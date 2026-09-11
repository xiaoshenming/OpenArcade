import { BookOpen, Layers3, ListOrdered, LockKeyhole, Play, Trophy } from 'lucide-react'
import type { GameManifest } from '../sdk'
import { getLobbyAccent } from './lobby-theme'

interface Props {
  game: GameManifest
  level: number
  levelCount: number
  unlocked: number
  bestScore: number
  resume: boolean
  onChooseLevel: () => void
  onPlay: () => void
}

const categoryName = { logic: '逻辑解谜', arcade: '反应挑战', cozy: '轻松记忆' }
const fallbackRules = ['阅读游戏内的目标提示并完成当前挑战。', '需要重开时由宿主确认，游戏不能自行消耗机会。']

export function GameLobby({ game, level, levelCount, unlocked, bestScore, resume, onChooseLevel, onPlay }: Props) {
  const rules = game.instructions ?? fallbackRules
  const highlights = game.highlights ?? []
  const available = game.status === 'ready'
  const safeAccent = getLobbyAccent(game.accent)
  return (
    <section className="game-lobby" style={{ '--game-accent': game.accent, '--game-action': safeAccent, '--game-ink': safeAccent } as React.CSSProperties} aria-label={`${game.title} 游戏大厅`}>
      <div className="lobby-hero">
        <img src={`/images/games/${game.id}.jpg`} alt={`${game.title} 实际游戏画面`} width="1000" height="560" decoding="async" />
        <div className="lobby-hero-shade" />
        <div className="lobby-marquee"><div className={available ? 'lobby-badge' : 'lobby-badge is-soon'}>{available ? resume ? 'CONTINUE?' : 'READY' : 'SOON'}</div></div>
        <div className="lobby-hero-copy">
          <span>{categoryName[game.category]} · {levelCount} 关</span>
          <h1>{game.title}</h1>
          <p>{game.description}</p>
          <div className="lobby-actions">
            <button className="lobby-play" onClick={onPlay} disabled={!available} autoFocus={resume}><Play size={18} fill="currentColor" />{available ? resume ? `继续第 ${level} 关` : `开始第 ${level} 关` : '即将开放'}</button>
            <button className="lobby-level" onClick={onChooseLevel} disabled={!available}><ListOrdered size={18} />选择关卡</button>
          </div>
        </div>
      </div>

      <div className="lobby-progress">
        <div><Trophy size={18} /><span>最佳分数<strong>{String(bestScore).padStart(4, '0')}</strong></span></div>
        <div><LockKeyhole size={18} /><span>解锁进度<strong>{unlocked} / {levelCount}</strong></span></div>
        <progress value={unlocked} max={levelCount} aria-label={`已解锁 ${unlocked} / ${levelCount}`} />
      </div>

      <div className="lobby-details">
        <section className="lobby-rules">
          <header><BookOpen size={18} /><div><span>HOW TO PLAY</span><h2>玩法规则</h2></div></header>
          <ol>{rules.map((rule, index) => <li key={rule}><em>{String(index + 1).padStart(2, '0')}</em><span>{rule}</span></li>)}</ol>
        </section>
        <section className="lobby-highlights">
          <header><Layers3 size={18} /><div><span>CHAPTERS</span><h2>章节特色</h2></div></header>
          {highlights.length ? <div>{highlights.map((item) => <span key={item}>{item}</span>)}</div> : <p>关卡内容会随着进度逐步展开。</p>}
          <small>当前选择</small><strong>关卡 {level}</strong>
        </section>
      </div>
    </section>
  )
}
