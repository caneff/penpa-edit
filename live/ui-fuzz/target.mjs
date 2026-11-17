// The page a UI fuzz list runs on (#195): `solve.html` on the list's puzzle, in a context of its own. Not a check itself.
import { afterChange, openSolvePage } from '../page.mjs'
import { readPageState } from './page-state.mjs'

// How long an action waits for a control before it fails: a missing one fails the list in seconds, not Playwright's 30.
const ACTION_TIMEOUT_MS = 5000

// The engine's `openTarget`: opens `puzzle` on `browser`, `setup` and `served` going to `openPenpa`, and returns the page, its snapshot
// (`page-state.mjs`), a wait for the page to draw an action, and its close.
export const openTarget = (browser, { setup, served } = {}) => async (puzzle) => {
  const { context, page, errors } = await openSolvePage(browser, puzzle.source, { setup, served })
  page.setDefaultTimeout(ACTION_TIMEOUT_MS)
  return {
    page,
    snapshot: () => readPageState(page, errors),
    drawn: () => afterChange(page),
    close: () => context.close()
  }
}
