import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

type RecordState = 'idle' | 'requesting' | 'previewing' | 'recording' | 'review' | 'error'

export default function Record() {
  const navigate = useNavigate()

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const [state, setState] = useState<RecordState>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
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
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      setCameraError(msg)
      setState('error')
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
    if (recordedBlob) navigate('/processing')
  }

  return (
    <div className="relative flex flex-col min-h-dvh bg-black overflow-hidden">
      <BackButton onPress={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); navigate('/') }} />

      <video ref={videoRef} playsInline className="absolute inset-0 w-full h-full object-cover" />

      {(state === 'idle' || state === 'requesting') && <StartingOverlay state={state} />}
      {state === 'error' && <ErrorOverlay message={cameraError} onRetry={() => { setCameraError(null); startCamera() }} />}
      {state === 'recording' && <RecordingTimer elapsed={elapsed} />}

      <div className="absolute bottom-0 inset-x-0 z-20">
        {(state === 'previewing' || state === 'recording') && (
          <RecordControls
            recording={state === 'recording'}
            onPress={state === 'previewing' ? startRecording : stopRecording}
          />
        )}
        {state === 'review' && (
          <ReviewControls onAnalyse={analyse} onRetake={retake} />
        )}
      </div>
    </div>
  )
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className="absolute top-8 left-8 z-20 p-2 rounded-xl bg-white w-14 h-14 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
      aria-label="Back"
    >
      <ArrowLeft />
    </button>
  )
}

function StartingOverlay({ state }: { state: 'idle' | 'requesting' }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
      <p className="text-white/60 text-sm">
        {state === 'requesting' ? 'Starting camera…' : 'Initialising…'}
      </p>
    </div>
  )
}

function ErrorOverlay({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 z-10 px-8">
      <p className="text-white font-medium text-center">Camera unavailable</p>
      <p className="text-white/50 text-xs text-center font-mono break-all">{message}</p>
      <button
        onClick={onRetry}
        className="mt-2 px-5 py-2.5 bg-white text-black text-sm font-medium rounded-full"
      >
        Try again
      </button>
    </div>
  )
}

function RecordingTimer({ elapsed }: { elapsed: number }) {
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  return (
    <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5">
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <span className="text-white text-sm font-mono">{mm}:{ss}</span>
    </div>
  )
}

function RecordControls({ recording, onPress }: { recording: boolean; onPress: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 pb-10">
      {!recording && <p className="text-white/60 text-sm">Move around your space slowly</p>}
      <button
        onClick={onPress}
        className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all active:scale-95 ${
          recording ? 'border-white bg-red-500' : 'border-white bg-transparent'
        }`}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
      >
        {recording
          ? <span className="w-6 h-6 rounded-sm bg-white" />
          : <span className="w-12 h-12 rounded-full bg-white" />}
      </button>
    </div>
  )
}

function ReviewControls({ onAnalyse, onRetake }: { onAnalyse: () => void; onRetake: () => void }) {
  return (
    <div className="flex flex-col gap-3 px-6 pb-10 pt-4 bg-gradient-to-t from-black/90 to-transparent">
      <p className="text-white/60 text-sm text-center mb-1">Review your recording</p>
      <button
        onClick={onAnalyse}
        className="w-full font-medium text-base rounded-xl py-4 transition-colors bg-white text-black"
      >
        Analyse this &rarr;
      </button>
      <button
        onClick={onRetake}
        className="w-full bg-white/10 hover:bg-white/20 text-white font-medium text-base rounded-xl py-3 transition-colors"
      >
        Retake
      </button>
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
