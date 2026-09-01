# Map pack data licensing

The mapdrill **code** is MIT licensed (see `/LICENSE`). Map pack **geometry
and data** — the subdivision boundaries, coordinates, and names shipped in
each `packs/<pack-id>/pack.json` — are **not** covered by that license.

Each pack's geometry is licensed separately, on whatever terms its source
data allows. Some pack sources permit redistribution under permissive or
share-alike terms; others may restrict commercial use or require specific
attribution. There is no single blanket license for "the data" — it is
per-pack.

## What this means in practice

- Before adding a pack, check the license of its source geometry (e.g. a
  government open-data portal, Natural Earth, OpenStreetMap-derived
  boundaries) and confirm it permits redistribution in this project.
- Every pack directory **must** contain a `SOURCE.md` recording:
  - where the boundary geometry came from
  - the license it is under
  - required attribution text, if any
  - any restrictions (non-commercial, share-alike, etc.)
- If a pack's source license conflicts with redistribution here, the pack
  cannot be merged as-is — open an issue to discuss alternatives (e.g.
  redrawing simplified boundaries from a permissively licensed source).

See `.github/ISSUE_TEMPLATE/new-map-pack.yml` for the proposal template used
when contributing a new pack.
