import { useRef, useState } from 'react'

const DELETE_WIDTH = 72
const SNAP_THRESHOLD = DELETE_WIDTH / 2

export function useSwipeMotion() {
  const [offset, setOffset] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const startX = useRef(0)
  const startOffset = useRef(0)

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX
    startOffset.current = offset
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    const delta = e.clientX - startX.current
    const next = Math.min(0, Math.max(-DELETE_WIDTH, startOffset.current + delta))
    setOffset(next)
    setIsOpen(true)
  }

  const onPointerUp = () => {
    const open = offset < -SNAP_THRESHOLD
    setOffset(open ? -DELETE_WIDTH : 0)
    setIsOpen(false)
  }

  return {
    offset,
    isOpen,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  }
}
