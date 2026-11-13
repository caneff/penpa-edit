// A constraint's `modeset`, `submodeset` and `styleset` are read by index, so they must be the same length.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../docs/js/constraints.js', import.meta.url), 'utf8')
const penpaConstraints = vm.runInNewContext(`${source}; penpa_constraints`)

// Every constraint the page offers, so one whose setting is missing or lacks `modeset` fails instead of being skipped.
const offered = Object.values(penpaConstraints.options).flat()

describe('penpa_constraints.setting', () => {
  it('lists the constraints the page offers', () => {
    assert.ok(offered.length > 0, 'at least one constraint is offered')
  })

  for (const name of offered) {
    it(`${name}: modeset, submodeset and styleset have equal length`, () => {
      const setting = penpaConstraints.setting[name]
      assert.ok(setting?.modeset, `setting.${name} has a modeset`)
      assert.deepEqual(
        { submodeset: setting.submodeset?.length, styleset: setting.styleset?.length },
        { submodeset: setting.modeset.length, styleset: setting.modeset.length }
      )
    })
  }
})
