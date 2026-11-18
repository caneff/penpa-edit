# Stream fit

The contract between `solve.html`'s desk and a stream userscript (twitch-rules-scroller's `sudokupad-sync.user.js`). It is written
for the userscript's side to be built against; the desk's side is `docs/ui/stream-fit.js` and the stream hooks in `docs/ui/desk.js`.
The words are `GLOSSARY.md`'s: Desk, Card, Board box, Side box, Ink rect. Tested by `live/stream-fit.live.mjs`.

## What it does

When a stream is on, the desk makes room for it instead of the userscript magnifying the canvas. On a request it:

- puts the board so its **ink rect** fills the **board box** on its limiting side, drawn at a whole cell size (so crisp, never scaled
  by CSS), centred on the other side; the Board card becomes the board box itself, with no header, border or shadow, and a white
  ground (black in the dark theme); the board coordinates are not drawn;
- puts the **Pinned**, **Mode** and **Mouse** cards in the **side box**, stacked top to bottom in that order, each at its own height, or all
  shortened in step down to their least height where the box is short. A Mouse card the solver closed stays closed;
- takes the **Rules** and **Recent** cards off the desk (the stream's scroller shows the rules);
- answers with the ink rect, and answers again whenever it changes.

Nothing is saved: the solver's kept layout (`chinstrap-solve-layout-v1` in localStorage) and the Rules text size kept beside it are
neither written nor removed while a stream fit is on, even by a card the solver moves or by Reset layout. A page opened without a request, or reloaded, shows the solver's own card
places. There is no request to leave the stream fit: a reload leaves it.

## Messages

Every message is a `window.postMessage` on the page's own `window`, an object whose `type` names it. All boxes and rects are in
**CSS px of the viewport** (the same space as `getBoundingClientRect()`), as `{ left, top, width, height }`.

| `type` | From | Meaning |
|---|---|---|
| `chinstrap:stream-fit-ready` | desk | The desk is built and answers requests. Sent once, when the desk is ready. |
| `chinstrap:stream-fit` | userscript | The request: `{ type, board, side }`, `board` the board box and `side` the side box. |
| `chinstrap:stream-fit-rect` | desk | The reply: `{ type, rect }`, `rect` the board's ink rect. |

The desk also sets `data-stream-fit="ready"` on `document.documentElement` at the same moment, for a userscript that starts after
the message was sent: it reads the marker, and listens for the message only when the marker is not there yet.

A request is heard only from the page's own window (`event.source === window`). A request whose `board` or `side` is not an object
with finite `left`, `top`, `width` and `height`, or has no width or height, is ignored, and the desk says why in the console. A
request sent before the desk is ready is lost: wait for the announcement.

## The boxes

- The **board box** is where the stream shows the board. The ink rect ends up inside it, with its limiting side (the shorter relative
  to the board's shape) within one cell step of the box's size, and centred along the other. Nothing but the board is inside it.
- The **side box** is beside it, outside the stream's crop. Its width is at least 280 px (the Mode card's least) and its height at
  least 440 px (the three cards' least heights and the two gaps between them); a smaller side box has the cards at those least sizes, running past it, and the desk says so in the console.
- Both boxes are cut to the desk (the window below the top bar) and to whole pixels, so a box that reaches past the window gets the
  part that is in it. Boxes wholly outside the window leave the desk as it was.
- A later request replaces the boxes; it is answered like the first.

## The reply

The ink rect is the bounding box of what the board draws other than its own margin, read from the board's pixels, in the same
space as the boxes. The desk sends it:

- once for each request;
- after the window is resized (the boxes held from the last request are cut to the new desk again);
- after the board's ink moves or changes size: a puzzle change inside the page (blank rows or columns added by Change size), or
  anything drawn outside the grid that widens the ink. A change inside the grid does not move the ink and sends nothing.

A reply can repeat the last rect (a resize that left the cut boxes as they were). A puzzle another link opens reloads the page,
which announces itself again, and a reload is no stream fit until a request comes: the userscript sends its request again after
every announcement.

## Not covered

The userscript's own side (finding the boxes, cropping, sending the rect on), phones and tablets, and what the stream does when
no reply comes.
