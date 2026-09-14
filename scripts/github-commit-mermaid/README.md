# GitHub Commit Mermaid

Renders Mermaid code blocks in commit messages as interactive visual diagrams on GitHub commit detail pages.

## Features

* Runs automatically on GitHub commit detail pages.
* Detects and parses ` ```mermaid ` fenced code blocks inside commit messages (both commit title and extended body).
* Renders Mermaid diagrams directly within the commit message container.

## Supported URLs

* `https://github.com/*/*/commit/*`

## Installation

1. Ensure you have a userscript manager extension installed in your browser (such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)).
2. Click to install: [Install GitHub Commit Mermaid](https://raw.githubusercontent.com/askalee/aska-userscripts/main/scripts/github-commit-mermaid/github-commit-mermaid.user.js)
3. In the extension's confirmation popup, click **Install**.

## Development

1. The main entry script is [`github-commit-mermaid.user.js`](./github-commit-mermaid.user.js).
2. For local testing, enable "Allow access to file URLs" in Tampermonkey / Violentmonkey settings, or copy the script content directly into the script editor.
3. The main entry point is `main()`. Planned rendering steps:
   * Select commit message container elements.
   * Extract fenced code blocks with ` ```mermaid `.
   * Load Mermaid.js and inject SVG render output.

## Versioning Rules

This userscript adheres to [Semantic Versioning](https://semver.org/):

* **Patch** (`0.1.x`): Bug fixes, GitHub DOM structure updates and compatibility fixes.
* **Minor** (`0.x.0`): New features (e.g., fullscreen diagram zoom, dark mode theme toggle), backwards-compatible.
* **Major** (`x.0.0`): Breaking changes or significant architectural refactors.
