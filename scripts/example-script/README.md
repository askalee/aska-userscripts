# Example Script Template

A boilerplate directory and code skeleton for creating new userscripts.

## Features

* Serves as a standard, copy-pasteable template for new userscripts.
* Logs an initialization message to the browser console when the page finishes loading.

## Supported URLs

* `https://example.com/*`

## Installation

1. Ensure you have a userscript manager extension installed in your browser (such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)).
2. Click to install: [Install Script](https://raw.githubusercontent.com/askalee/aska-userscripts/main/scripts/example-script/example-script.user.js)
3. In the extension's confirmation popup, click **Install**.

## Development

1. Duplicate this directory for your new script:
   ```bash
   cp -r scripts/example-script scripts/<your-script-name>
   ```
2. Rename the script file:
   ```bash
   mv scripts/<your-script-name>/example-script.user.js scripts/<your-script-name>/<your-script-name>.user.js
   ```
3. Update the metadata block in `.user.js` (`@name`, `@description`, `@match`, etc.).
4. Implement your script logic inside `main()`.
5. Update `README.md` with relevant information and register your new script in the root `README.md` catalog table.

## Versioning Rules

This project adheres to [Semantic Versioning](https://semver.org/):

* **Patch** (`0.1.x`): Bug fixes, minor compatibility adjustments without behavior changes.
* **Minor** (`0.x.0`): Backwards-compatible new features or new page support.
* **Major** (`x.0.0`): Breaking changes, major refactoring, or dependency overhauls.
