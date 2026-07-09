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
| `actor-motion/character/WorldCardinalCharacterMotionController.js` | Converts world-space left/right/forward/backward input into locomotion intent | **Adapted** | Added a `cameraAzimuth` config (default `0`, fully backward-compatible): rotates the forward/right input by that angle before applying it to the world basis. Needed because this game's `PositionFollowCameraRig` sits at a fixed 45° azimuth, so unrotated cardinal input moved the cursor along a raw world axis that read as diagonal on screen (the ZQSD/WASD bug) | `PlayerCursor`'s keyboard/joystick fallback; constructed with `cameraAzimuth: CAMERA_RIG_OPTIONS.azimuth` in `src/main.js` so "forward" always means "away from the camera on screen"; active input cancels the click target, matching the TODO's priority rule |
| `actor-motion/GeneralObjectModelController.js` | Applies resolved position + orientation frame to a Three.js object | Reused as-is | None | Drives the cursor model's position and yaw from the committed motion snapshot's `planarMoveFrame` |
| `camera/BaseCameraRig.js` | Shared smoothing/pose plumbing for camera rigs | Reused as-is | None | Base class for `PositionFollowCameraRig` |
| `camera/PositionFollowCameraRig.js` | Follows a target position at a fixed azimuth/height/distance, always looking at it | Reused as-is | None | High isometric-style camera following the cursor in `src/main.js` |
| `gameplay/AimResolver.js` | Resolves screen-space aim into a world hit position | Reused as-is | None | Converts pointer/tap coordinates into the ground point used as the click-to-move target |
| `world/visual-effects/GroundClickIndicator.js` | Fading ground marker for click feedback | Reused as-is | None | Spawned on every successful click-to-move aim in `src/main.js`, doubling as the cursor's click feedback per the TODO |
| `world/object/PickupObject.js` | Positions a pickup visual, bobs/spins it each frame, disposes it on collection | Reused as-is | None | `src/game/FragmentSystem.js` wraps every fragment mesh in a `PickupObject`; animation and disposal are entirely handled by the module |
| `world/object/factory/PickupVisualFactory.js` | Dispatches a pickup `type` to a mesh-building function (ammo/health/armor) | **Adapted** | Added `buildFileFragmentVisual()` (torn white paper silhouette, folded via a post-extrude vertex bend around the tear's anchor vertex, soft blue emissive) and a `'fragment'`/`'fragment-final'` branch in `createPickupVisual()`, following the file's existing per-type dispatch pattern | `FragmentSystem._spawnPickup()` |
| `user-interface/UiStateModel.js` | Observable state container with `patch`/`subscribe` | Reused as-is | None | `FragmentSystem.uiState` tracks `collectedCount`, `desktopRevealCount`, `fileNameRevealed` |
| `user-interface/DomHudRenderer.js` | Declarative bindings from state keys to DOM text/attributes | Reused as-is | None | `src/game/HudView.js` binds the Finder path bar and the fragment counter badge |
| `user-interface/NotificationQueue.js` | Time-limited visible/pending notification queue | Reused as-is | None | `FragmentSystem.notifications`; ticked every frame, rendered as macOS-style toasts by `HudView.js` |

Phase 3 design note: the Corbeille's fragment (`type: 'fragment-final'`) can be collected before the 6
desktop fragments since Phase 4's guarded interior doesn't exist yet. The Finder path formatter in
`HudView.js` only appends the filename once every folder segment ahead of it is also revealed, so the
path never shows the filename out of order even if the final fragment is grabbed first; verified with a
scripted full 7/7 collection run. The `?path=` query filename is parsed and sanitized minimally
(character allowlist, length cap) in `main.js`'s `getRequestedFileName()`; Phase 7 formalizes the full
sanitization contract described in the TODO.

| `world/object/PickupObject.js`, `world/object/factory/PickupVisualFactory.js` | (see Phase 3) | — | — | Final fragment now spawns at `TrashCanInterior.getFragmentPosition()` (bottom chamber) instead of the Phase 3 placeholder desktop position |

New for Phase 4 (no direct GameBlocks module, following the reuse-first patterns of already-copied
modules): `src/game/TrashCanInterior.js` builds the descending spiral corridor and bottom chamber as
hand-built world-space trimesh geometry/colliders, the same "bake world positions into a custom
BufferGeometry, one fixed rigid body per trimesh" technique already used by the copied
`ArenaEnvironment.js`/`WorldBoundsColliderFactory.js`.

Known API break found in Phase 4: contact/collision checks that mix "desktop" and "interior" actors
must never use planar-only distance (`basis.distanceSqPlanar`) across the two groups, since both sit at
the same (right, forward) column at wildly different heights (interior is built directly beneath the
desktop's Trash Can). `FragmentSystem`'s collection check was changed from planar to full 3D distance
for this reason (the final fragment moved deep underground in Phase 4).

Post-Phase 4 rework: the guarded interior ("le donjon" — `behavior/AgentPathNavigator.js`,
`behavior/WaypointProgressTracker.js`, `behavior/NearbyAvoidanceSteering.js`, `src/game/Guard.js`,
`src/game/GuardMesh.js`, `src/game/ForceQuitEffect.js`) was removed and replaced with an easy
jump-platforming course: `TrashCanInterior.js`'s descending spiral now skips floor/wall geometry (and
colliders) on a handful of segments (`GAP_SEGMENT_INDICES`), turning it into a series of platforms with
jump gaps; `TrashCanInterior.getGapCheckpoints()` exposes each gap's expected floor position so
`main.js`'s `createObstacleCourseChallenge()` can detect a missed jump (fallen well below the expected
floor while over a gap) and reset the player to the course entry — reusing the existing zone-transition
`transitionTo()`/cooldown/re-arm machinery, no new pattern needed. This also finally exercises the
`jump` parameter that `actor-motion/character/BaseCharacterMotionController.js` (and both concrete
motion controllers) already accepted since Phase 2 but no input ever set: `main.js` now tracks a Space
bar key state and a new `src/game/TouchJumpButton.js` (same pointer-event factory pattern as
`TouchJoystick.js`, gated by the same `pointer: coarse` CSS media query) tracks a touch button, both
merged into the same input object consumed by `PlayerCursor.update()`.

Design notes on the ground-hole/zone-teleport approach above (single-sided ground plane cut open under
the entry ring, `transitionTo()`'s re-arm gate against re-triggering on the arrival point) are superseded
by the second rework below and no longer apply - kept here only as a record of what was tried first.

Second rework, on direct user feedback: the underground-course idea above still wasn't what was asked
for. The Trash Can landmark itself (the translucent cylinder + entry ring in `DesktopEnvironment.js`)
and `src/game/TrashCanInterior.js` are both removed entirely - no trace of a "Trash Can" location
remains in the 3D world (the diegetic 404 copy, "your file was moved to the Trash", stays as flavor text
independent of any literal prop). The jump course is rebuilt as **static world geometry directly in
`DesktopEnvironment.js`**, in the continuity of the desktop (no separate scene, no zone/teleport-in
system at all - the player just walks and jumps there like anywhere else on the desktop):
- `COURSE_DIRECTION` is a fixed diagonal in (right, forward) chosen to match this game's fixed isometric
  camera's screen-right direction (derived from `CAMERA_RIG_OPTIONS.azimuth = Math.PI / 4` in `main.js`,
  using the same input-rotation formula already established by the
  `WorldCardinalCharacterMotionController` azimuth fix - see above).
- Two simple stepping-platform meshes at increasing height, plus one extra instance of the ordinary
  folder mesh (`createFolderMesh()`) standing normally on the ground at the end - its roof, one more
  easy hop up, holds the final fragment (`getCourseFragmentPosition()`). All three are rotated by a
  shared `courseYaw` (via `basis.forwardToYaw()`) so their own along-`COURSE_DIRECTION` half-extent is a
  plain half-length instead of a diagonal corner distance - this matters for sizing a comfortable,
  consistent air gap between each jump without the platforms visually clipping into each other.
- The only leftover gameplay logic is a small `createCourseFallRecovery()` in `main.js`: one checkpoint
  per gap (`DesktopEnvironment.getCourseFallCheckpoints()`, each at the gap's open-air midpoint, not
  either platform's own center, so standing on a lower platform is never mistaken for having fallen
  through the gap ahead of it) teleports the player back to `getCourseEntryPoint()` on a missed jump -
  the same distance/height-tolerance check as the removed `TrashCanInterior` version, just applied
  above ground and with no "zone" concept to track.
- Folder-grid generation and the shared `spawnSampler` both exclude the course's footprint via the same
  circle-keepout idiom already used for the (now-removed) Trash Can, so no folder, spawn point, or
  desktop fragment ever lands on or too close to the course.

Third rework: two more courses, "medium" and "hard", each heading in a different screen direction
(`SCREEN_FORWARD`/`SCREEN_BACKWARD` in `DesktopEnvironment.js`, derived the same way as the original
`SCREEN_RIGHT`) so all three fan out without crossing paths, and each ending on a folder holding one of
the fragments *relocated* from the desktop's ground-scattered set (not new fragments - `FragmentSystem`'s
total stays `REVEALABLE_PATH_SEGMENTS.length + 1`). The single-course logic was extracted into
`src/game/JumpCourse.js` (constructed 3 times by `DesktopEnvironment`, one per difficulty config) since
inlining three courses' worth of platform/collider/checkpoint logic directly in `DesktopEnvironment`
would have overloaded that class.

The harder two courses add **moving (back-and-forth) platforms** - the actual reason for the extraction,
since Rapier's `KinematicCharacterController` has no built-in notion of "what is the character standing
on": `computeColliderMovement()`/`computedGrounded()` only report a boolean, and the only relevant API
(`computedCollision()`) exposes raw per-collision data, not a convenient "grounded on this body" query
(checked against `@dimforge/rapier3d-compat`'s type defs). Concretely, a kinematic character controller
does not get carried along a moving kinematic platform by itself - without extra work, a platform sliding
out from under the player would just leave them standing in mid-air over its old spot. The fix: each
moving platform (`JumpCourse.update()`) is a `RigidBodyDesc.kinematicPositionBased()` body oscillating
sinusoidally along the course's own direction (same phase-accumulation idiom as `PickupObject.animate()`,
just applied to a physics body's `setNextKinematicTranslation()` instead of a plain mesh), and reports its
per-frame movement delta via `JumpCourse.getMovingPlatforms()`. `main.js`'s `createMovingPlatformRider()`
checks, once per frame *before* resolving the player's own movement, whether the player was grounded and
standing on a moving platform's footprint as of the end of the *previous* frame (a deliberate one-frame
lag, ~16ms at 60fps, imperceptible - avoids having to inspect Rapier's internal collision list), and if so
nudges the player by that platform's delta via a new `PlayerCursor.nudge()` (like `teleportTo()` but
without resetting velocity/grounded, since the player's own motion state hasn't changed - only the ground
moved under them). The footprint check projects onto the platform's own along/across axes (it's rotated
to face its course's direction, not the raw world axes) rather than a naive axis-aligned box test.

Fall-checkpoint sizing (`JumpCourse._layout()`) treats a moving platform's along-travel half-extent as its
static half-extent *plus* its oscillation amplitude, so the checkpoint for the next gap always stays clear
of the platform regardless of where it currently sits in its cycle - the same open-air-midpoint formula as
before, just fed an inflated half-extent for moving elements. Each checkpoint now also carries its own
course's entry point directly (`getFallCheckpoints()`), since `main.js`'s fall-recovery loop iterates all
3 courses' checkpoints flattened together (`DesktopEnvironment.getAllCourseFallCheckpoints()`) and must
send a missed jump back to whichever course it actually happened on, not a single shared entry point.

| `user-interface/StorageSettingsStore.js` | JSON-backed localStorage read/write with safe fallbacks | Reused as-is | None | `src/game/GameProgress.js` wraps a `JsonSettingsStore` (`introuvable-progress` key) tracking `restoredCount` and `bestTimeMs`, updated once per completed restoration |

New for Phase 5 (no direct GameBlocks module): `src/game/FileIconMesh.js` builds the restored file's 3D
icon (document + folded corner, `ExtrudeGeometry` + `Shape`, same technique as the guard/cursor
meshes). `src/game/RestorationCinematic.js` orchestrates the short scripted beat once the 7th fragment
lands: 4 small `buildFileFragmentVisual()` shards (reused from Phase 3, scaled down) converge above the
cursor into the file icon over ~0.9s, then calls back. `src/game/RestoreSound.js` and
`src/game/StartScreen.js`/`src/game/ForceQuitEffect.js`/`src/game/PickupSound.js` all share one
`AudioContext` via `AudioContextSingleton.js`. `src/game/FinderWindow.js` shows the static (hidden by
default) Finder-styled DOM dialog from `index.html` with the restored filename selected and an "Ouvrir"
button that navigates `window.top.location` to the portfolio (falls back to `window.location` if
`window.top` throws, e.g. a sandboxed iframe without top-navigation permission).

Known bug found in Phase 5: the Finder window overlay was given `hidden` in `index.html` but also a
class rule `.finder-window-overlay { display: flex; ... }` in `style.css`. Author-stylesheet class rules
and the `[hidden]` UA-stylesheet rule have equal specificity, so the class rule won without an explicit
override, and the dialog rendered (and intercepted clicks) even while `hidden` was set - as soon as the
DOM existed, before any fragment was even collected. Fixed with an explicit
`.finder-window-overlay[hidden] { display: none; }` rule ahead of the base rule.

Design note: gameplay (movement, guards, click-to-move, fragment collection) only starts once
`createStartScreen`'s `onStart` fires from the player's first click/Enter/Space on the start screen -
`start()` (which attaches input listeners and begins the render loop) is called from inside that
callback rather than unconditionally at module load. This both gates the "cliquez pour rechercher le
fichier" diegetic intro and, since the same click synchronously calls `getSharedAudioContext()`, unlocks
autoplay for every synthesized sound effect used later (pickup pop, Force Quit alert, restore chime).

Phase 6 (art direction & polish) needed no new GameBlocks module - it revisited the custom meshes/scene
code from Phases 1-5:
- `src/game/Palette.js` centralizes the folder blue and off-white tones so they're defined once instead
  of duplicated per file. Folder blue is set to the TODO's own suggested `#3B82F6`; no real portfolio
  wallpaper/folder-icon screenshot exists yet to verify against (still true as of this phase), so this
  is the most faithful value available rather than an invented one. `PickupVisualFactory.js`'s fragment
  paper keeps its own local off-white default (`0xf5f3ef`, matching `Palette.OFF_WHITE`) since
  `src/modules/` is meant to stay independent of `src/game/`.
- `src/game/ContactShadow.js`: a soft radial-gradient decal (one shared `CanvasTexture` + one shared
  unit `PlaneGeometry`, only `scale`/position differ per instance) added under the cursor, every folder,
  and every guard, per the TODO's explicit list (fragments and the Trash Can itself are not listed).
- Guards now have an idle "breathing" animation (a small sine-wave scale pulse, phase-offset per guard
  so all 4 don't pulse in lockstep) applied only to the guard's visual sub-group, not its contact shadow
  sibling - folders stay completely static, matching the TODO's "ce sont des bâtiments" note. Fragments
  already floated/spun via `PickupObject.animate()` since Phase 3; nothing to add there.
- Perf pass: `DesktopEnvironment`'s per-folder `MeshStandardMaterial` and `GuardMesh`'s per-guard
  geometry/material were being recreated on every instance despite being visually identical; both are
  now module-level shared constants. Removed one redundant `Vector3.clone()` per guard per frame in
  `Guard.update()` (the source vector was already a fresh, unshared object from that frame's navigator
  call). Per-frame allocations inside the copied GameBlocks modules themselves (e.g.
  `WorldTargetCharacterMotionController`) were left as-is per the reuse-first policy - negligible cost,
  and rewriting a copied module for micro-perf isn't an "adaptation" the modules actually need.
- Added a `visibilitychange` handler in `main.js` that cancels the `requestAnimationFrame` loop entirely
  while the tab is hidden and resets the clock on resume (avoiding one large clamped-but-still-wrong
  delta frame). Verified via an injected `requestAnimationFrame` call counter: 0 frames over 800ms while
  hidden, normal frame rate immediately on resume. This directly addresses the TODO's "c'est une page
  404, elle peut rester ouverte en fond" note - no GPU/battery burned while not visible.
- No numeric FPS measurement was taken (no profiler available in this environment) - the target is
  addressed by the shared-resource and no-per-frame-allocation work above, not verified with a number.

Phase 7 (query param contract & mobile) needed no new GameBlocks module either:
- `?path=` sanitization (length cap, character allowlist, `page.html` fallback) was already implemented
  in Phase 3's `getRequestedFileName()`; this phase just confirms/documents it as the finalized contract
  rather than a placeholder.
- `?theme=dark|light` (optional, defaults to `light`, any other value also falls back to `light`):
  `main.js`'s `getRequestedTheme()` stamps `data-theme` on `<html>`, and `style.css` defines the
  light/dark panel colors as CSS custom properties overridden under `:root[data-theme='dark']` (HUD,
  toasts, start screen, Finder window). `DesktopEnvironment` gained a `theme` constructor option
  selecting a `THEME_PALETTES` entry for the sky/ground/ambient/directional light colors; the Trash Can
  interior stays dark regardless of theme by design (Phase 4's "ambiance plus sombre" is independent of
  the portfolio's own light/dark mode). Verified both themes render distinctly via headless screenshots.
- Mobile/touch: click-to-move already used `pointerdown` (Phase 2), which handles touch natively: no
  code change needed, verified with a real touch-emulated tap (Playwright `hasTouch`/`isMobile`/
  `touchscreen.tap`) correctly setting a move target. Added `viewport-fit=cover` to the `<meta viewport>`
  tag (required for `env(safe-area-inset-*)` to resolve to non-zero values at all) and safe-area-aware
  padding on `.hud` and `.toast-container`, the two overlays that hug screen edges/corners. The camera
  rig gains a small height/distance bump (`getCameraRigOptions()`) below a 820px viewport width, per the
  TODO's "caméra légèrement plus haute" note; this is computed once at load, not re-evaluated on
  orientation change/resize (acceptable given the modest ask - a rotation mid-game just keeps whichever
  height was computed at load).
- Not done: testing on a real physical phone (Playwright's touch/viewport emulation is not equivalent to
  real hardware - the TODO explicitly asks for this separately; flagging rather than claiming it as
  verified).

Phase 8 (Vercel deployment & embed compliance) needed no GameBlocks module; it ran the project's
`portfolio-embed-check` skill and applied its findings:
- `vercel.json` added with `Content-Security-Policy: frame-ancestors 'self' https://elwen.dev
  https://*.elwen.dev` (the TODO's exact value) and no `X-Frame-Options` (Vite/Vercel don't add one by
  default for a static build, so there was nothing to remove).
- Audited for the skill's cross-origin pitfalls: the only `window.top` usage
  (`FinderWindow.js`'s "Ouvrir" redirect) was already try/catch-protected since Phase 5; no `<a>` tags
  anywhere in the app, so no missing `target="_blank"`/`rel="noopener"` cases; no cookies at all (only
  `localStorage` via `GameProgress`, which the skill confirms works fine per-origin regardless of
  embedding).
- Fixed a real touch-target gap the skill's mobile section calls out: the Finder window's "Ouvrir"
  button was ~29px tall (font + padding), under the 44px minimum this project's own CLAUDE.md already
  mandates. Added `min-width`/`min-height: 44px` with flex centering.
- The resize handler now coalesces to one update per animation frame (`requestAnimationFrame`-throttled)
  instead of running the full camera/renderer resize on every single `resize` event. Deliberately not a
  timeout-based debounce as the skill's generic wording suggests: a WebGL canvas needs to keep visually
  tracking the portfolio's live window drag, and a timeout delay would make it visibly lag behind the
  window edge during a continuous resize - the rAF throttle avoids redundant work without that lag.
  Verified via a real resizable-`<div>` + `<iframe>` embed test down to 360px width with no console
  errors.
- SEO: title and meta description added; `public/favicon.svg` is a dashed-outline, semi-transparent
  document icon with a "?" - literally the "favicon fichier-fantôme" the TODO asks for, no `noindex` per
  its explicit instruction to stay discoverable.
- Conscious exception flagged rather than silently overridden: the skill's generic advice says the
  embedded app should be "presentable without prior interaction, no blocking onboarding modal" - this
  project's start screen (Phase 5) is exactly such a gate, but it's load-bearing by design: it supplies
  the diegetic "cliquez pour rechercher le fichier" framing the TODO itself asks for, and is also the
  user gesture that unlocks the Web Audio context (no sound would ever play in the iframe without it).
  Not changed; noting the tension rather than picking a side unilaterally.
- Bundle weight (~1 MB gzipped, Three + Rapier) was not reduced - Phase 8's own TODO wording defers the
  actual mitigation to Phase 9 (`<link rel="preconnect">` from the portfolio's 404 page before the iframe
  ever loads this app); there is no "before interaction" state to lazy-load within this repo itself, the
  portfolio not creating the iframe until the user clicks already achieves that deferral.
- Not done: the actual Vercel project creation, `introuvable.elwen.dev` domain attachment, and header
  verification against a live deployment (`curl -sI` from the skill's checklist) - `vercel whoami` came
  back unauthenticated in this environment and no `.vercel` project link exists yet. This needs the
  user's own Vercel account; flagging rather than fabricating a deployment that didn't happen.

Embed-check verdict: **ready for `iframe` mode** once deployed, with the two notes above (intentional
start-screen gate; bundle weight mitigated by the portfolio's own click-before-embed flow, not by this
repo).
