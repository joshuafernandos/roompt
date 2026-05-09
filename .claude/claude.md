# Roompt

## What to build
A PWA called **Roompt**. User records a space with their phone → AI analyses it → stores the scan → user can view all scans on the home screen.

---

## Stack
- **Frontend:** React + TypeScript + Tailwind + React Router v7
- **Database:** `better-sqlite3` → `db/roompt.db`, served via a Vite plugin (`sqlitePlugin` in `vite.config.ts`) that attaches `/api` middleware directly to the Vite dev server
- **No global state** — data lives in SQLite, fetched via `/api`
- `npm run dev` is just `vite` — no separate server process needed

---

## Screens

**1. Home** (`/`) — Title, list of scans from SQLite sorted newest first. Empty state when no scans. Floating camera FAB bottom-right navigates to Record.

**2. Record** (`/record`) — Full-screen camera via `MediaRecorder` API. States: `idle → requesting → previewing → recording → review → error`. Back button stops tracks and returns home. "Analyse this →" navigates to Processing.

**3. Processing** (`/processing`) — Runs through 4 mock steps, saves scan to SQLite via `addScan`, navigates home on completion.

---

## Key files
- `src/hooks/useScans.ts` — `RoomData` type, `Scan` type, `useScans()` hook (load / addScan / deleteScan via `/api/scans`)
- `src/hooks/useIsMobile.ts` — mobile detection, gates the app
- `vite.config.ts` — includes `sqlitePlugin()` which mounts `/api/scans` middleware and manages the SQLite db
- `src/screens/Record.tsx` — camera logic + small local components (BackButton, RecordControls, etc.)

---

## React Best Practices
- **Custom hooks always go in `src/hooks/`** as their own file. Never define hooks inline inside a component or page file.
- **Navigation uses React Router** — always use `useNavigate` from `react-router-dom`. Never store current screen/route in component state.
