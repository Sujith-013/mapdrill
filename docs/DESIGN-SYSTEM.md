# Design system

The visual language for mapdrill's map view and chrome, derived from the
reference art in `docs/reference/` and encoded as CSS custom properties in
`src/styles/tokens.css`.

## Reference art

- `docs/reference/south-india-labelled.png` — target look, fully labelled.
- `docs/reference/south-india-blank.png` — same map unlabelled, the quiz
  start state.

These are a visual target only, not a data source (see
`docs/reference/README.md`).

## The intended look, in words

- Near-black plate background.
- Two-tone region fills: subdivisions colored by which state/group they
  belong to (e.g. Kerala vs Tamil Nadu), not by answer state.
- Thin, light hairline borders between individual districts.
- Yellow district labels.
- A small yellow compass rose, bottom-right.
- A title block top-left, in white and yellow (region name in white, the
  two states named in yellow, per the reference art's "The Soul of the
  South / Kerala & Tamil Nadu" treatment).

## Color tokens: sampling method

Colors were sampled empirically from the reference PNGs with Pillow
(`python3`, `PIL.Image` + `numpy`), not picked by eye. Method:

- **`south-india-blank.png`** (no labels, so background + the two region
  fills dominate): loaded as RGB, flattened to a pixel array, then masked
  and averaged per region:
  - **plate background** — pixels with all channels < 40, excluding pure
    `#000000` (that's the phone-screenshot letterbox, not the map plate).
    439,981 px matched; mean and median agreed to the pixel (`(30, 32, 31)`).
  - **region-primary (Kerala, blue)** — pixels where `blue > red + 15` and
    `40 < blue < 140`. 45,362 px matched; median `(29, 62, 89)` used over
    mean (anti-aliased edge pixels skew the mean slightly lighter).
  - **region-secondary (Tamil Nadu, maroon)** — pixels where
    `red > blue + 5`, `35 < red < 100`, `blue < 70`. 137,398 px matched;
    mean and median agreed (`(63, 51, 51)`).
- **`south-india-labelled.png`** (for label/title color): district labels
  are thin anti-aliased glyphs on a near-black background, so most
  "yellow-ish" pixels are edge blends, not the fill color. Used a strict
  mask (`red > 190`, `green > 180`, `blue < 90`) to isolate the least
  blended pixels — only 17 px matched, mean `(197, 203, 81)`. **Lower
  confidence than the region/plate samples** because of that small sample;
  treat as the best available estimate, not a certainty, until a
  vector/source version of the reference art turns up.
  - Title white (`#ffffff`) was checked the same way (`red,green,blue >
200`) and matched closely enough (`~ (252,252,252)`) that the existing
    token was left unchanged.

## Sampled vs previous token values

| Token                | Previous  | Sampled    | Change                   |
| -------------------- | --------- | ---------- | ------------------------ |
| `--plate-bg`         | `#121212` | `#1e201f`  | updated                  |
| `--region-primary`   | `#2b4a5e` | `#1d3e59`  | updated                  |
| `--region-secondary` | `#4a3230` | `#3f3333`  | updated                  |
| `--label-color`      | `#f4e04d` | `#c5cb51`  | updated                  |
| `--title-primary`    | `#ffffff` | `~#fcfcfc` | unchanged (within noise) |

`--plate-bg-alt` has no reference-art equivalent (it's a UI-only hover/alt
shade); it was shifted by the same delta as `--plate-bg` to stay
proportional, not independently sampled.

## Tokens

See `src/styles/tokens.css` for the concrete custom properties (plate,
region fills — full and muted — hairline, label, title, compass, and
answer-state colors).

## RESOLVED — fill color: group identity vs. answer state

The reference art uses fill color to encode which **state** a district
belongs to (the two-tone blue/maroon split). The quiz also needs fill color
to encode **answer state** (unsolved / solved / solved-on-retry / missed),
and the two compete for the same channel. Resolution:

- **Start screen and results screen** render regions at full reference-art
  saturation (`--region-primary` / `--region-secondary`) — these are the two
  moments the player reads the map as a picture, so it should look like the
  poster.
- **During active play**, base region fills use the desaturated variants
  (`--region-primary-muted` / `--region-secondary-muted` — a 60% mix toward
  `--plate-bg`), so answer-state color carries all signal unambiguously.
  This also makes the give-up reveal (`--state-missed` filled across every
  unsolved target) read instantly instead of competing with two
  mid-saturation base fills.

`ui/map-view.ts` should pick the fill-token pair (full vs muted) based on
whether a session is idle/complete or running/surrendered.
