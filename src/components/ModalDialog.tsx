import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  labelledBy: string
  className: string
  onClose: () => void
  children: ReactNode
  closeOnBackdrop?: boolean
}

const focusSelector = 'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function ModalDialog({ labelledBy, className, onClose, children, closeOnBackdrop = true }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const closingRef = useRef(false)
  const [closing, setClosing] = useState(false)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  const startClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
  }, [])

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => closeRef.current(), 160)
    return () => window.clearTimeout(timer)
  }, [closing])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusSelector) ?? [])
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); startClose(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); return }
      const first = items[0]
      const last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous?.isConnected) previous.focus()
    }
  }, [startClose])

  const endClosing = (event: React.AnimationEvent) => {
    if (!closing) return
    if (event.target === event.currentTarget || event.target === dialogRef.current) closeRef.current()
  }

  return (
    <div className={`modal-backdrop${closing ? ' is-closing' : ''}`} onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) startClose() }} onAnimationEnd={endClosing}>
      <section ref={dialogRef} className={`modal-frame ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</section>
    </div>
  )
}
