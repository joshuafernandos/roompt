# Roompt

## What to build
A PWA called **Roompt**. User records a space with their phone → AI analyses it → renders a 3D schematic → user prompts what they want to build → AI places objects + generates a plan.

---

## Stack
React + TypeScript + Tailwind + React Three Fiber + Zustand. Single page, state-driven navigation. No router needed.

---

## 4 Screens

**1. Home** — App name, "New Scan" button, recent scans list from IndexedDB.

**2. Record** — Full-screen camera via `MediaRecorder` API. Record button, video preview, "Analyse this →" button.

**3. Processing** — Extract 5 frames from video (Canvas API), send to Claude vision, show progress. Claude returns space JSON (dimensions, walls, floor, features).

**4. Viewer** — Three.js scene showing procedural room (floor + walls + feature markers). Prompt bar at bottom. User types e.g. "add a couch and TV". Claude returns object positions + build plan. Objects appear as labelled 3D boxes. Slide-up plan panel.

---

## Visual Style
- Dark UI — background `#0f172a`, cards `#1e293b`
- Accent: electric blue `#3b82f6`
- Clean sans-serif, generous whitespace
- Minimal — no decoration, everything functional
- Mobile-first, safe-area aware

---

## Mock Data (hardcode for prototype)

```json
{
  "spaceType": "room",
  "estimatedWidth": 5,
  "estimatedLength": 4,
  "estimatedHeight": 2.7,
  "floorType": "timber",
  "wallFeatures": [
    { "wall": "north", "features": ["window"] },
    { "wall": "east", "features": ["door"] }
  ],
  "constraints": ["radiator south wall"]
}
```

Mock prompt response — user types "I want a desk setup":
```json
{
  "objects": [
    { "id": "obj_1", "name": "Desk", "x": 1.5, "y": 0, "z": -1, "rotationY": 0, "width": 1.4, "depth": 0.7, "height": 0.75, "colour": "#94a3b8" },
    { "id": "obj_2", "name": "Chair", "x": 1.5, "y": 0, "z": -0.1, "rotationY": 180, "width": 0.6, "depth": 0.6, "height": 0.9, "colour": "#64748b" }
  ],
  "plan": {
    "summary": "A clean desk setup using the north wall light.",
    "steps": [
      { "step": 1, "title": "Position desk", "detail": "Place desk against north wall to use natural light.", "time": "20 min" },
      { "step": 2, "title": "Set up chair", "detail": "Position chair 60cm from desk, facing north.", "time": "5 min" }
    ]
  }
}
```

---

## Deliver
Single `.jsx` artifact, no required props, all mock data hardcoded, all screens navigable, objects rendered in 3D scene, plan panel slide-up working.