import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CirclePause, CirclePlay, Expand, Gamepad2, GitFork, Heart, Pause, Play, RotateCcw, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { GameHost } from './components/GameHost'
import { reportGameDiagnostic } from './platform/diagnostics'
import { games } from './platform/manifest'
import { GameSessionPolicy } from './platform/session-policy'
import { loadPlayer, playerRules, savePlayer, type PlayerState } from './platform/storage'
import type { GameEvent } from './platform/types'

export default function App() {
  const [selectedId, setSelectedId] = useState(games[0].id)
  const [player, setPlayer] = useState<PlayerState>(loadPlayer)
  const [sessionKey, setSessionKey] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [score, setScore] = useState(0)
  const [rewardOpen, setRewardOpen] = useState(false)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [rewardLoading, setRewardLoading] = useState(false)
  const cabinetRef = useRef<HTMLDivElement>(null)
  const selectedGame = useMemo(() => games.find((game) => game.id === selectedId) ?? games[0], [selectedId])
  const sessionPolicy = useMemo(
    () => new GameSessionPolicy(selectedGame.scorePolicy, `${selectedId}:${sessionKey}`),
    [selectedGame, selectedId, sessionKey],
  )

  useEffect(() => {
    savePlayer(player)
  }, [player])

  const requestRestart = useCallback(() => {
    if (player.lives <= 0) {
      setRewardOpen(true)
      return
    }
    setPlayer((current) => ({ ...current, lives: Math.max(0, current.lives - 1) }))
    setSessionKey((key) => key + 1)
    setScore(0)
  }, [player.lives])

  const handleEvent = useCallback((event: GameEvent) => {
    const decision = sessionPolicy.accept(event)
    if (!decision.accepted) {
      reportGameDiagnostic(selectedId, event, decision.reason ?? 'rejected')
      return
    }
    if (event.type === 'score') setScore(event.score)
    if (event.type === 'completed') {
      setScore(event.score)
      setPlayer((current) => ({
        ...current,
        bestScores: { ...current.bestScores, [selectedId]: Math.max(current.bestScores[selectedId] ?? 0, event.score) },
      }))
    }
    if (event.type === 'request-restart') {
      setPaused(true)
      setRestartConfirmOpen(true)
    }
  }, [selectedId, sessionPolicy])

  const selectGame = (id: string) => {
    setSelectedId(id)
    setSessionKey((key) => key + 1)
    setScore(0)
    setPaused(false)
    setRestartConfirmOpen(false)
  }

  const restart = requestRestart

  const claimReward = () => {
    setRewardLoading(true)
    window.setTimeout(() => {
      setPlayer((current) => ({ ...current, lives: Math.min(playerRules.maxLives, current.lives + 3) }))
      setRewardLoading(false)
      setRewardOpen(false)
    }, 1200)
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) void cabinetRef.current?.requestFullscreen()
    else void document.exitFullscreen()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#arcade" aria-label="OpenArcade 首页">
          <span className="brand-mark"><Gamepad2 size={21} strokeWidth={2.5} /></span>
          <span>OPEN<span>ARCADE</span></span>
        </a>
        <nav className="desktop-nav" aria-label="主导航">
          <a className="is-active" href="#arcade">游玩</a>
          <a href="https://github.com/xiaoshenming/OpenArcade/blob/main/docs/adding-a-game.md" target="_blank" rel="noreferrer">贡献游戏</a>
          <a href="https://github.com/xiaoshenming/OpenArcade" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="topbar-actions">
          <div className="life-counter" title="可用重试次数">
            <Heart size={16} fill="currentColor" />
            <strong>{player.lives}</strong>
            <span>次机会</span>
          </div>
          <a className="icon-button" href="https://github.com/xiaoshenming/OpenArcade" target="_blank" rel="noreferrer" aria-label="打开 GitHub"><GitFork size={19} /></a>
        </div>
      </header>

      <main id="arcade" className="arcade-layout">
        <aside className="game-library" aria-label="游戏列表">
          <div className="library-heading">
            <h2>小游戏</h2>
            <span>{games.length} 款</span>
          </div>
          <div className="game-list">
            {games.map((game) => (
              <button
                key={game.id}
                className={`game-list-item ${selectedId === game.id ? 'is-selected' : ''}`}
                style={{ '--game-accent': game.accent } as React.CSSProperties}
                onClick={() => selectGame(game.id)}
              >
                <span className="game-art" aria-hidden="true">
                  {game.status === 'ready'
                    ? <img src={`/images/games/${game.id}.jpg`} alt="" />
                    : <Sparkles size={25} />}
                </span>
                <span className="game-copy"><strong>{game.title}</strong><small>{game.category === 'logic' ? '逻辑解谜' : game.category === 'arcade' ? '反应挑战' : '轻松记忆'}</small></span>
                {game.status === 'soon' ? <em>SOON</em> : selectedId === game.id ? <CirclePlay size={20} fill="currentColor" /> : <Play size={17} />}
              </button>
            ))}
          </div>
        </aside>

        <section className="play-area">
          <div className="section-kicker"><span>正在游玩</span><span className="availability"><i /> 随时可玩</span></div>
          <div className="game-title-row">
            <div>
              <h1>{selectedGame.title}</h1>
              <p>{selectedGame.description}</p>
            </div>
            <div className="score-block"><span>BEST</span><strong>{String(player.bestScores[selectedId] ?? score).padStart(4, '0')}</strong></div>
          </div>

          <div className="cabinet" ref={cabinetRef}>
            <div className="cabinet-bar">
              <strong>{selectedGame.shortTitle}</strong>
              <div className="cabinet-controls">
                <button onClick={() => setMuted((value) => !value)} title={muted ? '打开声音' : '静音'} aria-label={muted ? '打开声音' : '静音'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                <button onClick={() => setPaused((value) => !value)} title={paused ? '继续' : '暂停'} aria-label={paused ? '继续游戏' : '暂停游戏'}>{paused ? <CirclePlay size={19} /> : <CirclePause size={19} />}</button>
                <button onClick={restart} disabled={selectedGame.status === 'soon'} title="重新开始" aria-label="重新开始"><RotateCcw size={18} /></button>
                <button onClick={toggleFullscreen} title="全屏" aria-label="全屏显示"><Expand size={18} /></button>
              </div>
            </div>
            <div className="screen">
              <GameHost game={selectedGame} sessionKey={sessionKey} paused={paused} muted={muted} onEvent={handleEvent} />
              {paused && selectedGame.status === 'ready' && <button className="pause-overlay" onClick={() => setPaused(false)}><Play size={34} fill="currentColor" /><strong>已暂停</strong><span>点击继续</span></button>}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer"><span>为她，也为每一个爱玩的人。</span><a href="https://github.com/xiaoshenming/OpenArcade" target="_blank" rel="noreferrer">在 GitHub 上一起创造</a></footer>

      {restartConfirmOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="reward-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-title">
            <div className="reward-icon"><RotateCcw size={30} /></div>
            <span className="dialog-kicker">RESTART REQUEST</span>
            <h2 id="restart-title">游戏请求重新开始</h2>
            <p>只有你的确认才能消耗一次机会。游戏代码不能自行扣除生命值。</p>
            <button className="reward-button" onClick={() => { setRestartConfirmOpen(false); setPaused(false); requestRestart() }}>
              <RotateCcw size={18} />确认重开
            </button>
            <button className="dialog-secondary" onClick={() => { setRestartConfirmOpen(false); setPaused(false) }}>继续当前游戏</button>
          </section>
        </div>
      )}

      {rewardOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !rewardLoading) setRewardOpen(false) }}>
          <section className="reward-dialog" role="dialog" aria-modal="true" aria-labelledby="reward-title">
            <button className="dialog-close" onClick={() => setRewardOpen(false)} disabled={rewardLoading} aria-label="关闭"><X size={20} /></button>
            <div className="reward-icon"><Heart size={30} fill="currentColor" /></div>
            <span className="dialog-kicker">ONE MORE ROUND</span>
            <h2 id="reward-title">机会用完了</h2>
            <p>观看一段演示内容，立即获得 3 次重试机会。正式上线时请在服务端验证真实广告回调。</p>
            <button className="reward-button" onClick={claimReward} disabled={rewardLoading}>{rewardLoading ? <><Pause size={18} /> 正在播放演示…</> : <><Play size={18} fill="currentColor" /> 观看并领取 3 次</>}</button>
            <small>演示模式 · 不包含真实广告或支付</small>
          </section>
        </div>
      )}
    </div>
  )
}
