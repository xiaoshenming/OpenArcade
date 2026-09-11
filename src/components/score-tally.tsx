import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../platform/motion'

const TALLY_MS = 420
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

export function ScoreTally({ value, label }: { value: number; label: string }) {
  const [display, setDisplay] = useState(value)
  const shown = useRef(value)
  const raf = useRef(0)

  useEffect(() => {
    const from = shown.current
    if (from === value) return
    if (Math.abs(value - from) <= 2 || prefersReducedMotion()) {
      cancelAnimationFrame(raf.current)
      shown.current = value
      setDisplay(value)
      return
    }
    const start = performance.now()
    cancelAnimationFrame(raf.current)
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TALLY_MS)
      const next = t < 1 ? Math.round(from + (value - from) * easeOutCubic(t)) : value
      if (next !== shown.current) {
        shown.current = next
        setDisplay(next)
      }
      if (t < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value])

  return (
    <>
      <strong>{String(display).padStart(4, '0')}</strong>
      <small>BEST {label}</small>
    </>
  )
}
