import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CirclePause, CirclePlay, Coins, Expand, Gamepad2, GitFork, Heart, Menu, Pause, Play, RotateCcw, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { GameHost } from './components/GameHost'
import { games } from './platform/manifest'
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
  const [rewardLoading, setRewardLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const cabinetRef = useRef<HTMLDivElement>(null)
  const selectedGame = useMemo(() => games.find((game) => game.id === selectedId) ?? games[0], [selectedId])

  useEffect(() => savePlayer(player), [player])

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
    if (event.type === 'score') setScore(event.score)
    if (event.type === 'completed') {
      setScore(event.score)
      setPlayer((current) => ({
        ...current,
        bestScores: { ...current.bestScores, [selectedId]: Math.max(current.bestScores[selectedId] ?? 0, event.score) },
      }))
    }
    if (event.type === 'request-restart') requestRestart()
  }, [requestRestart, selectedId])

  const selectGame = (id: string) => {
    setSelectedId(id)
    setSessionKey((key) => key + 1)
    setScore(0)
    setPaused(false)
    setMenuOpen(false)
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
          <a className="is-active" href="#arcade">游戏厅</a>
          <a href="#protocol">接入协议</a>
          <a href="https://github.com/xiaoshenming/OpenArcade" target="_blank" rel="noreferrer">开源仓库</a>
        </nav>
        <div className="topbar-actions">
          <div className="life-counter" title="可用重试次数">
            <Heart size={16} fill="currentColor" />
            <strong>{player.lives}</strong>
            <span>次机会</span>
          </div>
          <a className="icon-button" href="https://github.com/xiaoshenming/OpenArcade" target="_blank" rel="noreferrer" aria-label="打开 GitHub"><GitFork size={19} /></a>
          <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label="打开游戏菜单"><Menu size={20} /></button>
        </div>
      </header>

      <main id="arcade" className="arcade-layout">
        <aside className={`game-library ${menuOpen ? 'is-open' : ''}`}>
          <div className="library-heading">
            <div><span>CARTRIDGES</span><h2>游戏卡带</h2></div>
            <button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="关闭菜单"><X size={20} /></button>
          </div>
          <div className="game-list">
            {games.map((game, index) => (
              <button
                key={game.id}
                className={`game-list-item ${selectedId === game.id ? 'is-selected' : ''}`}
                style={{ '--game-accent': game.accent } as React.CSSProperties}
                onClick={() => selectGame(game.id)}
              >
                <span className="game-number">0{index + 1}</span>
                <span className="game-art" aria-hidden="true">
                  {game.id === 'water-sort' && <><i /><i /><i /></>}
                  {game.id === 'orbit-tap' && <Sparkles size={29} />}
                  {game.id === 'petal-pairs' && <><i className="card-shape" /><i className="card-shape" /></>}
                </span>
                <span className="game-copy"><strong>{game.title}</strong><small>{game.category === 'logic' ? '逻辑解谜' : game.category === 'arcade' ? '反应挑战' : '轻松记忆'}</small></span>
                {game.status === 'soon' ? <em>SOON</em> : selectedId === game.id ? <CirclePlay size={20} fill="currentColor" /> : <Play size={17} />}
              </button>
            ))}
          </div>
          <div className="library-note">
            <span><Coins size={16} /> 今日赠送</span>
            <strong>每位玩家 5 次重试</strong>
            <p>演示版仅保存在当前浏览器。</p>
          </div>
        </aside>

        <section className="play-area">
          <div className="section-kicker"><span>NOW PLAYING</span><span>{selectedGame.loader === 'iframe' ? 'IFRAME PLUG-IN' : 'NATIVE MODULE'}</span></div>
          <div className="game-title-row">
            <div>
              <h1>{selectedGame.title}</h1>
              <p>{selectedGame.description}</p>
            </div>
            <div className="score-block"><span>BEST</span><strong>{String(player.bestScores[selectedId] ?? score).padStart(4, '0')}</strong></div>
          </div>

          <div className="cabinet" ref={cabinetRef}>
            <div className="cabinet-bar">
              <div className="status-light"><i /> ONLINE</div>
              <div className="cabinet-controls">
                <button onClick={() => setMuted((value) => !value)} title={muted ? '打开声音' : '静音'} aria-label={muted ? '打开声音' : '静音'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
                <button onClick={() => setPaused((value) => !value)} title={paused ? '继续' : '暂停'} aria-label={paused ? '继续游戏' : '暂停游戏'}>{paused ? <CirclePlay size={18} /> : <CirclePause size={18} />}</button>
                <button onClick={toggleFullscreen} title="全屏" aria-label="全屏显示"><Expand size={17} /></button>
              </div>
            </div>
            <div className="screen">
              <GameHost game={selectedGame} sessionKey={sessionKey} paused={paused} muted={muted} onEvent={handleEvent} />
              {paused && selectedGame.status === 'ready' && <button className="pause-overlay" onClick={() => setPaused(false)}><Play size={34} fill="currentColor" /><strong>已暂停</strong><span>点击继续</span></button>}
            </div>
            <div className="cabinet-footer">
              <span>OA / {selectedGame.id.toUpperCase()}</span>
              <button className="restart-button" onClick={restart} disabled={selectedGame.status === 'soon'}><RotateCcw size={17} />重新开始 <kbd>{player.lives}</kbd></button>
              <span>BUILD 001</span>
            </div>
          </div>

          <div id="protocol" className="details-strip">
            <div><span>游戏类型</span><strong>{selectedGame.category === 'logic' ? '休闲 · 逻辑 · 单人' : '街机 · 反应 · 单人'}</strong></div>
            <div><span>运行方式</span><strong>{selectedGame.loader === 'iframe' ? '隔离容器 / Bridge' : '动态加载 / TypeScript'}</strong></div>
            <div><span>版权状态</span><strong>原创代码与素材</strong></div>
          </div>
        </section>
      </main>

      <footer className="site-footer"><span>为她，也为每一个爱玩的人。</span><span>OPENARCADE · OPEN SOURCE MINI GAMES</span></footer>

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
