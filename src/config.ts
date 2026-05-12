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
// Kept for backwards-compat with previous yaw-mapping callers. The current
// RoomScene only uses video time, so this is informational.
export const ASSUMED_PAN_RAD = Math.PI

// ── Camera ────────────────────────────────────────────────────────────────────
export const CAM_FOV = 75
export const CAM_NEAR = 0.1
export const CAM_FAR = 200
export const CAM_DAMPING = 0.08
export const CAM_PIXEL_RATIO_CAP = 2
