import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { RoomScene } from '@/components/RoomScene'
import { useScan } from '@/hooks/useScan'
import type { RoomObject } from '@/hooks/useScans'
import { pixelAnchorToCoords } from '@/utils/pixelAnchor'

export default function Scan() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { scan, updateObjects, isLoading } = useScan(id!)
  const [prompt, setPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAddFurniture = async (userPrompt: string) => {
    const frames = scan!.frames ?? []
    const res = await fetch('/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomData: scan!.roomData, prompt: userPrompt, frames }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? `Server error ${res.status}`)
    }
    const data: { objects: RoomObject[]; plan: string } = await res.json()

    // For objects Claude anchored to a pixel in the recording, override the
    // abstract room x/z with coords derived from the anchor so they line up
    // with the actual element on screen.
    const newObjects = data.objects.map((obj) => {
      if (obj.pixelAnchor && frames.length > 0) {
        const { x, z } = pixelAnchorToCoords(obj.pixelAnchor, frames.length, scan!.roomData)
        return { ...obj, x, z }
      }
      return obj
    })

    const existing = scan!.roomData.objects ?? []
    const merged = [...existing, ...newObjects]
    await updateObjects(merged)

    // Fire-and-forget Meshy generation for each new object. As GLBs arrive,
    // patch the corresponding object's modelUrl and update the scene.
    void hydrateModels(existing, newObjects)
    return data.plan
  }

  const hydrateModels = async (prevObjects: RoomObject[], newObjects: RoomObject[]) => {
    // Generate GLBs in parallel; PATCH the database sequentially so concurrent
    // /api/model completions don't clobber each other's modelUrl updates.
    let current = [...prevObjects, ...newObjects]
    const tasks = newObjects.map(async (obj) => {
      const r = await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: obj.type, label: obj.label }),
      })
      if (!r.ok) return null
      const { url } = (await r.json()) as { url: string }
      return { id: obj.id, url }
    })
    for (const t of tasks) {
      try {
        const result = await t
        if (!result) continue
        current = current.map((o) => (o.id === result.id ? { ...o, modelUrl: result.url } : o))
        await updateObjects(current)
      } catch {
        // leave this object with the procedural fallback
      }
    }
  }

  const handleSubmit = async () => {
    if (!prompt.trim() || isProcessing || !scan) return
    setIsProcessing(true)
    setError(null)
    const userPrompt = prompt
    setPrompt('')
    try {
      const resultPlan = await handleAddFurniture(userPrompt)
      setPlan(resultPlan)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process prompt')
      setPrompt(userPrompt)
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <Loader2 className="animate-spin text-white/40 w-8 h-8" />
      </div>
    )
  }

  if (!scan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-4 px-6">
        <p className="text-white/60">Scan not found</p>
        <button onClick={() => navigate('/')} className="text-white underline text-sm">
          Go home
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-dvh bg-black">
      <div className="flex items-center gap-3 px-5 py-4 shrink-0">
        <BackButton onClick={() => navigate('/')} />
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-semibold truncate">{scan.roomData.spaceType}</h1>
          <p className="text-white/40 text-xs">
            {scan.roomData.estimatedWidth}m × {scan.roomData.estimatedLength}m ×{' '}
            {scan.roomData.estimatedHeight}m
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <RoomScene roomData={scan.roomData} videoUrl={scan.videoUrl} />
      </div>

      {plan && (
        <div className="px-5 py-3 bg-white/5 border-t border-white/10 shrink-0">
          <p className="text-white/60 text-xs leading-relaxed">{plan}</p>
        </div>
      )}

      {error && (
        <div className="px-5 py-2 shrink-0">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      <PromptInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={handleSubmit}
        isProcessing={isProcessing}
      />
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-xl bg-white/10 active:bg-white/20 transition-colors"
      aria-label="Back"
    >
      <ArrowLeft className="w-5 h-5 text-white" />
    </button>
  )
}

function PromptInput({
  value, onChange, onSubmit, isProcessing,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  isProcessing: boolean
}) {
  return (
    <div
      className="flex gap-2 px-5 py-4 shrink-0"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="Add a couch and TV…"
        className="flex-1 bg-white/10 text-white rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:bg-white/15 transition-colors"
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim() || isProcessing}
        className="shrink-0 w-12 h-12 rounded-2xl bg-white flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
        aria-label="Submit"
      >
        {isProcessing ? (
          <Loader2 className="w-5 h-5 animate-spin text-black" />
        ) : (
          <Send className="w-5 h-5 text-black" />
        )}
      </button>
    </div>
  )
}
