import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CirclePause, CirclePlay, Expand, Gamepad2, GitFork, Heart, HeartCrack, Play, RotateCcw, Sparkles, Trophy, Volume2, VolumeX } from 'lucide-react'
import { GameHost } from './components/GameHost'
import { GameLobby } from './components/GameLobby'
import { LevelPicker } from './components/LevelPicker'
import { RestartDialog, RewardDialog } from './components/arcade-dialogs'
import { reportGameDiagnostic } from './platform/diagnostics'
import { games } from './platform/manifest'
import { getLevelCount, getUnlockedLevel, normalizeUnlockedLevels, unlockNextLevel } from './platform/progression'
import { useSessionAuthority } from './platform/use-session-authority'
import { GameSessionPolicy } from './platform/session-policy'
import { loadPlayer, playerRules, savePlayer, type PlayerState } from './platform/storage'
import { gameEventSchema } from './sdk/schema'
import type { GameEvent } from './platform/types'

type ArcadeLifecycle = 'lobby-idle' | 'playing' | 'lobby-paused'

export default function App() {
  const [selectedId, setSelectedId] = useState(games[0].id)
  const [player, setPlayer] = useState<PlayerState>(() => {
    const loaded = loadPlayer()
    return { ...loaded, unlockedLevels: normalizeUnlockedLevels(loaded.unlockedLevels, games) }
  })
  const { sessionKey, eventEpoch, beginSession, isCurrentSession } = useSessionAuthority()
  const [level, setLevel] = useState(() => getUnlockedLevel(player.unlockedLevels, games[0]))
  const [lifecycle, setLifecycle] = useState<ArcadeLifecycle>('lobby-idle')
  const playing = lifecycle === 'playing'
  const runtimeActive = lifecycle !== 'lobby-idle'
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [score, setScore] = useState(0)
  const [rewardOpen, setRewardOpen] = useState(false)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [failedOpen, setFailedOpen] = useState(false)
  const [levelPickerOpen, setLevelPickerOpen] = useState(false)
  const [levelComplete, setLevelComplete] = useState(false)
  const [rewardLoading, setRewardLoading] = useState(false)
  const cabinetRef = useRef<HTMLDivElement>(null)
  const acceptingEvents = useRef(false)
  const selectedGame = useMemo(() => games.find((game) => game.id === selectedId) ?? games[0], [selectedId])
  const sessionPolicy = useMemo(
    () => new GameSessionPolicy(selectedGame.scorePolicy, `${selectedId}:${sessionKey}`),
    [selectedGame, selectedId, sessionKey],
  )
  const levelCount = getLevelCount(selectedGame)
  const unlockedLevel = getUnlockedLevel(player.unlockedLevels, selectedGame)

  const changeLevel = useCallback((nextLevel: number) => {
    if (!Number.isInteger(nextLevel) || nextLevel < 1 || nextLevel > unlockedLevel) return
    if (nextLevel === level) { setLevelPickerOpen(false); return }
    setLevel(nextLevel)
    if (runtimeActive) beginSession()
    if (!playing) setLifecycle('lobby-idle')
    setScore(0)
    setPaused(false)
    setLevelComplete(false)
    setFailedOpen(false)
    setLevelPickerOpen(false)
  }, [beginSession, level, playing, runtimeActive, unlockedLevel])

  useEffect(() => {
    savePlayer(player)
  }, [player])

  const requestRestart = useCallback(() => {
    if (player.lives <= 0) {
      setRewardOpen(true)
      return
    }
    setPlayer((current) => ({ ...current, lives: Math.max(0, current.lives - 1) }))
    beginSession()
    setScore(0)
    setLevelComplete(false)
    setFailedOpen(false)
  }, [beginSession, player.lives])

  const openRestartConfirm = useCallback(() => {
    setPaused(true)
    setRestartConfirmOpen(true)
  }, [])

  const handleEvent = useCallback((event: GameEvent) => {
    if (!isCurrentSession(eventEpoch)) {
      reportGameDiagnostic(selectedId, event, 'stale-session')
      return
    }
    if (!acceptingEvents.current) {
      reportGameDiagnostic(selectedId, event, 'lobby-session')
      return
    }
    const parsed = gameEventSchema.safeParse(event)
    if (!parsed.success) {
      reportGameDiagnostic(selectedId, event, 'invalid-event')
      return
    }
    const safeEvent = parsed.data
    const decision = sessionPolicy.accept(safeEvent)
    if (!decision.accepted) {
      reportGameDiagnostic(selectedId, safeEvent, decision.reason ?? 'rejected')
      return
    }
    if (safeEvent.type === 'score') setScore(safeEvent.score)
    if (safeEvent.type === 'completed') {
      setScore(safeEvent.score)
      setPlayer((current) => ({
        ...current,
        bestScores: { ...current.bestScores, [selectedId]: Math.max(current.bestScores[selectedId] ?? 0, safeEvent.score) },
        unlockedLevels: unlockNextLevel(current.unlockedLevels, selectedGame, level),
      }))
      setLevelComplete(true)
    }
    if (safeEvent.type === 'failed') {
      setPaused(true)
      setFailedOpen(true)
    }
    if (safeEvent.type === 'request-restart') openRestartConfirm()
  }, [eventEpoch, isCurrentSession, level, openRestartConfirm, selectedGame, selectedId, sessionPolicy])

  const selectGame = (id: string) => {
    if (id === selectedId) {
      if (playing) {
        acceptingEvents.current = false
        setLifecycle('lobby-paused')
        setPaused(true)
      }
      return
    }
    const game = games.find((item) => item.id === id) ?? games[0]
    setSelectedId(id)
    setLevel(getUnlockedLevel(player.unlockedLevels, game))
    acceptingEvents.current = false
    setLifecycle('lobby-idle')
    beginSession()
    setScore(0)
    setPaused(false)
    setRestartConfirmOpen(false)
    setFailedOpen(false)
    setLevelPickerOpen(false)
    setLevelComplete(false)
  }

  const startGame = () => {
    acceptingEvents.current = true
    setLifecycle('playing')
    setPaused(false)
    setFailedOpen(false)
    if (runtimeActive) return
    beginSession()
    setScore(0)
    setLevelComplete(false)
  }

  const returnToLobby = () => {
    acceptingEvents.current = false
    setLifecycle('lobby-paused')
    setPaused(true)
    setRestartConfirmOpen(false)
    setFailedOpen(false)
  }

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
                aria-pressed={selectedId === game.id}
              >
                <span className="game-art" aria-hidden="true">
                  {game.status === 'ready'
                    ? <img src={`/images/games/${game.id}.jpg`} alt="" width="64" height="52" loading={selectedId === game.id ? 'eager' : 'lazy'} decoding="async" />
                    : <Sparkles size={25} />}
                </span>
                <span className="game-copy"><strong>{game.title}</strong><small>{game.category === 'logic' ? '逻辑解谜' : game.category === 'arcade' ? '反应挑战' : '轻松记忆'}</small></span>
                {game.status === 'soon' ? <em>SOON</em> : selectedId === game.id ? <CirclePlay size={20} fill="currentColor" /> : <Play size={17} />}
              </button>
            ))}
          </div>
        </aside>

        <section className="play-area">
          <div className="section-kicker"><span>{playing ? '正在游玩' : '游戏大厅'}</span><span className="availability"><i /> {playing ? '会话已连接' : '准备就绪'}</span></div>
          {!playing && <GameLobby game={selectedGame} level={level} levelCount={levelCount} unlocked={unlockedLevel} bestScore={player.bestScores[selectedId] ?? 0} resume={runtimeActive} onChooseLevel={() => setLevelPickerOpen(true)} onPlay={startGame} />}
          {playing && <div className="game-title-row"><div><h1>{selectedGame.title}</h1><p>{selectedGame.description}</p></div><div className="score-block"><strong>{String(score).padStart(4, '0')}</strong><small>BEST {String(player.bestScores[selectedId] ?? 0).padStart(4, '0')}</small></div></div>}
          {runtimeActive && (
            <div className="cabinet" ref={cabinetRef} hidden={!playing}>
              <div className="cabinet-bar">
                <div className="cabinet-nav">
                  <button className="lobby-back" onClick={returnToLobby} title="返回游戏大厅" aria-label="返回游戏大厅"><ArrowLeft size={18} /></button>
                  <button className="level-button" onClick={() => setLevelPickerOpen(true)} title="选择关卡"><strong>{selectedGame.shortTitle}</strong><span>关卡 {level} / {levelCount}</span></button>
                </div>
                <div className="cabinet-controls">
                  <button onClick={() => setMuted((value) => !value)} title={muted ? '打开声音' : '静音'} aria-label={muted ? '打开声音' : '静音'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                  <button onClick={() => setPaused((value) => !value)} title={paused ? '继续' : '暂停'} aria-label={paused ? '继续游戏' : '暂停游戏'}>{paused ? <CirclePlay size={19} /> : <CirclePause size={19} />}</button>
                  <button onClick={openRestartConfirm} title="重新开始" aria-label="重新开始"><RotateCcw size={18} /></button>
                  <button onClick={toggleFullscreen} title="全屏" aria-label="全屏显示"><Expand size={18} /></button>
                </div>
              </div>
              <div className="screen">
                <GameHost game={selectedGame} sessionKey={sessionKey} paused={paused} muted={muted} level={level} onEvent={handleEvent} />
                {paused && !levelComplete && <button className="pause-overlay" onClick={() => setPaused(false)}><Play size={34} fill="currentColor" /><strong>已暂停</strong><span>点击继续</span></button>}
                {levelComplete && <div className="completion-overlay" role="status"><Trophy size={38} /><span>关卡 {level} 完成</span><strong>{level === levelCount ? '全部通关' : '漂亮！继续下一关'}</strong><div>
                  <button className="completion-secondary" onClick={() => { beginSession(); setScore(0); setLevelComplete(false); setFailedOpen(false) }}>再玩一次</button>
                  {level < levelCount && <button className="completion-primary" onClick={() => changeLevel(level + 1)}>下一关</button>}
                </div></div>}
                {failedOpen && <div className="completion-overlay is-failure" role="alert"><HeartCrack size={38} /><span>挑战失败</span><strong>重试将消耗 1 次机会。</strong><div>
                  <button className="completion-primary" onClick={() => { setFailedOpen(false); setPaused(false); requestRestart() }}>再试一次</button>
                  <button className="completion-secondary" onClick={() => { setFailedOpen(false); returnToLobby() }}>返回大厅</button>
                </div></div>}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="site-footer"><span>为她，也为每一个爱玩的人。</span><a href="https://github.com/xiaoshenming/OpenArcade" target="_blank" rel="noreferrer">在 GitHub 上一起创造</a></footer>

      {levelPickerOpen && (
        <LevelPicker current={level} unlocked={unlockedLevel} total={levelCount} title={selectedGame.title} onSelect={changeLevel} onClose={() => setLevelPickerOpen(false)} />
      )}

      {restartConfirmOpen && <RestartDialog onConfirm={() => { setRestartConfirmOpen(false); setPaused(false); requestRestart() }} onDismiss={() => { setRestartConfirmOpen(false); setPaused(false) }} />}

      {rewardOpen && <RewardDialog claiming={rewardLoading} onClaim={claimReward} onClose={() => { if (!rewardLoading) setRewardOpen(false) }} />}
    </div>
  )
}
