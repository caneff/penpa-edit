// ==UserScript==
// @name         Penpa+ to caneff's fork
// @namespace    https://github.com/caneff/penpa-edit
// @version      1.1.0
// @description  Opens every Penpa+ link on caneff's fork, with the same query and # data; a solve link opens on the fork's solve page.
// @match        https://swaroopg92.github.io/penpa-edit/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/caneff/penpa-edit/master/userscript/penpa-redirect.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/penpa-edit/master/userscript/penpa-redirect.user.js
// ==/UserScript==

(function () {
  const UPSTREAM_URL = 'https://swaroopg92.github.io/penpa-edit/'
  const FORK_URL = 'https://caneff.github.io/penpa-edit/'

  // A solve link says `m=solve` in its query or its # data.
  function isSolveLink (url) {
    const data = url.slice(UPSTREAM_URL.length).replace(/^[^?#]*/, '')
    return data.split(/[?#&]/).includes('m=solve')
  }

  if (location.href.startsWith(UPSTREAM_URL)) {
    const tail = location.href.slice(UPSTREAM_URL.length)
    // A solve link opens on solve.html, whatever page it named; every other link keeps its path.
    const target = isSolveLink(location.href) ? FORK_URL + 'solve.html' + tail.replace(/^[^?#]*/, '') : FORK_URL + tail
    // `replace`, so Back does not return to the upstream link and loop.
    location.replace(target)
  }
})()
