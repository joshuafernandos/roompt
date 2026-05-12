import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  AI_MODEL, AI_MAX_TOKENS, AI_MAX_FRAMES,
  GEMINI_API_BASE, GEMINI_IMAGE_MODEL,
  EDIT_CROP_PADDING, EDITS_DIR,
} from './config'

// Two-step image edit pipeline:
//   1. Claude vision picks which frame + bounding box matches the user prompt
//      and produces a Gemini-ready edit instruction.
//   2. We crop that bbox (+ padding for context), pass to Gemini 2.5 Flash
//      Image, paste the returned crop back into a copy of the full original
//      frame, and save it to public/edits/ so the client can overlay it on the
//      video at the matching timestamp.

export interface EditPlan {
  frameIndex: number
  bbox: { x: number; y: number; w: number; h: number }  // normalised 0–1, top-left origin
  instruction: string                                    // edit prompt for Gemini
  plan: string                                           // human-readable summary
}

export interface AppliedEdit {
  id: string
  frameIndex: number
  imageUrl: string  // /edits/<filename>.jpg
  plan: string
}

const PLAN_SYSTEM = `You decide how to edit a recorded space (room / garden / interior) to satisfy a user request. You receive multiple video frames (Frame 0, Frame 1, …) and a prompt. Return ONLY a JSON object:

{
  "frameIndex": 2,
  "bbox": { "x": 0.18, "y": 0.32, "w": 0.45, "h": 0.55 },
  "instruction": "Replace the white wooden door with a modern dark walnut door with a brushed brass handle, matching the room's lighting and perspective.",
  "plan": "Swapping the door visible in frame 2 for a dark walnut one."
}

RULES:
• Pick the SINGLE frame that shows the target area most clearly and head-on.
• bbox is normalised 0–1 coords (top-left origin) of the region to EDIT. Tightly enclose just the object(s) being changed/added — do NOT add padding (the server adds context padding itself). For pure additions ("add flowers"), bbox is the empty area where the new element should appear.
• instruction MUST be a self-contained, photoreal Gemini edit prompt: describe what to change/add, materials, colour, lighting, perspective. Never reference frame numbers or coordinates.
• plan is one short sentence shown to the user.

Return only the JSON object. No markdown, no explanation.`

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
  inline_data?: { mime_type: string; data: string }
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[]
  error?: { message?: string }
}

export async function planEdit(
  frames: string[],
  prompt: string,
  anthropicKey: string,
): Promise<EditPlan> {
  const client = new Anthropic({ apiKey: anthropicKey })
  const usable = frames.slice(0, AI_MAX_FRAMES)
  const content = usable.flatMap((data, i) => [
    { type: 'text' as const, text: `Frame ${i}:` },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } },
  ])
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    system: PLAN_SYSTEM,
    messages: [{ role: 'user', content: [...content, { type: 'text', text: `Request: "${prompt}"` }] }],
  })
  const text = message.content.find((b) => b.type === 'text')?.text ?? ''
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const json = JSON.parse((fenced ? fenced[1] : text).trim()) as Partial<EditPlan>
  if (
    typeof json.frameIndex !== 'number' ||
    !json.bbox || typeof json.bbox.x !== 'number' ||
    typeof json.instruction !== 'string' || !json.instruction.trim()
  ) {
    throw new Error('Planner returned invalid JSON')
  }
  return {
    frameIndex: Math.max(0, Math.min(usable.length - 1, Math.floor(json.frameIndex))),
    bbox: clampBox(json.bbox),
    instruction: json.instruction.trim(),
    plan: (json.plan ?? '').toString().trim() || 'Applied edit.',
  }
}

function clampBox(b: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(0, Math.min(1, b.x))
  const y = Math.max(0, Math.min(1, b.y))
  const w = Math.max(0.02, Math.min(1 - x, b.w))
  const h = Math.max(0.02, Math.min(1 - y, b.h))
  return { x, y, w, h }
}

async function callGemini(
  cropJpeg: Buffer,
  instruction: string,
  apiKey: string,
): Promise<Buffer> {
  const url = `${GEMINI_API_BASE}/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`
  const body = {
    contents: [{
      parts: [
        { text: instruction },
        { inlineData: { mimeType: 'image/jpeg', data: cropJpeg.toString('base64') } },
      ],
    }],
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as GeminiResponse
  if (!res.ok) throw new Error(`Gemini error: ${json.error?.message ?? res.statusText}`)
  const parts = json.candidates?.[0]?.content?.parts ?? []
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data
    if (inline?.data) return Buffer.from(inline.data, 'base64')
  }
  throw new Error('Gemini returned no image')
}

export async function applyEdit(
  scanId: string,
  frames: string[],
  prompt: string,
  anthropicKey: string,
  geminiKey: string,
): Promise<AppliedEdit> {
  const plan = await planEdit(frames, prompt, anthropicKey)
  const frameBuf = Buffer.from(frames[plan.frameIndex], 'base64')
  const meta = await sharp(frameBuf).metadata()
  const fw = meta.width ?? 0
  const fh = meta.height ?? 0
  if (!fw || !fh) throw new Error('Could not read frame dimensions')

  // Expand the planner's tight bbox by EDIT_CROP_PADDING so Gemini sees enough
  // surrounding context (wall, lighting, neighbouring objects) to make the
  // edit blend in. Snap to pixel grid and clamp to frame bounds.
  const padX = plan.bbox.w * EDIT_CROP_PADDING
  const padY = plan.bbox.h * EDIT_CROP_PADDING
  const left = Math.max(0, Math.round((plan.bbox.x - padX) * fw))
  const top = Math.max(0, Math.round((plan.bbox.y - padY) * fh))
  const right = Math.min(fw, Math.round((plan.bbox.x + plan.bbox.w + padX) * fw))
  const bottom = Math.min(fh, Math.round((plan.bbox.y + plan.bbox.h + padY) * fh))
  const cropW = right - left
  const cropH = bottom - top
  if (cropW < 8 || cropH < 8) throw new Error('Crop region too small')

  const cropJpeg = await sharp(frameBuf)
    .extract({ left, top, width: cropW, height: cropH })
    .jpeg({ quality: 92 })
    .toBuffer()

  const editedCrop = await callGemini(cropJpeg, plan.instruction, geminiKey)

  // Gemini may return a different resolution; resize back to the crop size so
  // the paste is pixel-aligned with the original frame.
  const resized = await sharp(editedCrop)
    .resize(cropW, cropH, { fit: 'fill' })
    .png()
    .toBuffer()

  const composite = await sharp(frameBuf)
    .composite([{ input: resized, left, top }])
    .jpeg({ quality: 88 })
    .toBuffer()

  fs.mkdirSync(EDITS_DIR, { recursive: true })
  const id = randomUUID()
  const filename = `${scanId}-${id}.jpg`
  fs.writeFileSync(path.join(EDITS_DIR, filename), composite)

  return {
    id,
    frameIndex: plan.frameIndex,
    imageUrl: `/edits/${filename}`,
    plan: plan.plan,
  }
}
