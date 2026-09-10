import { Heart, Pause, Play, RotateCcw, X } from 'lucide-react'
import { ModalDialog } from './ModalDialog'

interface RestartDialogProps {
  onConfirm: () => void
  onDismiss: () => void
}

export function RestartDialog({ onConfirm, onDismiss }: RestartDialogProps) {
  return (
    <ModalDialog className="reward-dialog" labelledBy="restart-title" onClose={onDismiss}>
      <div className="reward-icon"><RotateCcw size={30} /></div>
      <span className="dialog-kicker">RESTART</span>
      <h2 id="restart-title">重新开始本关</h2>
      <p>只有你的确认才能消耗一次机会。游戏代码不能自行扣除生命值。</p>
      <button className="reward-button" onClick={onConfirm}><RotateCcw size={18} />确认重开</button>
      <button className="dialog-secondary" onClick={onDismiss}>继续当前游戏</button>
    </ModalDialog>
  )
}

interface RewardDialogProps {
  claiming: boolean
  onClaim: () => void
  onClose: () => void
}

export function RewardDialog({ claiming, onClaim, onClose }: RewardDialogProps) {
  return (
    <ModalDialog className="reward-dialog" labelledBy="reward-title" onClose={onClose}>
      <button className="dialog-close" onClick={onClose} disabled={claiming} aria-label="关闭"><X size={20} /></button>
      <div className="reward-icon"><Heart size={30} fill="currentColor" /></div>
      <span className="dialog-kicker">ONE MORE ROUND</span>
      <h2 id="reward-title">机会用完了</h2>
      <p>观看一段演示内容，立即获得 3 次重试机会。正式上线时请在服务端验证真实广告回调。</p>
      <button className="reward-button" onClick={onClaim} disabled={claiming}>{claiming ? <><Pause size={18} /> 正在播放演示…</> : <><Play size={18} fill="currentColor" /> 观看并领取 3 次</>}</button>
      <small>演示模式 · 不包含真实广告或支付</small>
    </ModalDialog>
  )
}
