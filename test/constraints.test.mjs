// Each constraint's `modeset`, `submodeset` and `styleset` are read by index in main.js, so they must be the same length.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../docs/js/constraints.js', import.meta.url), 'utf8')
const penpaConstraints = vm.runInNewContext(`${source}; penpa_constraints`)

describe('penpa_constraints.setting', () => {
  for (const [name, setting] of Object.entries(penpaConstraints.setting)) {
    if (!setting.modeset) continue
    it(`${name}: modeset, submodeset and styleset have equal length`, () => {
      assert.deepEqual(
        { submodeset: setting.submodeset.length, styleset: setting.styleset.length },
        { submodeset: setting.modeset.length, styleset: setting.modeset.length }
      )
    })
  }
})
