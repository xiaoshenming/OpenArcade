import { useEffect, useMemo, useRef, useState } from 'react'
import { Coins, Landmark, Layers, LockKeyhole, Palette, RotateCcw } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { prefersReducedMotion, tween } from '../../platform/motion'
import { canMove, colorOf, createBoard, isSolved, move, scoreFor, type Board } from './logic'
import { getPagodaLevel } from './levels'
import './pagoda-stack.css'

const modeIcons = { classic: Layers, rationed: Coins, quad: Landmark, sealed: LockKeyhole, rainbow: Palette } as const

export default function PagodaGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const spec = useMemo(() => getPagodaLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const pegRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [board, setBoard] = useState<Board>(() => createBoard(spec.pegs, spec.discs))
  const [selected, setSelected] = useState<number | null>(null)
  const [moves, setMoves] = useState(0)
  const [failed, setFailed] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [loadedSpec, setLoadedSpec] = useState(spec)
  if (loadedSpec !== spec) {
    setLoadedSpec(spec)
    setBoard(createBoard(spec.pegs, spec.discs))
    setSelected(null)
    setMoves(0)
    setFailed(false)
    setCompleted(false)
  }

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => audio.setMuted(muted), [audio, muted])

  const sealed = spec.lockedPeg !== undefined && moves < (spec.unlockAfter ?? 0)
  const lockedNow = sealed ? spec.lockedPeg : undefined

  useEffect(() => {
    if (!completed) return
    audio.play('win')
    emit({ type: 'completed', score: scoreFor(moves, spec.par) })
  }, [audio, completed, emit, moves, spec.par])

  const rejectPeg = (index: number) => {
    const element = pegRefs.current[index]
    if (!element || prefersReducedMotion()) return
    void tween(element, [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-9px)' },
      { transform: 'translateX(8px)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(0)' },
    ], { duration: 380, easing: 'spring' })
  }

  const choosePeg = (index: number) => {
    if (paused || completed || failed) return
    const lockedPeg = sealed ? spec.lockedPeg : undefined
    if (lockedPeg === index) {
      audio.play('mismatch')
      rejectPeg(index)
      return
    }
    if (selected === null) {
      if (!board[index].length) {
        rejectPeg(index)
        return
      }
      setSelected(index)
      audio.play('select')
      return
    }
    if (selected === index) {
      setSelected(null)
      return
    }
    if (!canMove(board, selected, index, { rainbow: spec.rainbow, lockedPeg })) {
      audio.play('mismatch')
      rejectPeg(index)
      return
    }
    const next = move(board, selected, index, { rainbow: spec.rainbow, lockedPeg })
    const nextMoves = moves + 1
    setSelected(null)
    setBoard(next)
    setMoves(nextMoves)
    audio.play('step')
    emit({ type: 'score', score: scoreFor(nextMoves, spec.par) })
    if (isSolved(next)) {
      setCompleted(true)
      return
    }
    if (spec.budget !== undefined && nextMoves >= spec.budget) {
      setFailed(true)
      audio.play('lose')
      emit({ type: 'failed', score: scoreFor(nextMoves, spec.par) })
    }
  }

  const restart = () => {
    if (paused) return
    emit({ type: 'request-restart' })
  }

  const Icon = modeIcons[spec.mode]
  const remaining = Math.max(0, (spec.unlockAfter ?? 0) - moves)
  return (
    <div className={`pagoda-game mode-${spec.mode}`} aria-label="梵塔秘录游戏区">
      <div className="game-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {spec.par} 步</span>
        <strong>{moves}{spec.budget ? ` / ${spec.budget}` : ''} 步</strong>
      </div>
      <div className="pagoda-rule">
        <span><Icon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {sealed && <em>解封还差 {remaining} 步</em>}
        {spec.rainbow && <em>同色不相邻</em>}
      </div>
      <div className="peg-board" style={{ '--peg-rows': spec.discs } as React.CSSProperties}>
        {board.map((stack, index) => {
          const locked = lockedNow === index
          return (
            <button
              key={index}
              ref={(element) => { pegRefs.current[index] = element }}
              className={`peg ${selected === index ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}`}
              onClick={() => choosePeg(index)}
              disabled={paused || locked}
              aria-pressed={selected === index}
              aria-label={`第 ${index + 1} 柱，${stack.length} 枚盘${locked ? '，封印中' : ''}`}
            >
              <span className="peg-rod" />
              <span className="peg-stack">
                {stack.map((disc, slot) => (
                  <span
                    key={disc}
                    className={`peg-disc ${spec.rainbow ? `tone-${colorOf(disc)}` : `sheen-${colorOf(disc)}`}${selected === index && slot === stack.length - 1 ? ' is-top' : ''}`}
                    style={{ '--slot': slot, '--ratio': disc / spec.discs } as React.CSSProperties}
                  />
                ))}
              </span>
              <span className="peg-base" />
              {locked && <span className="peg-lock"><LockKeyhole size={13} />{remaining}</span>}
            </button>
          )
        })}
      </div>
      <div className="game-actions">
        <button className="game-icon-button" onClick={restart} disabled={paused}><RotateCcw size={18} /><span>重开本关</span></button>
      </div>
      {(completed || failed) && (
        <div className={`end-stamp ${failed ? 'is-lose' : 'is-win'}`}>
          <span>{failed ? '步数耗尽' : '梵塔告成'}</span>
          <strong>{scoreFor(moves, spec.par)}</strong>
          <small>{moves} 步 · 参考 {spec.par} 步{failed ? ' · 重开再战' : ''}</small>
        </div>
      )}
    </div>
  )
}
