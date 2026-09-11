import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react'

export function LoadingState({ label = '正在装入卡带…' }: { label?: string }) {
  return <div className="game-loading" role="status"><span className="loading-ring"><LoaderCircle className="spin" size={30} /></span><span className="standby-kicker">LOADING</span><span>{label}</span></div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="game-error" role="alert">
      <span className="standby-kicker">GAME OVER</span>
      <AlertTriangle size={34} />
      <strong>卡带启动失败</strong>
      <span>{message}</span>
      <button className="game-icon-button" onClick={onRetry}><RotateCcw size={17} />重试</button>
    </div>
  )
}

export function ComingSoon() {
  return <div className="coming-soon"><span className="standby-panel"><span className="standby-kicker">INSERT COIN</span><strong>正在打磨</strong><span>下一枚游戏卡带很快上架</span></span></div>
}
