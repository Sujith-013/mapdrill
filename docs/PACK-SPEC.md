# Pack spec

The format a map pack's `pack.json` must follow, and how it's bound to an SVG.

## Schema

## Fields

## Groups and fill tokens

## Targets, aliases, and matching

## Label placement

## SVG binding (pathId)

Each `packs/<pack-id>/` directory holds `pack.json` next to a
`geometry.svg` containing one `<path id="...">` per subdivision.
`target.pathId` must match a `<path>` id in that file — enforced by
`tools/validate-pack.ts`, not just documented here.

## Validation

## Adding a new pack
