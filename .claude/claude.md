# Roompt

## What to build
A PWA called **Roompt**. User records a space with their phone → AI analyses it → stores the scan → user views the actual room footage with horizontal-drag scrub → user types a prompt ("change my door", "add flowers along this wall") → an AI image-edit pipeline produces a new frame and overlays it onto the recording at the matching timestamp.

---

## Stack
- **Frontend:** React + TypeScript + Tailwind + React Router v7
- **AI (planning):** Anthropic SDK (`@anthropic-ai/sdk`) — Claude vision picks which frame + bounding box to edit and writes the Gemini instruction
- **AI (image edit):** Google Gemini 2.5 Flash Image (Nano Banana) — instruction-based image editing of cropped frame regions
- **Server image ops:** [`sharp`](https://sharp.pixelplumbing.com) — crop the bbox+padding, resize Gemini's output to crop dims, composite back into the original frame
- **Database:** `better-sqlite3` → `db/roompt.db`, served via a Vite plugin (`server/plugin.ts`, registered in `vite.config.ts`) that attaches `/api` middleware directly to the Vite dev server
- **No global state** — data lives in SQLite, fetched via `/api`
- `npm run dev` is just `vite` — no separate server process needed
- **API keys:** set `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` in `.env` (loaded via Vite's `loadEnv` inside the plugin). Both are required for `/api/scans/:id/edit`.

---

## Full flow

```
Record video
  → extract frames every 2s (client, src/utils/extractFrames.ts)
  → POST /api/analyse — Claude vision returns RoomData JSON
  → addScan(roomData, frames) → scan + frames saved to SQLite
  → POST /api/scans/:id/video — raw blob written to public/videos/
  → navigate to /scan/:id

/scan/:id (Scan screen)
  → RoomScene plays the recorded <video>; horizontal drag scrubs currentTime.
    An <img> layer sits on top; when `video.currentTime` is within ±2s of an
    edit's source-frame timestamp, that edit's image fades in over the video.
  → user types prompt ("change my door to dark walnut", "add flowers")
  → POST /api/scans/:id/edit — server:
      1. asks Claude vision (server/edit.ts planEdit) which frame + bbox to
         edit and what edit instruction to send to Gemini
      2. crops the bbox + ~18% padding via sharp
      3. POSTs the crop to Gemini 2.5 Flash Image with the instruction
      4. resizes Gemini's output back to the crop dims and composites it onto
         a copy of the full original frame
      5. writes public/edits/<scanId>-<editId>.jpg, appends a FrameEdit entry
         to roomData.edits in SQLite, returns the FrameEdit
  → useScan adds the new edit to local state → RoomScene re-renders →
    overlay <img> appears the next time the user scrubs near that frame
```

The previous 3D-overlay pipeline (Meshy text-to-3D, procedural furniture
boxes, pixel-anchor → world-coord mapping, RoomObject placement in Three.js)
was removed in favour of this pure 2D image-edit approach — edits look
photoreal "in" the room because they ARE the room, not a 3D model overlaid on
top. Trade-off: edits don't reproject with camera motion / parallax, so they
only look right at (and near) their source-frame timestamp.

---

## Screens

**1. Home** (`/`) — Title, list of scans sorted newest first. Tap row → `/scan/:id`. Swipe row to delete. FAB navigates to Record.

**2. Record** (`/record`) — Full-screen camera via `MediaRecorder` API. States: `idle → requesting → previewing → recording → review → error`. "Analyse this →" navigates to `/processing` with `{ state: { blob } }`.

**3. Processing** (`/processing`) — Extracts frames from router state blob → calls `/api/analyse` → saves scan → navigates to `/scan/:id`.

**4. Scan** (`/scan/:id`) — Video viewer with horizontal-drag scrub. Edit overlays appear at their source-frame timestamps. Text input at bottom sends prompts to `/api/scans/:id/edit`.

---

## API routes (all served by `server/plugin.ts`)

| Method | Route | Body | Returns |
|--------|-------|------|---------|
| GET | `/api/scans` | — | `Scan[]` |
| GET | `/api/scans/:id` | — | `Scan` (incl. frames + videoUrl) |
| POST | `/api/scans` | `Scan` (incl. `frames: string[]`) | `{ ok: true }` |
| PATCH | `/api/scans/:id` | `{ frames }` | `{ ok: true }` |
| DELETE | `/api/scans/:id` | — | `{ ok: true }` (also deletes video + edits on disk) |
| POST | `/api/scans/:id/video` | raw bytes (Content-Type: video/*) | `{ ok: true, videoUrl }` |
| POST | `/api/scans/:id/edit` | `{ prompt }` | `FrameEdit` |
| POST | `/api/analyse` | `{ frames: string[] }` (base64 JPEG) | `RoomData` |

---

## Key types (`src/hooks/useScans.ts`)

```ts
interface FrameEdit {
  id: string
  frameIndex: number   // index into scan.frames; maps to video time via FRAME_INTERVAL_S
  imageUrl: string     // /edits/<scanId>-<editId>.jpg — full composited frame
  plan: string         // one-sentence human summary shown under the viewer
}

interface RoomData {
  spaceType: string
  estimatedWidth: number; estimatedLength: number; estimatedHeight: number
  floorType: string
  wallColor?: string
  wallFeatures: { wall: string; features: string[] }[]
  constraints: string[]
  edits?: FrameEdit[]
}

interface Scan {
  id: string
  label: string
  createdAt: number
  roomData: RoomData
  frames?: string[]            // base64 JPEGs; kept for the edit planner
  videoUrl?: string | null     // /videos/<id>.<ext> if a recording was uploaded
}
```

## Key files
- `src/hooks/useScans.ts` — `RoomData`, `FrameEdit`, `Scan` types + `useScans()` hook
- `src/hooks/useScan.ts` — `useScan(id)` fetches single scan (includes frames), exposes `applyEdit(prompt)` which POSTs `/api/scans/:id/edit` and appends the returned `FrameEdit` to local state
- `src/components/RoomScene.tsx` — `<video>` with horizontal-drag scrub + an `<img>` overlay layer. Each `edit` in `roomData.edits` gets one absolutely-positioned `<img>`; the one whose `frameIndex * FRAME_INTERVAL_S` is closest to `video.currentTime` (within `FRAME_INTERVAL_S`) is shown at opacity 1, others at 0
- `server/edit.ts` — the planning + Gemini + sharp compositing pipeline. `applyEdit(scanId, frames, prompt, anthropicKey, geminiKey)` returns a `FrameEdit`
- `server/ai.ts` — `analyseRoom` only (Claude vision room analysis). The old 3D-placement prompt is gone
- `server/plugin.ts` — all `/api` routes
- `server/db.ts` — `dbAppendEdit(id, edit)` mutates `room_data.edits` in place
- `server/config.ts` — `GEMINI_*`, `EDITS_DIR`, `EDIT_CROP_PADDING`
- `public/edits/*.jpg` — Gemini composites (gitignored); served by Vite at `/edits/*.jpg`
- `src/screens/Record.tsx` — camera; passes blob via `navigate('/processing', { state: { blob } })`
- `src/screens/Processing.tsx` — extract frames → `/api/analyse` → `addScan` → POST raw blob to `/api/scans/:id/video`
- `src/screens/Scan.tsx` — viewer + prompt input; calls `applyEdit(userPrompt)` and shows the returned `plan`

---

## React Best Practices
- **Custom hooks always go in `src/hooks/`** as their own file. Never define hooks inline inside a component or page file.
- **Navigation uses React Router** — always use `useNavigate` from `react-router-dom`. Never store current screen/route in component state.
- **Imports use `@/` alias** — never use `../` relative imports. The `@` alias maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- **Shared utilities go in `src/utils/`** — never define reusable helpers inline in a component or page file.
- **All icons use `lucide-react`** — never use inline SVGs or other icon libraries. Import named icons from `lucide-react`.
