# Map data source selection — Kerala & Tamil Nadu districts

Step 2, part 1: source evaluation for `packs/kerala-tamil-nadu`. No geometry is
fetched or converted here — this is the license/coverage decision that
`SOURCE.md`'s five `TODO`s (see `docs/PACK-SPEC.md`) get filled in from, once
building the pack actually starts.

## Hard requirements

1. License permits redistribution inside a public MIT-licensed repo (code
   stays MIT; pack data is licensed separately per `packs/LICENSE-DATA.md`).
2. Post-2020 Tamil Nadu boundaries — 38 districts, including the six carved
   out of the 2019–2020 reorganisation: **Tenkasi, Kallakurichi,
   Chengalpattu, Ranipet, Tirupathur, Mayiladuthurai**. A Census-2011-based
   dataset has 32 TN districts and is missing all six.
3. Kerala has all 14 districts.

## Candidates

| Candidate                                                    | Req 1 — redistribution license                                                                                                                      | Req 2 — post-2020 TN (38, incl. the 6 new)                                                                                                                                                                                                                                                 | Req 3 — Kerala 14/14         | Verdict                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------- |
| **GADM**                                                     | ❌ GADM's terms explicitly forbid redistribution and it supplies no provenance chain for its boundaries                                             | not checked — moot                                                                                                                                                                                                                                                                         | not checked — moot           | **Disqualified (Req 1)**   |
| **DataMeet** (`datameet/maps`, `Districts/`)                 | ✅ CC BY 2.5 India — redistribution with attribution is permitted                                                                                   | ❌ 32 districts. The repo's own directory structure names the vintage (`Districts/Census_2001/`, `Districts/Census_2011/`); parsing `2011_Dist.dbf` directly confirms 32 TN districts with `Tenkasi`, `Kallakurichi`, `Chengalpattu`, `Ranipet`, `Tirupathur`, `Mayiladuthurai` all absent | ✅ 14/14 present             | **Disqualified (Req 2)**   |
| **geoBoundaries ADM2 — India** (`gbOpen`)                    | ✅ ODbL 1.0 (this release's own `boundaryLicense` field — see "License" below), redistribution and derivative databases permitted under share-alike | ✅ `boundaryYearRepresented: 2021`, `sourceDataUpdateDate: 2023-01-19`. All 38 TN districts present by exact name in `shapeName`, including the six new ones (see spellings below)                                                                                                         | ✅ 14/14 present             | **Passes all**             |
| **OSM-derived extract** (e.g. Overpass on `admin_level=5/6`) | ✅ ODbL 1.0 (OpenStreetMap's own license, same terms as above)                                                                                      | ⚠️ Plausible — OSM has had the six new TN districts mapped for a while — but there is no single canonical, versioned extract to point at; it would mean running a fresh Overpass query and verifying each relation by hand, not evaluating an existing dataset                             | not verified — see reasoning | Viable, not chosen         |
| Natural Earth                                                | ✅ Public domain                                                                                                                                    | ❌ No ADM2/district-level layer for India at all — state level only                                                                                                                                                                                                                        | ❌ same                      | **Disqualified (Req 2/3)** |

## Chosen source: geoBoundaries ADM2 — India (`gbOpen`)

**Reasoning:** it's the only candidate that clears all three hard
requirements against a real, versioned, citable release rather than a
one-off extraction I'd have to re-justify later. DataMeet is
better-known and more permissively licensed but is Census-2011 vintage —
exactly the trap requirement 2 calls out — and the repo's own folder names
(`Census_2001`, `Census_2011`) say so before you even open a file. An OSM
Overpass extract would likely also pass, but geoBoundaries already packages
an OSM-license-equivalent (ODbL), current (2021/2023), single-file release
with stable provenance metadata, so there's no reason to hand-roll the OSM
route instead.

## License

The **release-specific** metadata for this exact dataset (queried from
geoBoundaries' API, not inferred from their marketing page) states:

```
boundaryLicense: "Open Data Commons Open Database License 1.0"
licenseDetail:   "Open Data Commons Open Database License 1.0"
licenseSource:   geonode.pathwaysdata.com/layers/geonode
boundarySource:  Pathways Data Pvt. Ltd., lgdirectory.gov.in
```

Note the discrepancy worth recording: geoBoundaries' own homepage describes
their overall `gbOpen` product as "CC-BY 4.0." That's true for boundaries
they compiled themselves, but the **per-file metadata for this specific
India ADM2 release** reports ODbL 1.0, because India's boundaries are
passed through from a third-party ODbL source (Pathways Data Pvt. Ltd. /
`lgdirectory.gov.in`) rather than compiled by geoBoundaries directly. The
per-file field is the authoritative value for this dataset — treat it as
ODbL 1.0, not CC-BY 4.0.

ODbL 1.0 permits redistribution and creating derivative databases, under
share-alike (see below). It's on the OSI/OKF-recognized open-license list
and is used by OpenStreetMap itself, so it's a well-understood term for a
public repo to carry.

### Required attribution — verbatim text to use

geoBoundaries' own citation request (from their site):

> Runfola, D. et al. (2020) geoBoundaries: A global database of political
> administrative boundaries. PLoS ONE 15(4): e0231866.

ODbL 1.0 §4.3 requires, for a Produced Work, "a notice associated with the
Produced Work reasonably calculated to make any Person that uses, views,
accesses, interacts with, or is otherwise exposed to the Produced Work
aware that Content was obtained from the Database... and that it is
available under this License," giving this example format:

> Contains information from DATABASE NAME, which is made available here
> under the Open Database License (ODbL).

Combining both into the attribution string this pack's `SOURCE.md` and
`pack.json`'s `attribution` field should carry:

> District boundaries contain information from geoBoundaries
> (Runfola, D. et al. 2020, PLoS ONE 15(4): e0231866; www.geoboundaries.org),
> sourced from Pathways Data Pvt. Ltd. / lgdirectory.gov.in, made available
> under the Open Database License (ODbL) v1.0.

## Retrieval

- URL: `https://www.geoboundaries.org/api/current/gbOpen/IND/ADM2/`
  (metadata), geometry at
  `https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM2/geoBoundaries-IND-ADM2.geojson`
- Commit pinned: `9469f09` (geoBoundaries' own release commit, per the API's
  `staticDownloadLink`/`gjDownloadURL`)
- Date retrieved (this evaluation): 2026-08-28

## ODbL share-alike: what it obligates for pack files, and why that's fine next to MIT code

ODbL's share-alike clause (§4.4) attaches to **Derivative Databases** — a
structured, queryable rework of the source data — not to the code that
reads it. `geometry.svg` + the geometry-derived parts of `pack.json`
(paths, boundaries, per-district names) are exactly that kind of rework, so
they count as a Derivative Database, not merely a "Produced Work" (ODbL's
own example of a Produced Work is a rendered map image with no underlying
structured data left in it — that's not what a `pack.json` is).

Concretely, that means for `packs/kerala-tamil-nadu`:

- The geometry (`geometry.svg`, and the geometry-derived fields of
  `pack.json`) must itself be redistributable under ODbL 1.0 or a
  ODbL-compatible license — i.e. **the pack's data license is ODbL 1.0**,
  recorded in that pack's `SOURCE.md`, not MIT.
- The attribution notice above must ship with the pack (in `SOURCE.md` and
  surfaced via `pack.json`'s `attribution` field, per `docs/PACK-SPEC.md`).
- Any alterations made getting from source to `geometry.svg` (simplification
  tolerance, reprojection, coordinate rounding) must be disclosed — this is
  already `SOURCE.md`'s required "Simplification applied" field — and the
  result made available at no more than reasonable cost, which a public
  GitHub repo satisfies by construction.

This does **not** propagate to the code. `packs/LICENSE-DATA.md` already
draws this line for exactly this reason: MIT covers `src/`, `tools/`, and
everything else that isn't map data; each pack's own boundary data is
licensed on its source's terms, declared in that pack's `SOURCE.md`. ODbL on
`packs/kerala-tamil-nadu/{geometry.svg,pack.json}` and MIT on the engine
that reads them are two separate license grants over two separate files,
with no clause in either one that reaches into the other.

## How requirement 2 was verified

Not inferred from the dataset's description, release notes, or feature
count — the actual property values were inspected directly:

- Downloaded the release's `_simplified.geojson` (~8 MB; the full-resolution
  file is git-LFS at ~48 MB — used the simplified one specifically to avoid
  pulling bulk geometry for what's a metadata check) to a scratch directory,
  not committed anywhere.
- Extracted every feature's `shapeName` property (735 national records) and
  confirmed, by exact string match, all 38 Tamil Nadu district names — most
  usefully the six new ones, present as `Tenkasi`, `Kallakurichi`,
  `Chengalputtu` (geoBoundaries' spelling of Chengalpattu), `Ranipet`,
  `Tirupathur`, `Mayiladuthurai` — and separately confirmed the six
  districts they were carved from (`Tirunelveli`, `Viluppuram`,
  `Kancheepuram`, `Vellore` ×2, `Nagapattinam`) still exist as their own,
  smaller districts rather than having been left un-split.
- Did the same exact-match check for all 14 Kerala district names.
- For DataMeet, downloaded only `Districts/Census_2011/2011_Dist.dbf`
  (55 KB, attribute table only, no geometry) and parsed its `DISTRICT`/
  `ST_NM` fields directly: 32 Tamil Nadu records, none matching any of the
  six new district names, confirming the disqualification.
- Scratch files were discarded after inspection; nothing from this
  verification is committed.
