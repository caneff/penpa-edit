// The puzzles and reads the live tests of solve.html's desk share. Not a check itself, so `live/**/*.live.mjs` skips it.
import { settle } from './settle.mjs'

// Box edges may differ by rounding.
export const SLACK_PX = 1
// desk.js's gap between two cards of a column.
export const CARD_GAP_PX = 10
// desk.js's Mouse body slack for its borders, and rounding.
export const MOUSE_SLACK_PX = 3
// The Mouse and Mode cards' smallest heights (desk.js's MIN_SIZE).
export const MOUSE_MIN_HEIGHT_PX = 140
export const MODE_MIN_HEIGHT_PX = 170

// The puzzle Chris reviewed the page with: its title, author and rules, on a 10x10 board with pins.
export const ICEBREAKER = {
  title: 'Icebreaker (Nurikabe + Icelom)',
  author: 'Agent',
  rules: 'Shade some cells so that the shaded cells form one connected area. Each number is part of an unshaded region of ' +
    'that size, and every unshaded region holds exactly one number. No 2x2 area is all shaded.\n\nIcelom: draw a path ' +
    'from the entrance to the exit that follows every arrow it passes and visits every ice cell; on ice it goes straight ' +
    'on. The path may cross itself only on ice.\n\nThe white circles must be visited by the path.',
  tabs: ['Surface', 'Line Normal', 'Composite']
}

// Runs in the page: a new board, 10x10 unless `size` says otherwise, with `puzzle`'s title, author, rules and Tab set; returns its solve link's `#` part.
export function solveLinkInPage ({ title, author, rules, tabs, size = 10 }) {
  document.getElementById('nb_size1').value = size
  document.getElementById('nb_size2').value = size
  create_newboard()
  document.getElementById('saveinfotitle').value = title
  document.getElementById('saveinfoauthor').value = author
  document.getElementById('saveinforules').value = rules
  UserSettings.tab_settings = tabs
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

// Reads `inPage` until two reads in a row agree, and returns the last: the page lays out after it renders, so a read
// is taken once nothing moves.
export async function steady (page, inPage, arg) {
  let last = null
  await settle(async () => {
    const now = JSON.stringify(await page.evaluate(inPage, arg))
    const same = now === last
    last = now
    return same
  }, true)
  return JSON.parse(last)
}
