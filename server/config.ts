// ── Claude API ────────────────────────────────────────────────────────────────
export const AI_MODEL = 'claude-sonnet-4-6'
export const AI_MAX_TOKENS = 1024
export const AI_MAX_FRAMES = 10   // frames sent to vision API per request

// ── Request body size limits ──────────────────────────────────────────────────
export const BODY_MAX_BYTES = 1_048_576     //  1 MB — general API routes
export const BODY_SCAN_MAX_BYTES = 31_457_280  // 30 MB — POST /api/scans (includes frames)
export const BODY_ANALYSE_MAX_BYTES = 20_971_520 // 20 MB — POST /api/analyse
export const BODY_EDIT_MAX_BYTES   = 20_971_520 // 20 MB — POST /api/edit-frame

// ── Validation ────────────────────────────────────────────────────────────────
export const LABEL_MAX_LENGTH = 200
