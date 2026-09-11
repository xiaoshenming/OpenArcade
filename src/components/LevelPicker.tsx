import { LockKeyhole, X } from 'lucide-react'
import { ModalDialog } from './ModalDialog'

interface Props {
  current: number
  unlocked: number
  total: number
  title: string
  onSelect: (level: number) => void
  onClose: () => void
}

export function LevelPicker({ current, unlocked, total, title, onSelect, onClose }: Props) {
  return (
    <ModalDialog className="level-dialog" labelledBy="level-picker-title" onClose={onClose}>
        <header>
          <div><span className="dialog-kicker">选择关卡</span><h2 id="level-picker-title">{title}</h2></div>
          <button className="dialog-close" onClick={onClose} aria-label="关闭关卡选择"><X size={20} /></button>
        </header>
        <div className="level-grid">
          {Array.from({ length: total }, (_, index) => index + 1).map((level) => {
            const locked = level > unlocked
            const isCurrent = level === current
            const label = locked ? '关卡 ' + level + '，未解锁' : isCurrent ? '当前关卡 ' + level : '进入关卡 ' + level
            return (
              <button key={level} style={{ '--stagger': `${Math.min((level - 1) * 18, 360)}ms` } as React.CSSProperties} className={isCurrent ? 'is-current' : locked ? 'is-locked' : ''} disabled={locked || isCurrent} aria-current={isCurrent ? 'step' : undefined} onClick={() => onSelect(level)} aria-label={label}>
                {locked ? <LockKeyhole size={13} /> : level}
              </button>
            )
          })}
        </div>
        <footer><span>已解锁 {unlocked} / {total}</span><progress value={unlocked} max={total} /></footer>
    </ModalDialog>
  )
}
