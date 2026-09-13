import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CloudFog, CloudLightning, Flower2, RotateCcw, Undo2 } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import {
  areNeighbors, dirBetween, generateCloudPuzzle, MAX_MISTAKES, REVEAL_MS, scoreFor, validatePath,
  type CloudPuzzle,
} from './logic'
import { CLOUD_LEVEL_COUNT, getCloudLevel } from './levels'
import './cloud-yard.css'

interface Run {
  readonly puzzle: CloudPuzzle
  readonly path: readonly number[]
  readonly mistakes: number
  readonly failed: boolean
}

const freshRun = (level: number): Run => {
  const puzzle = generateCloudPuzzle(level)
  return { puzzle, path: [puzzle.start], mistakes: 0, failed: false }
}

export default function CloudYardGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(CLOUD_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getCloudLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [run, setRun] = useState<Run>(() => freshRun(levelNumber))
  const [won, setWon] = useState(false)
  const [fogHidden, setFogHidden] = useState(false)
  const pathRef = useRef<readonly number[]>(run.path)
  const drawingRef = useRef(false)
  const boardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => audio.setMuted(muted), [audio, muted])
  useEffect(() => { emit({ type: 'ready' }); emit({ type: 'started' }) }, [emit])
  useEffect(() => {
    if (!run.puzzle.fog || paused || won || run.failed) return
    const timer = window.setTimeout(() => setFogHidden(true), REVEAL_MS)
    return () => window.clearTimeout(timer)
  }, [paused, run.failed, run.puzzle.fog, won])

  const { puzzle } = run
  const steps = run.path.length - 1
  const frozen = paused || won || run.failed
  const anchorSet = useMemo(() => new Set(puzzle.anchors), [puzzle])
  const anchorsHit = run.path.filter((cell) => anchorSet.has(cell)).length
  const pathSides = useMemo(() => {
    const mask = Array.from({ length: puzzle.rows * puzzle.cols }, () => 0)
    run.path.forEach((cell, index) => {
      if (index > 0) mask[cell] |= 1 << dirBetween(cell, run.path[index - 1], puzzle.cols)
      if (index < run.path.length - 1) mask[cell] |= 1 << dirBetween(cell, run.path[index + 1], puzzle.cols)
    })
    return mask
  }, [puzzle, run.path])

  const stepTo = (cell: number, dragging: boolean) => {
    if (frozen) return
    const path = pathRef.current
    const end = path[path.length - 1]
    let next: number[] | null = null
    let cue: 'select' | 'step' = 'select'
    if (path.length >= 2 && cell === path[path.length - 2]) {
      next = path.slice(0, -1)
      cue = 'step'
    } else if (cell !== end && areNeighbors(cell, end, puzzle.cols) && !path.includes(cell) && !puzzle.storms[cell] && path.length - 1 < puzzle.budget) {
      next = [...path, cell]
    }
    if (!next) {
      if (!dragging) audio.play('mismatch')
      return
    }
    pathRef.current = next
    setRun({ ...run, path: next })
    audio.play(cue)
    emit({ type: 'score', score: scoreFor(next.length - 1, puzzle.par, run.mistakes) })
  }

  const applyCell = (target: number, dragging: boolean) => {
    for (let guard = 0; guard < 100; guard += 1) {
      const path = pathRef.current
      const from = path[path.length - 1]
      if (from === target) return
      const dr = Math.floor(target / puzzle.cols) - Math.floor(from / puzzle.cols)
      const dc = (target % puzzle.cols) - (from % puzzle.cols)
      const next = dr !== 0 && Math.abs(dr) >= Math.abs(dc) ? from + Math.sign(dr) * puzzle.cols : from + Math.sign(dc)
      stepTo(next, dragging)
      if (pathRef.current === path) return
    }
  }

  const cellFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const board = boardRef.current
    if (!board) return -1
    const rect = board.getBoundingClientRect()
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * puzzle.cols)
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * puzzle.rows)
    if (col < 0 || col >= puzzle.cols || row < 0 || row >= puzzle.rows) return -1
    return row * puzzle.cols + col
  }

  const undo = () => {
    if (frozen || pathRef.current.length < 2) return
    const next = pathRef.current.slice(0, -1)
    pathRef.current = next
    setRun({ ...run, path: next })
    audio.play('step')
    emit({ type: 'score', score: scoreFor(next.length - 1, puzzle.par, run.mistakes) })
  }

  const submit = () => {
    if (frozen) return
    if (validatePath(puzzle, pathRef.current) === 'ok') {
      setWon(true)
      audio.play('win')
      emit({ type: 'completed', score: scoreFor(steps, puzzle.par, run.mistakes) })
      return
    }
    const mistakes = run.mistakes + 1
    const failed = mistakes >= MAX_MISTAKES
    setRun({ ...run, mistakes, failed })
    if (failed) {
      audio.play('lose')
      emit({ type: 'failed', score: scoreFor(steps, puzzle.par, mistakes) })
      return
    }
    audio.play('mismatch')
    emit({ type: 'score', score: scoreFor(steps, puzzle.par, mistakes) })
  }

  const cells = Array.from({ length: puzzle.rows * puzzle.cols }, (_, cell) => cell)
  return (
    <div className={`cy-game ch${spec.chapter}${puzzle.fog ? ' is-fog' : ''}${fogHidden ? ' is-veiled' : ''}${won ? ' is-won' : ''}${run.failed ? ' is-failed' : ''}`} aria-label="云汐花园游戏区">
      <div className="cy-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · {spec.rows}×{spec.cols}{puzzle.storms.some(Boolean) ? ' · 风暴' : ''}</span>
        <strong>{steps} / {puzzle.budget} 步 · 参考 {puzzle.par}</strong>
      </div>
      <div className="cy-rule">
        <span>{puzzle.fog ? <CloudFog size={14} /> : puzzle.storms.some(Boolean) ? <CloudLightning size={14} /> : <Flower2 size={14} />}{spec.title}</span>
        <small>{spec.detail}</small>
        <em className={run.failed ? 'is-over' : anchorsHit === puzzle.anchors.length ? 'is-gold' : ''}>{run.failed ? '护盾耗尽' : `护盾 ${MAX_MISTAKES - run.mistakes}`}</em>
      </div>
      <div
        ref={boardRef}
        className="cy-board"
        style={{ '--cy-cols': puzzle.cols } as React.CSSProperties}
        onPointerDown={(event) => { if (frozen || event.button > 0) return; drawingRef.current = true; const cell = cellFromEvent(event); if (cell >= 0) applyCell(cell, false) }}
        onPointerMove={(event) => { if (!drawingRef.current || frozen) return; const cell = cellFromEvent(event); if (cell >= 0) applyCell(cell, true) }}
        onPointerUp={() => { drawingRef.current = false }}
        onPointerLeave={() => { drawingRef.current = false }}
        onPointerCancel={() => { drawingRef.current = false }}
      >
        {cells.map((cell) => {
          const row = Math.floor(cell / puzzle.cols)
          const col = cell % puzzle.cols
          const onPath = run.path.includes(cell)
          const cls = [
            'cy-cell',
            onPath ? 'is-path' : '',
            cell === run.path[run.path.length - 1] ? 'is-head' : '',
            cell === puzzle.start ? 'is-start' : '',
            anchorSet.has(cell) ? 'is-anchor' : '',
            puzzle.storms[cell] ? 'is-storm' : '',
          ].filter(Boolean).join(' ')
          return (
            <div key={cell} className={cls} style={{ '--cell-index': cell } as React.CSSProperties} aria-label={`第 ${row + 1} 行第 ${col + 1} 列：${puzzle.storms[cell] ? '风暴格' : cell === puzzle.start ? '起点' : anchorSet.has(cell) ? '锚点' : '空格'}${onPath ? '，云径已经过' : ''}`}>
              {[0, 1, 2, 3].filter((side) => (pathSides[cell] & (1 << side)) !== 0).map((side) => (
                <span key={side} className={`cy-link cy-side-${side}`} />
              ))}
              {anchorSet.has(cell) && <span className="cy-anchor-dot" />}
              {puzzle.storms[cell] && <span className="cy-storm-plate" />}
              {cell === puzzle.start && <span className="cy-start-core" />}
            </div>
          )
        })}
      </div>
      <div className="cy-actions">
        <button className="cy-submit" onClick={submit} disabled={frozen}><Check size={17} />收笔</button>
        <button className="cy-undo" onClick={undo} disabled={frozen || steps < 1}><Undo2 size={17} />撤销</button>
        <button className="cy-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
        <span className="cy-legend">{won ? '云径成线，锚点尽收' : run.failed ? '云径中断，护盾耗尽' : `锚点 ${anchorsHit} / ${puzzle.anchors.length} · 步数 ${steps} / ${puzzle.budget}`}</span>
      </div>
    </div>
  )
}
