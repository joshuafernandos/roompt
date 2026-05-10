import { useEffect, useState, useCallback } from 'react'

export interface RoomObject {
  id: string
  type: string
  label: string
  x: number
  z: number
  rotation: number
  width: number
  depth: number
  height: number
  color?: string
}

export interface RoomData {
  spaceType: string
  estimatedWidth: number
  estimatedLength: number
  estimatedHeight: number
  floorType: string
  wallColor?: string
  wallFeatures: { wall: string; features: string[] }[]
  constraints: string[]
  objects?: RoomObject[]
}

export interface Scan {
  id: string
  label: string
  createdAt: number
  roomData: RoomData
  frames?: string[]
}

export function useScans() {
  const [scans, setScans] = useState<Scan[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    const res = await fetch('/api/scans')
    if (!res.ok) throw new Error(`Failed to load scans: ${res.status}`)
    setScans(await res.json())
    setIsLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const addScan = useCallback(async (roomData: RoomData, frames: string[] = []): Promise<string> => {
    const scan: Scan = {
      id: crypto.randomUUID(),
      label: roomData.spaceType,
      createdAt: Date.now(),
      roomData,
      frames,
    }
    const res = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scan),
    })
    if (!res.ok) throw new Error(`Failed to save scan: ${res.status}`)
    setScans((prev) => [scan, ...prev])
    return scan.id
  }, [])

  const deleteScan = useCallback(
    async (id: string) => {
      const snapshot = scans
      setScans((prev) => prev.filter((s) => s.id !== id))
      try {
        const res = await fetch(`/api/scans/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(`Failed to delete scan: ${res.status}`)
      } catch (err) {
        setScans(snapshot)
        throw err
      }
    },
    [scans],
  )

  return { scans, addScan, deleteScan, isLoading }
}
