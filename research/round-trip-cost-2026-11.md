# What a save/load round trip costs, and why the fuzz timed out on CI

Measured for #126 on 2026-11-15, on this WSL box with Playwright's headless Chromium, by throwaway scripts that are not
kept. "Pinned" means the run was held to 2 cores with `taskset -c 2,3`. CPU time is the busy time of those two cores in
`/proc/stat`. `/usr/bin/time` misses most of Chromium's renderer processes, so it under-reads by about 3×.

## The cause

Before this change, the fuzz (`live/fuzz.mjs`) opened a fresh page in a context of its own after every checkpoint, to
check that the board's Clone link loads back to the same canonical state.

- Akari, seed 3, 60 steps: 9.5 s alone, of which 6.3 s was opening those pages. It has 33 checkpoints.
- Seed 3 makes 33 checkpoints on every puzzle, seed 1 makes 27 and seed 2 makes 23. The input kinds a seed draws do not
  depend on the puzzle. This is why seed 3 is the slowest seed on every puzzle in CI's log of run 43801405380 (surface
  54 s, number 57 s, akari over 60 s). Every fuzz test there took 38 to 60 s, so seed 3 was simply nearest the limit.
- A fresh page costs about 300 ms of CPU, about 74% of a run's 13.6 s. Penpa+'s own JS is under 10 ms of that. The rest
  is Chromium parsing 43 scripts, styling 2,165 elements and starting a renderer process. A smaller viewport barely
  changes it (14.4 s against 15.8 s for 60 loads).
- Four runs at once on 2 pinned cores saturate the CPU (55 s busy, 1.5 s idle) and take 26 to 27 s each. CI's 60 s is
  about 2.2× that, which fits slower and shared runner cores. So CI time follows CPU per run, not waiting.

## What was cut

| Change | Effect |
|---|---|
| Skip a round trip whose link equals an earlier one except for the timer line, with the same expected board | 13 of akari seed 3's 33 loads. The timer line only starts the stopwatch, and canonical state leaves the timer out. |
| Load each round trip in one reused page per lane (`openReloader`), not a new context's page | about 254 ms of CPU per load against 304 ms. Wall time per load is about 146 ms against 204 ms. |
| Run the fuzz's round trips in `roundTrips`' 4 lanes beside its steps, as the replay already did | Wall time only, and only where a core is free. |

Result for akari seed 3, 60 steps, each run a script of its own that launches its own Chromium:

| | Alone | CPU per run | 4 at once, 2 pinned cores |
|---|---|---|---|
| Before | 9.6 s | 13.6 s | 26 to 27.7 s |
| After | 5.2 s | 8.6 s | 16.8 to 18.7 s |

Inside `live/fuzz.live.mjs`, whose tests share one Chromium launched before them, the same test took 3.1 s after the
change. Before the change, the test's time there was not measured.

What this predicts for CI is not settled here. Scaling the four-at-once time by the 2.2× above gives 37 to 41 s, still
over #126's 30 s bar. The four copies are all fuzz runs and keep both cores busy for their whole length, so that is an
upper estimate. The CI log of the PR is the measurement that counts.

## Why the reused page is a fresh boot

Penpa+ keeps a puzzle's progress in localforage's IndexedDB database and saves it on `beforeunload`. At boot,
`PenpaProgress.tryLoad` reads that progress back in place of the link. It also keeps user settings in cookies. A reused
page that kept these stores would load the earlier link's progress and hide a link that drops data. So
`openReloader` navigates through `about:blank`, so the page's globals start over. It also clears the cookies once the
old page has unloaded. An init script empties localStorage and sessionStorage and deletes the `localforage` database
before any page script runs. IndexedDB runs the delete before the page's own open of that database.
`live/round-trip.live.mjs` checks that a second load sees none of the first page's entries.

Loading a link in place with Penpa+'s `load()` would avoid the page load, but `load()` only sets the fields a link
carries. For example, it sets `nb_sudoku1` when the link says so and never clears it, so state would carry over from
one round trip to the next.
