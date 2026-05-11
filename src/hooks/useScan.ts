import { useState, useEffect, useCallback } from 'react'
import type { Scan, RoomObject } from './useScans'

export function useScan(id: string) {
  const [scan, setScan] = useState<Scan | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/scans/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Scan) => setScan(data))
      .catch(() => setScan(null))
      .finally(() => setIsLoading(false))
  }, [id])

  const updateObjects = useCallback(
    async (objects: RoomObject[]) => {
      const res = await fetch(`/api/scans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects }),
      })
      if (!res.ok) throw new Error('Failed to update objects')
      setScan((prev) =>
        prev ? { ...prev, roomData: { ...prev.roomData, objects } } : prev,
      )
    },
    [id],
  )

  return { scan, updateObjects, isLoading }
}
