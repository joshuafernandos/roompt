// ── Frame extraction ──────────────────────────────────────────────────────────
export const FRAME_INTERVAL_S = 2       // seconds between extracted frames
export const FRAME_MAX_COUNT = 8        // cap on frames per recording
export const FRAME_CANVAS_WIDTH = 1024  // px; video frames are downscaled to this
export const FRAME_JPEG_QUALITY = 0.75

// ── Default room dimensions (metres) — used when Claude returns 0 ─────────────
export const DEFAULT_ROOM_WIDTH = 4.0
export const DEFAULT_ROOM_LENGTH = 3.5
export const DEFAULT_ROOM_HEIGHT = 2.7

// ── Recording playback (video-backdrop Scan view) ─────────────────────────────
// How much horizontal rotation a full scrub of the recording corresponds to.
// Used by RoomScene (camera yaw) AND pixel-anchor → world-coord conversion so
// the 3D scene and the recorded footage agree on which yaw matches which frame.
export const ASSUMED_PAN_RAD = Math.PI
export const FRAME_HFOV_DEG = 55           // assumed per-frame camera horizontal FOV

// ── Camera ────────────────────────────────────────────────────────────────────
export const CAM_FOV = 75
export const CAM_NEAR = 0.1
export const CAM_FAR = 200
export const CAM_DAMPING = 0.08
export const CAM_PIXEL_RATIO_CAP = 2
