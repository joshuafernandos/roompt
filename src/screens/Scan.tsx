import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { RoomScene } from '@/components/RoomScene'
import { useScan } from '@/hooks/useScan'

export default function Scan() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { scan, applyEdit, isLoading } = useScan(id!)
  const [prompt, setPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!prompt.trim() || isProcessing || !scan) return
    setIsProcessing(true)
    setError(null)
    const userPrompt = prompt
    setPrompt('')
    try {
      const edit = await applyEdit(userPrompt)
      setPlan(edit.plan)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply edit')
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
        placeholder="Change my door, add flowers…"
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
