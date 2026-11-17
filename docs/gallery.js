// The review page: lists GALLERY_PUZZLES (`gallery-puzzles.js`), opens the chosen one in `solve.html` inside an iframe of
// the chosen size, and keeps both in the page's address, as `?puzzle=<id>&size=<size>`.
(function () {
  const FILL = 'fill'
  // The sizes the solve page is laid out at, besides filling the window.
  const SIZES = ['1366x768', '1920x1080', FILL]

  const list = document.getElementById('puzzle-list')
  const stage = document.getElementById('stage')
  const sizePicker = document.getElementById('size')
  const previous = document.getElementById('previous')
  const next = document.getElementById('next')

  const indexOfId = (id) => GALLERY_PUZZLES.findIndex((p) => p.id === id)

  // A puzzle or size the address names that the page does not know falls back to the first puzzle and to filling.
  const params = new URLSearchParams(location.search)
  let current = Math.max(0, indexOfId(params.get('puzzle')))
  let size = SIZES.includes(params.get('size')) ? params.get('size') : FILL

  for (const name of SIZES) sizePicker.add(new Option(name === FILL ? 'Fill the window' : name, name))

  for (const puzzle of GALLERY_PUZZLES) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.id = puzzle.id
    button.append(puzzle.name)
    const detail = document.createElement('small')
    detail.textContent = `${puzzle.genre} · ${puzzle.shape}`
    button.append(detail)
    button.addEventListener('click', () => show(indexOfId(puzzle.id)))
    item.append(button)
    list.append(item)
  }

  // A new iframe each time: a changed `#` alone would not reload the solve page.
  function show (index) {
    current = index
    const puzzle = GALLERY_PUZZLES[current]
    for (const button of list.querySelectorAll('button')) {
      button.setAttribute('aria-current', String(button.dataset.id === puzzle.id))
    }
    previous.disabled = current === 0
    next.disabled = current === GALLERY_PUZZLES.length - 1
    const frame = document.createElement('iframe')
    frame.title = puzzle.name
    sizeFrame(frame)
    frame.src = `./solve.html${puzzle.link}`
    stage.replaceChildren(frame)
    writeAddress()
  }

  function sizeFrame (frame) {
    const [width, height] = size === FILL ? ['100%', '100%'] : size.split('x').map((n) => `${n}px`)
    frame.style.width = width
    frame.style.height = height
  }

  function writeAddress () {
    history.replaceState(null, '', `?puzzle=${GALLERY_PUZZLES[current].id}&size=${size}`)
  }

  // Moves the selection by `step` and keeps focus on the entry chosen.
  function step (by) {
    const index = current + by
    if (index < 0 || index >= GALLERY_PUZZLES.length) return
    show(index)
    list.querySelector('[aria-current="true"]').focus()
  }

  previous.addEventListener('click', () => show(current - 1))
  next.addEventListener('click', () => show(current + 1))
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    step(e.key === 'ArrowDown' ? 1 : -1)
  })
  sizePicker.addEventListener('change', () => {
    size = sizePicker.value
    sizeFrame(stage.querySelector('iframe'))
    writeAddress()
  })

  sizePicker.value = size
  show(current)
})()
