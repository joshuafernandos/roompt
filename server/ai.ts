import Anthropic from '@anthropic-ai/sdk'
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

function extractJSON(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse((fenced ? fenced[1] : text).trim())
}

export async function analyseRoom(frames: string[], apiKey: string): Promise<unknown> {
  const client = new Anthropic({ apiKey })

  const imageContent: Anthropic.ImageBlockParam[] = frames.slice(0, AI_MAX_FRAMES).map((data) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
  }))

  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    messages: [
      { role: 'user', content: [...imageContent, { type: 'text', text: ANALYSE_PROMPT }] },
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
