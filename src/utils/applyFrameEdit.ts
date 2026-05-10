export interface EditStyle {
  primaryColor: string
  secondaryColor: string
  material: string
  variant: string
  hasHandle: boolean
  panelCount: number
  handleSide: 'left' | 'right'
}

export interface FrameEditData {
  frameIndex: number
  elementType: 'door' | 'window' | 'wall' | 'floor' | 'other'
  region: { x: number; y: number; width: number; height: number }
  style: EditStyle
  plan: string
}

function hex(color: string, delta: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const r = clamp(parseInt(color.slice(1, 3), 16) + delta)
  const g = clamp(parseInt(color.slice(3, 5), 16) + delta)
  const b = clamp(parseInt(color.slice(5, 7), 16) + delta)
  return `rgb(${r},${g},${b})`
}

function drawDoor(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rw: number, rh: number,
  s: EditStyle,
) {
  const fw = Math.max(Math.round(rw * 0.07), 4)

  // Frame
  ctx.fillStyle = s.secondaryColor
  ctx.fillRect(rx, ry, rw, rh)

  // Face
  const fx = rx + fw, fy = ry + fw * 0.5
  const fw2 = rw - fw * 2, fh2 = rh - fw * 1.5
  ctx.fillStyle = s.primaryColor
  ctx.fillRect(fx, fy, fw2, fh2)

  // Wood grain lines
  if (s.material === 'wood') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(fx, fy, fw2, fh2)
    ctx.clip()
    ctx.strokeStyle = hex(s.primaryColor, -18)
    ctx.lineWidth = 0.7
    for (let i = 10; i < fw2; i += 14) {
      ctx.beginPath()
      ctx.moveTo(fx + i, fy)
      ctx.lineTo(fx + i + Math.sin(i * 0.4) * 3, fy + fh2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Glass panel
  if (s.material === 'glass' || s.variant === 'frosted') {
    const gx = fx + fw2 * 0.1, gy = fy + fh2 * 0.08
    const gw = fw2 * 0.8, gh = fh2 * 0.6
    ctx.fillStyle = s.variant === 'frosted' ? '#d4dde4' : '#c2d6e8'
    ctx.fillRect(gx, gy, gw, gh)
    const shine = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh)
    shine.addColorStop(0, 'rgba(255,255,255,0.38)')
    shine.addColorStop(0.45, 'rgba(255,255,255,0.04)')
    shine.addColorStop(1, 'rgba(255,255,255,0.12)')
    ctx.fillStyle = shine
    ctx.fillRect(gx, gy, gw, gh)
  }

  // Raised panels (traditional / panel variant)
  const panels = Math.min(s.panelCount, 4)
  if (panels > 0 && s.material !== 'glass') {
    const padX = Math.round(fw2 * 0.13)
    const padTop = Math.round(fh2 * 0.05)
    const panelW = fw2 - padX * 2
    const totalH = fh2 - padTop - Math.round(fh2 * 0.04)
    const gap = Math.round(totalH * 0.05)
    const panelH = (totalH - gap * (panels - 1)) / panels

    for (let p = 0; p < panels; p++) {
      const px = fx + padX
      const py = fy + padTop + p * (panelH + gap)
      // Shadow (bottom-right)
      ctx.strokeStyle = hex(s.primaryColor, -40)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px + panelW, py); ctx.lineTo(px + panelW, py + panelH)
      ctx.lineTo(px, py + panelH)
      ctx.stroke()
      // Highlight (top-left)
      ctx.strokeStyle = hex(s.primaryColor, 40)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, py + panelH); ctx.lineTo(px, py); ctx.lineTo(px + panelW, py)
      ctx.stroke()
    }
  }

  // Subtle sheen gradient
  const sheen = ctx.createLinearGradient(fx, fy, fx + fw2, fy)
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)')
  sheen.addColorStop(0.4, 'rgba(255,255,255,0.02)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.05)')
  ctx.fillStyle = sheen
  ctx.fillRect(fx, fy, fw2, fh2)

  // Handle
  if (s.hasHandle) {
    const hx = s.handleSide === 'right' ? rx + rw * 0.76 : rx + rw * 0.24
    const hy = ry + rh * 0.52
    const hr = Math.max(Math.round(rw * 0.042), 4)

    // Backplate
    ctx.fillStyle = '#9a7e20'
    ctx.fillRect(hx - hr * 0.28, hy - hr * 1.1, hr * 0.56, hr * 2.2)

    // Knob
    ctx.fillStyle = '#c09a30'
    ctx.beginPath()
    ctx.arc(hx, hy, hr, 0, Math.PI * 2)
    ctx.fill()

    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.beginPath()
    ctx.arc(hx - hr * 0.28, hy - hr * 0.28, hr * 0.33, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWindow(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rw: number, rh: number,
  s: EditStyle,
) {
  const fw = Math.max(Math.round(rw * 0.09), 4)

  // Frame
  ctx.fillStyle = s.secondaryColor
  ctx.fillRect(rx, ry, rw, rh)

  // Pane layout
  const cols = rw > rh * 0.7 ? 2 : 1
  const rows = rh > rw * 1.4 ? 2 : 1
  const mullW = cols > 1 ? Math.max(Math.round(rw * 0.05), 3) : 0
  const mullH = rows > 1 ? Math.max(Math.round(rh * 0.05), 3) : 0
  const paneW = (rw - fw * 2 - mullW * (cols - 1)) / cols
  const paneH = (rh - fw * 2 - mullH * (rows - 1)) / rows

  const glassColor = s.variant === 'frosted' ? '#ccd8dd' : '#b8d0e0'
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = rx + fw + c * (paneW + mullW)
      const py = ry + fw + r * (paneH + mullH)

      // Glass
      ctx.fillStyle = glassColor
      ctx.fillRect(px, py, paneW, paneH)

      // Reflection
      const shine = ctx.createLinearGradient(px, py, px + paneW * 0.6, py + paneH * 0.6)
      shine.addColorStop(0, 'rgba(255,255,255,0.40)')
      shine.addColorStop(0.5, 'rgba(255,255,255,0.06)')
      shine.addColorStop(1, 'rgba(255,255,255,0.10)')
      ctx.fillStyle = shine
      ctx.fillRect(px, py, paneW, paneH)
    }
  }
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rw: number, rh: number,
  s: EditStyle,
) {
  // Tint at 72% so original texture bleeds through
  ctx.globalAlpha = 0.72
  ctx.fillStyle = s.primaryColor
  ctx.fillRect(rx, ry, rw, rh)
  ctx.globalAlpha = 1

  // Baseboard strip at bottom
  const bh = Math.max(Math.round(rh * 0.06), 6)
  ctx.fillStyle = hex(s.primaryColor, 30)
  ctx.fillRect(rx, ry + rh - bh, rw, bh)
  ctx.fillStyle = hex(s.primaryColor, 50)
  ctx.fillRect(rx, ry + rh - bh, rw, 2)
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rw: number, rh: number,
  s: EditStyle,
) {
  ctx.fillStyle = s.primaryColor
  ctx.fillRect(rx, ry, rw, rh)

  if (s.material === 'wood') {
    const plankH = Math.max(Math.round(rh / 6), 12)
    ctx.strokeStyle = hex(s.primaryColor, -28)
    ctx.lineWidth = 1
    for (let y = ry; y < ry + rh; y += plankH) {
      ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + rw, y); ctx.stroke()
      const seams = Math.floor(rw / 90)
      for (let i = 0; i < seams; i++) {
        const sx = rx + (i / seams) * rw + (Math.random() * 20 - 10)
        ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + plankH); ctx.stroke()
      }
    }
  } else if (s.material === 'tile') {
    const ts = Math.round(Math.min(rw, rh) / 5)
    ctx.strokeStyle = hex(s.primaryColor, -35)
    ctx.lineWidth = 1.2
    for (let x = rx; x <= rx + rw; x += ts) {
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + rh); ctx.stroke()
    }
    for (let y = ry; y <= ry + rh; y += ts) {
      ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + rw, y); ctx.stroke()
    }
  }
}

export async function applyFrameEdit(
  base64Frame: string,
  edit: FrameEditData,
): Promise<string> {
  const src = base64Frame.startsWith('data:')
    ? base64Frame
    : `data:image/jpeg;base64,${base64Frame}`

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('Failed to load frame'))
    i.src = src
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!

  // Draw original frame as base
  ctx.drawImage(img, 0, 0)

  // Pixel-space region
  const rx = Math.round(edit.region.x * img.naturalWidth)
  const ry = Math.round(edit.region.y * img.naturalHeight)
  const rw = Math.round(edit.region.width * img.naturalWidth)
  const rh = Math.round(edit.region.height * img.naturalHeight)

  switch (edit.elementType) {
    case 'door':   drawDoor(ctx, rx, ry, rw, rh, edit.style);   break
    case 'window': drawWindow(ctx, rx, ry, rw, rh, edit.style); break
    case 'wall':   drawWall(ctx, rx, ry, rw, rh, edit.style);   break
    case 'floor':  drawFloor(ctx, rx, ry, rw, rh, edit.style);  break
  }

  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}
