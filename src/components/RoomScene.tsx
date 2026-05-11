import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { RoomData, RoomObject } from '@/hooks/useScans'
import { buildFurniture } from '@/utils/furniture'
import {
  DEFAULT_ROOM_WIDTH, DEFAULT_ROOM_LENGTH, DEFAULT_ROOM_HEIGHT,
  CAM_FOV, CAM_NEAR, CAM_FAR, CAM_DAMPING, CAM_PIXEL_RATIO_CAP,
  ASSUMED_PAN_RAD,
} from '@/config'

function buildScene(
  el: HTMLDivElement,
  roomData: RoomData,
  videoUrl: string | null,
): () => void {
  const rw = roomData.estimatedWidth || DEFAULT_ROOM_WIDTH
  const rl = roomData.estimatedLength || DEFAULT_ROOM_LENGTH
  const rh = roomData.estimatedHeight || DEFAULT_ROOM_HEIGHT

  const useVideo = !!videoUrl

  // Optional video backdrop: plays underneath a transparent WebGL canvas.
  // Drag scrubs through the recording (rather than spinning a stitched
  // sphere), so every frame the user sees is pristine, full-resolution
  // footage with no stitching artifacts.
  let videoEl: HTMLVideoElement | null = null
  if (useVideo) {
    videoEl = document.createElement('video')
    videoEl.src = videoUrl!
    videoEl.muted = true
    videoEl.playsInline = true
    videoEl.preload = 'auto'
    videoEl.crossOrigin = 'anonymous'
    Object.assign(videoEl.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      objectFit: 'cover', zIndex: '0', backgroundColor: '#000',
    } as Partial<CSSStyleDeclaration>)
    el.appendChild(videoEl)
    videoEl.addEventListener('loadedmetadata', () => {
      videoEl!.pause()
      videoEl!.currentTime = 0
    })
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: useVideo })
  renderer.domElement.style.display = 'block'
  if (useVideo) {
    Object.assign(renderer.domElement.style, {
      position: 'absolute', inset: '0', zIndex: '1',
    } as Partial<CSSStyleDeclaration>)
    renderer.setClearColor(0x000000, 0)
  }
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
  let videoUpdate: (() => void) | null = null
  let videoCleanup: (() => void) | null = null

  if (useVideo) {
    // ── First-person camera; furniture sits at its world coords in metres ──
    camera.position.set(0, 1.5, 0)
    camera.lookAt(0, 1.5, -1)

    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const sun = new THREE.DirectionalLight(0xffffff, 0.9)
    sun.position.set(rw * 0.6, rh * 2.2, rl * 0.4)
    scene.add(sun)

    for (const obj of roomData.objects ?? []) placeFurniture(scene, obj, 1)

    const MAX_PITCH = Math.PI / 4
    let yaw = 0, pitch = 0
    let targetYaw = 0, targetPitch = 0

    const dom = renderer.domElement
    dom.style.touchAction = 'none'
    dom.style.cursor = 'grab'

    let dragStart: { x: number; y: number; yaw: number; pitch: number; t: number } | null = null

    const seek = (t: number) => {
      if (!videoEl || !isFinite(videoEl.duration) || videoEl.duration <= 0) return
      videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, t))
    }

    const onPointerDown = (e: PointerEvent) => {
      dom.setPointerCapture(e.pointerId)
      dragStart = {
        x: e.clientX, y: e.clientY,
        yaw: targetYaw, pitch: targetPitch,
        t: videoEl?.currentTime ?? 0,
      }
      dom.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragStart) return
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      // Map a full-width horizontal drag to the assumed pan span. Camera yaw
      // and video currentTime advance in lockstep so the room footage and the
      // 3D furniture both "rotate" together as the user drags.
      const yawDelta = (-dx / dom.clientWidth) * ASSUMED_PAN_RAD
      targetYaw = dragStart.yaw + yawDelta
      const pitchSens = ((camera.fov * Math.PI) / 180) / dom.clientHeight
      targetPitch = THREE.MathUtils.clamp(dragStart.pitch + dy * pitchSens, -MAX_PITCH, MAX_PITCH)

      if (videoEl && isFinite(videoEl.duration) && videoEl.duration > 0) {
        // Drag right ⇒ look left ⇒ scrub back (negative). Sign matches yawDelta.
        const tDelta = (-dx / dom.clientWidth) * videoEl.duration
        seek(dragStart.t + tDelta)
      }
    }

    const onPointerUp = () => {
      dragStart = null
      dom.style.cursor = 'grab'
    }

    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('pointercancel', onPointerUp)

    videoUpdate = () => {
      yaw += (targetYaw - yaw) * 0.18
      pitch += (targetPitch - pitch) * 0.18
      const cy = Math.cos(pitch)
      const ex = camera.position.x + Math.sin(yaw) * cy
      const ey = camera.position.y + Math.sin(pitch)
      const ez = camera.position.z - Math.cos(yaw) * cy
      camera.lookAt(ex, ey, ez)
    }

    videoCleanup = () => {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointercancel', onPointerUp)
      if (videoEl) {
        videoEl.pause()
        videoEl.removeAttribute('src')
        videoEl.load()
        if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl)
      }
    }
  } else {
    // ── Fallback: outside-in 3D box view (no video recorded) ─────────────
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
  videoUpdate?.()

  let rafId: number
  const tick = () => {
    rafId = requestAnimationFrame(tick)
    orbit?.update()
    videoUpdate?.()
    renderer.render(scene, camera)
  }
  tick()

  const ro = new ResizeObserver(() => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    camera.aspect = r.width / r.height
    camera.updateProjectionMatrix()
    renderer.setSize(r.width, r.height)
  })
  ro.observe(el)

  return () => {
    cancelAnimationFrame(rafId)
    ro.disconnect()
    orbit?.dispose()
    videoCleanup?.()
    renderer.dispose()
    if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
  }
}

const gltfLoader = new GLTFLoader()
const gltfCache = new Map<string, Promise<THREE.Object3D>>()

function loadGltf(url: string): Promise<THREE.Object3D> {
  const cached = gltfCache.get(url)
  if (cached) return cached.then((o) => o.clone(true))
  const p = new Promise<THREE.Object3D>((resolve, reject) => {
    gltfLoader.load(url, (g) => resolve(g.scene), undefined, reject)
  })
  gltfCache.set(url, p)
  return p.then((o) => o.clone(true))
}

function isWallMounted(type: string): boolean {
  const t = (type || '').toLowerCase()
  return t.includes('door') || t.includes('window')
}

function fitObjectToDims(
  obj3d: THREE.Object3D,
  width: number, height: number, depth: number,
  wallMounted: boolean,
) {
  const box = new THREE.Box3().setFromObject(obj3d)
  const size = new THREE.Vector3()
  box.getSize(size)
  if (size.x < 1e-4 || size.y < 1e-4 || size.z < 1e-4) return
  const center = new THREE.Vector3()
  box.getCenter(center)
  obj3d.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))
  if (wallMounted) {
    // Doors/windows are spec'd at a near-zero depth so they sit flat against
    // the wall. Non-uniform-scaling a Meshy GLB to that depth squashes the
    // frame and handle into a wafer. Scale uniformly by height instead so
    // proportions stay correct; width/depth come out naturally.
    obj3d.scale.setScalar(height / size.y)
  } else {
    obj3d.scale.set(width / size.x, height / size.y, depth / size.z)
  }
}

function placeFurniture(scene: THREE.Scene, obj: RoomObject, scale: number) {
  const apply = (node: THREE.Object3D) => {
    const group = new THREE.Group()
    group.add(node)
    group.position.set(obj.x * scale, 0, obj.z * scale)
    group.rotation.y = (obj.rotation * Math.PI) / 180
    group.scale.setScalar(scale)
    group.traverse((c) => {
      const mesh = c as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    scene.add(group)
    return group
  }

  if (obj.modelUrl) {
    const placeholder = new THREE.Group()
    const group = apply(placeholder)
    const wallMounted = isWallMounted(obj.type)
    loadGltf(obj.modelUrl)
      .then((model) => {
        fitObjectToDims(model, obj.width, obj.height, obj.depth, wallMounted)
        group.remove(placeholder)
        group.add(model)
        group.traverse((c) => {
          const mesh = c as THREE.Mesh
          if (mesh.isMesh) {
            mesh.castShadow = true
            mesh.receiveShadow = true
          }
        })
      })
      .catch(() => {
        group.remove(placeholder)
        group.add(buildFurniture(obj))
      })
    return
  }

  apply(buildFurniture(obj))
}

interface Props {
  roomData: RoomData
  videoUrl?: string | null
}

export function RoomScene({ roomData, videoUrl }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mountRef.current) return
    const el = mountRef.current
    let cleanup: (() => void) | null = null
    try { cleanup = buildScene(el, roomData, videoUrl ?? null) } catch { /* WebGL unavailable */ }
    return () => { cleanup?.() }
  }, [roomData, videoUrl])

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
}
