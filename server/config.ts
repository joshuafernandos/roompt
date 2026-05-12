// ── Claude API ────────────────────────────────────────────────────────────────
export const AI_MODEL = 'claude-sonnet-4-6'
export const AI_MAX_TOKENS = 1024
export const AI_MAX_FRAMES = 10   // frames sent to vision API per request

// ── Request body size limits ──────────────────────────────────────────────────
export const BODY_MAX_BYTES = 1_048_576     //  1 MB — general API routes
export const BODY_SCAN_MAX_BYTES = 31_457_280  // 30 MB — POST /api/scans (includes frames)
export const BODY_ANALYSE_MAX_BYTES = 20_971_520 // 20 MB — POST /api/analyse
export const BODY_VIDEO_MAX_BYTES  = 52_428_800 // 50 MB — POST /api/scans/:id/video

// ── Video & edit storage ──────────────────────────────────────────────────────
export const VIDEOS_DIR = './public/videos'   // raw recordings, served at /videos/*
export const EDITS_DIR = './public/edits'     // Gemini-composited frames, served at /edits/*

// ── Validation ────────────────────────────────────────────────────────────────
export const LABEL_MAX_LENGTH = 200

// ── Gemini 2.5 Flash Image (Nano Banana) — instruction-based image editing ────
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
export const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image-preview'
export const EDIT_CROP_PADDING = 0.18  // extra context around bbox so the model sees surroundings
export const BODY_EDIT_MAX_BYTES = 20_971_520  // 20 MB — POST /api/edit (frames + prompt)
