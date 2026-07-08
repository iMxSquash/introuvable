# GameBlocks usage

Modules copied from the GameBlocks skill (`~/.claude/skills/gameblocks`) into `src/modules/`,
preserving the skill directory structure so relative imports keep working.

Dependency note: the skill targets `three@0.161.0` and `@dimforge/rapier3d-compat@0.14.0`.
This project uses the latest stable versions (`three@0.185.1`, `@dimforge/rapier3d-compat@0.19.3`);
compatibility is checked module by module when copied.

Known API break found in Phase 1: `World.updateSceneQueries()`, called by `ArenaEnvironment.js` after
creating/removing colliders, no longer exists on `@dimforge/rapier3d-compat@0.19.3`'s `World` (query
state now updates as part of the pipeline). `DesktopEnvironment.js` omits those calls. The same break
resurfaced in Phase 2: `KinematicBatchResolver.js` (`createActor`, `resolveQueuedMoves`, `_stepWorld`)
also called `updateSceneQueries()` in four places; all four calls were removed directly in the copied
file (kinematic character movement and collider creation work fine without them on this Rapier version).

| Module | Role | Status | Key changes | Integration |
| --- | --- | --- | --- | --- |
| `math/WorldBasis.js` | Single source of truth for axes, forward/right/up, planar math, headings | Reused as-is | None (stable three API, OK with 0.185) | `DEFAULT_WORLD_BASIS` used in `src/main.js` for gravity direction, ground plane orientation, camera placement |
| `math/Vector3Utils.js` | Safe vector normalization, basis-aware planar directions | Reused as-is | None | Available for upcoming motion/camera modules |
| `math/ScalarUtils.js` | Clamp, lerp, smoothing helpers | Reused as-is | None | `clamp` bounds the frame delta in the render loop |
| `math/TimeUtils.js` | System/manual clock for consistent timestamps | Reused as-is | None | `Clock` drives delta time in the `requestAnimationFrame` loop |
| `math/RandomUtils.js` | Deterministic PRNG | Reused as-is | None | `DEFAULT_PRNG` seeds the folder grid jitter/yaw and the spawn sampler in `DesktopEnvironment` |
| `world/Object3DUtils.js` | Dispose Three.js hierarchies (geometry + materials) | Reused as-is | None | `DesktopEnvironment.dispose()` |
| `world/environment/ArenaEnvironment.js` | Reference implementation: ground, walls, obstacles, ad hoc spawn sampling, Rapier collider helpers | **Adapted** → `src/game/DesktopEnvironment.js` | Kept the ground-plane + static-cuboid-collider pattern; dropped the grid helper, built-in visual walls, pillars and ramps (not needed for a flat desktop); pillars replaced by macOS folder meshes (box + tab) with matching cuboid colliders; added the Corbeille landmark (translucent cylinder + entry ring) which has no Arena equivalent; replaced Arena's inline `sampleSpawn` with the dedicated `SpawnAreaSampler` module | `src/game/DesktopEnvironment.js`, instantiated in `src/main.js` |
| `world/environment/WorldBoundsColliderFactory.js` | Basis-aware invisible boundary wall colliders | Reused as-is | None | `DesktopEnvironment.createPhysicsColliders()` builds the world-edge walls (no visual mesh, matches the TODO's "murs invisibles") |
| `world/environment/SpawnAreaSampler.js` | Rejection-sampled planar spawn positions with block/spawn regions | Reused as-is | None | `DesktopEnvironment.createSpawnSampler()` excludes a keep-out circle around every folder and around the Corbeille; `samplePlayerSpawn()` exposes the result, consumed by `src/main.js` for the initial camera target and by the Phase 2 character controller |
| `world/environment/PlanarUtils.js` | Basis-aware planar geometry/terrain helpers | Reused as-is | None | Copied now per the Phase 1 checklist; not yet consumed, expected to support the click-to-move/steering code in later phases |
| `actor-motion/KinematicBatchResolver.js` | Batches kinematic actor moves through Rapier collision and returns grounded/collision outcomes | **Adapted** | Removed 4 calls to `world.updateSceneQueries()` (see API break note above) | `src/game/PlayerCursor.js` resolves the cursor's move each frame against the desktop's colliders (folders, world-bounds walls, floor) |
| `actor-motion/character/BaseCharacterMotionController.js` | Shared grounded locomotion (accel/decel smoothing, gravity, yaw, resolver intent/commit) | Reused as-is | None | Base class for both motion controllers below |
| `actor-motion/character/WorldTargetCharacterMotionController.js` | Converts a world-space move target into locomotion intent (click-to-move) | Reused as-is | None | `PlayerCursor`'s primary control mode; target set from `AimResolver`'s ground hit point |
| `actor-motion/character/WorldCardinalCharacterMotionController.js` | Converts world-space left/right/forward/backward input into locomotion intent | Reused as-is | None | `PlayerCursor`'s keyboard fallback (WASD/arrows); active input cancels the click target, matching the TODO's priority rule |
| `actor-motion/GeneralObjectModelController.js` | Applies resolved position + orientation frame to a Three.js object | Reused as-is | None | Drives the cursor model's position and yaw from the committed motion snapshot's `planarMoveFrame` |
| `camera/BaseCameraRig.js` | Shared smoothing/pose plumbing for camera rigs | Reused as-is | None | Base class for `PositionFollowCameraRig` |
| `camera/PositionFollowCameraRig.js` | Follows a target position at a fixed azimuth/height/distance, always looking at it | Reused as-is | None | High isometric-style camera following the cursor in `src/main.js` |
| `gameplay/AimResolver.js` | Resolves screen-space aim into a world hit position | Reused as-is | None | Converts pointer/tap coordinates into the ground point used as the click-to-move target |
| `world/visual-effects/GroundClickIndicator.js` | Fading ground marker for click feedback | Reused as-is | None | Spawned on every successful click-to-move aim in `src/main.js`, doubling as the cursor's click feedback per the TODO |
