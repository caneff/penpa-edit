// Replaying a recording (GLOSSARY.md) on the engine. Not a check itself, so `live/**/*.live.mjs` skips it.

// Runs in the page. Builds a 4x4 grid whose author's answer shades two cells, checked as shading, and returns its solve
// link's `#` part.
export function surfaceSolveLinkInPage () {
  // Indices in `pu.centerlist` of the cells the author's answer shades.
  const answerCells = [5, 9]
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  for (const box of [...document.getElementsByClassName('solcheck'), ...document.getElementsByClassName('solcheck_or')]) box.checked = false
  document.getElementById('sol_surface').checked = true
  for (const index of answerCells) pu.pu_a.surface[pu.centerlist[index]] = 1
  const url = pu.maketext_solve_solution()
  return url.slice(url.indexOf('#'))
}
