import type { RoomData } from '@/hooks/useScans'
import { ASSUMED_PAN_RAD, FRAME_HFOV_DEG } from '@/config'

export interface PixelAnchor {
  frameIndex: number
  pixelX: number
  pixelY: number
}

// Convert Claude's pixel anchor (which frame + where in it) into world (x, z)
// coords aligned with the video-backdrop camera. Mirrors the camera-yaw
// mapping in RoomScene so a 3D object dropped at the returned coords ends up
// on screen at the exact same spot the user sees in the recording.
export function pixelAnchorToCoords(
  anchor: PixelAnchor,
  numFrames: number,
  roomData: RoomData,
): { x: number; z: number } {
  // Frame fraction → yaw of the frame's centre. Recording is assumed to span
  // ASSUMED_PAN_RAD radians evenly across all extracted frames; this matches
  // RoomScene's drag/scrub mapping so anchored objects stay in place as the
  // user pans through the video.
  const frameFraction = numFrames > 1
    ? Math.max(0, Math.min(numFrames - 1, anchor.frameIndex)) / (numFrames - 1)
    : 0
  const frameCenterYaw = frameFraction * ASSUMED_PAN_RAD
  const frameHfovRad = (FRAME_HFOV_DEG * Math.PI) / 180
  const px = Math.max(0, Math.min(1, anchor.pixelX))
  const yaw = frameCenterYaw + (px - 0.5) * frameHfovRad

  // Cast a ray from the camera (origin) along yaw until it hits the nearest
  // wall, so wall-mounted objects (doors/windows) and floor-resting furniture
  // (the recording usually shows objects against the room boundary) land at a
  // believable depth.
  const rw = roomData.estimatedWidth || 4
  const rl = roomData.estimatedLength || 3.5
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const distZ = Math.abs(c) > 1e-3 ? (rl / 2) / Math.abs(c) : Infinity
  const distX = Math.abs(s) > 1e-3 ? (rw / 2) / Math.abs(s) : Infinity
  const dist = Math.min(distZ, distX)

  return { x: dist * s, z: -dist * c }
}
