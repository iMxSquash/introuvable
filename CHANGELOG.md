# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Keyboard movement (ZQSD/WASD/arrows) walked diagonally on screen because it moved along raw world axes while the camera sits at a fixed 45° azimuth; input is now rotated by the camera's azimuth so "forward" moves the cursor away from the camera on screen

## [0.1.0] - 2026-07-09

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

[Unreleased]: https://github.com/iMxSquash/introuvable/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/iMxSquash/introuvable/releases/tag/v0.1.0
