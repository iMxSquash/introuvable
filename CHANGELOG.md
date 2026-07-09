# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Giant macOS-style desktop world with folders and a Trash Can landmark
- Click-to-move player cursor with follow camera
- Collectible file fragments and a Finder-style HUD
- Trash Can interior with patrolling guards and a Force Quit effect
- Restoration cinematic, Finder window and start screen
- Vercel deployment with CSP header restricting iframe embedding to `elwen.dev`
- ESLint flat config and Vitest test suite covering the pure math modules (`ScalarUtils`, `RandomUtils`, `WorldBasis`, `Vector3Utils`)
- Repository documentation: `README.md`, `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, this changelog
- GitHub project files: issue templates, pull request template, `CODEOWNERS`, `dependabot.yml`, `release.yml`
- CI workflow (`.github/workflows/ci.yml`) running lint, tests and build on every push and pull request
