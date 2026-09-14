// ==UserScript==
// @name         GitHub Commit Mermaid Renderer
// @namespace    github-commit-mermaid
// @version      4.1.0
// @description  Replace Mermaid source blocks in GitHub commit messages with vertically stacked rendered diagrams.
// @match        https://github.com/*
// @require      https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js
// @run-at       document-idle
// @grant        GM_addStyle
// @sandbox      DOM
// ==/UserScript==

(() => {
  'use strict';

  const BUTTON_ID = 'github-commit-mermaid-button';

  const REPLACEMENT_ATTRIBUTE =
    'data-github-commit-mermaid-replacement';

  /*
   * Group 1: opening fence (``` or ~~~)
   * Group 2: Mermaid source
   *
   * Closing fence must match the opening fence.
   */
  const MERMAID_PATTERN =
    /(```|~~~)\s*mermaid[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\1/gi;

  let mermaidInitialized = false;
  let installScheduled = false;

  addStyles();
  scheduleInstall();

  /*
   * GitHub uses soft navigation.
   */
  document.addEventListener(
    'turbo:load',
    scheduleInstall,
  );

  document.addEventListener(
    'soft-nav:end',
    scheduleInstall,
  );

  document.addEventListener(
    'pjax:end',
    scheduleInstall,
  );

  new MutationObserver(scheduleInstall).observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
    },
  );

  function scheduleInstall() {
    if (installScheduled) {
      return;
    }

    installScheduled = true;

    window.setTimeout(() => {
      installScheduled = false;
      installButton();
    }, 300);
  }

  function isCommitPage() {
    return /^\/[^/]+\/[^/]+\/commit\/[0-9a-f]+(?:\/|$)/i.test(
      location.pathname,
    );
  }

  function installButton() {
    if (!isCommitPage()) {
      document
        .getElementById(BUTTON_ID)
        ?.remove();

      return;
    }

    if (document.getElementById(BUTTON_ID)) {
      return;
    }

    const button =
      document.createElement('button');

    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Render Mermaid';

    button.addEventListener('click', () => {
      void replaceMermaidBlocks(button);
    });

    document.body.append(button);
  }

  async function replaceMermaidBlocks(button) {
    button.disabled = true;
    button.textContent = 'Finding Mermaid…';

    try {
      /*
       * Do not render twice.
       */
      if (
        document.querySelector(
          `[${REPLACEMENT_ATTRIBUTE}="true"]`,
        )
      ) {
        setButtonStatus(
          button,
          'Already rendered',
        );

        return;
      }

      const result =
        findCommitMessageWithMermaid();

      if (!result) {
        setButtonStatus(
          button,
          'No Mermaid found',
        );

        return;
      }

      const parts =
        splitMessageIntoParts(result.text);

      const diagramCount = parts.filter(
        (part) => part.type === 'diagram',
      ).length;

      if (diagramCount === 0) {
        setButtonStatus(
          button,
          'No Mermaid found',
        );

        return;
      }

      const mermaidApi = getMermaidApi();

      initializeMermaid(mermaidApi);

      /*
       * Build the complete replacement in memory first.
       * Only replace the original message after all parts
       * have been created.
       */
      const replacement =
        createReplacementContainer(
          result.element,
        );

      let renderedCount = 0;

      for (const part of parts) {
        if (part.type === 'text') {
          appendTextPart(
            replacement,
            part.content,
          );

          continue;
        }

        renderedCount += 1;

        button.textContent =
          `Rendering ${renderedCount}/${diagramCount}…`;

        const diagramContainer =
          createDiagramContainer();

        replacement.append(
          diagramContainer,
        );

        await renderDiagram({
          mermaidApi,
          container: diagramContainer,
          source: part.source,
          index: renderedCount - 1,
        });
      }

      /*
       * Replace the original commit message element.
       */
      result.element.replaceWith(
        replacement,
      );

      setButtonStatus(
        button,
        `Rendered ${diagramCount}`,
      );
    } catch (error) {
      console.error(
        '[GitHub Commit Mermaid] Render failed:',
        error,
      );

      button.disabled = false;
      button.textContent = 'Render failed';

      window.alert(
        [
          'GitHub Commit Mermaid 執行失敗。',
          '',
          String(error),
          '',
          '按 F12 開啟 Console 可查看詳細錯誤。',
        ].join('\n'),
      );

      window.setTimeout(() => {
        button.textContent =
          'Render Mermaid';
      }, 3000);
    }
  }

  /**
   * Find the smallest DOM element containing
   * a complete Mermaid fenced block.
   */
  function findCommitMessageWithMermaid() {
    const main =
      document.querySelector('main');

    if (!main) {
      return null;
    }

    const candidates = [];

    for (
      const element of main.querySelectorAll(
        'pre, div, section, article',
      )
    ) {
      /*
       * Ignore our own rendered content.
       */
      if (
        element.closest(
          `[${REPLACEMENT_ATTRIBUTE}="true"]`,
        )
      ) {
        continue;
      }

      /*
       * Exclude file diffs.
       */
      if (
        element.closest(
          [
            '.js-file',
            '[data-testid="diff-file"]',
            '[data-file-type="file"]',
            '[class*="DiffFile"]',
          ].join(','),
        )
      ) {
        continue;
      }

      const text =
        element.innerText || '';

      if (
        !/(?:```|~~~)\s*mermaid/i.test(
          text,
        )
      ) {
        continue;
      }

      if (
        countMermaidBlocks(text) === 0
      ) {
        continue;
      }

      candidates.push({
        element,
        text,
        length: text.length,
        isPre: element.tagName === 'PRE',
      });
    }

    /*
     * Prefer a PRE element, since GitHub currently
     * presents commit messages as preformatted text.
     *
     * Otherwise choose the smallest matching element.
     */
    candidates.sort((left, right) => {
      if (left.isPre !== right.isPre) {
        return left.isPre ? -1 : 1;
      }

      return left.length - right.length;
    });

    return candidates[0] ?? null;
  }

  /**
   * Split the commit message into normal text
   * and Mermaid diagram parts.
   */
  function splitMessageIntoParts(text) {
    const parts = [];

    MERMAID_PATTERN.lastIndex = 0;

    let cursor = 0;
    let match;

    while (
      (
        match =
          MERMAID_PATTERN.exec(text)
      ) !== null
    ) {
      const textBeforeDiagram =
        text.slice(
          cursor,
          match.index,
        );

      if (textBeforeDiagram) {
        parts.push({
          type: 'text',
          content: textBeforeDiagram,
        });
      }

      parts.push({
        type: 'diagram',
        source: match[2].trim(),
      });

      cursor =
        MERMAID_PATTERN.lastIndex;
    }

    const remainingText =
      text.slice(cursor);

    if (remainingText) {
      parts.push({
        type: 'text',
        content: remainingText,
      });
    }

    return parts;
  }

  function countMermaidBlocks(text) {
    let count = 0;

    MERMAID_PATTERN.lastIndex = 0;

    while (
      MERMAID_PATTERN.exec(text) !==
      null
    ) {
      count += 1;
    }

    return count;
  }

  /**
   * Create a replacement container.
   *
   * Important:
   * Do not inherit GitHub's flex, grid, column,
   * inline or width layout properties.
   */
  function createReplacementContainer(
    originalElement,
  ) {
    const replacement =
      document.createElement('div');

    replacement.setAttribute(
      REPLACEMENT_ATTRIBUTE,
      'true',
    );

    replacement.className =
      'github-commit-mermaid-replacement';

    /*
     * Copy text appearance only.
     */
    copySafeTextStyles(
      originalElement,
      replacement,
    );

    /*
     * Force normal vertical block flow.
     */
    replacement.style.setProperty(
      'display',
      'block',
      'important',
    );

    replacement.style.setProperty(
      'width',
      '100%',
      'important',
    );

    replacement.style.setProperty(
      'max-width',
      '100%',
      'important',
    );

    replacement.style.setProperty(
      'min-width',
      '0',
      'important',
    );

    replacement.style.setProperty(
      'box-sizing',
      'border-box',
      'important',
    );

    replacement.style.setProperty(
      'float',
      'none',
      'important',
    );

    replacement.style.setProperty(
      'clear',
      'both',
      'important',
    );

    replacement.style.setProperty(
      'columns',
      'auto',
      'important',
    );

    replacement.style.setProperty(
      'column-count',
      'auto',
      'important',
    );

    replacement.style.setProperty(
      'white-space',
      'normal',
      'important',
    );

    replacement.style.setProperty(
      'overflow-x',
      'visible',
      'important',
    );

    replacement.style.setProperty(
      'height',
      'auto',
      'important',
    );

    replacement.style.setProperty(
      'min-height',
      '0',
      'important',
    );

    return replacement;
  }

  /**
   * Copy only visual text styles.
   *
   * Do not copy:
   * - display
   * - flex
   * - grid
   * - columns
   * - width
   * - max-width
   * - position
   */
  function copySafeTextStyles(
    source,
    target,
  ) {
    const computed =
      window.getComputedStyle(source);

    const properties = [
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',

      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',

      'border-top',
      'border-right',
      'border-bottom',
      'border-left',

      'border-radius',

      'background-color',
      'background-image',

      'color',

      'font-family',
      'font-size',
      'font-style',
      'font-weight',

      'line-height',
      'letter-spacing',

      'text-align',
      'text-indent',

      'tab-size',
      'overflow-wrap',
      'word-break',
    ];

    for (const property of properties) {
      const value =
        computed.getPropertyValue(
          property,
        );

      if (value) {
        target.style.setProperty(
          property,
          value,
        );
      }
    }
  }

  /**
   * Each text part is a DIV instead of a SPAN.
   *
   * This guarantees that normal text and diagrams
   * are vertically stacked.
   */
  function appendTextPart(
    container,
    content,
  ) {
    if (!content) {
      return;
    }

    const text =
      document.createElement('div');

    text.className =
      'github-commit-mermaid-text';

    text.textContent = content;

    container.append(text);
  }

  function createDiagramContainer() {
    const container =
      document.createElement('div');

    container.className =
      'github-commit-mermaid-diagram';

    return container;
  }

  function getMermaidApi() {
    const api =
      typeof mermaid !== 'undefined'
        ? mermaid
        : globalThis.mermaid;

    if (
      !api ||
      typeof api.initialize !==
        'function' ||
      typeof api.render !==
        'function'
    ) {
      throw new Error(
        'Mermaid library 未正確載入。' +
        '請檢查 Tampermonkey 的 @require 狀態。',
      );
    }

    return api;
  }

  function initializeMermaid(
    mermaidApi,
  ) {
    if (mermaidInitialized) {
      return;
    }

    const githubColorMode =
      document.documentElement.getAttribute(
        'data-color-mode',
      );

    const computedColorScheme =
      window.getComputedStyle(
        document.documentElement,
      ).colorScheme;

    const prefersDark =
      window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;

    const useDarkTheme =
      githubColorMode === 'dark' ||
      computedColorScheme.includes(
        'dark',
      ) ||
      (
        githubColorMode === 'auto' &&
        prefersDark
      );

    mermaidApi.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme:
        useDarkTheme
          ? 'dark'
          : 'default',
    });

    mermaidInitialized = true;
  }

  async function renderDiagram({
    mermaidApi,
    container,
    source,
    index,
  }) {
    try {
      const renderId =
        `github-commit-mermaid-${Date.now()}-` +
        `${index}-` +
        Math.random()
          .toString(36)
          .slice(2);

      const result =
        await mermaidApi.render(
          renderId,
          source,
        );

      container.innerHTML =
        result.svg;

      if (
        typeof result.bindFunctions ===
        'function'
      ) {
        result.bindFunctions(
          container,
        );
      }

      const svg =
        container.querySelector('svg');

      if (svg) {
        svg.style.setProperty(
          'display',
          'inline-block',
          'important',
        );

        svg.style.setProperty(
          'max-width',
          '100%',
          'important',
        );

        svg.style.setProperty(
          'height',
          'auto',
          'important',
        );
      }
    } catch (error) {
      console.error(
        '[GitHub Commit Mermaid] Diagram failed:',
        error,
      );

      /*
       * Preserve the original source if this diagram
       * cannot be rendered.
       */
      container.classList.add(
        'github-commit-mermaid-error',
      );

      const heading =
        document.createElement('strong');

      heading.textContent =
        'Mermaid render error';

      const errorText =
        document.createElement('pre');

      errorText.textContent =
        String(error);

      const sourceText =
        document.createElement('pre');

      sourceText.className =
        'github-commit-mermaid-source';

      sourceText.textContent = [
        '```mermaid',
        source,
        '```',
      ].join('\n');

      container.append(
        heading,
        errorText,
        sourceText,
      );
    }
  }

  function setButtonStatus(
    button,
    text,
  ) {
    button.textContent = text;

    window.setTimeout(() => {
      button.disabled = false;

      button.textContent =
        'Render Mermaid';
    }, 2500);
  }

  function addStyles() {
    GM_addStyle(`
      #${BUTTON_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;

        padding: 10px 16px;

        border: 1px solid #58a6ff;
        border-radius: 7px;

        background: #1f6feb;
        color: #ffffff;

        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;

        font-size: 14px;
        font-weight: 600;

        cursor: pointer;

        box-shadow:
          0 4px 16px
          rgba(0, 0, 0, 0.4);
      }

      #${BUTTON_ID}:hover:not(:disabled) {
        background: #388bfd;
      }

      #${BUTTON_ID}:disabled {
        cursor: progress;
        opacity: 0.75;
      }

      /*
       * Main replacement container.
       *
       * All children must use normal vertical block flow.
       */
      .github-commit-mermaid-replacement {
        display: block !important;

        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;

        box-sizing: border-box !important;

        float: none !important;
        clear: both !important;

        columns: auto !important;
        column-count: auto !important;
        column-width: auto !important;

        white-space: normal !important;
        overflow: visible !important;
      }

      /*
       * Normal commit message text.
       */
      .github-commit-mermaid-text {
        display: block !important;

        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;

        box-sizing: border-box !important;

        float: none !important;
        clear: both !important;

        columns: auto !important;
        column-count: auto !important;

        white-space: pre-wrap !important;

        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }

      /*
       * Each Mermaid diagram occupies its own full row.
       */
      .github-commit-mermaid-diagram {
        display: block !important;

        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;

        box-sizing: border-box !important;

        float: none !important;
        clear: both !important;

        columns: auto !important;
        column-count: auto !important;

        overflow: auto !important;

        margin: 16px 0 !important;
        padding: 20px !important;

        border:
          1px solid
          var(
            --borderColor-default,
            var(
              --color-border-default,
              #30363d
            )
          ) !important;

        border-radius: 7px !important;

        background:
          var(
            --bgColor-muted,
            var(
              --color-canvas-subtle,
              #161b22
            )
          ) !important;

        white-space: normal !important;
        text-align: center !important;
      }

      .github-commit-mermaid-diagram svg {
        display: inline-block !important;

        max-width: 100% !important;
        height: auto !important;
      }

      .github-commit-mermaid-error {
        color:
          var(
            --fgColor-danger,
            var(
              --color-danger-fg,
              #f85149
            )
          ) !important;

        text-align: left !important;
      }

      .github-commit-mermaid-error pre {
        overflow: auto;

        margin-top: 10px;
        padding: 10px;

        white-space: pre-wrap;
        word-break: break-word;

        background:
          var(
            --bgColor-default,
            var(
              --color-canvas-default,
              #0d1117
            )
          );
      }

      .github-commit-mermaid-source {
        color:
          var(
            --fgColor-default,
            var(
              --color-fg-default,
              #f0f6fc
            )
          );
      }
    `);
  }
})();