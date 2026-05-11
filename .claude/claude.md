# Roompt

## What to build
A PWA called **Roompt**. User records a space with their phone → AI analyses it → stores the scan → user views a 360° panoramic viewer of the actual room footage → user prompts furniture placement → objects appear in the scene.

---

## Stack
- **Frontend:** React + TypeScript + Tailwind + React Router v7
- **3D:** Three.js (raw, no R3F) — `OrbitControls` + `GLTFLoader` from `three/addons`
- **AI:** Anthropic SDK (`@anthropic-ai/sdk`) — vision analysis + furniture placement
- **3D model generation:** [Meshy](https://www.meshy.ai) text-to-3D — server-side, GLB output cached on disk
- **Database:** `better-sqlite3` → `db/roompt.db`, served via a Vite plugin (`server/plugin.ts`, registered in `vite.config.ts`) that attaches `/api` middleware directly to the Vite dev server
- **No global state** — data lives in SQLite, fetched via `/api`
- `npm run dev` is just `vite` — no separate server process needed
- **API keys:** set `ANTHROPIC_API_KEY` and `MESHY_API_KEY` in `.env` (loaded via Vite's `loadEnv` inside the plugin). If `MESHY_API_KEY` is absent, furniture falls back to the procedural builder in `src/utils/furniture.ts`.

---

## Full flow

```
Record video
  → extract frames every 2s (client, src/utils/extractFrames.ts)
  → POST /api/analyse — Claude vision returns RoomData JSON
  → addScan(roomData, frames) → scan + frames saved to SQLite
  → navigate to /scan/:id

/scan/:id (Scan screen)
  → RoomScene plays the raw recording as the backdrop (HTML <video> behind a
    transparent Three.js canvas); horizontal drag scrubs through the video AND
    rotates the 3D camera in lockstep, so furniture appears to track the room
  → user types prompt ("add a couch and TV")
  → POST /api/prompt — Claude returns { objects, plan }
  → PATCH /api/scans/:id updates room_data.objects in SQLite
  → new objects appear as procedural 3D boxes in front of the video (instant)
  → in the background, for each new object: POST /api/model — Meshy returns a GLB URL
  → each completed GLB is PATCHed onto the object (modelUrl) and swaps the box in-scene
```

Stitched-frame panoramas were tried earlier and dropped — naive overlap blending
produced doubled objects and seam artifacts on real phone-pan footage. Showing
the actual recording at full fidelity is a strict upgrade.

---

## Screens

**1. Home** (`/`) — Title, list of scans sorted newest first. Tap row → `/scan/:id`. Swipe row to delete. FAB navigates to Record.

**2. Record** (`/record`) — Full-screen camera via `MediaRecorder` API. States: `idle → requesting → previewing → recording → review → error`. "Analyse this →" navigates to `/processing` with `{ state: { blob } }`.

**3. Processing** (`/processing`) — Extracts frames from router state blob → calls `/api/analyse` → saves scan → navigates to `/scan/:id`.

**4. Scan** (`/scan/:id`) — 360° panoramic viewer (raw Three.js). Frames from the recording are stitched side-by-side as a cylinder texture; camera sits inside so the user can look around the real room. Text input at bottom sends prompts to `/api/prompt`, places returned objects as 3D boxes inside the scene. Objects persist via PATCH to SQLite.

---

## API routes (all served by `server/plugin.ts`)

| Method | Route | Body | Returns |
|--------|-------|------|---------|
| GET | `/api/scans` | — | `Scan[]` |
| GET | `/api/scans/:id` | — | `Scan` |
| POST | `/api/scans` | `Scan` (incl. `frames: string[]`) | `{ ok: true }` |
| PATCH | `/api/scans/:id` | `{ objects: RoomObject[] }` | `{ ok: true }` |
| DELETE | `/api/scans/:id` | — | `{ ok: true }` |
| POST | `/api/scans/:id/video` | raw bytes (Content-Type: video/*) | `{ ok: true, videoUrl }` |
| POST | `/api/analyse` | `{ frames: string[] }` (base64 JPEG) | `RoomData` |
| POST | `/api/prompt` | `{ roomData, prompt, frames? }` | `{ objects, plan }` (objects may include `pixelAnchor`) |
| POST | `/api/model` | `{ type, label? }` | `{ url }` (path to `/models/<key>.glb`) |

---

## Key types (`src/hooks/useScans.ts`)

```ts
interface RoomObject {
  id: string; type: string; label: string
  x: number; z: number; rotation: number
  width: number; depth: number; height: number
  color?: string
  modelUrl?: string                          // optional Meshy-generated GLB (served from /models/*.glb)
  pixelAnchor?: {                            // when set, the client overrides x/z to align with the recording
    frameIndex: number; pixelX: number; pixelY: number
  }
}

interface RoomData {
  spaceType: string
  estimatedWidth: number; estimatedLength: number; estimatedHeight: number
  floorType: string
  wallColor?: string
  wallFeatures: { wall: string; features: string[] }[]
  constraints: string[]
  objects?: RoomObject[]
}

interface Scan {
  id: string
  label: string
  createdAt: number
  roomData: RoomData
  frames?: string[]            // base64 JPEGs; kept for Claude vision/edit endpoints
  videoUrl?: string | null     // /videos/<id>.<ext> if a recording was uploaded
}
```

## Key files
- `src/hooks/useScans.ts` — `RoomData`, `RoomObject`, `Scan` types + `useScans()` hook; `addScan(roomData, frames)` returns `Promise<string>` (the scan ID)
- `src/hooks/useScan.ts` — `useScan(id)` fetches single scan (includes frames), exposes `updateObjects()`
- `src/hooks/useIsMobile.ts` — mobile detection, gates the app
- `src/utils/extractFrames.ts` — extracts base64 JPEG frames from a video Blob at a given interval
- `src/components/RoomScene.tsx` — Three.js scene with a video backdrop. If `videoUrl` is set, the recording plays under a transparent WebGL canvas and horizontal drag scrubs `video.currentTime` while rotating the camera by `ASSUMED_PAN_RAD * (-dx / width)` so furniture appears to track the room. Vertical drag tilts the camera. Falls back to a procedural box scene when no recording is available. Loads `obj.modelUrl` via `GLTFLoader` (auto-fits the GLB bounding box to `width/height/depth`), otherwise renders the procedural builder
- `src/utils/furniture.ts` — procedural Three.js builders (sofa, bed, table, …) used as the instant placeholder before a Meshy GLB arrives, and as the permanent fallback when Meshy is disabled or fails
- `server/plugin.ts` — all `/api` routes; uses `loadEnv` for `ANTHROPIC_API_KEY` and `MESHY_API_KEY`
- `server/db.ts` — SQLite schema + queries; `scans` table stores `id, label, created_at, room_data, frames, video_ext`. `video_ext` (when set) means the raw recording lives at `./public/videos/<id>.<ext>` and is served at `/videos/<id>.<ext>`
- `server/ai.ts` — Claude API calls (`analyseRoom`, `promptFurniture`). "change my X" prompts are handled by `promptFurniture` — Claude returns a new 3D object overlay. When frames are sent, Claude also returns a `pixelAnchor` for objects that reference visible recording elements, so the client can position the 3D overlay at the exact same spot as the original in the video
- `src/utils/pixelAnchor.ts` — `pixelAnchorToCoords(anchor, numFrames, roomData)` maps `{frameIndex, pixelX, pixelY}` to world `(x, z)` by mirroring RoomScene's video-time-to-yaw mapping and ray-casting to the nearest wall
- `server/meshy.ts` — Meshy text-to-3D client. `generateModel(type, label, apiKey)` POSTs a preview task, polls until SUCCEEDED, downloads the GLB to `public/models/<cache-key>.glb`, returns the public URL. Cache key is `slug(type)[--slug(label)]`; an in-flight `Map` dedupes concurrent requests
- `server/config.ts` — also holds `MESHY_*` constants (API base, art style, poll cadence, models dir)
- `public/models/*.glb` — Meshy GLB cache (gitignored); served by Vite at `/models/*.glb`
- `src/screens/Record.tsx` — camera logic; passes blob via `navigate('/processing', { state: { blob } })`
- `src/screens/Processing.tsx` — extract frames → `/api/analyse` → `addScan(roomData, frames)` → POST raw blob to `/api/scans/:id/video` (best-effort; failure is fine) → navigate
- `src/screens/Scan.tsx` — panoramic viewer + prompt input; after `/api/prompt` returns objects, calls `/api/model` per object in parallel and serially PATCHes `modelUrl` onto each as it lands

---

## React Best Practices
- **Custom hooks always go in `src/hooks/`** as their own file. Never define hooks inline inside a component or page file.
- **Navigation uses React Router** — always use `useNavigate` from `react-router-dom`. Never store current screen/route in component state.
- **Imports use `@/` alias** — never use `../` relative imports. The `@` alias maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- **Shared utilities go in `src/utils/`** — never define reusable helpers inline in a component or page file.
- **All icons use `lucide-react`** — never use inline SVGs or other icon libraries. Import named icons from `lucide-react`.
