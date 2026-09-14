// ==UserScript==
// @name         Example Script Template
// @namespace    https://github.com/askalee/aska-userscripts
// @version      0.1.0
// @description  A clean template for creating new userscripts
// @author       aska
// @match        https://example.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  /**
   * Main entry point
   */
  function main() {
    console.log('[Example Script] Initialized successfully.');
    // TODO: Implement script logic here
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
