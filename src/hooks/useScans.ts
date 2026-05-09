import { useEffect, useState, useCallback } from 'react'

export interface RoomData {
  spaceType: string
  estimatedWidth: number
  estimatedLength: number
  estimatedHeight: number
  floorType: string
  wallFeatures: { wall: string; features: string[] }[]
  constraints: string[]
}

export interface Scan {
  id: string
  label: string
  createdAt: number
  roomData: RoomData
}

export function useScans() {
  const [scans, setScans] = useState<Scan[]>([])

  const load = useCallback(async () => {
    const res = await fetch('/api/scans')
    if (!res.ok) throw new Error(`Failed to load scans: ${res.status}`)
    setScans(await res.json())
  }, [])

  useEffect(() => { load() }, [load])

  const addScan = useCallback(async (roomData: RoomData) => {
    const scan: Scan = {
      id: crypto.randomUUID(),
      label: roomData.spaceType,
      createdAt: Date.now(),
      roomData,
    }
    const res = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scan),
    })
    if (!res.ok) throw new Error(`Failed to save scan: ${res.status}`)
    setScans((prev) => [scan, ...prev])
  }, [])

  const deleteScan = useCallback(async (id: string) => {
    const snapshot = scans
    setScans((prev) => prev.filter((s) => s.id !== id))
    try {
      const res = await fetch(`/api/scans/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed to delete scan: ${res.status}`)
    } catch (err) {
      setScans(snapshot)
      throw err
    }
  }, [scans])

  return { scans, addScan, deleteScan }
}
