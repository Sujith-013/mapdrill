# Source: South India (Kerala & Tamil Nadu) districts

The 14 districts of Kerala and 38 districts of Tamil Nadu (52 targets
total). Selection reasoning and the full candidate comparison live in
`docs/DATA-SOURCES.md` — this file records only what
`docs/PACK-SPEC.md` requires for this specific pack.

- **Boundary geometry source:** geoBoundaries ADM2 — India (`gbOpen`
  release), commit `9469f09`:
  `https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM2/geoBoundaries-IND-ADM2.geojson`.
  Boundary year represented: 2021; upstream source data updated
  2023-01-19 (per that release's own API metadata at
  `https://www.geoboundaries.org/api/current/gbOpen/IND/ADM2/`).

- **License:** Open Data Commons Open Database License 1.0 (ODbL) — this
  is the release's own per-file `boundaryLicense`, not geoBoundaries'
  general "CC-BY 4.0" marketing claim (see `docs/DATA-SOURCES.md` for why
  the two differ for this particular country). ODbL permits redistribution
  and derivative databases under share-alike; see "Share-alike" below for
  what that means for this pack's files specifically.

- **Required attribution:**

  > District boundaries contain information from geoBoundaries
  > (Runfola, D. et al. 2020, PLoS ONE 15(4): e0231866; www.geoboundaries.org),
  > sourced from Pathways Data Pvt. Ltd. / lgdirectory.gov.in, made available
  > under the Open Database License (ODbL) v1.0.

  This exact string is `pack.json`'s `attribution` field.

- **Restrictions:** Share-alike (ODbL §4.4) applies to this pack's
  geometry files specifically — see "Share-alike" below.

- **Retrieval date:** 2026-08-28.

- **Trimming and enrichment applied (source of truth for the bake):**
  `source/geoBoundaries-IND-ADM2-kerala-tamil-nadu.geojson` in this
  directory is the upstream release above, filtered from all 735 Indian
  ADM2 features down to exactly the 52 Kerala + Tamil Nadu features (by
  exact `shapeName` match), committed so the bake is reproducible from the
  repo alone without re-downloading 48 MB from GitHub LFS. Every other
  property on every feature — `shapeName` included — is untouched from
  upstream. The one addition: each feature got a `STATE` property
  (`"Kerala"` or `"Tamil Nadu"`) stamped on, since the upstream file
  carries no state/ADM1 field at all (only country-level `shapeGroup:
"IND"`) and `tools/geojson-to-pack.ts` needs some property to both
  filter by and derive `pack.json`'s two `groups` from. The state each
  district belongs to is well-established and not itself sourced from
  geoBoundaries.

- **Simplification applied:** `tools/geojson-to-pack.ts` defaults —
  Douglas-Peucker, tolerance 1.5 (SVG px, in the pack's 800x1000
  `viewBox`), applied after projection. Reduced `geometry.svg` from
  1,768,329 bytes (unsimplified) to 61,478 bytes (-96.5%) with all 52
  features retained. Command run:

  ```sh
  npx tsx tools/geojson-to-pack.ts \
    --input packs/south-india-districts/source/geoBoundaries-IND-ADM2-kerala-tamil-nadu.geojson \
    --id south-india-districts \
    --name-prop shapeName \
    --group-prop STATE \
    --regions "Kerala,Tamil Nadu" \
    --title "South India" \
    --subtitle "Kerala & Tamil Nadu districts" \
    --attribution "District boundaries contain information from geoBoundaries (Runfola, D. et al. 2020, PLoS ONE 15(4): e0231866; www.geoboundaries.org), sourced from Pathways Data Pvt. Ltd. / lgdirectory.gov.in, made available under the Open Database License (ODbL) v1.0." \
    --out-dir packs/south-india-districts
  ```

  followed by one hand-completion pass (per `docs/PACK-SPEC.md` step 4):
  five targets were renamed from the source's spelling to the canonical
  name this pack's target list requires (source spelling moved into
  `aliases`), and every target's `aliases` was populated. See "Name
  divergences from the source" below for the renames, and `pack.json`
  directly for the full alias lists.

## Share-alike

ODbL's share-alike clause attaches to **Derivative Databases** (§4.4) —
`geometry.svg` and the geometry-derived fields of `pack.json` count as
one, since they're a structured rework of geoBoundaries' district
boundaries, not just a static rendered image. Concretely:

- `packs/south-india-districts/{geometry.svg,pack.json}` are licensed
  under ODbL 1.0, **not** the repo's MIT license — MIT covers `src/` and
  `tools/` only, per `packs/LICENSE-DATA.md`.
- The attribution notice above ships with the pack (this file, and
  `pack.json`'s `attribution` field).
- The trimmed source this bake was built from — the "alterations" ODbL
  §4.6 requires be disclosed — is committed at `source/` in this same
  directory, so the derivation is fully reproducible from the repo alone.

## Name divergences from the source

Per the task that produced this pack: `target.name` uses the district
name list given directly, not the source's spelling, wherever the two
differ. The source spelling is preserved in `aliases[]` so it still
matches during play. All five divergences:

| `target.name` (canonical) | geoBoundaries `shapeName` |
| ------------------------- | ------------------------- |
| Tuticorin                 | Thoothukkudi              |
| Tiruchirapalli            | Tiruchirappalli           |
| Villupuram                | Viluppuram                |
| Kanchipuram               | Kancheepuram              |
| Chengalpattu              | Chengalputtu              |

Every other target's `name` matches geoBoundaries' `shapeName` exactly.
