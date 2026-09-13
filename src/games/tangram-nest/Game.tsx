import { useEffect, useMemo, useState } from 'react'
import { Eraser, Heart, LockKeyhole, RotateCcw, RotateCw, Shapes } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { applyPlace, applyRemove, applyRotate, blockCells, coveredOwner, createTangramState, judgeTangram, MAX_MISSES, scoreFor, TANGRAM_COLORS, type TangramState } from './logic'
import { getTangramLevel, TANGRAM_LEVELS } from './levels'
import './tangram-nest.css'

export default function TangramNestGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(TANGRAM_LEVELS, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const spec = useMemo(() => getTangramLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [state, setState] = useState<TangramState>(() => createTangramState(spec))
  const [selected, setSelected] = useState<number | null>(null)
  const [done, setDone] = useState<'won' | 'lost' | null>(null)
  const [loaded, setLoaded] = useState(spec)
  if (loaded !== spec) {
    setLoaded(spec)
    setState(createTangramState(spec))
    setSelected(null)
    setDone(null)
  }

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  const owner = useMemo(() => coveredOwner(spec.rows, spec.cols, spec.blocks, state.orientations, state.placements), [spec, state])
  const scoreNow = (next: TangramState) => scoreFor(next.ops, spec.par, next.misses)

  const win = (next: TangramState) => {
    audio.play('win')
    setDone('won')
    emit({ type: 'completed', score: scoreNow(next) })
  }
  const fail = (next: TangramState) => {
    audio.play('lose')
    setDone('lost')
    emit({ type: 'failed', score: scoreNow(next) })
  }
  const afterOp = (next: TangramState) => {
    emit({ type: 'score', score: scoreNow(next) })
    if (judgeTangram(spec.rows, spec.cols, spec.blocks, next.orientations, next.placements).solved) {
      win(next)
      return
    }
    if (spec.moveLimit !== undefined && next.ops >= spec.moveLimit) fail(next)
  }

  const onCell = (cell: number) => {
    if (paused || done) return
    const holder = owner[cell]
    if (holder >= 0) {
      if (spec.fixed.includes(holder)) {
        audio.play('mismatch')
        return
      }
      const removed = applyRemove(spec, state, holder)
      if (removed.applied) {
        setState(removed.state)
        setSelected(holder)
        audio.play('select')
      }
      return
    }
    if (selected === null) {
      audio.play('select')
      return
    }
    const result = applyPlace(spec, state, selected, cell)
    setState(result.state)
    if (!result.applied) {
      audio.play('mismatch')
      emit({ type: 'score', score: scoreNow(result.state) })
      if (result.state.misses >= MAX_MISSES) fail(result.state)
      return
    }
    setSelected(null)
    audio.play('match')
    afterOp(result.state)
  }

  const onPiece = (id: number) => {
    if (paused || done) return
    if (selected === id) {
      const result = applyRotate(spec, state, id)
      if (result.applied) {
        setState(result.state)
        audio.play('step')
        afterOp(result.state)
      } else audio.play('mismatch')
      return
    }
    setSelected(id)
    audio.play('select')
  }

  const reset = () => {
    if (paused || done) return
    setState(createTangramState(spec))
    setSelected(null)
    audio.play('mismatch')
  }

  const cells = Array.from({ length: spec.rows * spec.cols }, (_, cell) => cell)
  const palette = spec.blocks.filter((block) => !spec.fixed.includes(block.id) && state.placements[block.id] === null)
  const lives = Math.max(0, MAX_MISSES - state.misses)
  const lostByBudget = done === 'lost' && spec.moveLimit !== undefined && state.ops >= spec.moveLimit
  return (
    <div className="tangram-game" aria-label="七巧拼界游戏区">
      <div className="tg-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章</span>
        <strong>{state.ops}{spec.moveLimit ? ` / ${spec.moveLimit}` : ` · 参考 ${spec.par}`} 步</strong>
        <span className="tg-lives" aria-label={`剩余 ${lives} 次机会`}>
          {Array.from({ length: MAX_MISSES }, (_, heart) => <Heart key={heart} size={13} className={heart < lives ? 'is-on' : ''} />)}
        </span>
      </div>
      <div className="tg-rule">
        <span><Shapes size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.fixed.length > 0 && <em><LockKeyhole size={11} />定桩 {spec.fixed.length}</em>}
      </div>
      <div className="tg-stage">
        <div
          className="tg-board" style={{ '--tg-cols': spec.cols, '--tg-rows': spec.rows, aspectRatio: `${spec.cols} / ${spec.rows}` } as React.CSSProperties}
        >
          {cells.map((cell) => {
            const holder = owner[cell]
            const className = [
              'tg-cell',
              holder >= 0 ? 'is-filled' : '',
              holder >= 0 && spec.fixed.includes(holder) ? 'is-fixed' : '',
              selected !== null && holder < 0 ? 'is-armed' : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={cell} type="button" className={className} disabled={Boolean(done)}
                style={{ '--block-color': holder >= 0 ? TANGRAM_COLORS[spec.blocks[holder].color] : 'transparent' } as React.CSSProperties}
                onClick={() => onCell(cell)}
                aria-label={`拼台第 ${Math.floor(cell / spec.cols) + 1} 行第 ${(cell % spec.cols) + 1} 列${holder >= 0 ? '，已有色块' : ''}`}
              />
            )
          })}
        </div>
        <div className="tg-side">
          <div className="tg-palette-head">
            <span>待放色块 {palette.length}</span>
            <button
              className="tg-mini" type="button" onClick={() => selected !== null && onPiece(selected)}
              disabled={paused || Boolean(done) || selected === null || spec.rotateLocked}
            ><RotateCw size={13} />旋转90°</button>
          </div>
          <div className="tg-palette">
            {palette.map((block) => {
              const shape = blockCells(block, state.orientations[block.id])
              const height = Math.max(...shape.map((spot) => spot[0])) + 1
              const width = Math.max(...shape.map((spot) => spot[1])) + 1
              const grid = Array.from({ length: height * width }, (_, index) => shape.some(([r, c]) => r * width + c === index))
              return (
                <button
                  key={block.id} type="button" aria-pressed={selected === block.id}
                  className={`tg-piece ${selected === block.id ? 'is-selected' : ''}`}
                  style={{ '--piece-cols': width, '--block-color': TANGRAM_COLORS[block.color] } as React.CSSProperties}
                  onClick={() => onPiece(block.id)}
                  aria-label={`色块 ${block.family} 形 ${block.size} 格${selected === block.id ? '，已选中再点旋转' : ''}`}
                >
                  {grid.map((filled, index) => <i key={index} className={filled ? 'is-on' : ''} />)}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="tg-actions">
        <button className="tg-button" type="button" onClick={reset} disabled={paused || Boolean(done)}><Eraser size={17} />清空重摆</button>
        <button className="tg-button" type="button" onClick={() => emit({ type: 'request-restart' })} disabled={paused}><RotateCcw size={17} />重开本关</button>
      </div>
      {done && <div className={`tg-banner ${done === 'lost' ? 'is-lost' : ''}`}>{done === 'won' ? '拼合完璧 · 剪影填满' : lostByBudget ? '预算耗尽 · 拼台蒙尘' : '三次失误 · 色块散落'}</div>}
    </div>
  )
}
