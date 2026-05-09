import { Plugin } from 'vite'
import Database from 'better-sqlite3'
import fs from 'fs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 1_048_576 // 1 MB

function isValidUUID(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

function sendJSON(res: any, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function sqlitePlugin(): Plugin {
  return {
    name: 'sqlite-api',
    configureServer(server) {
      fs.mkdirSync('./db', { recursive: true })
      const db = new Database('./db/roompt.db')
      db.exec(`
        CREATE TABLE IF NOT EXISTS scans (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          room_data TEXT NOT NULL
        )
      `)

      server.middlewares.use('/api/scans', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const rows = db.prepare('SELECT * FROM scans ORDER BY created_at DESC').all() as {
              id: string; label: string; created_at: number; room_data: string
            }[]
            sendJSON(res, 200, rows.map((r) => ({
              id: r.id, label: r.label, createdAt: r.created_at, roomData: JSON.parse(r.room_data),
            })))
          } catch {
            sendJSON(res, 500, { error: 'Internal server error' })
          }
          return
        }

        if (req.method === 'POST') {
          let body = ''
          let byteLength = 0

          req.on('data', (chunk: Buffer) => {
            byteLength += chunk.length
            if (byteLength > MAX_BODY_BYTES) {
              sendJSON(res, 413, { error: 'Request body too large' })
              req.destroy()
              return
            }
            body += chunk
          })

          req.on('end', () => {
            if (res.writableEnded) return
            try {
              const parsed = JSON.parse(body)
              const { id, label, createdAt, roomData } = parsed

              if (!isValidUUID(id)) return sendJSON(res, 400, { error: 'Invalid id' })
              if (typeof label !== 'string' || label.trim().length === 0 || label.length > 200)
                return sendJSON(res, 400, { error: 'Invalid label' })
              if (typeof createdAt !== 'number' || !Number.isFinite(createdAt))
                return sendJSON(res, 400, { error: 'Invalid createdAt' })
              if (!roomData || typeof roomData !== 'object' || Array.isArray(roomData))
                return sendJSON(res, 400, { error: 'Invalid roomData' })

              db.prepare('INSERT INTO scans (id, label, created_at, room_data) VALUES (?, ?, ?, ?)').run(
                id, label.trim(), createdAt, JSON.stringify(roomData)
              )
              sendJSON(res, 201, { ok: true })
            } catch {
              sendJSON(res, 400, { error: 'Invalid JSON' })
            }
          })
          return
        }

        // DELETE /api/scans/:id
        if (req.method === 'DELETE' && req.url && req.url.length > 1) {
          const id = req.url.slice(1)
          if (!isValidUUID(id)) {
            sendJSON(res, 400, { error: 'Invalid id' })
            return
          }
          try {
            const result = db.prepare('DELETE FROM scans WHERE id = ?').run(id)
            if (result.changes === 0) {
              sendJSON(res, 404, { error: 'Not found' })
            } else {
              sendJSON(res, 200, { ok: true })
            }
          } catch {
            sendJSON(res, 500, { error: 'Internal server error' })
          }
          return
        }

        next()
      })
    },
  }
}
