import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { AI_MODEL, AI_MAX_TOKENS, AI_MAX_FRAMES } from './config'

const ANALYSE_PROMPT = `You are given multiple video frames of a real room. Carefully study every frame — lighting, surfaces, openings, and objects — then return ONLY a single valid JSON object describing what you actually see:

{
  "spaceType": "Living Room",
  "estimatedWidth": 5.0,
  "estimatedLength": 4.0,
  "estimatedHeight": 2.7,
  "floorType": "timber",
  "wallColor": "#f2ede4",
  "wallFeatures": [
    { "wall": "north", "features": ["window", "window"] },
    { "wall": "east", "features": ["door"] }
  ],
  "constraints": ["radiator on south wall", "built-in bookshelf on east wall"]
}

RULES — read carefully:

DIMENSIONS
Estimate in metres from visual cues: standard door ≈ 2.05 m tall × 0.85 m wide; ceiling height ≈ 2.4–3.0 m; skirting board ≈ 0.1 m. Use proportions between known objects to derive width and length. A typical bedroom is 3–4 m × 3–4 m; a living room 4–6 m × 4–5 m.

FLOOR TYPE
Choose exactly one: timber / carpet / tile / concrete / vinyl. Match what you can actually see on the floor.

WALL COLOR
Sample the dominant painted or plastered wall surface — ignore furniture, artwork, and shadows. Return a hex string (e.g. "#e8e0d4") that closely matches the actual hue and lightness you see. Warm off-white ≈ "#f0ebe2", cool grey ≈ "#d8dade", cream ≈ "#f5f0e4".

WALL FEATURES
Only include walls that have a visible window or door. Use compass labels: north, south, east, west — where the wall you first face when entering is north. Each feature string must be exactly "window" or "door" — one entry per opening (two windows → ["window","window"]).

CONSTRAINTS
List only fixed, built-in, unmovable elements (radiators, fireplaces, built-in wardrobes, kitchen islands, structural columns). Each string MUST contain:
  • the wall direction keyword (north / south / east / west)
  • the fixture type keyword (radiator / bookshelf / shelf / fireplace / wardrobe / column)
  Example: "radiator on north wall", "built-in bookshelf on east wall"
Ignore loose furniture — it is movable and not a constraint.

Return only the JSON object. No markdown, no explanation.`

const PROMPT_SYSTEM = `You are an interior designer placing furniture in a 3D room model. Given room data and a user request, return ONLY valid JSON for the NEW furniture objects to add:

{
  "objects": [
    {
      "type": "sofa",
      "label": "3-seater sofa",
      "x": 0.0,
      "z": 1.5,
      "rotation": 0,
      "width": 2.2,
      "depth": 0.9,
      "height": 0.8,
      "color": "#5c4a3a"
    }
  ],
  "plan": "One sentence describing the placement rationale."
}

TYPE — must be one of these canonical lowercase keywords (the renderer dispatches on substring match):
  door, window, sofa, armchair, bed, chair, dining_table, coffee_table, side_table, desk, tv, lamp, plant, rug, bookshelf, wardrobe
Pick the closest match. Do NOT invent new types like "front_door" or "modern_sofa" — use "door" or "sofa" and put descriptors in "label".

COORDINATE SYSTEM — critical:
• Origin (0, 0) = room centre on the floor plane.
• x-axis runs east (+x) / west (-x). Room spans −width/2 to +width/2.
• z-axis runs south (+z) / north (−z). Room spans −length/2 to +length/2.
• North wall is at z = −length/2. South wall at z = +length/2. East wall at x = +width/2. West wall at x = −width/2.
• rotation is degrees around the vertical axis: 0° = object faces north (−z), 90° = faces east (+x), 180° = faces south (+z), 270° = faces west (−x).

PLACEMENT RULES:
1. Keep objects fully inside the room: |x| ≤ width/2 − objWidth/2 and |z| ≤ length/2 − objDepth/2.
2. Leave at least 0.7 m clearance between objects and between objects and walls, except when intentionally placing against a wall (then back face touches wall).
3. Respect constraints — do not place objects over or in front of radiators, fireplaces, or built-in shelves.
4. Respect wall features — leave a 1.0 m clear zone in front of each door; do not block windows with tall objects.
5. Sofas and beds face inward (away from the nearest wall). Desks and TVs face toward the user.
6. "Against the north wall" means z ≈ −length/2 + depth/2 + 0.06 (just off the wall).

DOORS AND WINDOWS — special rules:
• Doors and windows are wall-mounted. depth must be small (door: 0.05; window: 0.06). The renderer draws a frame, panel, and handle — DO NOT model these as deep boxes.
• Door dimensions: width 0.85, height 2.05, depth 0.05.
• Window dimensions: width 1.0–1.5, height 1.1–1.4, depth 0.06. Place at chest height by setting the object on the floor (the renderer uses 'height' as the object's full height; for windows, choose y-position via z, and let height represent visible window height — they will sit on the floor in this version, which is acceptable).
• rotation must align the door/window flat to its wall: north wall → 0°, east → 90°, south → 180°, west → 270°.
• Position: back face flush to the wall, e.g. north door at z = −length/2 + 0.025.

REALISTIC DIMENSIONS (metres):
sofa 2-seater: 1.6×0.85×0.8 | 3-seater: 2.2×0.9×0.8
armchair: 0.85×0.85×0.85
coffee_table: 1.1×0.45×0.4
dining_table 4-seat: 1.4×0.8×0.75 | 6-seat: 1.8×0.9×0.75
chair: 0.45×0.45×0.85
bed single: 0.9×1.9×0.5 | double: 1.4×1.9×0.5 | queen: 1.6×2.0×0.5 | king: 1.8×2.0×0.5
wardrobe: 1.2×0.6×2.0
desk: 1.2×0.6×0.75
tv: 1.2×0.08×0.7 (mounted appearance)
bookshelf: 0.8×0.3×1.8
side_table: 0.5×0.5×0.55
lamp (floor): 0.35×0.35×1.5
plant: 0.5×0.5×1.2
rug: 1.6×0.02×2.2

COLORS: use muted, realistic hex colors that complement the wall color in the room data. No pure black or pure white.

Return only new objects the user asked for. No markdown, no commentary — pure JSON only.`

export interface FrameEditData {
  frameIndex: number
  elementType: 'door' | 'window' | 'wall' | 'floor' | 'other'
  region: { x: number; y: number; width: number; height: number }
  style: {
    primaryColor: string
    secondaryColor: string
    material: 'wood' | 'metal' | 'glass' | 'painted' | 'composite'
    variant: 'modern' | 'traditional' | 'minimal' | 'panel' | 'frosted'
    hasHandle: boolean
    panelCount: number
    handleSide: 'left' | 'right'
  }
  plan: string
}

function extractJSON(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse((fenced ? fenced[1] : text).trim())
}

function makeClient(apiKey: string) {
  return new Anthropic({ apiKey })
}

export async function analyseRoom(frames: string[], apiKey: string): Promise<unknown> {
  const client = makeClient(apiKey)

  const imageContent: Anthropic.ImageBlockParam[] = frames.slice(0, AI_MAX_FRAMES).map((data) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
  }))

  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [...imageContent, { type: 'text', text: ANALYSE_PROMPT }],
      },
    ],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? ''
  const result = extractJSON(text) as Record<string, unknown>

  // Fill in sensible defaults when Claude couldn't analyse the frames
  if (!result.spaceType || result.spaceType === 'Unknown') result.spaceType = 'Room'
  if (!result.estimatedWidth) result.estimatedWidth = 4.0
  if (!result.estimatedLength) result.estimatedLength = 3.5
  if (!result.estimatedHeight) result.estimatedHeight = 2.7
  if (!result.floorType) result.floorType = 'timber'
  if (!result.wallColor || result.wallColor === '#000000') result.wallColor = '#e8e0d4'
  if (!Array.isArray(result.wallFeatures)) result.wallFeatures = []
  if (!Array.isArray(result.constraints)) result.constraints = []

  return result
}

export async function editRoomElement(
  frames: string[],
  prompt: string,
  apiKey: string,
): Promise<FrameEditData> {
  const client = makeClient(apiKey)

  // Interleave "Frame N:" labels with image blocks so Claude can reference by index
  const imageContent = frames.slice(0, AI_MAX_FRAMES).flatMap((data, i) => [
    { type: 'text' as const, text: `Frame ${i}:` },
    {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
    },
  ])

  const locatePrompt = `The user wants to: "${prompt}"

Look at every frame and find the element to change. Return ONLY valid JSON:

{
  "frameIndex": 0,
  "elementType": "door",
  "region": { "x": 0.30, "y": 0.08, "width": 0.14, "height": 0.58 },
  "style": {
    "primaryColor": "#f5f5f0",
    "secondaryColor": "#dedad2",
    "material": "painted",
    "variant": "modern",
    "hasHandle": true,
    "panelCount": 0,
    "handleSide": "right"
  },
  "plan": "Replacing the existing door with a modern flat white painted door."
}

RULES:
frameIndex — 0-based index of the frame that best shows the element to change.
elementType — exactly one of: "door" / "window" / "wall" / "floor" / "other".
region — normalised coords (0.0–1.0), (0,0) = top-left of the frame:
  • x,y: top-left corner of the bounding box (include the door/window frame in the box)
  • width,height: box dimensions
style — interpret the user's request to determine the desired replacement:
  • primaryColor: main surface hex (door face, wall paint, floor boards)
  • secondaryColor: trim/frame hex (slightly darker or complementary)
  • material: "wood" | "metal" | "glass" | "painted" | "composite"
  • variant: "modern" (flat) | "traditional" (ornate) | "minimal" (very simple) | "panel" (raised panels) | "frosted" (frosted glass)
  • hasHandle: true for doors, false for walls/floors/windows
  • panelCount: 0 for modern/minimal/glass, 2 for traditional, 4 for classic
  • handleSide: "left" or "right" based on what you see in the frame
plan — one sentence describing what will change.

Return only the JSON. No markdown, no extra text.`

  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: locatePrompt }] }],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? ''
  const raw = extractJSON(text) as FrameEditData

  // Clamp to valid ranges
  const n = frames.length
  raw.frameIndex = Math.max(0, Math.min(n - 1, raw.frameIndex ?? 0))
  const r = raw.region ?? { x: 0.2, y: 0.1, width: 0.15, height: 0.6 }
  r.x = Math.max(0, Math.min(0.95, r.x))
  r.y = Math.max(0, Math.min(0.95, r.y))
  r.width = Math.max(0.03, Math.min(1 - r.x, r.width))
  r.height = Math.max(0.03, Math.min(1 - r.y, r.height))
  raw.region = r

  return raw
}

export async function promptFurniture(
  roomData: unknown,
  prompt: string,
  apiKey: string,
): Promise<{ objects: unknown[]; plan: string }> {
  const client = makeClient(apiKey)

  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    system: PROMPT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Room: ${JSON.stringify(roomData)}\n\nRequest: "${prompt}"`,
      },
    ],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? ''
  const result = extractJSON(text) as { objects: any[]; plan: string }

  const objects = (result.objects ?? []).map((obj: any) => ({ ...obj, id: randomUUID() }))
  return { objects, plan: result.plan ?? '' }
}
