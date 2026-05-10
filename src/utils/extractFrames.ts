import { FRAME_INTERVAL_S, FRAME_MAX_COUNT, FRAME_CANVAS_WIDTH, FRAME_JPEG_QUALITY } from '@/config'

export async function extractFrames(
  blob: Blob,
  intervalSeconds = FRAME_INTERVAL_S,
  maxFrames = FRAME_MAX_COUNT,
): Promise<string[]> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  return new Promise((resolve, reject) => {
    video.onloadeddata = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      canvas.width = Math.min(video.videoWidth, FRAME_CANVAS_WIDTH)
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth))

      const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      const times: number[] = []
      // Start from 10% into video to avoid blank first frame on iOS
      const start = Math.min(duration * 0.1, 0.5)
      for (let t = start; times.length < maxFrames; t += intervalSeconds) {
        if (t >= duration && times.length > 0) break
        times.push(Math.min(t, Math.max(0, duration - 0.1)))
        if (!duration) break
      }
      if (times.length === 0) times.push(0)

      const frames: string[] = []
      let index = 0

      const capture = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY).split(',')[1])
      }

      const seek = () => {
        if (index >= times.length) {
          URL.revokeObjectURL(url)
          resolve(frames)
          return
        }
        video.currentTime = times[index++]
      }

      video.onseeked = () => {
        // Small rAF delay so iOS has time to decode the frame before drawing
        requestAnimationFrame(() => {
          capture()
          seek()
        })
      }

      seek()
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load video for frame extraction'))
    }

    video.load()
  })
}
