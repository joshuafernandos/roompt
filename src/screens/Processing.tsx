import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useScans } from '@/hooks/useScans'
import { extractFrames } from '@/utils/extractFrames'
import { FRAME_INTERVAL_S, FRAME_MAX_COUNT } from '@/config'
import { CheckCheck, AlertCircle } from 'lucide-react'

const STEPS = ['Extracting frames', 'Analysing space', 'Mapping features', 'Building model']

export default function Processing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { addScan } = useScans()
  const [step, setStep] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const blob: Blob | undefined = location.state?.blob

    async function run() {
      try {
        // Step 0: Extract frames
        setStep(0)
        const frames = blob ? await extractFrames(blob, FRAME_INTERVAL_S, FRAME_MAX_COUNT) : []

        // Step 1: Analyse space via Claude vision
        setStep(1)
        const analyseRes = await fetch('/api/analyse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frames }),
        })
        if (!analyseRes.ok) {
          const err = await analyseRes.json().catch(() => ({}))
          throw new Error(err.error ?? `Analysis failed (${analyseRes.status})`)
        }
        const roomData = await analyseRes.json()

        // Step 2: Mapping features (brief visual pause)
        setStep(2)
        await new Promise((r) => setTimeout(r, 500))

        // Step 3: Save and navigate
        setStep(3)
        const scanId = await addScan(roomData, frames)

        // Persist the raw recording so the Scan view can play it back as the
        // backdrop (much better than stitched frames). Best-effort: a failed
        // upload still leaves the scan usable via the procedural fallback.
        if (blob) {
          try {
            await fetch(`/api/scans/${scanId}/video`, {
              method: 'POST',
              headers: { 'Content-Type': blob.type || 'video/webm' },
              body: blob,
            })
          } catch { /* keep going, video is optional */ }
        }

        await new Promise((r) => setTimeout(r, 300))
        navigate(`/scan/${scanId}`, { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    }

    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex flex-col min-h-dvh text-white px-6 items-center justify-center gap-6">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <div className="text-center">
          <p className="font-semibold mb-2">Analysis failed</p>
          <p className="text-white/50 text-sm">{error}</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-white text-black rounded-xl font-medium"
        >
          Go home
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh text-white px-6 items-center justify-center">
      <div className="w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-8 text-center">Analysing space</h2>
        <div className="flex flex-col gap-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-4">
              <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                {i < step && <CheckCheck className="w-3 h-3 text-white" />}
              </div>
              <span
                className={`text-sm transition-colors ${
                  i < step
                    ? 'text-white'
                    : i === step
                      ? 'text-white animate-pulse'
                      : 'text-slate-500'
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
