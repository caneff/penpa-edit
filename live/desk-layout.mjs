// The layout constants and reads the live tests of solve.html's desk share. Not a check itself, so `live/**/*.live.mjs` skips it.
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
