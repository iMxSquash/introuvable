# Contributing

Thanks for your interest in this project. This is a small personal easter-egg game, but contributions and bug reports are welcome.

## Setup

See the [README](./README.md#installation) for installation and available scripts.

## Workflow

1. Fork the repository and create a branch from `main`, named `type/short-description` (e.g. `fix/checkout-crash`, `feat/new-guard-behavior`).
2. Make your changes, following the code style already in use in the file you're editing.
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`, in English, imperative present tense (e.g. `fix(guard): stop guard from clipping through walls`).
4. Push your branch and open a pull request against `main`.

## Testing and linting

- `npm run lint` runs ESLint.
- `npm test` runs the Vitest suite.
- `npm run build` builds the production bundle.

The CI workflow runs all three on every push and pull request; make sure they pass locally before opening a pull request. Tests currently cover the pure logic modules under `src/modules/math/`; add tests alongside any new pure logic you introduce.

## Code standards

- Vanilla JS (no TypeScript, no framework), matching the existing GameBlocks module structure under `src/modules/`.
- Keep GameBlocks modules aligned with their source structure (see `gameblocks_usage.md`).
- Reuse an existing module as-is if it covers the need; adapt it if the need is partial; avoid rewriting from scratch.

## Reporting bugs or proposing features

Use the [issue templates](./.github/ISSUE_TEMPLATE) (bug report / feature request). Never report a security vulnerability through a public issue: see [SECURITY.md](./SECURITY.md).
