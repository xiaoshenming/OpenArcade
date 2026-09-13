import { useEffect, useMemo, useState } from 'react'
import { EyeOff, Gauge, Radar, RotateCcw, Split, Zap } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import {
  coversAll, generateBeamPuzzle, KIND_NAMES, MAX_MISTAKES, PIECE_MIRROR_B, PIECE_NONE,
  PIECE_SPLIT_A, PIECE_SPLIT_B, scoreFor, traceBeam, type BeamPuzzle,
} from './logic'
import { BEAM_LEVEL_COUNT, getBeamLevel } from './levels'
import './beam-fold.css'

interface Run {
  readonly puzzle: BeamPuzzle
  readonly placed: readonly number[]
  readonly ops: number
  readonly mistakes: number
  readonly failed: boolean
}

const freshRun = (level: number): Run => {
  const puzzle = generateBeamPuzzle(level)
  return { puzzle, placed: puzzle.slots.map(() => PIECE_NONE), ops: 0, mistakes: 0, failed: false }
}

const beamLayout = (puzzle: BeamPuzzle, placed: readonly number[]) => {
  const pieces = Array.from({ length: puzzle.rows * puzzle.cols }, () => PIECE_NONE)
  puzzle.slots.forEach((cell, slot) => { pieces[cell] = placed[slot] ?? PIECE_NONE })
  return traceBeam(puzzle.rows, puzzle.cols, pieces, puzzle.blocks, puzzle.source, puzzle.sourceDir)
}

export default function BeamFoldGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(BEAM_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getBeamLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [run, setRun] = useState<Run>(() => freshRun(levelNumber))
  const [won, setWon] = useState(false)

  useEffect(() => audio.setMuted(muted), [audio, muted])
  useEffect(() => { emit({ type: 'ready' }); emit({ type: 'started' }) }, [emit])

  const { puzzle } = run
  const trace = useMemo(() => beamLayout(puzzle, run.placed), [puzzle, run.placed])
  const litTargets = puzzle.targets.filter((cell) => trace.lit[cell]).length
  const allLit = coversAll(trace, puzzle.targets)
  const frozen = paused || won || run.failed
  const slotOf = useMemo(() => {
    const map = new Map<number, number>()
    puzzle.slots.forEach((cell, index) => map.set(cell, index))
    return map
  }, [puzzle])

  const cycle = (slot: number) => {
    if (frozen) return
    const placed = [...run.placed]
    placed[slot] = ((placed[slot] ?? PIECE_NONE) + 1) % (puzzle.allowSplitter ? 5 : 3)
    const ops = run.ops + 1
    const complete = coversAll(beamLayout(puzzle, placed), puzzle.targets)
    const failed = puzzle.budget !== undefined && !complete && ops >= puzzle.budget
    setRun({ puzzle, placed, ops, mistakes: run.mistakes, failed })
    if (failed) {
      audio.play('lose')
      emit({ type: 'failed', score: scoreFor(ops, puzzle.par, run.mistakes) })
      return
    }
    audio.play(complete ? 'match' : 'select')
    emit({ type: 'score', score: scoreFor(ops, puzzle.par, run.mistakes) })
  }

  const submit = () => {
    if (frozen) return
    if (allLit) {
      setWon(true)
      audio.play('win')
      emit({ type: 'completed', score: scoreFor(run.ops, puzzle.par, run.mistakes) })
      return
    }
    const mistakes = run.mistakes + 1
    const failed = mistakes >= MAX_MISTAKES
    setRun({ ...run, mistakes, failed })
    if (failed) {
      audio.play('lose')
      emit({ type: 'failed', score: scoreFor(run.ops, puzzle.par, mistakes) })
      return
    }
    audio.play('mismatch')
    emit({ type: 'score', score: scoreFor(run.ops, puzzle.par, mistakes) })
  }

  const cells = Array.from({ length: puzzle.rows * puzzle.cols }, (_, cell) => cell)
  return (
    <div className={`bf-game ch${spec.chapter}${puzzle.blackBox ? ' is-blackbox' : ''}${won ? ' is-won' : ''}${run.failed ? ' is-failed' : ''}`} aria-label="光束折跃游戏区">
      <div className="bf-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · {spec.rows}×{spec.cols}{puzzle.allowSplitter ? ' · 分光' : ''}</span>
        <strong>{run.ops}{puzzle.budget !== undefined ? ` / ${puzzle.budget}` : ''} 操作 · 参考 {puzzle.par}</strong>
      </div>
      <div className="bf-rule">
        <span>{puzzle.blackBox ? <EyeOff size={14} /> : puzzle.allowSplitter ? <Split size={14} /> : puzzle.budget !== undefined ? <Gauge size={14} /> : <Radar size={14} />}{spec.title}</span>
        <small>{spec.detail}</small>
        <em className={run.failed ? 'is-over' : allLit ? 'is-gold' : ''}>{run.failed ? '护盾耗尽' : allLit ? '可以折跃' : `护盾 ${MAX_MISTAKES - run.mistakes}`}</em>
      </div>
      <div className="bf-board" style={{ '--bf-cols': puzzle.cols } as React.CSSProperties}>
        {cells.map((cell) => {
          const slot = slotOf.get(cell)
          const kind = slot !== undefined ? run.placed[slot] ?? PIECE_NONE : PIECE_NONE
          const isSource = cell === puzzle.source
          const cls = [
            'bf-cell',
            slot !== undefined ? 'is-slot' : '',
            puzzle.blocks[cell] ? 'is-block' : '',
            puzzle.targets.includes(cell) ? 'is-target' : '',
            isSource ? 'is-source' : '',
            trace.lit[cell] ? 'is-lit' : '',
          ].filter(Boolean).join(' ')
          const body = (
            <>
              {[0, 1, 2, 3].filter((side) => (trace.beams[cell] & (1 << side)) !== 0).map((side) => (
                <span key={side} className={`bf-beam bf-side-${side}`} />
              ))}
              {slot !== undefined && kind !== PIECE_NONE && (
                <span className={`bf-piece${kind === PIECE_MIRROR_B || kind === PIECE_SPLIT_B ? ' is-flip' : ''}${kind >= PIECE_SPLIT_A ? ' is-split' : ''}`} />
              )}
              {puzzle.blocks[cell] && <span className="bf-plate" />}
              {puzzle.targets.includes(cell) && <span className={`bf-tick${trace.lit[cell] ? ' is-on' : ''}`} />}
              {isSource && <span className="bf-emitter" />}
            </>
          )
          if (slot === undefined) return <div key={cell} className={cls} style={{ '--cell-index': cell } as React.CSSProperties}>{body}</div>
          return (
            <button
              key={cell}
              className={cls}
              style={{ '--cell-index': cell } as React.CSSProperties}
              onClick={() => cycle(slot)}
              disabled={frozen}
              aria-label={`镜位 ${cell + 1}：${KIND_NAMES[kind]}`}
              aria-pressed={kind !== PIECE_NONE}
            >
              {body}
            </button>
          )
        })}
      </div>
      <div className="bf-actions">
        <button className="bf-submit" onClick={submit} disabled={frozen}><Zap size={17} />折跃</button>
        {/* 重开是失败/卡死后的唯一出口,因此有意不随 frozen 禁用 */}
        <button className="bf-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
        <span className="bf-legend">
          {won ? '全部目标点亮，光束折跃成功' : run.failed ? '光路崩塌，目标仍未全亮' : `已点亮 ${litTargets} / ${puzzle.targets.length} 个目标格`}
        </span>
      </div>
    </div>
  )
}
