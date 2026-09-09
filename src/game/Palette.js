// macOS-inspired palette shared across meshes. Folder blue matches the
// TODO's own reference value; no real portfolio wallpaper/icon screenshot
// exists yet to verify against (see gameblocks_usage.md), so these are the
// most faithful values available rather than an invented guess. Same caveat
// applies to the two-tone folder split and the ground gradient stops below.
export const FOLDER_BLUE = 0x3b82f6;
// No longer read by any JS module (was the jump courses' procedural platform
// color, now superseded by public/models/keycap.glb's own baked materials -
// see KeycapPlatformMesh.js) - kept as the generic macOS surface tone for
// future chrome (windows, sidebars) built the same procedural way.
export const SURFACE_GRAY = 0x9aa3ab;
export const OFF_WHITE = 0xf5f3ef;

// System accent blue (matches the CSS `#0a84ff` already used by the HUD/Finder
// window), reused for the 3D click indicator so world and DOM feedback share
// one accent instead of the click marker's unrelated default mint green.
export const ACCENT_BLUE = 0x0a84ff;
export const ACCENT_BLUE_SOFT = 0x8ec9ff;

// Two-tone folder icon: lighter front pocket catching the key light, darker
// back tab reading as "behind" it. No longer read by any JS module - baked
// directly into the vertex colors/material of public/models/icon_folder.glb
// (see FolderPlatformMesh.js), kept here as the source-of-truth reference for
// that asset.
export const FOLDER_FRONT_BLUE = 0x5aa7f2;
export const FOLDER_BACK_BLUE = 0x2f6fce;
