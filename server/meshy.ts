import fs from 'fs'
import path from 'path'
import {
  MESHY_API_BASE,
  MESHY_ART_STYLE,
  MESHY_POLL_INTERVAL_MS,
  MESHY_MAX_POLL_MS,
  MESHY_MODELS_DIR,
} from './config'

interface MeshyTaskCreate { result: string }
interface MeshyTaskStatus {
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'CANCELED'
  model_urls?: { glb?: string; fbx?: string; obj?: string; usdz?: string }
  task_error?: { message?: string }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item'
}

function cacheKey(type: string, label?: string): string {
  return label ? `${slug(type)}--${slug(label)}` : slug(type)
}

function modelPath(key: string): string {
  return path.join(MESHY_MODELS_DIR, `${key}.glb`)
}

const inflight = new Map<string, Promise<string>>()

export async function generateModel(
  type: string,
  label: string | undefined,
  apiKey: string,
): Promise<string> {
  const key = cacheKey(type, label)
  const filePath = modelPath(key)
  const publicUrl = `/models/${key}.glb`

  if (fs.existsSync(filePath)) return publicUrl
  const existing = inflight.get(key)
  if (existing) return existing

  const job = runMeshy(type, label, apiKey, filePath).then(() => publicUrl)
  inflight.set(key, job)
  try { return await job } finally { inflight.delete(key) }
}

async function runMeshy(
  type: string,
  label: string | undefined,
  apiKey: string,
  outPath: string,
): Promise<void> {
  const prompt = `A realistic ${label || type}, single isolated furniture model, neutral lighting, no background, centered on origin.`

  const createRes = await fetch(`${MESHY_API_BASE}/openapi/v2/text-to-3d`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'preview',
      prompt,
      art_style: MESHY_ART_STYLE,
      should_remesh: true,
    }),
  })
  if (!createRes.ok) {
    const msg = await createRes.text().catch(() => '')
    throw new Error(`Meshy create failed: ${createRes.status} ${msg}`)
  }
  const { result: taskId } = (await createRes.json()) as MeshyTaskCreate

  const deadline = Date.now() + MESHY_MAX_POLL_MS
  let glbUrl: string | undefined
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, MESHY_POLL_INTERVAL_MS))
    const statusRes = await fetch(`${MESHY_API_BASE}/openapi/v2/text-to-3d/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (!statusRes.ok) continue
    const data = (await statusRes.json()) as MeshyTaskStatus
    if (data.status === 'SUCCEEDED') { glbUrl = data.model_urls?.glb; break }
    if (data.status === 'FAILED' || data.status === 'EXPIRED' || data.status === 'CANCELED') {
      throw new Error(`Meshy task ${data.status}: ${data.task_error?.message ?? ''}`)
    }
  }
  if (!glbUrl) throw new Error('Meshy task timed out')

  const dl = await fetch(glbUrl)
  if (!dl.ok) throw new Error(`Meshy GLB download failed: ${dl.status}`)
  const buf = Buffer.from(await dl.arrayBuffer())
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, buf)
}
