import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { RoomData, RoomObject } from '@/hooks/useScans'
import { buildFurniture } from '@/utils/furniture'
import {
  DEFAULT_ROOM_WIDTH, DEFAULT_ROOM_LENGTH, DEFAULT_ROOM_HEIGHT,
  PANO_SPHERE_RADIUS, PANO_SPHERE_SEGMENTS, PANO_FURNITURE_SCALE, PANO_EQUIRECT_WIDTH, PANO_FRAME_HFOV_DEG,
  CAM_FOV, CAM_NEAR, CAM_FAR, CAM_DAMPING, CAM_PIXEL_RATIO_CAP,
} from '@/config'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.replace('#', ''), 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

function rgba({ r, g, b }: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${r},${g},${b},${a})`
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

function floorColorFromType(floorType: string): string {
  const t = floorType.toLowerCase()
  if (t.includes('wood') || t.includes('hardwood') || t.includes('laminate')) return '#8b6914'
  if (t.includes('tile') || t.includes('ceramic') || t.includes('marble')) return '#b0b0b0'
  if (t.includes('carpet') || t.includes('rug')) return '#6b4f3a'
  if (t.includes('concrete') || t.includes('cement')) return '#909090'
  if (t.includes('vinyl') || t.includes('lino')) return '#a08060'
  return '#9a8060'
}

interface PanoResult {
  tex: THREE.CanvasTexture
  spanRad: number  // horizontal angular extent of captured content
}

async function buildPanoTexture(
  frames: string[],
  roomData: RoomData,
): Promise<PanoResult | null> {
  if (!frames.length) return null

  const srcs = frames.map((f) => (f.startsWith('data:') ? f : `data:image/jpeg;base64,${f}`))
  const loaded = await Promise.all(srcs.map(loadImage))
  const images = loaded.filter((img): img is HTMLImageElement => img !== null)
  if (!images.length) return null

  const fw = images[0].naturalWidth
  const fh = images[0].naturalHeight
  const n = images.length

  // Each frame overlaps the next by BLEND pixels for cross-dissolve
  const BLEND = n > 1 ? Math.round(fw * 0.18) : 0
  const step = fw - BLEND
  const totalW = step * n + BLEND  // = fw*n - BLEND*(n-1)

  const canvas = document.createElement('canvas')
  canvas.width = totalW
  canvas.height = fh
  const ctx = canvas.getContext('2d')!

  const rawWall = roomData.wallColor || '#d0c4b0'
  const wallLum = parseInt(rawWall.slice(1), 16)
  const wallColor = wallLum < 0x303030 ? '#c8bfb0' : rawWall
  ctx.fillStyle = wallColor
  ctx.fillRect(0, 0, totalW, fh)

  const brighten = 'brightness(1.5) contrast(1.05)'

  // Frame 0: draw fully. Frames 1..n-1: draw skipping the left BLEND zone
  // (that zone is handled by the cross-dissolve patch below).
  ctx.filter = brighten
  ctx.drawImage(images[0], 0, 0, fw, fh)
  for (let i = 1; i < n; i++) {
    const x = i * step
    ctx.drawImage(
      images[i],
      BLEND, 0, fw - BLEND, fh,
      x + BLEND, 0, fw - BLEND, fh,
    )
  }
  ctx.filter = 'none'

  // Cross-dissolve patch at each seam: frame[i-1] fading out → frame[i] fading in.
  // The patch covers the overlap zone [i*step, i*step + BLEND].
  // Bottom: frame[i-1]'s rightmost BLEND pixels (already on canvas at full opacity).
  // Top: frame[i]'s leftmost BLEND pixels drawn with a 0→1 alpha gradient.
  for (let i = 1; i < n; i++) {
    const tmp = document.createElement('canvas')
    tmp.width = BLEND
    tmp.height = fh
    const tc = tmp.getContext('2d')!

    tc.filter = brighten
    tc.drawImage(images[i], 0, 0, BLEND, fh, 0, 0, BLEND, fh)
    tc.filter = 'none'
    tc.globalCompositeOperation = 'destination-in'
    const grad = tc.createLinearGradient(0, 0, BLEND, 0)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,1)')
    tc.fillStyle = grad
    tc.fillRect(0, 0, BLEND, fh)

    ctx.drawImage(tmp, i * step, 0)
  }

  // ── Project the stitched strip onto an equirectangular (2:1) canvas ────────
  // Horizontal span: the user almost never records a full 360°. Estimate the
  // captured angular extent from per-frame camera FOV + overlap, then place
  // the strip at its true angular position. This avoids stretching a partial
  // recording across the whole sphere.
  const overlapFrac = n > 1 ? BLEND / fw : 0
  const rawSpanDeg = n * PANO_FRAME_HFOV_DEG - (n - 1) * PANO_FRAME_HFOV_DEG * overlapFrac
  const spanDeg = Math.min(360, Math.max(20, rawSpanDeg))

  const W = PANO_EQUIRECT_WIDTH
  const H = W / 2
  const equirect = document.createElement('canvas')
  equirect.width = W
  equirect.height = H
  const ec = equirect.getContext('2d')!

  // Vertical FOV derived from source aspect, so 1px-vertical == 1px-horizontal
  // in angular terms — preserves the video's true aspect ratio.
  const vfovDeg = Math.min(170, (fh * spanDeg) / totalW)
  const bandH = Math.round((vfovDeg / 180) * H)
  const bandY = Math.round((H - bandH) / 2)
  const bandW = Math.round((spanDeg / 360) * W)
  const bandX = Math.round((W - bandW) / 2)

  // Assumed ceiling + floor for the un-captured top/bottom of the room
  const ceilHex = '#e8e4da'
  const ceilRgb = hexToRgb(ceilHex)
  const floorHex = floorColorFromType(roomData.floorType || '')
  const floorRgb = hexToRgb(floorHex)

  ec.fillStyle = ceilHex
  ec.fillRect(0, 0, W, H / 2)
  ec.fillStyle = floorHex
  ec.fillRect(0, H / 2, W, H / 2)

  ec.drawImage(canvas, 0, 0, totalW, fh, bandX, bandY, bandW, bandH)

  // Soft fade between captured band and assumed ceiling/floor (top/bottom)
  const fadeV = Math.max(24, Math.round(bandH * 0.08))
  const topGrad = ec.createLinearGradient(0, bandY, 0, bandY + fadeV)
  topGrad.addColorStop(0, rgba(ceilRgb, 1))
  topGrad.addColorStop(1, rgba(ceilRgb, 0))
  ec.fillStyle = topGrad
  ec.fillRect(bandX, bandY, bandW, fadeV)
  const botGrad = ec.createLinearGradient(0, bandY + bandH - fadeV, 0, bandY + bandH)
  botGrad.addColorStop(0, rgba(floorRgb, 0))
  botGrad.addColorStop(1, rgba(floorRgb, 1))
  ec.fillStyle = botGrad
  ec.fillRect(bandX, bandY + bandH - fadeV, bandW, fadeV)

  const tex = new THREE.CanvasTexture(equirect)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return { tex, spanRad: (spanDeg * Math.PI) / 180 }
}

function buildScene(
  el: HTMLDivElement,
  roomData: RoomData,
  pano: PanoResult | null,
): () => void {
  const rw = roomData.estimatedWidth || DEFAULT_ROOM_WIDTH
  const rl = roomData.estimatedLength || DEFAULT_ROOM_LENGTH
  const rh = roomData.estimatedHeight || DEFAULT_ROOM_HEIGHT

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.domElement.style.display = 'block'
  const rect = el.getBoundingClientRect()
  const sw = el.clientWidth || rect.width || 300
  const sh = el.clientHeight || rect.height || 300
  renderer.setSize(sw, sh)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CAM_PIXEL_RATIO_CAP))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  el.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(CAM_FOV, sw / sh, CAM_NEAR, CAM_FAR)

  let orbit: OrbitControls | null = null
  let panoUpdate: (() => void) | null = null
  let panoCleanup: (() => void) | null = null

  if (pano) {
    // ── True 360° equirectangular sphere with Street View-style controls ──
    scene.background = new THREE.Color(0x000000)
    camera.position.set(0, 0, 0)

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(PANO_SPHERE_RADIUS, PANO_SPHERE_SEGMENTS, PANO_SPHERE_SEGMENTS / 2),
      new THREE.MeshBasicMaterial({ map: pano.tex, side: THREE.BackSide }),
    )
    // BackSide on a sphere mirrors UVs horizontally when seen from inside;
    // flip the texture to compensate so the panorama reads left→right correctly.
    pano.tex.wrapS = THREE.ClampToEdgeWrapping
    pano.tex.repeat.x = -1
    pano.tex.offset.x = 1
    pano.tex.needsUpdate = true
    // Center of the captured strip sits at U=0.5 on the texture. With the
    // BackSide+repeat-flip mapping, that lands at +Z. Rotate so it faces -Z
    // (the camera's forward at yaw=0).
    sphere.rotation.y = Math.PI
    scene.add(sphere)

    const scale = (PANO_SPHERE_RADIUS * PANO_FURNITURE_SCALE) / (Math.max(rw, rl) / 2)
    for (const obj of roomData.objects ?? []) {
      placeFurniture(scene, obj, scale)
    }

    const MIN_FOV = 30
    const MAX_FOV = 90
    const MAX_PITCH = Math.PI / 2 - 0.02
    // Yaw clamp: only let the user pan within the captured horizontal range.
    // If the recording covers full 360° we leave it unclamped (free-spin).
    const isFull = pano.spanRad >= Math.PI * 2 - 0.01
    const halfSpan = pano.spanRad / 2
    const yawMargin = Math.min(0.08, halfSpan * 0.05)
    const minYaw = isFull ? -Infinity : -halfSpan + yawMargin
    const maxYaw = isFull ? Infinity : halfSpan - yawMargin
    let yaw = 0, pitch = 0
    let targetYaw = 0, targetPitch = 0

    const dom = renderer.domElement
    dom.style.touchAction = 'none'
    dom.style.cursor = 'grab'

    const pointers = new Map<number, { x: number; y: number }>()
    let dragStart: { x: number; y: number; yaw: number; pitch: number } | null = null
    let pinchStart: { dist: number; fov: number } | null = null

    const onPointerDown = (e: PointerEvent) => {
      dom.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) {
        dragStart = { x: e.clientX, y: e.clientY, yaw: targetYaw, pitch: targetPitch }
        dom.style.cursor = 'grabbing'
      } else if (pointers.size === 2) {
        const pts = Array.from(pointers.values())
        pinchStart = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), fov: camera.fov }
        dragStart = null
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2 && pinchStart) {
        const pts = Array.from(pointers.values())
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
        camera.fov = THREE.MathUtils.clamp(pinchStart.fov * (pinchStart.dist / dist), MIN_FOV, MAX_FOV)
        camera.updateProjectionMatrix()
      } else if (pointers.size === 1 && dragStart) {
        const dx = e.clientX - dragStart.x
        const dy = e.clientY - dragStart.y
        const sens = ((camera.fov * Math.PI) / 180) / dom.clientHeight
        targetYaw = THREE.MathUtils.clamp(dragStart.yaw + dx * sens, minYaw, maxYaw)
        targetPitch = THREE.MathUtils.clamp(dragStart.pitch + dy * sens, -MAX_PITCH, MAX_PITCH)
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchStart = null
      if (pointers.size === 0) {
        dragStart = null
        dom.style.cursor = 'grab'
      } else if (pointers.size === 1) {
        const p = Array.from(pointers.values())[0]
        dragStart = { x: p.x, y: p.y, yaw: targetYaw, pitch: targetPitch }
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camera.fov = THREE.MathUtils.clamp(camera.fov * (1 + e.deltaY * 0.0015), MIN_FOV, MAX_FOV)
      camera.updateProjectionMatrix()
    }

    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('pointercancel', onPointerUp)
    dom.addEventListener('wheel', onWheel, { passive: false })

    panoUpdate = () => {
      yaw += (targetYaw - yaw) * 0.18
      pitch += (targetPitch - pitch) * 0.18
      const cy = Math.cos(pitch)
      camera.lookAt(Math.sin(yaw) * cy, Math.sin(pitch), -Math.cos(yaw) * cy)
    }

    panoCleanup = () => {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointercancel', onPointerUp)
      dom.removeEventListener('wheel', onWheel)
    }
  } else {
    // ── fallback: outside-in 3D box view ─────────────────────────────────
    scene.background = new THREE.Color(0x0d0d0d)
    scene.fog = new THREE.Fog(0x0d0d0d, Math.max(rw, rl) * 3, Math.max(rw, rl) * 6)

    const dist = Math.max(rw, rl) * 1.4
    camera.position.set(dist, rh * 1.7, dist)
    orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = CAM_DAMPING
    orbit.target.set(0, rh / 4, 0)
    orbit.maxPolarAngle = Math.PI * 0.52
    orbit.minDistance = 1.5
    orbit.maxDistance = dist * 3
    orbit.enableZoom = true

    scene.add(new THREE.AmbientLight(0xfff8f0, 0.5))
    const sun = new THREE.DirectionalLight(0xfffbe8, 1.4)
    sun.position.set(rw * 0.8, rh * 2.5, rl * 0.6)
    sun.castShadow = true
    scene.add(sun)

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2ede4, roughness: 0.88 })
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x9a7040, roughness: 0.65 })
    const WALL_T = 0.12

    const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(rw, rl), floorMat)
    floorPlane.rotation.x = -Math.PI / 2
    floorPlane.receiveShadow = true
    scene.add(floorPlane)

    const addWall = (bw: number, bh: number, bd: number, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wallMat)
      m.position.set(px, py, pz)
      m.castShadow = m.receiveShadow = true
      scene.add(m)
    }
    addWall(rw, rh, WALL_T, 0, rh / 2, -(rl / 2))
    addWall(rw, rh, WALL_T, 0, rh / 2, rl / 2)
    addWall(WALL_T, rh, rl, rw / 2, rh / 2, 0)
    addWall(WALL_T, rh, rl, -rw / 2, rh / 2, 0)

    for (const obj of roomData.objects ?? []) placeFurniture(scene, obj, 1)
  }

  orbit?.update()
  panoUpdate?.()

  let rafId: number
  const tick = () => {
    rafId = requestAnimationFrame(tick)
    orbit?.update()
    panoUpdate?.()
    renderer.render(scene, camera)
  }
  tick()

  const ro = new ResizeObserver(() => {
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
    renderer.setSize(rect.width, rect.height)
  })
  ro.observe(el)

  return () => {
    cancelAnimationFrame(rafId)
    ro.disconnect()
    orbit?.dispose()
    panoCleanup?.()
    renderer.dispose()
    if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
  }
}

function placeFurniture(scene: THREE.Scene, obj: RoomObject, scale: number) {
  const node = buildFurniture(obj)
  node.position.set(obj.x * scale, 0, obj.z * scale)
  node.rotation.y = (obj.rotation * Math.PI) / 180
  node.scale.setScalar(scale)
  node.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  scene.add(node)
}

interface Props {
  roomData: RoomData
  frames?: string[]
}

export function RoomScene({ roomData, frames }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mountRef.current) return
    const el = mountRef.current
    let cleanup: (() => void) | null = null
    let cancelled = false

    async function init() {
      let pano: PanoResult | null = null
      try {
        pano = frames?.length ? await buildPanoTexture(frames, roomData) : null
      } catch {
        pano = null
      }
      if (cancelled) {
        pano?.tex.dispose()
        return
      }
      try {
        cleanup = buildScene(el, roomData, pano)
      } catch {
        // fallback: retry without pano texture
        try { cleanup = buildScene(el, roomData, null) } catch { /* WebGL unavailable */ }
      }
    }

    init()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [roomData, frames])

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
}
