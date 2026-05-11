import { Plugin, loadEnv } from 'vite'
import fs from 'fs'
import path from 'path'
import { dbGetScans, dbGetScan, dbInsertScan, dbPatchObjects, dbPatchFrames, dbDeleteScan, dbSetVideoExt } from './db'
import { analyseRoom, promptFurniture } from './ai'
import { generateModel } from './meshy'
import {
  BODY_MAX_BYTES, BODY_SCAN_MAX_BYTES, BODY_ANALYSE_MAX_BYTES, BODY_VIDEO_MAX_BYTES,
  LABEL_MAX_LENGTH, MESHY_TYPE_MAX_LENGTH, VIDEOS_DIR,
} from './config'

function mimeToExt(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('quicktime')) return 'mov'
  return 'webm'
}

function videoUrlFor(id: string, ext: string | null): string | null {
  return ext ? `/videos/${id}.${ext}` : null
}

function readBodyBuffer(req: any, maxBytes: number, cb: (err: Error | null, buf: Buffer) => void) {
  const chunks: Buffer[] = []
  let byteLength = 0
  req.on('data', (chunk: Buffer) => {
    byteLength += chunk.length
    if (byteLength > maxBytes) { cb(new Error('too large'), Buffer.alloc(0)); req.destroy() }
    else chunks.push(chunk)
  })
  req.on('end', () => cb(null, Buffer.concat(chunks)))
  req.on('error', (err: Error) => cb(err, Buffer.alloc(0)))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUUID(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

function sendJSON(res: any, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: any, maxBytes: number, cb: (err: Error | null, body: string) => void) {
  let body = ''
  let byteLength = 0
  req.on('data', (chunk: Buffer) => {
    byteLength += chunk.length
    if (byteLength > maxBytes) { cb(new Error('too large'), ''); req.destroy() }
    else body += chunk
  })
  req.on('end', () => cb(null, body))
  req.on('error', (err: Error) => cb(err, ''))
}

export function sqlitePlugin(): Plugin {
  return {
    name: 'sqlite-api',
    configureServer(server) {
      const env = loadEnv('', process.cwd(), '')
      const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
      const meshyKey = env.MESHY_API_KEY || process.env.MESHY_API_KEY

      // ── /api/scans ────────────────────────────────────────────────────────
      server.middlewares.use('/api/scans', (req, res, next) => {
        const url = req.url ?? '/'
        const idMatch = url.match(/^\/([0-9a-f-]{36})$/)
        const isRoot = url === '/' || url === ''

        // GET /api/scans
        if (req.method === 'GET' && isRoot) {
          try {
            const rows = dbGetScans()
            sendJSON(res, 200, rows.map((r) => ({
              id: r.id, label: r.label, createdAt: r.created_at,
              roomData: JSON.parse(r.room_data),
            })))
          } catch { sendJSON(res, 500, { error: 'Internal server error' }) }
          return
        }

        // GET /api/scans/:id
        if (req.method === 'GET' && idMatch) {
          const id = idMatch[1]
          if (!isValidUUID(id)) { sendJSON(res, 400, { error: 'Invalid id' }); return }
          try {
            const row = dbGetScan(id)
            if (!row) { sendJSON(res, 404, { error: 'Not found' }); return }
            sendJSON(res, 200, {
              id: row.id, label: row.label, createdAt: row.created_at,
              roomData: JSON.parse(row.room_data),
              frames: JSON.parse(row.frames ?? '[]'),
              videoUrl: videoUrlFor(row.id, row.video_ext ?? null),
            })
          } catch { sendJSON(res, 500, { error: 'Internal server error' }) }
          return
        }

        // POST /api/scans/:id/video  — raw bytes, Content-Type identifies format
        const videoMatch = url.match(/^\/([0-9a-f-]{36})\/video$/)
        if (req.method === 'POST' && videoMatch) {
          const id = videoMatch[1]
          if (!isValidUUID(id)) { sendJSON(res, 400, { error: 'Invalid id' }); return }
          const mime = (req.headers['content-type'] as string) || 'video/webm'
          const ext = mimeToExt(mime)
          readBodyBuffer(req, BODY_VIDEO_MAX_BYTES, (err, buf) => {
            if (err) { sendJSON(res, 413, { error: 'Video too large' }); return }
            try {
              fs.mkdirSync(VIDEOS_DIR, { recursive: true })
              fs.writeFileSync(path.join(VIDEOS_DIR, `${id}.${ext}`), buf)
              const updated = dbSetVideoExt(id, ext)
              updated ? sendJSON(res, 200, { ok: true, videoUrl: `/videos/${id}.${ext}` })
                      : sendJSON(res, 404, { error: 'Scan not found' })
            } catch (e) {
              sendJSON(res, 500, { error: e instanceof Error ? e.message : 'Save failed' })
            }
          })
          return
        }

        // POST /api/scans
        if (req.method === 'POST' && isRoot) {
          readBody(req, BODY_SCAN_MAX_BYTES, (err, body) => {
            if (err) { sendJSON(res, 413, { error: 'Request body too large' }); return }
            try {
              const { id, label, createdAt, roomData, frames } = JSON.parse(body)
              if (!isValidUUID(id)) return sendJSON(res, 400, { error: 'Invalid id' })
              if (typeof label !== 'string' || label.trim().length === 0 || label.length > LABEL_MAX_LENGTH)
                return sendJSON(res, 400, { error: 'Invalid label' })
              if (typeof createdAt !== 'number' || !Number.isFinite(createdAt))
                return sendJSON(res, 400, { error: 'Invalid createdAt' })
              if (!roomData || typeof roomData !== 'object' || Array.isArray(roomData))
                return sendJSON(res, 400, { error: 'Invalid roomData' })
              dbInsertScan(id, label.trim(), createdAt, roomData, Array.isArray(frames) ? frames : [])
              sendJSON(res, 201, { ok: true })
            } catch { sendJSON(res, 400, { error: 'Invalid JSON' }) }
          })
          return
        }

        // PATCH /api/scans/:id  — accepts { objects? } and/or { frames? }
        if (req.method === 'PATCH' && idMatch) {
          const id = idMatch[1]
          if (!isValidUUID(id)) { sendJSON(res, 400, { error: 'Invalid id' }); return }
          const patchLimit = Math.max(BODY_MAX_BYTES, BODY_SCAN_MAX_BYTES)
          readBody(req, patchLimit, (err, body) => {
            if (err) { sendJSON(res, 413, { error: 'Request body too large' }); return }
            try {
              const payload = JSON.parse(body)
              const { objects, frames } = payload
              if (objects === undefined && frames === undefined)
                return sendJSON(res, 400, { error: 'Nothing to update' })
              if (objects !== undefined && !Array.isArray(objects))
                return sendJSON(res, 400, { error: 'Invalid objects' })
              if (frames !== undefined && !Array.isArray(frames))
                return sendJSON(res, 400, { error: 'Invalid frames' })

              let found = true
              if (objects !== undefined) found = dbPatchObjects(id, objects)
              if (found && frames !== undefined) found = dbPatchFrames(id, frames)
              found ? sendJSON(res, 200, { ok: true }) : sendJSON(res, 404, { error: 'Not found' })
            } catch { sendJSON(res, 400, { error: 'Invalid JSON' }) }
          })
          return
        }

        // DELETE /api/scans/:id
        if (req.method === 'DELETE' && idMatch) {
          const id = idMatch[1]
          if (!isValidUUID(id)) { sendJSON(res, 400, { error: 'Invalid id' }); return }
          try {
            const ok = dbDeleteScan(id)
            if (ok) {
              for (const ext of ['webm', 'mp4', 'mov']) {
                const p = path.join(VIDEOS_DIR, `${id}.${ext}`)
                if (fs.existsSync(p)) fs.unlinkSync(p)
              }
            }
            ok ? sendJSON(res, 200, { ok: true }) : sendJSON(res, 404, { error: 'Not found' })
          } catch { sendJSON(res, 500, { error: 'Internal server error' }) }
          return
        }

        next()
      })

      // ── /api/analyse ──────────────────────────────────────────────────────
      server.middlewares.use('/api/analyse', (req, res, next) => {
        if (req.method !== 'POST') { next(); return }
        if (!anthropicKey) { sendJSON(res, 503, { error: 'ANTHROPIC_API_KEY not configured' }); return }

        readBody(req, BODY_ANALYSE_MAX_BYTES, async (err, body) => {
          if (err) { sendJSON(res, 413, { error: 'Request body too large' }); return }
          try {
            const { frames } = JSON.parse(body) as { frames: string[] }
            const roomData = await analyseRoom(frames ?? [], anthropicKey)
            sendJSON(res, 200, roomData)
          } catch (e) {
            sendJSON(res, 500, { error: e instanceof Error ? e.message : 'Analysis failed' })
          }
        })
      })

      // ── /api/model ────────────────────────────────────────────────────────
      server.middlewares.use('/api/model', (req, res, next) => {
        if (req.method !== 'POST') { next(); return }
        if (!meshyKey) { sendJSON(res, 503, { error: 'MESHY_API_KEY not configured' }); return }

        readBody(req, BODY_MAX_BYTES, async (err, body) => {
          if (err) { sendJSON(res, 413, { error: 'Request body too large' }); return }
          try {
            const { type, label } = JSON.parse(body) as { type?: unknown; label?: unknown }
            if (typeof type !== 'string' || !type.trim() || type.length > MESHY_TYPE_MAX_LENGTH)
              return sendJSON(res, 400, { error: 'Invalid type' })
            if (label !== undefined && (typeof label !== 'string' || label.length > LABEL_MAX_LENGTH))
              return sendJSON(res, 400, { error: 'Invalid label' })
            const url = await generateModel(type.trim(), typeof label === 'string' ? label.trim() : undefined, meshyKey)
            sendJSON(res, 200, { url })
          } catch (e) {
            sendJSON(res, 500, { error: e instanceof Error ? e.message : 'Model generation failed' })
          }
        })
      })

      // ── /api/prompt ───────────────────────────────────────────────────────
      server.middlewares.use('/api/prompt', (req, res, next) => {
        if (req.method !== 'POST') { next(); return }
        if (!anthropicKey) { sendJSON(res, 503, { error: 'ANTHROPIC_API_KEY not configured' }); return }

        // Body may include up to AI_MAX_FRAMES base64 JPEGs so Claude can return
        // a pixelAnchor pointing at the existing object in the recording.
        readBody(req, BODY_ANALYSE_MAX_BYTES, async (err, body) => {
          if (err) { sendJSON(res, 413, { error: 'Request body too large' }); return }
          try {
            const { roomData, prompt, frames } = JSON.parse(body)
            const framesArr = Array.isArray(frames) ? frames : []
            const result = await promptFurniture(roomData, prompt, anthropicKey, framesArr)
            sendJSON(res, 200, result)
          } catch (e) {
            sendJSON(res, 500, { error: e instanceof Error ? e.message : 'Prompt failed' })
          }
        })
      })
    },
  }
}
