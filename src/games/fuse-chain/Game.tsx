import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Bomb, Heart, Lock, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { failedScore, isBudgetSpent, LIVES_PER_LEVEL, scoreFor, simulateChain, type BombGrid } from './logic'
import { createFusePuzzle, FUSE_LEVEL_COUNT, type FusePuzzle } from './levels'
import './fuse-chain.css'

interface ChainFx {
  waves: number[][]
}

function FuseSession({ puzzle, paused, muted, emit }: { puzzle: FusePuzzle; paused: boolean; muted: boolean; emit: (event: GameEvent) => void }) {
  const spec = puzzle.spec
  const [bombs, setBombs] = useState<BombGrid>(puzzle.bombs)
  const [detonations, setDetonations] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [lives, setLives] = useState(LIVES_PER_LEVEL)
  const [chain, setChain] = useState<ChainFx | null>(null)
  const [settled, setSettled] = useState<'win' | 'lost' | null>(null)
  const [announce, setAnnounce] = useState('')
  const audio = useMemo(() => createGameAudio(), [])
  const waveOf = useMemo(() => {
    const map = new Map<number, number>()
    chain?.waves.forEach((wave, index) => wave.forEach((cell) => map.set(cell, index)))
    return map
  }, [chain])
  const armed = bombs.reduce((total, bomb) => total + (bomb ? 1 : 0), 0)
  const frozen = paused || settled !== null || chain !== null

  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => {
    if (!chain || paused) return
    const timer = window.setTimeout(() => setChain(null), 420 + chain.waves.length * 160)
    return () => window.clearTimeout(timer)
  }, [chain, paused])

  const restart = () => {
    if (paused) return
    audio.play('select')
    setChain(null)
    setBombs(puzzle.bombs)
    setDetonations(0)
    setAttempt(0)
    setLives(LIVES_PER_LEVEL)
    setSettled(null)
    setAnnounce('')
  }

  const detonate = (cell: number) => {
    if (frozen) return
    const row = Math.floor(cell / spec.cols) + 1
    const col = (cell % spec.cols) + 1
    if (puzzle.locked[cell]) {
      audio.play('mismatch')
      setAnnounce(`第${row}行第${col}列已锁定，无法直接起爆`)
      return
    }
    const result = simulateChain(bombs, puzzle.locked, spec.cols, spec.rows, cell)
    const cleared = new Set(result.cleared)
    const nextBombs = bombs.map((bomb, index) => bomb && !cleared.has(index))
    const nextDetonations = detonations + 1
    const nextAttempt = attempt + 1
    const total = scoreFor(nextDetonations, lives)
    setBombs(nextBombs)
    setDetonations(nextDetonations)
    setAttempt(nextAttempt)
    audio.play('select')
    if (result.waves.length > 1) audio.play('match')
    if (result.waves.length) setChain({ waves: result.waves })
    emit({ type: 'score', score: total })
    const at = `第${row}行第${col}列起爆，波及 ${result.cleared.length} 枚雷管`
    if (nextBombs.every((bomb) => !bomb)) {
      setAnnounce(`${at}，雷区全清！`)
      setSettled('win')
      audio.play('win')
      emit({ type: 'completed', score: total })
      return
    }
    if (isBudgetSpent(nextAttempt, puzzle.budget)) {
      const nextLives = lives - 1
      setLives(nextLives)
      if (nextLives <= 0) {
        setAnnounce(`${at}，引信耗尽`)
        setSettled('lost')
        audio.play('lose')
        emit({ type: 'failed', score: failedScore(nextDetonations) })
        return
      }
      audio.play('mismatch')
      setAnnounce(`${at}，预算耗尽，扣除一条命，雷区重置`)
      setChain(null)
      setBombs(puzzle.bombs)
      setAttempt(0)
      return
    }
    setAnnounce(at)
  }

  return (
    <div className={`fuse-game mode-${spec.mode}`} aria-label="雷管连锁游戏区">
      <div className="fuse-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · 第{spec.chapter}章</span>
        <strong>{attempt}{puzzle.budget ? ` / ${puzzle.budget}` : ''} 次起爆 · 参考 {puzzle.par}</strong>
      </div>
      <div className="fuse-rule">
        <span>{spec.locks ? <Lock size={14} /> : <Bomb size={14} />}{spec.title}</span>
        <small>{spec.detail}</small>
        {puzzle.budget !== undefined && <em>预算 {puzzle.budget}</em>}
        {spec.locks > 0 && <em>锁定 {spec.locks}</em>}
        <em>雷管 {armed}</em>
        <em>累计 {detonations}</em>
        <span className="fuse-lives" aria-label={`剩余 ${lives} 条命`}>
          {Array.from({ length: LIVES_PER_LEVEL }, (_, index) => (
            <Heart key={index} size={14} className={index < lives ? 'is-on' : ''} />
          ))}
        </span>
      </div>
      <div className="fuse-grid" style={{ '--fuse-cols': spec.cols } as CSSProperties}>
        {bombs.map((bomb, index) => {
          const locked = puzzle.locked[index]
          const wave = waveOf.get(index)
          const row = Math.floor(index / spec.cols) + 1
          const col = (index % spec.cols) + 1
          return (
            <button
              key={index}
              className={`fuse-cell ${bomb ? 'is-armed' : ''} ${locked ? 'is-locked' : ''} ${wave !== undefined ? 'is-blast' : ''}`}
              style={wave !== undefined ? ({ '--fuse-wave': wave } as CSSProperties) : undefined}
              onClick={() => detonate(index)}
              disabled={frozen}
              aria-label={`第${row}行第${col}列，${locked ? '锁定雷管' : bomb ? '雷管' : '空格'}`}
            >
              {bomb && (locked ? <Lock size={15} /> : <Bomb size={15} />)}
            </button>
          )
        })}
      </div>
      <div className="fuse-actions">
        <button className="fuse-restart" onClick={restart} disabled={paused}>
          <RotateCcw size={17} />重开本关
        </button>
      </div>
      <p className="fuse-live" aria-live="polite">{announce}</p>
      {settled && (
        <div className="fuse-stamp" role="status">
          <span>{settled === 'win' ? 'CHAIN COMPLETE' : 'OUT OF FUSES'}</span>
          <strong>{settled === 'win' ? `连锁全清 · ${scoreFor(detonations, lives)}` : `引信耗尽 · ${failedScore(detonations)}`}</strong>
          <button className="fuse-again" onClick={restart}><RotateCcw size={15} />再来一次</button>
        </div>
      )}
    </div>
  )
}

export default function FuseChainGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(FUSE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const puzzle = useMemo(() => createFusePuzzle(levelNumber), [levelNumber])
  return <FuseSession key={levelNumber} puzzle={puzzle} paused={paused} muted={muted} emit={emit} />
}
