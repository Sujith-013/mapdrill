# Reference art

Two reference images live in this directory. They are a **visual target
only** — they establish the intended look and feel of the rendered map, not
a source of geometry, district names, or coordinates. All actual pack data
comes from `packs/<pack-id>/pack.json`, sourced and licensed per
`packs/LICENSE-DATA.md`.

- **`south-india-labelled.png`** — the target look: near-black plate,
  two-tone region fills (Kerala vs Tamil Nadu), yellow district labels,
  yellow compass rose, white+yellow title block. This is what a completed
  or fully-labelled session should evoke.
- **`south-india-blank.png`** — the same map unlabelled: the quiz start
  state, before any subdivision has been named.

See `docs/DESIGN-SYSTEM.md` for how this look translates into tokens and
component styling, including the open question on how answer-state color
(solved/retry/missed) coexists with the state-fill color shown here.
