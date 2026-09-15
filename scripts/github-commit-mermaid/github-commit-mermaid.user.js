// ==UserScript==
// @name         GitHub Commit Mermaid Renderer
// @namespace    github-commit-mermaid
// @version      4.4.0
// @description  Replace Mermaid source blocks in GitHub commit messages with vertically stacked rendered diagrams.
// @match        https://github.com/*
// @require      https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CONTAINER_ID = 'github-commit-mermaid-controls';
  const BUTTON_ID = 'github-commit-mermaid-button';
  const SETTINGS_BTN_ID = 'github-commit-mermaid-settings-btn';
  const SETTINGS_PANEL_ID = 'github-commit-mermaid-settings-panel';

  const SETTINGS_STORAGE_KEY = 'github-commit-mermaid-settings';

  const AVAILABLE_THEMES = [
    'auto',
    'default',
    'neutral',
    'dark',
    'forest',
    'base',
  ];

  const THEME_LABELS = {
    auto: 'Auto (跟隨系統 / GitHub 外觀)',
    default: 'Default (經典淺色)',
    neutral: 'Neutral (簡潔灰階)',
    dark: 'Dark (深色模式)',
    forest: 'Forest (森林綠)',
    base: 'Base (簡約底色)',
  };

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
  let originalCommitElementSnapshot = null;

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

  /*
   * Close settings panel on outside click or ESC key.
   */
  document.addEventListener('click', (event) => {
    const panel = document.getElementById(SETTINGS_PANEL_ID);
    const settingsBtn = document.getElementById(SETTINGS_BTN_ID);

    if (
      panel &&
      !panel.contains(event.target) &&
      !settingsBtn?.contains(event.target)
    ) {
      panel.remove();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.getElementById(SETTINGS_PANEL_ID)?.remove();
    }
  });

  function scheduleInstall() {
    if (installScheduled) {
      return;
    }

    installScheduled = true;

    window.setTimeout(() => {
      installScheduled = false;
      installControls();
    }, 300);
  }

  function isCommitPage() {
    return /^\/[^/]+\/[^/]+\/commit\/[0-9a-f]+(?:\/|$)/i.test(
      location.pathname,
    );
  }

  function loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          classDiagramTheme: AVAILABLE_THEMES.includes(parsed.classDiagramTheme)
            ? parsed.classDiagramTheme
            : 'auto',
          generalTheme: AVAILABLE_THEMES.includes(parsed.generalTheme)
            ? parsed.generalTheme
            : 'auto',
        };
      }
    } catch (error) {
      console.warn('[GitHub Commit Mermaid] Failed to load settings:', error);
    }

    return {
      classDiagramTheme: 'auto',
      generalTheme: 'auto',
    };
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    } catch (error) {
      console.warn('[GitHub Commit Mermaid] Failed to save settings:', error);
    }
  }

  function isGitHubDarkTheme() {
    const githubColorMode =
      document.documentElement.getAttribute('data-color-mode');

    const computedColorScheme =
      window.getComputedStyle(document.documentElement).colorScheme;

    const prefersDark =
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    return (
      githubColorMode === 'dark' ||
      computedColorScheme.includes('dark') ||
      (githubColorMode === 'auto' && prefersDark)
    );
  }

  function isClassDiagramSource(source) {
    return /(?:^|\n)\s*classDiagram\b/i.test(source);
  }

  function resolveTheme(configuredTheme, useDarkTheme) {
    if (!configuredTheme || configuredTheme === 'auto') {
      return useDarkTheme ? 'dark' : 'default';
    }
    return configuredTheme;
  }

  function applyThemeDirective(source, targetTheme) {
    if (!targetTheme) {
      return source;
    }

    const initRegex = /^\s*%%\{init:\s*(\{[\s\S]*?\})\s*\}%%\s*(?:\r?\n|$)/i;
    const match = source.match(initRegex);

    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        parsed.theme = targetTheme;
        return source.replace(initRegex, `%%{init: ${JSON.stringify(parsed)}}%%\n`);
      } catch {
        if (/['"]?theme['"]?\s*:\s*['"][^'"]+['"]/i.test(match[1])) {
          const replaced = match[0].replace(
            /(['"]?theme['"]?\s*:\s*)['"][^'"]+['"]/i,
            `$1'${targetTheme}'`,
          );
          return source.replace(match[0], replaced);
        }
      }
    }

    return `%%{init: {'theme': '${targetTheme}'}}%%\n${source}`;
  }

  function installControls() {
    if (!isCommitPage()) {
      document.getElementById(CONTAINER_ID)?.remove();
      document.getElementById(SETTINGS_PANEL_ID)?.remove();
      return;
    }

    if (document.getElementById(CONTAINER_ID)) {
      return;
    }

    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Render Mermaid';

    button.addEventListener('click', () => {
      const isAlreadyRendered = Boolean(
        document.querySelector(
          `[${REPLACEMENT_ATTRIBUTE}="true"]`,
        ),
      );
      void replaceMermaidBlocks({ button, force: isAlreadyRendered });
    });

    const settingsBtn = document.createElement('button');
    settingsBtn.id = SETTINGS_BTN_ID;
    settingsBtn.type = 'button';
    settingsBtn.title = 'Mermaid 渲染設定 (類別圖與主題)';
    settingsBtn.setAttribute('aria-label', 'Mermaid 渲染設定');
    settingsBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" style="display: block;">
        <path d="M8 0a8.2 8.2 0 00-.734.032.75.75 0 00-.67.625l-.261 1.706a5.5 5.5 0 00-1.226.507L3.65 1.794a.75.75 0 00-.916.155l-.756.91a.75.75 0 00-.09.919l.995 1.41a5.5 5.5 0 00-.507 1.226L.67 6.675a.75.75 0 00-.638.734v1.182a.75.75 0 00.638.734l1.706.261c.123.432.296.845.507 1.226l-1.076 1.459a.75.75 0 00.09.919l.756.91a.75.75 0 00.916.155l1.459-1.076c.381.211.794.384 1.226.507l.261 1.706a.75.75 0 00.734.638h1.182a.75.75 0 00.734-.638l.261-1.706a5.5 5.5 0 001.226-.507l1.459 1.076a.75.75 0 00.916-.155l.756-.91a.75.75 0 00.09-.919l-1.076-1.459c.211-.381.384-.794.507-1.226l1.706-.261a.75.75 0 00.638-.734V7.409a.75.75 0 00-.638-.734l-1.706-.261a5.5 5.5 0 00-.507-1.226l1.076-1.459a.75.75 0 00-.09-.919l-.756-.91a.75.75 0 00-.916-.155l-1.459 1.076a5.5 5.5 0 00-1.226-.507l-.261-1.706A.75.75 0 008.591.032 8.2 8.2 0 008 0zm0 5.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z"></path>
      </svg>
    `;

    settingsBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSettingsPanel();
    });

    container.append(button, settingsBtn);
    document.body.append(container);
  }

  function toggleSettingsPanel() {
    const existing = document.getElementById(SETTINGS_PANEL_ID);
    if (existing) {
      existing.remove();
      return;
    }

    const settings = loadSettings();
    const panel = document.createElement('div');
    panel.id = SETTINGS_PANEL_ID;
    panel.className = 'github-commit-mermaid-settings-panel';

    const header = document.createElement('div');
    header.className = 'github-commit-mermaid-settings-header';
    header.innerHTML = `
      <span style="font-weight: 600; font-size: 13px;">Mermaid 渲染主題設定</span>
      <button type="button" class="github-commit-mermaid-close-btn" aria-label="關閉">✕</button>
    `;

    header
      .querySelector('.github-commit-mermaid-close-btn')
      .addEventListener('click', () => {
        panel.remove();
      });

    const body = document.createElement('div');
    body.className = 'github-commit-mermaid-settings-body';

    function createSelectGroup(labelText, id, currentValue) {
      const group = document.createElement('div');
      group.className = 'github-commit-mermaid-setting-group';

      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = labelText;

      const select = document.createElement('select');
      select.id = id;

      AVAILABLE_THEMES.forEach((themeKey) => {
        const option = document.createElement('option');
        option.value = themeKey;
        option.textContent = THEME_LABELS[themeKey] || themeKey;
        if (themeKey === currentValue) {
          option.selected = true;
        }
        select.append(option);
      });

      group.append(label, select);
      return { group, select };
    }

    const classGroup = createSelectGroup(
      '類別圖主題 (Class Diagram Theme)：',
      'github-commit-mermaid-class-theme',
      settings.classDiagramTheme,
    );

    const generalGroup = createSelectGroup(
      '一般圖表主題 (General Theme)：',
      'github-commit-mermaid-general-theme',
      settings.generalTheme,
    );

    const hint = document.createElement('div');
    hint.className = 'github-commit-mermaid-settings-hint';
    hint.textContent =
      '提示：搭配 diff-explainer 類別圖時，推薦選擇 Neutral (簡潔灰階) 以清晰呈現 classDef 異動標籤色彩。';

    const actions = document.createElement('div');
    actions.className = 'github-commit-mermaid-settings-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className =
      'github-commit-mermaid-btn github-commit-mermaid-btn-primary';
    saveBtn.textContent = '儲存並套用';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className =
      'github-commit-mermaid-btn github-commit-mermaid-btn-secondary';
    resetBtn.textContent = '重設為 Auto';

    saveBtn.addEventListener('click', () => {
      const newSettings = {
        classDiagramTheme: classGroup.select.value,
        generalTheme: generalGroup.select.value,
      };
      saveSettings(newSettings);
      panel.remove();

      const button = document.getElementById(BUTTON_ID);
      if (
        document.querySelector(
          `[${REPLACEMENT_ATTRIBUTE}="true"]`,
        )
      ) {
        void replaceMermaidBlocks({ button, force: true });
      }
    });

    resetBtn.addEventListener('click', () => {
      classGroup.select.value = 'auto';
      generalGroup.select.value = 'auto';
    });

    actions.append(resetBtn, saveBtn);
    body.append(classGroup.group, generalGroup.group, hint, actions);
    panel.append(header, body);

    document.body.append(panel);

    panel.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  async function replaceMermaidBlocks({ button, force = false } = {}) {
    const targetBtn = button || document.getElementById(BUTTON_ID);

    if (targetBtn) {
      targetBtn.disabled = true;
      targetBtn.textContent = 'Finding Mermaid…';
    }

    try {
      const existingReplacement = document.querySelector(
        `[${REPLACEMENT_ATTRIBUTE}="true"]`,
      );

      if (existingReplacement) {
        if (!force) {
          if (targetBtn) {
            setButtonStatus(targetBtn, 'Already rendered');
          }
          return;
        }

        if (originalCommitElementSnapshot) {
          const freshOriginal =
            originalCommitElementSnapshot.cloneNode(true);
          existingReplacement.replaceWith(freshOriginal);
        }
      }

      const result =
        findCommitMessageWithMermaid();

      if (!result) {
        if (targetBtn) {
          setButtonStatus(
            targetBtn,
            'No Mermaid found',
          );
        }
        return;
      }

      const parts =
        splitMessageIntoParts(result.text);

      const diagramCount = parts.filter(
        (part) => part.type === 'diagram',
      ).length;

      if (diagramCount === 0) {
        if (targetBtn) {
          setButtonStatus(
            targetBtn,
            'No Mermaid found',
          );
        }
        return;
      }

      const mermaidApi = getMermaidApi();
      initializeMermaid(mermaidApi);

      const settings = loadSettings();
      const useDarkTheme = isGitHubDarkTheme();

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

        if (targetBtn) {
          targetBtn.textContent =
            `Rendering ${renderedCount}/${diagramCount}…`;
        }

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
          settings,
          useDarkTheme,
        });
      }

      /*
       * Preserve original element clone for future re-render.
       */
      originalCommitElementSnapshot =
        result.element.cloneNode(true);

      /*
       * Replace the original commit message element.
       */
      result.element.replaceWith(
        replacement,
      );

      if (targetBtn) {
        setButtonStatus(
          targetBtn,
          `Rendered ${diagramCount}`,
        );
      }
    } catch (error) {
      console.error(
        '[GitHub Commit Mermaid] Render failed:',
        error,
      );

      if (targetBtn) {
        targetBtn.disabled = false;
        targetBtn.textContent = 'Render failed';
      }

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
        if (targetBtn) {
          targetBtn.textContent =
            'Render Mermaid';
        }
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
        : typeof globalThis !== 'undefined' && globalThis
          ? globalThis.mermaid
          : typeof window !== 'undefined'
            ? window.mermaid
            : undefined;

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

    mermaidApi.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isGitHubDarkTheme() ? 'dark' : 'default',
    });

    mermaidInitialized = true;
  }

  /**
   * Preprocesses Mermaid source code to resolve compatibility issues with
   * classDiagram classDef syntax in Mermaid 10, converting multi-attribute
   * classDef statements into scoped SVG CSS styles.
   */
  function preprocessMermaidSource(source) {
    const lines = source.split(/\r?\n/);
    const cleanedLines = [];
    const customRules = [];
    const isClassDiagram = isClassDiagramSource(source);

    for (const line of lines) {
      if (isClassDiagram) {
        const match = line.match(/^\s*classDef\s+([a-zA-Z0-9_-]+)\s+(.*)$/);
        if (match) {
          const className = match[1];
          const rawStyles = match[2].trim().replace(/;$/, '');
          const styleDeclarations = rawStyles
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const colonIndex = s.indexOf(':');
              if (colonIndex === -1) return '';
              const prop = s.slice(0, colonIndex).trim();
              const val = s.slice(colonIndex + 1).trim();
              return `${prop}: ${val} !important;`;
            })
            .filter(Boolean)
            .join(' ');

          if (styleDeclarations) {
            customRules.push(
              `.github-commit-mermaid-diagram g.${className} rect, ` +
              `.github-commit-mermaid-diagram g.${className} polygon, ` +
              `.github-commit-mermaid-diagram g.${className} path, ` +
              `.github-commit-mermaid-diagram .${className} { ${styleDeclarations} }`
            );
          }
          continue;
        }
      }
      cleanedLines.push(line);
    }

    return {
      cleanedSource: cleanedLines.join('\n'),
      customRules,
    };
  }

  async function renderDiagram({
    mermaidApi,
    container,
    source,
    index,
    settings,
    useDarkTheme,
  }) {
    try {
      const renderId =
        `github-commit-mermaid-${Date.now()}-` +
        `${index}-` +
        Math.random()
          .toString(36)
          .slice(2);

      const isClass = isClassDiagramSource(source);
      const targetTheme = isClass
        ? resolveTheme(settings?.classDiagramTheme, useDarkTheme)
        : resolveTheme(settings?.generalTheme, useDarkTheme);

      const themedSource = applyThemeDirective(source, targetTheme);

      const { cleanedSource, customRules } =
        preprocessMermaidSource(themedSource);

      const result =
        await mermaidApi.render(
          renderId,
          cleanedSource,
        );

      container.innerHTML =
        result.svg;

      if (customRules.length > 0) {
        const customStyleEl = document.createElement('style');
        customStyleEl.textContent = customRules.join('\n');
        container.append(customStyleEl);
      }

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
        'Re-render Mermaid';
    }, 2500);
  }

  function addStyles() {
    const style = document.createElement('style');
    style.id = 'github-commit-mermaid-styles';
    style.textContent = `
      #${CONTAINER_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;

        display: inline-flex;
        align-items: center;
        gap: 6px;

        padding: 4px;
        border: 1px solid var(--borderColor-default, var(--color-border-default, #30363d));
        border-radius: 8px;

        background: var(--bgColor-muted, var(--color-canvas-subtle, #161b22));
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      }

      #${BUTTON_ID} {
        padding: 8px 14px;

        border: 1px solid #58a6ff;
        border-radius: 6px;

        background: #1f6feb;
        color: #ffffff;

        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;

        font-size: 13px;
        font-weight: 600;

        cursor: pointer;
        transition: background 0.15s ease;
      }

      #${BUTTON_ID}:hover:not(:disabled) {
        background: #388bfd;
      }

      #${BUTTON_ID}:disabled {
        cursor: progress;
        opacity: 0.75;
      }

      #${SETTINGS_BTN_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;

        padding: 8px 10px;

        border: 1px solid var(--borderColor-default, var(--color-border-default, #30363d));
        border-radius: 6px;

        background: var(--button-default-bgColor-rest, var(--color-btn-bg, #21262d));
        color: var(--fgColor-default, var(--color-fg-default, #c9d1d9));

        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      }

      #${SETTINGS_BTN_ID}:hover {
        background: var(--button-default-bgColor-hover, var(--color-btn-hover-bg, #30363d));
        border-color: var(--borderColor-muted, #8b949e);
      }

      #${SETTINGS_PANEL_ID} {
        position: fixed;
        right: 20px;
        bottom: 74px;
        z-index: 2147483647;

        width: 330px;
        padding: 16px;

        background: var(--bgColor-default, var(--color-canvas-default, #0d1117));
        border: 1px solid var(--borderColor-default, var(--color-border-default, #30363d));
        border-radius: 10px;

        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);

        color: var(--fgColor-default, var(--color-fg-default, #e6edf3));
        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
        font-size: 13px;
      }

      .github-commit-mermaid-settings-header {
        display: flex;
        align-items: center;
        justify-content: space-between;

        margin-bottom: 14px;
        padding-bottom: 8px;

        border-bottom: 1px solid var(--borderColor-muted, var(--color-border-muted, #21262d));
      }

      .github-commit-mermaid-close-btn {
        padding: 2px 6px;
        border: none;
        border-radius: 4px;

        background: transparent;
        color: var(--fgColor-muted, var(--color-fg-muted, #8b949e));

        font-size: 15px;
        cursor: pointer;
      }

      .github-commit-mermaid-close-btn:hover {
        background: var(--bgColor-muted, var(--color-canvas-subtle, #161b22));
        color: var(--fgColor-default, var(--color-fg-default, #f0f6fc));
      }

      .github-commit-mermaid-setting-group {
        margin-bottom: 12px;
      }

      .github-commit-mermaid-setting-group label {
        display: block;
        margin-bottom: 5px;

        font-size: 12px;
        font-weight: 600;
        color: var(--fgColor-default, var(--color-fg-default, #e6edf3));
      }

      .github-commit-mermaid-setting-group select {
        width: 100%;
        padding: 6px 10px;

        border: 1px solid var(--borderColor-default, var(--color-border-default, #30363d));
        border-radius: 6px;

        background: var(--bgColor-muted, var(--color-canvas-subtle, #161b22));
        color: var(--fgColor-default, var(--color-fg-default, #e6edf3));

        font-size: 13px;
        outline: none;
      }

      .github-commit-mermaid-setting-group select:focus {
        border-color: #58a6ff;
        box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.3);
      }

      .github-commit-mermaid-settings-hint {
        margin-top: 10px;
        margin-bottom: 14px;

        font-size: 11px;
        line-height: 1.4;
        color: var(--fgColor-muted, var(--color-fg-muted, #8b949e));
      }

      .github-commit-mermaid-settings-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;

        margin-top: 14px;
        padding-top: 10px;

        border-top: 1px solid var(--borderColor-muted, var(--color-border-muted, #21262d));
      }

      .github-commit-mermaid-btn {
        padding: 5px 12px;

        border: 1px solid transparent;
        border-radius: 6px;

        font-size: 12px;
        font-weight: 600;

        cursor: pointer;
      }

      .github-commit-mermaid-btn-primary {
        border-color: #2ea043;
        background: #238636;
        color: #ffffff;
      }

      .github-commit-mermaid-btn-primary:hover {
        background: #2ea043;
      }

      .github-commit-mermaid-btn-secondary {
        border-color: var(--borderColor-default, var(--color-border-default, #30363d));
        background: var(--button-default-bgColor-rest, var(--color-btn-bg, #21262d));
        color: var(--fgColor-default, var(--color-fg-default, #c9d1d9));
      }

      .github-commit-mermaid-btn-secondary:hover {
        background: var(--button-default-bgColor-hover, var(--color-btn-hover-bg, #30363d));
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
    `;
    document.head.append(style);
  }
})();