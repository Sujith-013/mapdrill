# PRD

## Purpose

mapdrill is a self-hosted drill for memorizing the names and locations of a
region's subdivisions from a blank map. It's for anyone studying geography by
rote — students, quiz-team prep, travelers — who wants a fast, offline,
no-account tool rather than a quiz app with a login screen. One pack (South
India's districts) ships first; the format is built to take more.

## Core model

One engine, two modes, differing only in where the prompt comes from: Free
Recall gets the next target from whatever the player types; Pin & Name gets
it from whatever the player clicks. Both drive the same `Session` through
`engine/session.ts` — matching, scoring, and the timer don't know which mode
is running.

State machine:

```
IDLE -> RUNNING -> COMPLETE
              \  -> SURRENDERED
              \  -> TIMEOUT
```

Mode B additionally has:

```
RUNNING <-> ARMED(targetId)
```

Transitions:

- `IDLE -> RUNNING`: player starts the session (`startSession`). Timer starts.
- `RUNNING -> COMPLETE`: every target reaches `solved`/`solvedRetry`.
- `RUNNING -> SURRENDERED`: player gives up (`giveUp`). Timer freezes.
- `RUNNING -> TIMEOUT`: budgeted timer reaches 0. Timer freezes; behaves like
  give-up (unsolved targets are filled `missed`, labels shown).
- `RUNNING -> ARMED(targetId)` (Mode B only): player clicks an unsolved
  target's region.
- `ARMED(targetId) -> RUNNING` (Mode B only): correct answer (target solved),
  Esc, or clicking elsewhere. Wrong answer stays in `ARMED(targetId)`.
- `COMPLETE`/`SURRENDERED`/`TIMEOUT` are terminal for that session. A new
  session (fresh or `replayMisses`) starts a new `IDLE`.

## Mode A — Free Recall

Single always-focused text box (`ui/input-box.ts`) sits over the map.
`handleInput` runs on every keystroke — no Enter required. Input is matched
against unsolved targets only (`matcher.findMatch`, which searches the whole
pack but callers only care about unsolved ones); already-solved targets are
never re-matched. On match: clear the box, mark that target's state
`solved` (or `solvedRetry` per the duplicate-name rule below), fill it green,
reveal its label. Wrong or partial input has no penalty and never clears the
box — the player keeps typing until it resolves or they stop.

## Mode B — Pin & Name

Click an unsolved region to arm it (`handleArm` -> `ARMED(targetId)`). Type
into the input box and press Enter to answer; the input is compared against
that armed target only, never the whole pack. Correct: state goes green
(tiered, see below), target disarms, session returns to `RUNNING`. Wrong: the
region shakes, stays armed, `attempts[targetId]` increments, input clears for
another try. Esc or clicking outside the map (or on a different unsolved
region, which re-arms instead) disarms without penalty.

Tiered result color, keyed off `attempts[targetId]` at the moment it's
solved:

- 1 attempt -> `solved` (green)
- 2–3 attempts -> `solvedRetry` (amber)
- 4+ attempts -> `solvedRetry` still applies visually as grey-green (see
  Visual states) — same state value, the darker shade is a display-only
  distinction, not a third `TargetState`.

## Give up

Available any time `status === 'running'` (or `ARMED`). Fills every unsolved
target's state to `missed` and reveals their labels. Freezes the timer and
disables all input. `status -> 'surrendered'`. Renders the list of missed
targets in the results panel. Offers "replay the misses": calls
`replayMisses(session)` to build a fresh `IDLE` session seeded with only the
targets that ended `missed`, same pack, same mode.

## Scoring

```
score = solved / total
```

`solved` counts targets in state `solved` or `solvedRetry`; `total` is the
pack's target count (or the replay subset's count, if replaying misses).

Mode B additionally reports:

```
clean = firstAttemptSolves / total
```

`firstAttemptSolves` counts only targets solved with `attempts === 1`.

Timer: counts down from a budget, pausable only via give-up/complete (no
mid-session pause). Budget:

```
budgetMs = max(180_000, 8_000 * targetCount)
```

Reaching 0 triggers `TIMEOUT`, handled identically to give-up (fill `missed`,
freeze, show results) except the transition is automatic rather than
player-initiated.

## Visual states

| `TargetState`  | Token                        |
| -------------- | ---------------------------- |
| `unsolved`     | region base fill (see below) |
| armed (Mode B) | `--state-armed`              |
| `solved`       | `--state-solved`             |
| `solvedRetry`  | `--state-solved-retry`       |
| `missed`       | `--state-missed`             |

Resolved rule (from `docs/DESIGN-SYSTEM.md`): `unsolved` regions render at
full reference-art saturation (`--region-primary` / `--region-secondary`) on
the start screen and results screen — the two moments the player reads the
map as a picture. During active play, `unsolved` regions use the muted
variants (`--region-primary-muted` / `--region-secondary-muted`) so
answer-state color is the only thing carrying signal; this also keeps the
give-up reveal (a wash of `--state-missed`) legible instead of competing with
two mid-saturation base fills.

## Resolved decisions

- **Duplicate names: solve-all.** One correct entry resolves every target
  sharing that normalized name; each still counts separately toward score.
  Rationale: a player who types "Alappuzha" shouldn't have to guess which of
  several same-named targets the engine wants — but a pack with genuine
  duplicates (rare, but real in district data) shouldn't let one keystroke
  under-count the work.
- **Mode B retries: unlimited, tiered result color, no strike limit in v1.**
  Rationale: a hard cap adds a second failure mode (lockout) to design and
  test for a drill whose whole point is repetition until it sticks; the
  tiered color already signals "this one took work" without blocking replay.
- **Fuzzy matching: Levenshtein distance <= 1, only for inputs of 6+
  characters, configurable per session, default ON.** Rationale: typos
  shouldn't cost a recall that was otherwise correct, but the same tolerance
  on short names (e.g. "Erode" vs "Coorg") risks false positives — gating on
  length keeps the leniency where the collision risk is low.
- **Zoom: not in v1.** Rationale: the first pack is district-level and
  legible at a fixed viewBox; zoom is real UI/state complexity (viewport,
  pan, hit-testing at scale) that only pays for itself once a pack proves
  unreadable without it.
- **Answer normalization:** trim -> lowercase -> NFD -> strip combining marks
  -> strip `.` `'` `-` `–` and all whitespace -> collapse. Rationale: a fixed,
  documented pipeline so matching behavior is predictable and testable
  independent of any one pack's naming quirks (accents, hyphenation,
  apostrophes).

## Out of scope for v1

Multiplayer, leaderboards, accounts, server of any kind, map editor UI,
non-district geography (rivers, peaks), i18n.

## Deferred

Spaced repetition weighted by the per-target miss counts already recorded in
`store/progress.ts`. That data is collected from v1 onward (attempts and
miss outcomes persist per target) even though nothing consumes it for
scheduling yet.
