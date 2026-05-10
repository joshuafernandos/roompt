// ── Frame extraction ──────────────────────────────────────────────────────────
export const FRAME_INTERVAL_S = 2       // seconds between extracted frames
export const FRAME_MAX_COUNT = 8        // cap on frames per recording
export const FRAME_CANVAS_WIDTH = 1024  // px; video frames are downscaled to this
export const FRAME_JPEG_QUALITY = 0.75

// ── Default room dimensions (metres) — used when Claude returns 0 ─────────────
export const DEFAULT_ROOM_WIDTH = 4.0
export const DEFAULT_ROOM_LENGTH = 3.5
export const DEFAULT_ROOM_HEIGHT = 2.7

// ── Panorama sphere (equirectangular 360°) ────────────────────────────────────
export const PANO_SPHERE_RADIUS = 50
export const PANO_SPHERE_SEGMENTS = 128
export const PANO_FURNITURE_SCALE = 0.7    // fraction of sphere radius used for room floor
export const PANO_EQUIRECT_WIDTH = 4096    // equirectangular canvas width (height = width / 2)
export const PANO_FRAME_HFOV_DEG = 55      // assumed phone-camera horizontal FOV per frame

// ── Camera ────────────────────────────────────────────────────────────────────
export const CAM_FOV = 75
export const CAM_NEAR = 0.1
export const CAM_FAR = 200
export const CAM_DAMPING = 0.08
export const CAM_PIXEL_RATIO_CAP = 2
