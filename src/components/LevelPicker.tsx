import { useEffect } from 'react'
import { LockKeyhole, X } from 'lucide-react'

interface Props {
  current: number
  unlocked: number
  total: number
  title: string
  onSelect: (level: number) => void
  onClose: () => void
}

export function LevelPicker({ current, unlocked, total, title, onSelect, onClose }: Props) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop level-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="level-dialog" role="dialog" aria-modal="true" aria-labelledby="level-picker-title">
        <header>
          <div><span>选择关卡</span><h2 id="level-picker-title">{title}</h2></div>
          <button className="dialog-close" onClick={onClose} autoFocus aria-label="关闭关卡选择"><X size={20} /></button>
        </header>
        <div className="level-grid">
          {Array.from({ length: total }, (_, index) => index + 1).map((level) => {
            const locked = level > unlocked
            const isCurrent = level === current
            const label = locked ? '关卡 ' + level + '，未解锁' : isCurrent ? '当前关卡 ' + level : '进入关卡 ' + level
            return (
              <button key={level} className={isCurrent ? 'is-current' : ''} disabled={locked || isCurrent} aria-current={isCurrent ? 'step' : undefined} onClick={() => onSelect(level)} aria-label={label}>
                {locked ? <LockKeyhole size={13} /> : level}
              </button>
            )
          })}
        </div>
        <footer><span>已解锁 {unlocked} / {total}</span><progress value={unlocked} max={total} /></footer>
      </section>
    </div>
  )
}
