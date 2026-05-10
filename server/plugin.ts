import { Plugin, loadEnv } from 'vite'
import { dbGetScans, dbGetScan, dbInsertScan, dbPatchObjects, dbPatchFrames, dbDeleteScan } from './db'
import { analyseRoom, promptFurniture, editRoomElement } from './ai'
import { BODY_MAX_BYTES, BODY_SCAN_MAX_BYTES, BODY_ANALYSE_MAX_BYTES, BODY_EDIT_MAX_BYTES, LABEL_MAX_LENGTH } from './config'

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
            })
          } catch { sendJSON(res, 500, { error: 'Internal server error' }) }
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
            dbDeleteScan(id)
              ? sendJSON(res, 200, { ok: true })
              : sendJSON(res, 404, { error: 'Not found' })
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

      // ── /api/edit-frame ───────────────────────────────────────────────────
      server.middlewares.use('/api/edit-frame', (req, res, next) => {
        if (req.method !== 'POST') { next(); return }
        if (!anthropicKey) { sendJSON(res, 503, { error: 'ANTHROPIC_API_KEY not configured' }); return }

        readBody(req, BODY_EDIT_MAX_BYTES, async (err, body) => {
          if (err) { sendJSON(res, 413, { error: 'Request body too large' }); return }
          try {
            const { frames, prompt } = JSON.parse(body) as { frames: string[]; prompt: string }
            if (!Array.isArray(frames) || !frames.length)
              return sendJSON(res, 400, { error: 'frames required' })
            if (typeof prompt !== 'string' || !prompt.trim())
              return sendJSON(res, 400, { error: 'prompt required' })
            const result = await editRoomElement(frames, prompt, anthropicKey)
            sendJSON(res, 200, result)
          } catch (e) {
            sendJSON(res, 500, { error: e instanceof Error ? e.message : 'Edit failed' })
          }
        })
      })

      // ── /api/prompt ───────────────────────────────────────────────────────
      server.middlewares.use('/api/prompt', (req, res, next) => {
        if (req.method !== 'POST') { next(); return }
        if (!anthropicKey) { sendJSON(res, 503, { error: 'ANTHROPIC_API_KEY not configured' }); return }

        readBody(req, BODY_MAX_BYTES, async (err, body) => {
          if (err) { sendJSON(res, 413, { error: 'Request body too large' }); return }
          try {
            const { roomData, prompt } = JSON.parse(body)
            const result = await promptFurniture(roomData, prompt, anthropicKey)
            sendJSON(res, 200, result)
          } catch (e) {
            sendJSON(res, 500, { error: e instanceof Error ? e.message : 'Prompt failed' })
          }
        })
      })
    },
  }
}
