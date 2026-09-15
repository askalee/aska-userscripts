# GitHub Commit Mermaid

Renders Mermaid code blocks in commit messages as interactive visual diagrams on GitHub commit detail pages.

## Features

* Runs automatically on GitHub commit detail pages (`/commit/*`).
* Detects and parses ` ```mermaid ` fenced code blocks inside commit messages (both commit title and extended body).
* Renders Mermaid diagrams directly within the commit message container.
* **Customizable Diagram Themes**: Configure themes independently for **Class Diagrams** and **General Diagrams** (e.g. sequence diagrams).
  * Supported themes: `Auto` (matches GitHub appearance), `Default`, `Neutral` (grayscale high-contrast, ideal for class diagrams with `classDef` annotations), `Dark`, `Forest`, `Base`.
* **Persistent Settings**: Saves preferences in browser `localStorage` without requiring elevated userscript extension permissions.
* **Instant Re-render**: Change themes in the settings modal (`⚙`) and immediately re-render diagrams without needing a full page reload.
* **Multi-attribute `classDef` Compatibility**: Fully preserves CSS styles and highlight classes (e.g., `changed`, `added`, `removed` from `diff-explainer`).

## Supported URLs

* `https://github.com/*/*/commit/*`

## Installation

1. Ensure you have a userscript manager extension installed in your browser (such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)).
2. Click to install: [Install GitHub Commit Mermaid](https://raw.githubusercontent.com/askalee/aska-userscripts/main/scripts/github-commit-mermaid/github-commit-mermaid.user.js)
3. In the extension's confirmation popup, click **Install**.

## Usage & Settings

1. Navigate to any GitHub commit detail page containing Mermaid code blocks in the commit message.
2. A control group appears in the bottom right corner:
   * **[Render Mermaid]**: Click to render diagrams into SVG visual blocks. After rendering, turns into **[Re-render Mermaid]**.
   * **[⚙] (Settings)**: Click to open the theme configuration panel.
3. In the settings panel:
   * **類別圖主題 (Class Diagram Theme)**: Choose your preferred theme for class diagrams (default: `Auto`).
   * **一般圖表主題 (General Theme)**: Choose your preferred theme for other diagrams (default: `Auto`).
   * Click **儲存並套用 (Save & Apply)** to save to `localStorage` and trigger an immediate re-render if diagrams are already displayed.
   * Click **重設為 Auto (Reset to Auto)** to restore defaults.

## Development

1. The main entry script is [`github-commit-mermaid.user.js`](./github-commit-mermaid.user.js).
2. For local testing, enable "Allow access to file URLs" in Tampermonkey / Violentmonkey settings, or copy the script content directly into the script editor.
3. Test locally or check syntax:
   ```bash
   node --check scripts/github-commit-mermaid/github-commit-mermaid.user.js
   ```

## Versioning Rules

This userscript adheres to [Semantic Versioning](https://semver.org/):

* **Patch** (`0.1.x`): Bug fixes, GitHub DOM structure updates and compatibility fixes.
* **Minor** (`0.x.0`): New features (e.g., theme toggle, settings modal, re-render support), backwards-compatible.
* **Major** (`x.0.0`): Breaking changes or significant architectural refactors.
