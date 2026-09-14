# aska-userscripts

A centralized repository for browser userscripts (Tampermonkey / Violentmonkey / Greasemonkey).

This project adopts a lightweight architecture by directly maintaining native `.user.js` files without complex build tools or bundlers (e.g., Webpack, Vite, Rollup). Each userscript is self-contained in its own directory for long-term maintainability and effortless expansion.

---

## 📜 Userscript Catalog

| Script | Description | Install |
| :--- | :--- | :--- |
| **[github-commit-mermaid](scripts/github-commit-mermaid/)** | Renders Mermaid diagrams within commit messages on GitHub commit detail pages | [Install](https://raw.githubusercontent.com/askalee/aska-userscripts/main/scripts/github-commit-mermaid/github-commit-mermaid.user.js) |
| **[example-script](scripts/example-script/)** | Boilerplate template for creating new userscripts | [Install](https://raw.githubusercontent.com/askalee/aska-userscripts/main/scripts/example-script/example-script.user.js) |

---

## 📁 Directory Structure

```text
userscripts/
├─ .github/
│  └─ workflows/
│     └─ sync-readme-links.yml                        # Auto-sync install links for forks
├─ README.md                                          # Project overview & catalog
├─ package.json                                       # Minimal project metadata
├─ .gitignore                                         # Git ignore rules
└─ scripts/
   ├─ github-commit-mermaid/                          # GitHub Commit Mermaid renderer
   │  ├─ github-commit-mermaid.user.js
   │  └─ README.md
   ├─ example-script/                                 # Starter boilerplate template
   │  ├─ example-script.user.js
   │  └─ README.md
   └─ <future-script>/                                # Future extensions (e.g., jira-helper)
      ├─ <future-script>.user.js
      └─ README.md
```

---

## 🚀 How to Add a New Userscript

1. **Copy the template directory**:
   ```bash
   cp -r scripts/example-script scripts/<script-name>
   ```

2. **Rename the script file**:
   ```bash
   mv scripts/<script-name>/example-script.user.js scripts/<script-name>/<script-name>.user.js
   ```

3. **Configure Userscript Metadata**:
   Edit `scripts/<script-name>/<script-name>.user.js` and customize the header metadata block:
   ```javascript
   // ==UserScript==
   // @name         Your Script Name
   // @namespace    https://github.com/askalee/aska-userscripts
   // @version      0.1.0
   // @description  Your script description
   // @match        https://target-domain.com/*
   // @grant        none
   // ==/UserScript==
   ```

4. **Implement logic & documentation**:
   * Implement business logic in `main()` inside `<script-name>.user.js`.
   * Update supported URLs, feature descriptions, and install links in `scripts/<script-name>/README.md`.

5. **Register in Catalog**:
   Add a new row to the table in the root `README.md` with the script name, description, and direct raw installation link.

---

## 🏷️ Versioning (Semantic Versioning)

Each script independently follows [Semantic Versioning](https://semver.org/):

* **Patch** (`0.1.x`): Bug fixes, minor layout/DOM compatibility adjustments.
* **Minor** (`0.x.0`): Backwards-compatible new features or new page support.
* **Major** (`x.0.0`): Breaking changes, major architectural rewrites, or dependency overhauls.
