import Database from 'better-sqlite3'
import fs from 'fs'

export interface ScanRow {
  id: string
  label: string
  created_at: number
  room_data: string
  frames: string
  video_ext: string | null
}

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync('./db', { recursive: true })
    db = new Database('./db/roompt.db')
    db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        room_data TEXT NOT NULL,
        frames TEXT NOT NULL DEFAULT '[]',
        video_ext TEXT
      )
    `)
    // migrations for existing DBs
    try { db.exec(`ALTER TABLE scans ADD COLUMN frames TEXT NOT NULL DEFAULT '[]'`) } catch { /* exists */ }
    try { db.exec(`ALTER TABLE scans ADD COLUMN video_ext TEXT`) } catch { /* exists */ }
  }
  return db
}

export function dbSetVideoExt(id: string, ext: string): boolean {
  const result = getDb().prepare('UPDATE scans SET video_ext = ? WHERE id = ?').run(ext, id)
  return result.changes > 0
}

export function dbGetScans() {
  return getDb()
    .prepare('SELECT id, label, created_at, room_data FROM scans ORDER BY created_at DESC')
    .all() as Omit<ScanRow, 'frames'>[]
}

export function dbGetScan(id: string): ScanRow | undefined {
  return getDb().prepare('SELECT * FROM scans WHERE id = ?').get(id) as ScanRow | undefined
}

export function dbInsertScan(id: string, label: string, createdAt: number, roomData: object, frames: string[]) {
  getDb()
    .prepare('INSERT INTO scans (id, label, created_at, room_data, frames) VALUES (?, ?, ?, ?, ?)')
    .run(id, label, createdAt, JSON.stringify(roomData), JSON.stringify(frames))
}

export function dbPatchObjects(id: string, objects: unknown[]): boolean {
  const row = getDb().prepare('SELECT room_data FROM scans WHERE id = ?').get(id) as
    | { room_data: string }
    | undefined
  if (!row) return false
  const roomData = JSON.parse(row.room_data)
  roomData.objects = objects
  getDb().prepare('UPDATE scans SET room_data = ? WHERE id = ?').run(JSON.stringify(roomData), id)
  return true
}

export function dbPatchFrames(id: string, frames: string[]): boolean {
  const result = getDb()
    .prepare('UPDATE scans SET frames = ? WHERE id = ?')
    .run(JSON.stringify(frames), id)
  return (result as any).changes > 0
}

export function dbDeleteScan(id: string): boolean {
  const result = getDb().prepare('DELETE FROM scans WHERE id = ?').run(id)
  return result.changes > 0
}
