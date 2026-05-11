// ── Claude API ────────────────────────────────────────────────────────────────
export const AI_MODEL = 'claude-sonnet-4-6'
export const AI_MAX_TOKENS = 1024
export const AI_MAX_FRAMES = 10   // frames sent to vision API per request

// ── Request body size limits ──────────────────────────────────────────────────
export const BODY_MAX_BYTES = 1_048_576     //  1 MB — general API routes
export const BODY_SCAN_MAX_BYTES = 31_457_280  // 30 MB — POST /api/scans (includes frames)
export const BODY_ANALYSE_MAX_BYTES = 20_971_520 // 20 MB — POST /api/analyse
export const BODY_VIDEO_MAX_BYTES  = 52_428_800 // 50 MB — POST /api/scans/:id/video

// ── Video storage ─────────────────────────────────────────────────────────────
export const VIDEOS_DIR = './public/videos'   // raw recordings, served at /videos/*

// ── Validation ────────────────────────────────────────────────────────────────
export const LABEL_MAX_LENGTH = 200

// ── Meshy (text-to-3D) ────────────────────────────────────────────────────────
export const MESHY_API_BASE = 'https://api.meshy.ai'
export const MESHY_ART_STYLE = 'realistic'           // 'realistic' | 'sculpture'
export const MESHY_POLL_INTERVAL_MS = 5_000          // poll cadence while a task is running
export const MESHY_MAX_POLL_MS = 5 * 60_000          // give up after 5 min
export const MESHY_MODELS_DIR = './public/models'    // GLBs cached here, served at /models/*.glb
export const MESHY_TYPE_MAX_LENGTH = 64
