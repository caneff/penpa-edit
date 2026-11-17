# Engine replay profile (#267), 2026-11-17

Local run, one replay at a time, nothing else on the page, engine driver, three recordings. Times in ms.

| recording | steps | boot of the replay's own page | steps + checkpoint reads | round-trip loads (count, summed time over 4 lanes) | whole replay |
|---|---|---|---|---|---|
| genre-tool/combi-akari | 43 | 344 | 865 | 13, 5341 | 1903 |
| genre/nagenawa | 39 | 382 | 786 | 9, 3766 | 1644 |
| grid/tri-sudoku | 52 | 328 | 1205 | 15, 4894 | 1782 |

Findings:

- The replay's own boot is about 0.35 s of about 1.8 s, around 20%. Steps and reads take about 0.8 to 1.2 s.
- `replay()` also starts a round trip at every checkpoint (`roundTrips`): the duplicate link of the board loaded in a page
  booted afresh, 9 to 15 loads per recording at about 0.35 to 0.4 s each, run in 4 lanes beside the steps. These loads are
  already one reused page per lane (`openReloader`); each load is still a full boot, because a navigation is what resets the page.
- The ticket's median of 4.9 s per recording is CI's, where 4 test files and the lanes share the CPU: the loads' summed
  time (about 4 to 5 s) matches it.
- So reusing the replay's own page saves at most the one boot per recording (about 0.35 s of 1.8 s). The cost is the
  round-trip loads: boots of the same kind the ticket's design would keep.

## After: round trips at every k-th checkpoint

Wall time on the shared box swings with other sessions' load (one part ran slower with fewer round trips), so the
comparison is CPU time (`time` of `node --test live/engine-replay-1.live.mjs`, browser processes included), part 1 of 3, 178 tests:

| round trips | user + sys CPU, s | against full |
|---|---|---|
| every checkpoint (full mode) | 261 | |
| first, every 4th, last | 160 | -39% |
| first, every 8th, last | 126 | -52% |
| first and last only | 75 | -71% |

k = 8 took the part's CPU time down by half, but CI's summed replay time fell only 34% (841 s on master 67510ab, 553 s at k = 8, d4cf0f7; the controller's sum of the 268 "replays … to its expected states" tests), so the default is now the first and last checkpoint only (k = Infinity). Wall time of the three parts summed, k = 4 against full:
517 s to 375 s (-27%), a noisy reading.

Per replay, part 1 is 178 replays: full mode 1.47 s of CPU each, first/every 8th/last 0.71 s each.
