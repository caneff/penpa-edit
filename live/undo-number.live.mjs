// Undo after typing a number in a single cell: one undo removes one group of edits (#55).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, shadeInPage, useBrowser } from './page.mjs'

const browser = useBrowser()

// Index in `pu.centerlist` of the cells the test shades and types into.
const FIRST_SHADED = 20
const SECOND_SHADED = 22
const TYPED = 12

// The ways to type a digit into one cell: the edit mode and the submode's code (the first character of its entry in `pu.mode`).
const WAYS = [
  { name: 'number mode', editMode: 'number', submode: '1' },
  { name: 'sudoku mode, normal', editMode: 'sudoku', submode: '1' },
  { name: 'sudoku mode, corner', editMode: 'sudoku', submode: '2' },
  { name: 'sudoku mode, center', editMode: 'sudoku', submode: '3' }
]

// Runs in the page: types a digit into the single empty cell at `index` of the center list, as a key press does.
function typeDigitInPage ({ index, editMode, submode }) {
  pu.mode_set(editMode)
  pu.mode.pu_a[editMode][0] = submode
  pu.selection = [pu.centerlist[index]]
  pu.cursol = pu.centerlist[index]
  pu.key_number('5')
}

// The ways to delete the digit of one cell: the key handler and the edit mode it runs in.
const DELETES = [
  { name: 'backspace in number mode', key: 'key_backspace', editMode: 'number' },
  { name: 'space in number mode', key: 'key_space', editMode: 'number' },
  { name: 'space in sudoku mode', key: 'key_space', editMode: 'sudoku' }
]

// Runs in the page: puts a digit in the cell at `index` of the center list with no undo record, then deletes it through `key`.
function deleteDigitInPage ({ index, key, editMode }) {
  const cell = pu.centerlist[index]
  pu.pu_a.number[cell] = ['5', 1, '1']
  pu.mode_set(editMode)
  pu.selection = [cell]
  pu.cursol = cell
  pu[key]()
}

describe('undo after typing a number in a single cell', () => {
  for (const way of WAYS) {
    it(`removes one shaded cell, not two, when an undo of the number lay between them: ${way.name}`, async () => {
      const { context, page } = await openPenpa(browser())
      await page.evaluate(() => { pu.mode.qa = 'pu_a' })
      await page.evaluate(shadeInPage, FIRST_SHADED)
      await page.evaluate(typeDigitInPage, { index: TYPED, ...way })
      const typed = await page.evaluate(() => pu.pu_a.command_undo.__a.length)
      assert.equal(typed, 2, 'the digit was entered as one move on top of the shading')
      await page.evaluate(() => pu.undo())
      await page.evaluate(shadeInPage, SECOND_SHADED)
      await page.evaluate(() => pu.undo())
      const shaded = await page.evaluate(() => Object.keys(pu.pu_a.surface))
      const first = String(await page.evaluate((i) => pu.centerlist[i], FIRST_SHADED))
      assert.deepEqual(shaded, [first], 'the first shaded cell survives the undo of the second')
      await context.close()
    })
  }
})

describe('undo after deleting the digit of a single cell', () => {
  for (const way of DELETES) {
    it(`removes one shaded cell, not two, when an undo of the deletion lay between them: ${way.name}`, async () => {
      const { context, page } = await openPenpa(browser())
      await page.evaluate(() => { pu.mode.qa = 'pu_a' })
      await page.evaluate(shadeInPage, FIRST_SHADED)
      await page.evaluate(deleteDigitInPage, { index: TYPED, ...way })
      const deleted = await page.evaluate((i) => pu.pu_a.number[pu.centerlist[i]], TYPED)
      assert.equal(deleted, undefined, 'the digit was deleted')
      await page.evaluate(() => pu.undo())
      await page.evaluate(shadeInPage, SECOND_SHADED)
      await page.evaluate(() => pu.undo())
      const shaded = await page.evaluate(() => Object.keys(pu.pu_a.surface))
      const first = String(await page.evaluate((i) => pu.centerlist[i], FIRST_SHADED))
      assert.deepEqual(shaded, [first], 'the first shaded cell survives the undo of the second')
      await context.close()
    })
  }
})
