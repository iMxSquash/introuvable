# GameBlocks usage

Modules copied from the GameBlocks skill (`~/.claude/skills/gameblocks`) into `src/modules/`,
preserving the skill directory structure so relative imports keep working.

Dependency note: the skill targets `three@0.161.0` and `@dimforge/rapier3d-compat@0.14.0`.
This project uses the latest stable versions (`three@0.185.1`, `@dimforge/rapier3d-compat@0.19.3`);
compatibility is checked module by module when copied.

| Module | Role | Status | Key changes | Integration |
| --- | --- | --- | --- | --- |
| `math/WorldBasis.js` | Single source of truth for axes, forward/right/up, planar math, headings | Reused as-is | None (stable three API, OK with 0.185) | `DEFAULT_WORLD_BASIS` used in `src/main.js` for gravity direction, ground plane orientation, camera placement |
| `math/Vector3Utils.js` | Safe vector normalization, basis-aware planar directions | Reused as-is | None | Available for upcoming motion/camera modules |
| `math/ScalarUtils.js` | Clamp, lerp, smoothing helpers | Reused as-is | None | `clamp` bounds the frame delta in the render loop |
| `math/TimeUtils.js` | System/manual clock for consistent timestamps | Reused as-is | None | `Clock` drives delta time in the `requestAnimationFrame` loop |
| `math/RandomUtils.js` | Deterministic PRNG | Reused as-is | None | Not wired yet; needed by spawn sampling in Phase 1 |
| `world/Object3DUtils.js` | Dispose Three.js hierarchies (geometry + materials) | Reused as-is | None | Not wired yet; cleanup of transient objects in later phases |
