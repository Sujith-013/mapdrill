# Pack spec

The contributor-facing contract for adding a map pack to mapdrill. Read this
and you should be able to build and merge a pack without opening any source
file. It is kept in sync with three files — `packs/schema/pack.schema.json`,
`src/engine/types.ts`, and the checks implemented in `tools/validate-pack.ts`
— and this spec should agree with all three exactly; if a future change to
one of them drifts from this doc, that's a bug in whichever one moved.

No `pack.json` exists in this repo yet (the first pack,
`packs/kerala-tamil-nadu/`, currently has only a `SOURCE.md` stub — real
geometry is Step 2 of the build, not this doc). Every example value below is
illustrative, drawn from that pack's real districts, not copied from a
committed file.

## Anatomy of a pack

```
packs/<pack-id>/
  pack.json      # data: subdivisions, names, aliases, label placement
  geometry.svg   # shape: one <path> per subdivision, id-matched to pack.json
  SOURCE.md      # provenance: where the boundaries came from, and under what license
```

- **`pack.json`** is the only file the engine and UI read at runtime. It owns
  everything about a subdivision except its shape: canonical name, accepted
  aliases, which group (state/province) it belongs to, and where its label
  goes.
- **`geometry.svg`** owns shape only. It supplies the `<path>` the map view
  draws and hit-tests for Pin & Name clicks; it carries no names, no answer
  state, no color beyond what the token system assigns at render time.
- **`SOURCE.md`** owns provenance. It's what makes `geometry.svg`'s
  boundaries legally redistributable — see `packs/LICENSE-DATA.md` for why
  this is separate from the code's MIT license and mandatory per pack.

`pack-id` (the directory name) must match `pack.json`'s own `id` field and
satisfy `^[a-z0-9-]+$`.

## pack.json

Full field reference for `Pack`, `Group`, and `Target`, matching
`packs/schema/pack.schema.json` and `src/engine/types.ts` exactly. All
fields listed are **required**; both the schema and the types forbid
additional properties, so extra fields fail validation rather than being
silently ignored.

### Pack (top level)

| Field         | Type                               | Constraints                       | Example (south-india)                                        |
| ------------- | ---------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `id`          | `string`                           | `^[a-z0-9-]+$`                    | `"kerala-tamil-nadu"`                                        |
| `title`       | `string`                           | non-empty                         | `"South India"`                                              |
| `subtitle`    | `string`                           | —                                 | `"Kerala & Tamil Nadu districts"`                            |
| `attribution` | `string`                           | non-empty                         | `"District boundaries: <source>, <license>. See SOURCE.md."` |
| `viewBox`     | `[number, number, number, number]` | exactly 4 numbers, `[x, y, w, h]` | `[0, 0, 800, 1000]`                                          |
| `groups`      | `Group[]`                          | min 1 item                        | see below                                                    |
| `targets`     | `Target[]`                         | min 1 item                        | see below                                                    |

`viewBox` is passed straight through to the `<svg viewBox="...">` attribute
of `geometry.svg` at render time — the two must describe the same coordinate
space (see "geometry.svg" below).

### Group

One `Group` per fill-color grouping — typically one per state/province:

| Field       | Type     | Constraints                                                                                              | Example            |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------- | ------------------ |
| `id`        | `string` | `^[a-z0-9-]+$`, unique within the pack                                                                   | `"kerala"`         |
| `name`      | `string` | non-empty                                                                                                | `"Kerala"`         |
| `fillToken` | `string` | non-empty; a CSS custom property name **without** the `--` prefix, must exist in `src/styles/tokens.css` | `"region-primary"` |

Example, both groups of the south-india pack:

```json
"groups": [
  { "id": "kerala", "name": "Kerala", "fillToken": "region-primary" },
  { "id": "tamil-nadu", "name": "Tamil Nadu", "fillToken": "region-secondary" }
]
```

A pack isn't required to reuse `region-primary`/`region-secondary` — but any
new `fillToken` it introduces must be added to `tokens.css` first, as a pair
(full-saturation + `-muted`, per the active-play/results-screen split in
`docs/DESIGN-SYSTEM.md`). Neither the schema nor `validate-pack.ts` checks
that a `fillToken` actually resolves to a real CSS property — an unknown
token fails silently at render time (the browser drops an unresolvable
`var()`), not at `npm run validate:packs`. Check this visually.

### Target

One `Target` per nameable, clickable subdivision:

| Field         | Type                           | Constraints                                                    | Example                  |
| ------------- | ------------------------------ | -------------------------------------------------------------- | ------------------------ |
| `id`          | `string`                       | `^[a-z0-9-]+$`, unique within the pack                         | `"thiruvananthapuram"`   |
| `name`        | `string`                       | non-empty; the canonical/display answer                        | `"Thiruvananthapuram"`   |
| `aliases`     | `string[]`                     | each item non-empty; may be `[]`                               | `["trivandrum"]`         |
| `groupId`     | `string`                       | must equal some `Group.id` in the same pack                    | `"kerala"`               |
| `pathId`      | `string`                       | non-empty; must equal some `<path id="...">` in `geometry.svg` | `"thiruvananthapuram"`   |
| `labelPoint`  | `{ "x": number, "y": number }` | coordinates in `viewBox` space                                 | `{ "x": 421, "y": 812 }` |
| `labelAnchor` | `string` enum                  | one of `n ne e se s sw w nw`                                   | `"n"`                    |
| `tier`        | `integer` enum                 | one of `1 2 3`                                                 | `1`                      |

Full example, one target:

```json
{
  "id": "thiruvananthapuram",
  "name": "Thiruvananthapuram",
  "aliases": ["trivandrum"],
  "groupId": "kerala",
  "pathId": "thiruvananthapuram",
  "labelPoint": { "x": 421, "y": 812 },
  "labelAnchor": "n",
  "tier": 1
}
```

`aliases` are matched identically to `name` — same normalization pipeline
(`docs/PRD.md`, "Answer normalisation"), same fuzzy-match eligibility, no
ranking between an alias and the canonical name. Duplicate normalized names
across targets resolve-all per the PRD's duplicate-names rule: one correct
entry solves every target sharing that normalized name, and a pack author
relying on that should know it keys on the normalized string, not on
`Target.id`.

`id` uniqueness on `pathId` is **not** enforced by the schema or by
`tools/validate-pack.ts` — two targets could legally point at the same
`<path>`. Nothing in the engine currently depends on `pathId` being unique,
but a pack shouldn't do this deliberately; it isn't a supported way to
express, e.g., a multi-part district.

## geometry.svg

The contract:

- **One `<path>` per target**, each carrying an `id` attribute that some
  `Target.pathId` in the sibling `pack.json` references. Only `<path>`
  elements are scanned for ids (`extractSvgIds` in `tools/validate-pack.ts`)
  — an id on a `<rect>`, `<g>`, or anything else is invisible to validation
  and to the map view's rendering, which only draws targets by walking
  `pack.json`'s `targets` array and looking up each `pathId`.
- **Coordinate space matches `pack.viewBox`.** The SVG's own root
  `viewBox` attribute should describe the same `[x, y, w, h]` — this isn't
  cross-checked by tooling, so keep them in sync by hand. `labelPoint`
  coordinates on every target are also in this same space.

Disallowed:

- **No `transform` attributes on `<path>` elements**, and no nested `<g>`
  wrapping paths in a `transform`. Hit-testing and label placement both
  assume a path's `d` coordinates are final, untransformed points in
  `viewBox` space; a transform silently breaks that assumption instead of
  failing loudly.
- **No inline `style` or presentation attributes that set fill/stroke**
  (`style="fill:..."`, `fill="#..."`, `stroke="..."`, etc.) on paths. Fill is
  assigned entirely by the token system at render time — a group's
  `fillToken` for the base state, an answer-state token once solved/armed/
  missed. An inline fill wins the CSS cascade and silently overrides
  whichever state the engine thinks it's rendering.

## SOURCE.md

Required per `packs/LICENSE-DATA.md`, and required before `pack.json` can be
merged for that pack. Must record:

- **Origin** — exactly where the boundary geometry came from (e.g. a named
  government open-data portal, Natural Earth, an OpenStreetMap extract),
  specific enough that someone could re-fetch it.
- **License** — the license the source data is under, and confirmation it
  permits redistribution here (see `packs/LICENSE-DATA.md` for what
  "permits redistribution" needs to cover).
- **Attribution text** — the exact text required by that license, if any;
  this is what ends up in `pack.json`'s `attribution` field and/or UI
  chrome.
- **Retrieval date** — when the source data was fetched, since open-data
  portals revise boundaries over time and a later reader may need to know
  which vintage shipped.
- **Simplification applied** — any geometry simplification/generalization
  done on the way from source to `geometry.svg` (e.g. a Douglas-Peucker
  tolerance, a coordinate precision truncation), since a simplified boundary
  is no longer exactly the source's data.

`packs/kerala-tamil-nadu/SOURCE.md` currently has all five as `TODO` — it's
the placeholder for this pack's real geometry, added in a later step, not a
model to copy.

## Validation

Run:

```sh
npm run validate:packs
```

This wraps `tools/validate-pack.ts` and checks every pack directory under
`packs/` (anything with a `pack.json`, excluding `packs/schema/`) against
these rules, stated as what a contributor must satisfy:

1. **`pack.json` is schema-valid** against `packs/schema/pack.schema.json`.
   If this fails, none of the rules below run for that pack — a
   structurally broken file makes cross-reference checks meaningless noise.
2. **`geometry.svg` exists** alongside `pack.json` in the same directory.
3. **Every `Group.id` is unique** within the pack.
4. **Every `Target.id` is unique** within the pack.
5. **Every `Target.groupId` resolves** to some `Group.id` defined in the
   same pack.
6. **Every `Target.pathId` resolves** to a `<path id="...">` found in that
   pack's `geometry.svg`.

All violations for a pack are collected and reported together — it doesn't
stop at the first error. The command exits `0` only if every pack passes;
CI runs it on every PR touching `packs/`.

Passing output looks like:

```
OK    packs/kerala-tamil-nadu

1/1 packs valid.
```

A failing pack reports each violation under its `FAIL` line instead, e.g.:

```
FAIL  packs/kerala-tamil-nadu
      - target "kochi" references pathId "kochi" not found in geometry.svg
      - target "kochi" references unknown groupId "kochii"

0/1 packs valid.
```

(and the process exits non-zero.)

## Adding a pack — walkthrough

1. **Confirm the geometry is redistributable.** Check the source data's
   license against `packs/LICENSE-DATA.md` before doing any other work —
   there's no point building a pack you can't merge. Open the
   `.github/ISSUE_TEMPLATE/new-map-pack.yml` proposal issue first if unsure.
2. **Acquire boundary geometry** for the subdivisions (typically a
   shapefile or GeoJSON `FeatureCollection` from a government open-data
   portal, Natural Earth, or an OSM extract), one feature per subdivision,
   with a property holding each subdivision's name.
3. **Convert to pack geometry with `tools/geojson-to-pack.ts`.** This tool
   does not exist yet in this repo — it's planned, not stubbed, unlike the
   other `src/`/`tools/` files that currently throw `TODO`. Once built it's
   intended to take a GeoJSON `FeatureCollection` plus the name of the
   name-bearing property, and emit:
   - `geometry.svg` — one `<path id="...">` per feature, reprojected into a
     chosen `viewBox`, `id`s slugified from each feature's name property;
   - a draft `pack.json` — `targets` pre-filled with `id`, `name`, and
     `pathId` (each `labelPoint` defaulted to that feature's path centroid,
     per "Label placement" below), leaving `groups`/`fillToken`, `aliases`,
     `labelAnchor` tuning, and `tier` for hand-completion.
     Until it exists, both files have to be built by hand or with ad hoc
     scripting against this same contract.
4. **Hand-complete `pack.json`.** Assign `groups` (decide the
   state/province split and each one's `fillToken`, adding new tokens to
   `tokens.css` first if not reusing the existing pair). Fill in `aliases`
   for common alternate spellings. Review every `labelPoint`/`labelAnchor`
   the centroid default produced (see "Label placement") and correct the
   ones that land outside their region or collide with a neighbor. Assign
   `tier`.
5. **Write `SOURCE.md`** with the five required fields above.
6. **Run `npm run validate:packs`** and fix everything it reports, until
   the pack shows `OK`.
7. **Load the pack in the dev server** (`npm run dev`) and eyeball label
   placement and fill colors at the pack's fixed viewBox — validation
   checks structure, not legibility, and legibility is the actual bar
   (see "Zoom: not in v1" in `docs/PRD.md`: there's no pan/zoom escape
   hatch for a label that doesn't fit).

## Label placement

`labelPoint` is meant to default to the target's path centroid — that's
what step 3 of the walkthrough above (`tools/geojson-to-pack.ts`, once
built) is expected to compute automatically. But a centroid is only a
starting point, not a final answer, for two recurring reasons a pack author
has to fix by hand:

- **Concave regions.** A centroid is computed from the polygon's area, not
  its outline — for a crescent-, horseshoe-, or coastline-hugging district,
  the geometric centroid can land outside the shape entirely (in the bay a
  crescent wraps around, for instance). The map view doesn't clip or
  reposition labels that fall outside their own path, so an unfixed
  centroid here renders a label floating over a neighboring region.
- **Dense clusters.** Where several small subdivisions sit close together
  (common in a district-level pack), their centroids can sit close enough
  that revealed labels overlap or collide, even though each centroid is
  individually correct for its own shape.

`labelPoint` and `labelAnchor` both exist as hand-tunable overrides for
exactly these cases: move `labelPoint` to wherever the label should
actually sit, and use `labelAnchor` to control which corner/edge of the
label text anchors to that point — e.g. anchoring `"nw"` instead of
centering lets a label sit fully inside a narrow region, or stay clear of a
neighbor's label when nudged off-center.

`tier` records label-priority ordering for collision resolution: tier 1 is
the highest priority (large/prominent subdivisions, whose labels should
always render and never be the one dropped or de-prioritized when neighbors
crowd each other), tier 3 the lowest (small subdivisions most likely to
need their label suppressed or deferred first in a dense cluster). Nothing
in the current `map-view.ts` stub implements automatic collision
resolution yet — `tier` is captured per target from pack authoring onward
so that a later pass has the data to use, the same "collect now, consume
later" pattern as the per-target miss counts noted in `docs/PRD.md`
("Deferred").
