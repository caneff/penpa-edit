# Going back to automatic size after a manual resize

Asked by Chris, 2026-11-17, for the solve page's cards (#252): once a card is resized by hand, how does the solver return it to automatic sizing?

## How other apps do it

The shared convention is a **double-click on the edge that was dragged**: the panel snaps back to fitting its contents.

- **Excel.** Dragging a column boundary sets a width; double-clicking the boundary to the right of a column heading AutoFits it to its widest cell, and works on every selected column at once. Ribbon command: Home > Format > AutoFit Column Width. Source: https://support.microsoft.com/en-us/excel/change-the-column-width-and-row-height
- **Figma (auto layout).** Sizing per axis is *Hug contents*, *Fill container* or *Fixed*. Resizing by hand or typing a value switches that axis to Fixed. Double-clicking the frame's vertical or horizontal bounding-box edge sets that axis back to Hug contents; Alt/Option + double-click sets Fill container. Source: https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma
- **VS Code** (since 1.1, April 2016). Double-clicking a sash: the Explorer sidebar sizes to show its paths untrimmed, other side views go to minimum width, split editors to equal width, the bottom panel to minimum height. Requested because Sublime Text and Atom already resized the sidebar to its optimal width on a border double-click. Sources: https://code.visualstudio.com/updates/vApril, https://github.com/microsoft/vscode/issues/4660, https://github.com/microsoft/vscode/pull/4702

## What fits the solve page

Figma's model: each card axis is auto until dragged; a drag of an edge makes that axis fixed; a double-click on that edge (or its resize handle) returns that axis to auto. Per axis, so a hand-set width can keep an automatic height. Reset layout stays the way to return every card at once.
