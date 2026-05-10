import * as THREE from 'three'
import type { RoomObject } from '@/hooks/useScans'

// ── Materials ─────────────────────────────────────────────────────────────────
function matStandard(color: string, opts: { roughness?: number; metalness?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0,
  })
}

function darken(hex: string, amount: number): THREE.Color {
  return new THREE.Color(hex).lerp(new THREE.Color(0x000000), amount)
}

function lighten(hex: string, amount: number): THREE.Color {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), amount)
}

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ── Builders ──────────────────────────────────────────────────────────────────
// Convention for every builder: footprint centred at origin in X/Z, bottom at Y=0.
// Dimensions in metres. Caller applies position, rotation, and scale.

function buildDoor(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width
  const h = obj.height
  const d = Math.max(0.05, obj.depth)
  const panelColor = obj.color || '#e8e2d4'
  const frameColor = '#3a2a18'

  const frameThk = 0.06
  const frameDepth = d * 1.6
  const frameMat = matStandard(frameColor, { roughness: 0.6 })

  // Top + side jambs
  g.add(box(w + 2 * frameThk, frameThk, frameDepth, frameMat).translateY(h - frameThk / 2))
  g.add(box(frameThk, h, frameDepth, frameMat).translateX(-(w / 2 + frameThk / 2)).translateY(h / 2))
  g.add(box(frameThk, h, frameDepth, frameMat).translateX(w / 2 + frameThk / 2).translateY(h / 2))

  // Door panel
  const panelMat = matStandard(panelColor, { roughness: 0.55 })
  const panel = box(w * 0.97, h - frameThk, d, panelMat)
  panel.position.y = (h - frameThk) / 2
  g.add(panel)

  // Inset rectangle on the panel face (gives it dimension)
  const insetMat = new THREE.MeshStandardMaterial({
    color: darken(panelColor, 0.1),
    roughness: 0.6,
  })
  const inset = box(w * 0.78, h * 0.78, 0.005, insetMat)
  inset.position.set(0, h * 0.46, d / 2 + 0.003)
  g.add(inset)

  // Handle (lever-style)
  const handleMat = matStandard('#b8b0a0', { roughness: 0.35, metalness: 0.7 })
  const handlePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 16), handleMat)
  handlePlate.rotation.x = Math.PI / 2
  handlePlate.position.set(w * 0.36, h * 0.45, d / 2 + 0.01)
  g.add(handlePlate)
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.025), handleMat)
  lever.position.set(w * 0.32, h * 0.45, d / 2 + 0.024)
  g.add(lever)

  return g
}

function buildWindow(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width
  const h = obj.height
  const d = Math.max(0.05, obj.depth)
  const frameMat = matStandard('#f2efe8', { roughness: 0.5 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#bcd3dc'),
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.55,
  })

  const frameThk = 0.06
  // Outer frame (4 pieces)
  g.add(box(w, frameThk, d, frameMat).translateY(frameThk / 2))
  g.add(box(w, frameThk, d, frameMat).translateY(h - frameThk / 2))
  g.add(box(frameThk, h, d, frameMat).translateX(-(w / 2 - frameThk / 2)).translateY(h / 2))
  g.add(box(frameThk, h, d, frameMat).translateX(w / 2 - frameThk / 2).translateY(h / 2))

  // Glass
  g.add(box(w - 2 * frameThk, h - 2 * frameThk, d * 0.3, glassMat).translateY(h / 2))

  // Cross mullions
  const mullionThk = 0.025
  g.add(box(w - 2 * frameThk, mullionThk, d * 0.5, frameMat).translateY(h / 2))
  g.add(box(mullionThk, h - 2 * frameThk, d * 0.5, frameMat).translateY(h / 2))

  return g
}

function buildSofa(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height, d = obj.depth
  const main = obj.color || '#5a4f44'
  const baseMat = matStandard(main, { roughness: 0.85 })
  const cushionMat = matStandard(lighten(main, 0.12).getHexString().padStart(6, '0').replace(/^/, '#'), { roughness: 0.85 })

  const baseH = h * 0.45
  // Base
  g.add(box(w, baseH, d, baseMat).translateY(baseH / 2))
  // Backrest (along the back, +Z is "front")
  const backH = h * 0.65
  g.add(box(w, backH, d * 0.22, baseMat).translateY(baseH + backH / 2).translateZ(-(d / 2 - (d * 0.22) / 2)))
  // Arms
  const armH = h * 0.6
  for (const sx of [-1, 1]) {
    g.add(
      box(w * 0.08, armH, d, baseMat)
        .translateY(armH / 2)
        .translateX(sx * (w / 2 - (w * 0.08) / 2)),
    )
  }
  // Seat cushions
  const cushionCount = w >= 1.9 ? 3 : w >= 1.4 ? 2 : 1
  const seatW = (w - w * 0.16) / cushionCount
  for (let i = 0; i < cushionCount; i++) {
    const x = -((w - w * 0.16) / 2) + seatW * (i + 0.5)
    g.add(
      box(seatW * 0.94, h * 0.18, d * 0.7, cushionMat)
        .translateY(baseH + h * 0.09)
        .translateX(x)
        .translateZ(d * 0.05),
    )
  }
  return g
}

function buildBed(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height, d = obj.depth
  const frameColor = obj.color || '#5b4233'
  const sheetColor = '#f3eee2'
  const pillowColor = '#fafafa'

  const frameH = h * 0.4
  g.add(box(w, frameH, d, matStandard(frameColor, { roughness: 0.7 })).translateY(frameH / 2))

  const mattressH = h * 0.45
  g.add(
    box(w * 0.96, mattressH, d * 0.96, matStandard(sheetColor, { roughness: 0.9 }))
      .translateY(frameH + mattressH / 2),
  )

  // Headboard at -Z
  const hbH = h * 1.4
  g.add(
    box(w, hbH, 0.06, matStandard(frameColor, { roughness: 0.7 }))
      .translateY(hbH / 2)
      .translateZ(-(d / 2 + 0.03)),
  )

  // Pillows
  const pillowCount = w >= 1.4 ? 2 : 1
  const pw = (w * 0.85) / pillowCount
  for (let i = 0; i < pillowCount; i++) {
    const x = -((w * 0.85) / 2) + pw * (i + 0.5)
    g.add(
      box(pw * 0.9, h * 0.12, d * 0.22, matStandard(pillowColor, { roughness: 0.95 }))
        .translateY(frameH + mattressH + h * 0.06)
        .translateX(x)
        .translateZ(-(d / 2 - d * 0.16)),
    )
  }
  return g
}

function buildTable(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height, d = obj.depth
  const color = obj.color || '#7a5a3a'
  const mat = matStandard(color, { roughness: 0.6 })

  const topThk = Math.min(0.05, h * 0.1)
  g.add(box(w, topThk, d, mat).translateY(h - topThk / 2))

  const legThk = 0.06
  const legH = h - topThk
  const xOff = w / 2 - legThk
  const zOff = d / 2 - legThk
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(legThk, legH, legThk, mat).translateY(legH / 2).translateX(sx * xOff).translateZ(sz * zOff))
    }
  }
  return g
}

function buildChair(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height, d = obj.depth
  const color = obj.color || '#6a513c'
  const mat = matStandard(color, { roughness: 0.7 })

  const seatY = h * 0.5
  const seatThk = h * 0.08
  g.add(box(w, seatThk, d, mat).translateY(seatY))

  const legThk = 0.04
  const legH = seatY - seatThk / 2
  const xOff = w / 2 - legThk
  const zOff = d / 2 - legThk
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(legThk, legH, legThk, mat).translateY(legH / 2).translateX(sx * xOff).translateZ(sz * zOff))
    }
  }
  // Backrest
  const backH = h * 0.45
  g.add(box(w, backH, 0.04, mat).translateY(seatY + backH / 2).translateZ(-(d / 2 - 0.02)))
  return g
}

function buildTV(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height, d = obj.depth
  const screenMat = matStandard('#0e0e10', { roughness: 0.3, metalness: 0.5 })
  const bezelMat = matStandard('#1a1a1c', { roughness: 0.5 })
  const standMat = matStandard('#2a2a2c', { roughness: 0.5 })

  const screenH = h * 0.85
  const bezelThk = 0.015
  // Bezel
  g.add(box(w, screenH, d * 0.4, bezelMat).translateY(h - screenH / 2))
  // Screen face
  g.add(
    box(w - bezelThk * 2, screenH - bezelThk * 2, d * 0.05, screenMat)
      .translateY(h - screenH / 2)
      .translateZ(d * 0.2 + 0.001),
  )
  // Stand
  g.add(box(w * 0.18, h * 0.06, d * 0.25, standMat).translateY(h * 0.06 / 2))
  g.add(box(w * 0.4, h * 0.012, d * 0.25, standMat).translateY(h * 0.006))
  return g
}

function buildLamp(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height
  const baseMat = matStandard('#3a3530', { roughness: 0.5, metalness: 0.4 })
  const shadeMat = matStandard(obj.color || '#f0e6cf', { roughness: 0.9 })

  const baseR = Math.min(w, obj.depth) / 2
  const base = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 0.9, baseR, h * 0.04, 24), baseMat)
  base.position.y = h * 0.02
  g.add(base)

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, h * 0.78, 12),
    baseMat,
  )
  pole.position.y = h * 0.04 + (h * 0.78) / 2
  g.add(pole)

  const shadeH = h * 0.18
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR * 0.95, baseR * 1.1, shadeH, 24, 1, true),
    shadeMat,
  )
  shade.position.y = h - shadeH / 2
  g.add(shade)
  return g
}

function buildPlant(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height, d = obj.depth
  const potMat = matStandard('#7a4f38', { roughness: 0.85 })
  const leafMat = matStandard('#3d6b3a', { roughness: 0.8 })

  const potH = h * 0.3
  const potR = Math.min(w, d) / 2
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR * 0.85, potR, potH, 18), potMat)
  pot.position.y = potH / 2
  g.add(pot)

  // Foliage: a few overlapping spheres
  const foliageR = potR * 1.4
  const foliageBase = potH + foliageR * 0.5
  for (let i = 0; i < 5; i++) {
    const r = foliageR * (0.6 + Math.random() * 0.5)
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), leafMat)
    s.position.set(
      (Math.random() - 0.5) * potR * 0.6,
      foliageBase + (Math.random() - 0.3) * (h - foliageBase) * 0.6,
      (Math.random() - 0.5) * potR * 0.6,
    )
    g.add(s)
  }
  return g
}

function buildRug(obj: RoomObject): THREE.Object3D {
  const w = obj.width, d = obj.depth
  const mat = matStandard(obj.color || '#7a4a3a', { roughness: 0.95 })
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.015, d), mat)
  m.position.y = 0.0075
  m.receiveShadow = true
  return m
}

function buildShelf(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height, d = obj.depth
  const color = obj.color || '#4a3520'
  const mat = matStandard(color, { roughness: 0.7 })

  const sideThk = 0.025
  const shelfThk = 0.025
  // Sides + back
  g.add(box(sideThk, h, d, mat).translateX(-(w / 2 - sideThk / 2)).translateY(h / 2))
  g.add(box(sideThk, h, d, mat).translateX(w / 2 - sideThk / 2).translateY(h / 2))
  g.add(box(w, h, sideThk, mat).translateY(h / 2).translateZ(-(d / 2 - sideThk / 2)))

  // Shelves (4)
  const shelves = 4
  for (let i = 0; i <= shelves; i++) {
    const y = (h * i) / shelves + (i === 0 ? shelfThk / 2 : -shelfThk / 2)
    const cy = i === 0 ? shelfThk / 2 : i === shelves ? h - shelfThk / 2 : (h * i) / shelves
    g.add(box(w - sideThk * 2, shelfThk, d - sideThk, mat).translateY(cy))
  }
  return g
}

function buildWardrobe(obj: RoomObject): THREE.Object3D {
  const g = new THREE.Group()
  const w = obj.width, h = obj.height, d = obj.depth
  const color = obj.color || '#3d2a1a'
  const mat = matStandard(color, { roughness: 0.6 })
  const trimMat = matStandard(darken(color, 0.2).getHexString().padStart(6, '0').replace(/^/, '#'), { roughness: 0.5 })

  // Body
  g.add(box(w, h, d, mat).translateY(h / 2))

  // Two doors with handles
  const gap = 0.01
  const dw = (w - gap * 3) / 2
  for (const sx of [-1, 1]) {
    const x = sx * (dw / 2 + gap / 2)
    g.add(
      box(dw, h * 0.96, 0.012, trimMat)
        .translateX(x)
        .translateY(h / 2)
        .translateZ(d / 2 + 0.006),
    )
    // handle
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, h * 0.15, 12),
      matStandard('#aaa', { metalness: 0.7, roughness: 0.3 }),
    )
    handle.position.set(x + (sx > 0 ? -dw * 0.4 : dw * 0.4), h * 0.5, d / 2 + 0.025)
    g.add(handle)
  }
  return g
}

function buildFallback(obj: RoomObject): THREE.Object3D {
  const w = obj.width, h = obj.height, d = obj.depth
  const m = box(w, h, d, matStandard(obj.color || '#8a7868', { roughness: 0.75 }))
  m.position.y = h / 2
  return m
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
export function buildFurniture(obj: RoomObject): THREE.Object3D {
  const t = (obj.type || '').toLowerCase()
  if (t.includes('door')) return buildDoor(obj)
  if (t.includes('window')) return buildWindow(obj)
  if (t.includes('sofa') || t.includes('couch') || t.includes('loveseat')) return buildSofa(obj)
  if (t.includes('armchair') || t.includes('recliner')) return buildSofa({ ...obj, width: Math.min(obj.width, 1.0) })
  if (t.includes('bed')) return buildBed(obj)
  if (t.includes('chair')) return buildChair(obj)
  if (t.includes('tv') || t.includes('television') || t.includes('monitor')) return buildTV(obj)
  if (t.includes('lamp')) return buildLamp(obj)
  if (t.includes('plant') || t.includes('tree') || t.includes('flower')) return buildPlant(obj)
  if (t.includes('rug') || t.includes('carpet') || t.includes('mat')) return buildRug(obj)
  if (t.includes('wardrobe') || t.includes('closet') || t.includes('dresser') || t.includes('cabinet')) {
    return buildWardrobe(obj)
  }
  if (t.includes('shelf') || t.includes('bookcase') || t.includes('bookshelf')) return buildShelf(obj)
  if (t.includes('table') || t.includes('desk')) return buildTable(obj)
  return buildFallback(obj)
}
