import { useEffect, useMemo, useState } from 'react'
import { Droplets, EyeOff, Gauge, LockKeyhole, RotateCcw } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { computeFlow, generateAquaPuzzle, pipeDegree, rotateMask, type AquaPuzzle } from './logic'
import { AQUA_LEVEL_COUNT, getAquaLevel } from './levels'
import './aqueduct.css'

const scoreFor = (moves: number, par: number) => Math.max(100, 1000 - Math.max(0, moves - par) * 12)
const STUB_CLASS = ['aq-stub-n', 'aq-stub-e', 'aq-stub-s', 'aq-stub-w']

interface Run {
  readonly puzzle: AquaPuzzle
  readonly turns: number[]
  readonly moves: number
  readonly failed: boolean
}

const freshRun = (level: number): Run => {
  const puzzle = generateAquaPuzzle(level)
  return { puzzle, turns: [...puzzle.turns0], moves: 0, failed: false }
}

export default function AqueductGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(AQUA_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getAquaLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [run, setRun] = useState<Run>(() => freshRun(levelNumber))
  const [won, setWon] = useState(false)

  useEffect(() => audio.setMuted(muted), [audio, muted])
  useEffect(() => { emit({ type: 'ready' }); emit({ type: 'started' }) }, [emit])

  const { puzzle } = run
  const masks = useMemo(() => puzzle.base.map((mask, index) => rotateMask(mask, run.turns[index] ?? 0)), [puzzle, run.turns])
  const flow = useMemo(() => computeFlow(puzzle.rows, puzzle.cols, masks, puzzle.sources), [masks, puzzle.rows, puzzle.cols, puzzle.sources])
  const sourceSet = useMemo(() => new Set(puzzle.sources), [puzzle.sources])
  const frozen = paused || won || run.failed

  const rotate = (index: number) => {
    if (frozen) return
    if (puzzle.locked[index]) { audio.play('mismatch'); return }
    const turns = [...run.turns]
    turns[index] = (turns[index] ?? 0) + 1
    const moves = run.moves + 1
    const nextMasks = puzzle.base.map((mask, cell) => rotateMask(mask, turns[cell] ?? 0))
    const nextFlow = computeFlow(puzzle.rows, puzzle.cols, nextMasks, puzzle.sources)
    const failed = puzzle.budget !== undefined && !nextFlow.solved && moves >= puzzle.budget
    setRun({ puzzle, turns, moves, failed })
    audio.play('step')
    emit({ type: 'score', score: scoreFor(moves, puzzle.par) })
    if (nextFlow.solved) {
      setWon(true)
      audio.play('win')
      emit({ type: 'completed', score: scoreFor(moves, puzzle.par) })
    } else if (failed) {
      audio.play('lose')
      emit({ type: 'failed', score: scoreFor(moves, puzzle.par) })
    }
  }

  const restart = () => emit({ type: 'request-restart' })

  return (
    <div className={`aq-game ch${spec.chapter}${run.failed ? ' is-failed' : ''}${won ? ' is-won' : ''}`} aria-label="连线水网游戏区">
      <div className="aq-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · {spec.rows}×{spec.cols}{spec.dual ? ' · 双源' : ''}</span>
        <strong>{run.moves}{puzzle.budget !== undefined ? ` / ${puzzle.budget}` : ''} 步 · 参考 {puzzle.par}</strong>
      </div>
      <div className="aq-rule">
        <span>{spec.fog ? <EyeOff size={14} /> : puzzle.locked.some(Boolean) ? <LockKeyhole size={14} /> : puzzle.budget !== undefined ? <Gauge size={14} /> : <Droplets size={14} />}{spec.title}</span>
        <small>{spec.detail}</small>
        {puzzle.budget !== undefined && <em className={run.failed ? 'is-over' : ''}>{run.failed ? '水压耗尽' : `预算 ${puzzle.budget}`}</em>}
        {won && <em className="is-gold">水网贯通</em>}
      </div>
      <div className="aq-board" style={{ '--aq-cols': puzzle.cols } as React.CSSProperties}>
        {puzzle.base.map((base, index) => {
          const wet = flow.wet[index]
          const turns = run.turns[index] ?? 0
          const locked = puzzle.locked[index]
          const isSource = sourceSet.has(index)
          const isSink = !isSource && pipeDegree(base) === 1
          return (
            <button
              key={index}
              className={`aq-cell${wet ? ' is-wet' : ''}${spec.fog && !wet ? ' is-dim' : ''}${locked ? ' is-locked' : ''}${isSource ? ' is-source' : ''}${isSink ? ' is-sink' : ''}${flow.leaks[index] ? ' is-leaking' : ''}`}
              style={{ '--turns': `${turns * 90}deg`, '--cell-index': index } as React.CSSProperties}
              onClick={() => rotate(index)}
              disabled={locked}
              aria-label={`管道 ${index + 1}${isSource ? '（源头）' : isSink ? '（汇点）' : ''}${locked ? '，已焊死' : ''}，${wet ? '已通水' : '未通水'}`}
              aria-pressed={wet}
            >
              <span className="aq-rotor">
                {[0, 1, 2, 3].filter((dir) => (base & (1 << dir)) !== 0).map((dir) => (
                  <span key={dir} className={`aq-stub ${STUB_CLASS[dir]}${(flow.leakDirs[index] & (1 << ((dir + turns) % 4))) !== 0 ? ' is-dripping' : ''}`} />
                ))}
                <span className="aq-core" />
              </span>
              {isSource && <span className="aq-mark">源</span>}
              {isSink && <span className="aq-mark">汇</span>}
            </button>
          )
        })}
      </div>
      <div className="aq-actions">
        <button className="aq-restart" onClick={restart}><RotateCcw size={17} />重开本关</button>
        <span className="aq-legend">{run.failed ? '超出预算：水网未能贯通' : won ? '每一处汇点都喝到了水' : `还有 ${puzzle.rows * puzzle.cols - flow.filled} 格未通水`}</span>
      </div>
    </div>
  )
}
