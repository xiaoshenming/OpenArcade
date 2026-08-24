import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react'

export function LoadingState({ label = '正在装入卡带…' }: { label?: string }) {
  return <div className="game-loading" role="status"><LoaderCircle className="spin" size={24} /><span>{label}</span></div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="game-error" role="alert">
      <AlertTriangle size={28} />
      <strong>卡带启动失败</strong>
      <span>{message}</span>
      <button className="game-icon-button" onClick={onRetry}><RotateCcw size={17} />重试</button>
    </div>
  )
}

export function ComingSoon() {
  return <div className="coming-soon"><strong>正在打磨</strong><span>下一枚游戏卡带很快上架</span></div>
}
