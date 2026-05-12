import { useEffect, useRef } from 'react'
import type { FrameEdit, RoomData } from '@/hooks/useScans'
import { ASSUMED_PAN_RAD, FRAME_INTERVAL_S } from '@/config'

// The viewer is now a pure 2D scrubbable video: horizontal drag advances
// `video.currentTime` across the recording, mirroring the previous Three.js
// camera-yaw mapping for muscle-memory consistency. On top of the video sits
// an <img> layer that swaps in Gemini-edited frames when the current time is
// near their source frame's timestamp — that's how user prompts appear in the
// scene.

interface Props {
  roomData: RoomData
  videoUrl?: string | null
  frameCount?: number
}

interface EditEntry {
  edit: FrameEdit
  img: HTMLImageElement
}

export function RoomScene({ roomData, videoUrl }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const edits = roomData.edits ?? []

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // Clear any prior children (StrictMode double-mount, edit-list change).
    while (mount.firstChild) mount.removeChild(mount.firstChild)

    if (!videoUrl) {
      const empty = document.createElement('div')
      empty.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);font-size:14px;background:#000'
      empty.textContent = 'No recording available'
      mount.appendChild(empty)
      return
    }

    const video = document.createElement('video')
    video.src = videoUrl
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    Object.assign(video.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      objectFit: 'cover', backgroundColor: '#000',
    } as Partial<CSSStyleDeclaration>)
    mount.appendChild(video)

    // Edit overlay layer — one <img> per saved edit, stacked above the video.
    // Only the one nearest to the current playhead is shown.
    const editLayer = document.createElement('div')
    Object.assign(editLayer.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>)
    mount.appendChild(editLayer)

    const editEntries: EditEntry[] = edits.map((edit) => {
      const img = document.createElement('img')
      img.src = edit.imageUrl
      img.alt = ''
      Object.assign(img.style, {
        position: 'absolute', inset: '0', width: '100%', height: '100%',
        objectFit: 'cover', opacity: '0', transition: 'opacity 120ms linear',
      } as Partial<CSSStyleDeclaration>)
      editLayer.appendChild(img)
      return { edit, img }
    })

    // Drag-scrub: full-width horizontal drag spans the whole recording. We
    // keep `ASSUMED_PAN_RAD` in the import only for parity with the old yaw
    // mapping (so muscle memory matches) — the actual scrub uses video time.
    void ASSUMED_PAN_RAD

    const updateOverlay = () => {
      if (editEntries.length === 0) return
      const t = video.currentTime
      let bestIdx = -1
      let bestDist = Infinity
      for (let i = 0; i < editEntries.length; i++) {
        const sourceT = editEntries[i].edit.frameIndex * FRAME_INTERVAL_S
        const dist = Math.abs(t - sourceT)
        if (dist < bestDist) { bestDist = dist; bestIdx = i }
      }
      // Show the closest edit if it's within half a frame interval of the
      // playhead; otherwise hide everything so the raw video shows through.
      const SHOW_WINDOW = FRAME_INTERVAL_S
      for (let i = 0; i < editEntries.length; i++) {
        editEntries[i].img.style.opacity = (i === bestIdx && bestDist < SHOW_WINDOW) ? '1' : '0'
      }
    }

    video.addEventListener('loadedmetadata', () => {
      video.pause()
      video.currentTime = 0
      updateOverlay()
    })
    video.addEventListener('seeked', updateOverlay)
    video.addEventListener('timeupdate', updateOverlay)

    mount.style.touchAction = 'none'
    mount.style.cursor = 'grab'

    let dragStart: { x: number; t: number } | null = null

    const onPointerDown = (e: PointerEvent) => {
      mount.setPointerCapture(e.pointerId)
      dragStart = { x: e.clientX, t: video.currentTime || 0 }
      mount.style.cursor = 'grabbing'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragStart) return
      if (!isFinite(video.duration) || video.duration <= 0) return
      const dx = e.clientX - dragStart.x
      const tDelta = (-dx / mount.clientWidth) * video.duration
      const next = Math.max(0, Math.min(video.duration, dragStart.t + tDelta))
      video.currentTime = next
    }
    const onPointerUp = () => {
      dragStart = null
      mount.style.cursor = 'grab'
    }

    mount.addEventListener('pointerdown', onPointerDown)
    mount.addEventListener('pointermove', onPointerMove)
    mount.addEventListener('pointerup', onPointerUp)
    mount.addEventListener('pointercancel', onPointerUp)

    return () => {
      mount.removeEventListener('pointerdown', onPointerDown)
      mount.removeEventListener('pointermove', onPointerMove)
      mount.removeEventListener('pointerup', onPointerUp)
      mount.removeEventListener('pointercancel', onPointerUp)
      video.pause()
      video.removeAttribute('src')
      video.load()
      while (mount.firstChild) mount.removeChild(mount.firstChild)
    }
  }, [videoUrl, edits])

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
}
