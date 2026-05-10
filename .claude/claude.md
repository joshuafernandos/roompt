# Roompt

## What to build
A PWA called **Roompt**. User records a space with their phone → AI analyses it → stores the scan → user views a 360° panoramic viewer of the actual room footage → user prompts furniture placement → objects appear in the scene.

---

## Stack
- **Frontend:** React + TypeScript + Tailwind + React Router v7
- **3D:** Three.js (raw, no R3F) — `OrbitControls` from `three/addons`
- **AI:** Anthropic SDK (`@anthropic-ai/sdk`) — vision analysis + furniture placement
- **Database:** `better-sqlite3` → `db/roompt.db`, served via a Vite plugin (`server/plugin.ts`, registered in `vite.config.ts`) that attaches `/api` middleware directly to the Vite dev server
- **No global state** — data lives in SQLite, fetched via `/api`
- `npm run dev` is just `vite` — no separate server process needed
- **API key:** set `ANTHROPIC_API_KEY` in `.env` (loaded via Vite's `loadEnv` inside the plugin)

---

## Full flow

```
Record video
  → extract frames every 2s (client, src/utils/extractFrames.ts)
  → POST /api/analyse — Claude vision returns RoomData JSON
  → addScan(roomData, frames) → scan + frames saved to SQLite
  → navigate to /scan/:id

/scan/:id (Scan screen)
  → RoomScene stitches frames into a cylindrical 360° panorama
  → user looks around the actual room footage with drag controls
  → user types prompt ("add a couch and TV")
  → POST /api/prompt — Claude returns { objects, plan }
  → PATCH /api/scans/:id updates room_data.objects in SQLite
  → new objects appear as 3D boxes inside the panoramic scene
```

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
| POST | `/api/analyse` | `{ frames: string[] }` (base64 JPEG) | `RoomData` |
| POST | `/api/prompt` | `{ roomData, prompt }` | `{ objects, plan }` |

---

## Key types (`src/hooks/useScans.ts`)

```ts
interface RoomObject {
  id: string; type: string; label: string
  x: number; z: number; rotation: number
  width: number; depth: number; height: number
  color?: string
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
  frames?: string[]   // base64 JPEGs; present on GET /api/scans/:id, omitted on list
}
```

## Key files
- `src/hooks/useScans.ts` — `RoomData`, `RoomObject`, `Scan` types + `useScans()` hook; `addScan(roomData, frames)` returns `Promise<string>` (the scan ID)
- `src/hooks/useScan.ts` — `useScan(id)` fetches single scan (includes frames), exposes `updateObjects()`
- `src/hooks/useIsMobile.ts` — mobile detection, gates the app
- `src/utils/extractFrames.ts` — extracts base64 JPEG frames from a video Blob at a given interval
- `src/components/RoomScene.tsx` — Three.js panoramic viewer; stitches frames into a cylinder texture (360° look-around); falls back to box scene if no frames; accepts `roomData` + `frames` props
- `server/plugin.ts` — all `/api` routes; uses `loadEnv` for `ANTHROPIC_API_KEY`
- `server/db.ts` — SQLite schema + queries; `scans` table stores `id, label, created_at, room_data, frames`
- `server/ai.ts` — Claude API calls (`analyseRoom`, `promptFurniture`)
- `src/screens/Record.tsx` — camera logic; passes blob via `navigate('/processing', { state: { blob } })`
- `src/screens/Processing.tsx` — extract frames → `/api/analyse` → `addScan(roomData, frames)` → navigate
- `src/screens/Scan.tsx` — panoramic viewer + prompt input

---

## React Best Practices
- **Custom hooks always go in `src/hooks/`** as their own file. Never define hooks inline inside a component or page file.
- **Navigation uses React Router** — always use `useNavigate` from `react-router-dom`. Never store current screen/route in component state.
- **Imports use `@/` alias** — never use `../` relative imports. The `@` alias maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- **Shared utilities go in `src/utils/`** — never define reusable helpers inline in a component or page file.
- **All icons use `lucide-react`** — never use inline SVGs or other icon libraries. Import named icons from `lucide-react`.
