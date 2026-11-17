// What the live tests of `solve.html` share for the Pinned card's preset picker: its field, list and name form, found by role and
// accessible name. Not a check itself, so `live/**/*.live.mjs` skips it.
import { chipName, newBoardSolveLink, openSolvePage } from './page.mjs'

export const pinnedCard = (page) => page.getByRole('region', { name: 'Pinned' })
export const presetField = (page) => pinnedCard(page).getByRole('combobox', { name: 'Pin presets' })
export const presetList = (page) => pinnedCard(page).getByRole('listbox', { name: 'Presets' })
export const closed = (page) => presetList(page).waitFor({ state: 'hidden' })
export const openList = async (page) => {
  await closed(page)
  await presetField(page).click()
  await presetList(page).waitFor()
}
export const choosePreset = async (page, name) => {
  await openList(page)
  await presetList(page).getByRole('option', { name, exact: true }).click()
  await closed(page)
}
export const nameField = (page) => pinnedCard(page).getByRole('textbox', { name: 'Preset name' })
export const saveButton = (page) => pinnedCard(page).getByRole('button', { name: 'Save pins…', exact: true })

// Saves the pins as `name` through the save icon's inline form.
export const savePreset = async (page, name) => {
  await saveButton(page).click()
  await nameField(page).fill(name)
  await pinnedCard(page).getByRole('button', { name: 'Save', exact: true }).click()
}

export const pinChips = (page) => pinnedCard(page).locator('.ui-chip')
export const pinChipTexts = async (page) => (await pinChips(page).locator('.ui-chip-main').allInnerTexts()).map(chipName)
export const toolKeyOf = ({ mode, submode }) => `${mode}/${submode ?? ''}`

// The Tab set the pin tests open a new board with, so the Pinned card starts with one pin each.
export const PIN_TAB_SET = ['Line Normal', 'Sudoku Corner', 'Surface']

// Runs `body(page)` on a solve page opened on a new board with PIN_TAB_SET, and closes it after.
export const withPinnedPage = (browser, body) => async () => {
  const opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), PIN_TAB_SET))
  try {
    await body(opened.page)
  } finally {
    await opened.context.close()
  }
}
