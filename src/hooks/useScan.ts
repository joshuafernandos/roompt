import { useState, useEffect, useCallback } from 'react'
import type { Scan, FrameEdit } from './useScans'

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

  const applyEdit = useCallback(
    async (prompt: string): Promise<FrameEdit> => {
      const res = await fetch(`/api/scans/${id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Edit failed (${res.status})`)
      }
      const edit = (await res.json()) as FrameEdit
      setScan((prev) =>
        prev
          ? { ...prev, roomData: { ...prev.roomData, edits: [...(prev.roomData.edits ?? []), edit] } }
          : prev,
      )
      return edit
    },
    [id],
  )

  return { scan, applyEdit, isLoading }
}
