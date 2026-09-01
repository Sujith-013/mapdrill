# Contributing

## Pre-commit formatting

`npm ci` installs a git pre-commit hook (via husky) that runs
[lint-staged](https://github.com/okonet/lint-staged) on staged files:
`prettier --write` on `*.md`, `*.ts`, `*.json`, `*.css`, `*.yml`, and
`eslint --fix` on `*.ts`. The fixed files are re-staged automatically, so
badly formatted code can't reach CI. The hook is skipped in CI itself
(`prepare` checks for `$CI`).
