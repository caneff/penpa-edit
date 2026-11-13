// ==UserScript==
// @name         Penpa+ to caneff's fork
// @namespace    https://github.com/caneff/penpa-edit
// @version      1.0.0
// @description  Opens every Penpa+ link on caneff's fork, with the same path, query and # data.
// @match        https://swaroopg92.github.io/penpa-edit/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/caneff/penpa-edit/master/userscript/penpa-redirect.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/penpa-edit/master/userscript/penpa-redirect.user.js
// ==/UserScript==

(function () {
  const UPSTREAM_URL = 'https://swaroopg92.github.io/penpa-edit/'
  const FORK_URL = 'https://caneff.github.io/penpa-edit/'

  if (location.href.startsWith(UPSTREAM_URL)) {
    // `replace`, so Back does not return to the upstream link and loop.
    location.replace(FORK_URL + location.href.slice(UPSTREAM_URL.length))
  }
})()
