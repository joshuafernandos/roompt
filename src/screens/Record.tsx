import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

type RecordState = 'idle' | 'requesting' | 'previewing' | 'recording' | 'review'

export default function Record() {
  const navigate = useAppStore((s) => s.navigate)
  const setVideoBlob = useAppStore((s) => s.setVideoBlob)

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const [state, setState] = useState<RecordState>('idle')
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCamera = useCallback(async () => {
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        videoRef.current.play()
      }
      setState('previewing')
    } catch {
      setState('idle')
      alert('Camera access denied. Please allow camera access and try again.')
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startCamera])

  const startRecording = () => {
    if (!streamRef.current) return
    chunksRef.current = []
    const mr = new MediaRecorder(streamRef.current, { mimeType: getSupportedMimeType() })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: getSupportedMimeType() })
      setRecordedBlob(blob)
      if (videoRef.current) {
        videoRef.current.srcObject = null
        videoRef.current.src = URL.createObjectURL(blob)
        videoRef.current.muted = false
        videoRef.current.loop = true
        videoRef.current.play()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setState('review')
    }
    mediaRecorderRef.current = mr
    mr.start(250)
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    setState('recording')
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const retake = () => {
    setRecordedBlob(null)
    setElapsed(0)
    startCamera()
  }

  const analyse = () => {
    if (recordedBlob) {
      setVideoBlob(recordedBlob)
      navigate('processing')
    }
  }

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="relative flex flex-col min-h-screen bg-black overflow-hidden">
      {/* Back button */}
      <button
        onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); navigate('home') }}
        className="absolute top-4 left-4 z-20 p-2 rounded-full bg-black/40 backdrop-blur-sm text-white"
        aria-label="Back"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12 4L6 10L12 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Camera / video */}
      <video
        ref={videoRef}
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Idle / requesting overlay */}
      {(state === 'idle' || state === 'requesting') && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <p className="text-white/60 text-sm">
            {state === 'requesting' ? 'Starting camera…' : 'Camera unavailable'}
          </p>
        </div>
      )}

      {/* Recording timer */}
      {state === 'recording' && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-sm font-mono">{formatTime(elapsed)}</span>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-safe">
        {(state === 'previewing' || state === 'recording') && (
          <div className="flex flex-col items-center gap-4 pb-10">
            {state === 'previewing' && (
              <p className="text-white/60 text-sm">Move around your space slowly</p>
            )}
            <button
              onClick={state === 'previewing' ? startRecording : stopRecording}
              className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all active:scale-95 ${
                state === 'recording'
                  ? 'border-white bg-red-500'
                  : 'border-white bg-transparent'
              }`}
              aria-label={state === 'previewing' ? 'Start recording' : 'Stop recording'}
            >
              {state === 'recording' ? (
                <span className="w-6 h-6 rounded-sm bg-white" />
              ) : (
                <span className="w-12 h-12 rounded-full bg-white" />
              )}
            </button>
          </div>
        )}

        {state === 'review' && (
          <div className="flex flex-col gap-3 px-6 pb-10 pt-4 bg-gradient-to-t from-black/90 to-transparent">
            <p className="text-white/60 text-sm text-center mb-1">Review your recording</p>
            <button
              onClick={analyse}
              className="w-full bg-accent hover:bg-accent-hover active:bg-accent-active text-white font-medium text-base rounded-xl py-4 transition-colors"
            >
              Analyse this &rarr;
            </button>
            <button
              onClick={retake}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-medium text-base rounded-xl py-3 transition-colors"
            >
              Retake
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function getSupportedMimeType(): string {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}
