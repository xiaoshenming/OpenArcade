import { useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, LockKeyhole, RotateCcw, Sparkles } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { judgeVine, ownerOf, trimPath, tryExtend, VINE_COLORS } from './logic'
import { createVinePaths, getVineLevel, VINE_LEVELS } from './levels'
import './vine-link.css'

const scoreFor = (steps: number, par: number) => Math.max(100, 1000 - Math.max(0, steps - par) * 10)

export default function VineLinkGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(VINE_LEVELS, Math.max(1, Math.floor(level) || 1))
  const spec = useMemo(() => getVineLevel(levelNumber), [levelNumber])
  const [paths, setPaths] = useState<number[][]>(() => createVinePaths(spec))
  const [steps, setSteps] = useState(0)
  const [dragging, setDragging] = useState<number | null>(null)
  const [activePair, setActivePair] = useState<number | null>(null)
  const [done, setDone] = useState<'won' | 'lost' | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const lastCell = useRef(-1)
  const audio = useMemo(() => createGameAudio(), [])
  const verdict = useMemo(() => judgeVine(spec.rows, spec.cols, spec.pairs, paths), [spec, paths])
  const owners = useMemo(() => {
    const map = new Map<number, number>()
    paths.forEach((path, index) => path.forEach((cell) => map.set(cell, index)))
    return map
  }, [paths])
  const knobs = useMemo(() => {
    const map = new Map<number, number>()
    spec.pairs.forEach((pair, index) => {
      map.set(pair.a, index)
      map.set(pair.b, index)
    })
    return map
  }, [spec])
  const links = useMemo(() => {
    const map = new Map<number, string[]>()
    const add = (cell: number, dir: string) => map.set(cell, [...(map.get(cell) ?? []), dir])
    for (const path of paths) {
      for (let step = 1; step < path.length; step += 1) {
        const from = path[step - 1]
        const to = path[step]
        const dRow = Math.floor(to / spec.cols) - Math.floor(from / spec.cols)
        const dCol = (to % spec.cols) - (from % spec.cols)
        add(from, dRow === -1 ? 'u' : dRow === 1 ? 'd' : dCol === 1 ? 'r' : 'l')
        add(to, dRow === -1 ? 'd' : dRow === 1 ? 'u' : dCol === 1 ? 'l' : 'r')
      }
    }
    return map
  }, [paths, spec.cols])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  const commit = (pair: number, cell: number) => {
    const result = tryExtend(spec.cols, spec.pairs, paths, pair, cell)
    if (!result.placed) return
    const nextSteps = steps + 1
    setPaths(result.paths)
    setSteps(nextSteps)
    audio.play(result.paired ? 'match' : 'step')
    emit({ type: 'score', score: scoreFor(nextSteps, spec.par) })
    if (judgeVine(spec.rows, spec.cols, spec.pairs, result.paths).solved) {
      audio.play('win')
      setDone('won')
      emit({ type: 'completed', score: scoreFor(nextSteps, spec.par) })
      return
    }
    if (spec.moveLimit && nextSteps >= spec.moveLimit) {
      audio.play('lose')
      setDone('lost')
      emit({ type: 'failed', score: scoreFor(nextSteps, spec.par) })
    }
  }

  const advance = (pair: number, cell: number) => {
    const path = paths[pair]
    if (!path?.length || cell === path[path.length - 1]) return
    if (path.length > 1 && cell === path[path.length - 2]) {
      setPaths(paths.map((item, index) => (index === pair ? path.slice(0, -1) : [...item])))
      audio.play('select')
      return
    }
    commit(pair, cell)
  }

  const cellFrom = (event: React.PointerEvent<HTMLDivElement>) => {
    const board = boardRef.current
    if (!board) return -1
    const rect = board.getBoundingClientRect()
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * spec.cols)
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * spec.rows)
    return col < 0 || row < 0 || col >= spec.cols || row >= spec.rows ? -1 : row * spec.cols + col
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (paused || done) return
    const cell = cellFrom(event)
    if (cell < 0) return
    lastCell.current = cell
    const owner = ownerOf(paths, cell)
    if (owner >= 0) {
      if (spec.fixed.includes(owner)) {
        audio.play('mismatch')
        return
      }
      setPaths(paths.map((item, index) => (index === owner ? trimPath(item, cell) : [...item])))
      setDragging(owner)
      setActivePair(owner)
      audio.play('select')
      return
    }
    const endpoint = knobs.get(cell)
    if (endpoint !== undefined && !paths[endpoint].length) {
      const nextSteps = steps + 1
      setPaths(paths.map((item, index) => (index === endpoint ? [cell] : [...item])))
      setSteps(nextSteps)
      setDragging(endpoint)
      setActivePair(endpoint)
      audio.play('select')
      emit({ type: 'score', score: scoreFor(nextSteps, spec.par) })
      return
    }
    if (activePair !== null && !spec.fixed.includes(activePair)) {
      setDragging(activePair)
      advance(activePair, cell)
      return
    }
    setDragging(null)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (paused || done || dragging === null) return
    const cell = cellFrom(event)
    if (cell < 0 || cell === lastCell.current) return
    lastCell.current = cell
    advance(dragging, cell)
  }

  const clearPaths = () => {
    if (paused || done) return
    setPaths(createVinePaths(spec))
    setDragging(null)
    audio.play('mismatch')
  }

  const cells = Array.from({ length: spec.rows * spec.cols }, (_, cell) => cell)
  return (
    <div className="vine-game" aria-label="藤蔓花园游戏区">
      <div className="vine-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章</span>
        <strong>{steps} 步{spec.moveLimit ? ` / ${spec.moveLimit}` : ` · 参考 ${spec.par}`}</strong>
      </div>
      <div className="vine-rule">
        <span><Sparkles size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.fixed.length > 0 && <em><LockKeyhole size={11} />老藤 {spec.fixed.length}</em>}
      </div>
      <div
        className="vine-board" ref={boardRef}
        style={{ '--vine-cols': spec.cols } as React.CSSProperties}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)} onPointerLeave={() => setDragging(null)}
      >
        {cells.map((cell) => {
          const owner = owners.get(cell)
          const knob = knobs.get(cell)
          const color = owner !== undefined ? VINE_COLORS[spec.pairs[owner].color] : knob !== undefined ? VINE_COLORS[spec.pairs[knob].color] : undefined
          const className = [
            'vine-cell',
            owner !== undefined ? 'is-owned' : '',
            knob !== undefined ? 'is-endpoint' : '',
            owner !== undefined && spec.fixed.includes(owner) ? 'is-fixed' : '',
            owner !== undefined && verdict.connected[owner] ? 'is-paired' : '',
            dragging !== null && owner === dragging ? 'is-tip' : '',
          ].filter(Boolean).join(' ')
          return (
            <button key={cell} type="button" className={className} style={{ '--cell-color': color ?? 'transparent' } as React.CSSProperties} aria-pressed={owner !== undefined} aria-label={`花畦第 ${Math.floor(cell / spec.cols) + 1} 行第 ${(cell % spec.cols) + 1} 列${knob !== undefined ? '，嫩芽' : ''}`}>
              {color && <i className="vine-fill" />}
              {links.get(cell)?.map((dir) => <i key={dir} className={`vine-link link-${dir}`} />)}
              {knob !== undefined && <i className="vine-knob" />}
            </button>
          )
        })}
      </div>
      <div className="vine-actions">
        <button className="vine-button" type="button" onClick={clearPaths} disabled={Boolean(done)}><Eraser size={17} />清除重铺</button>
        <button className="vine-button" type="button" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
      </div>
      {done && <div className={`vine-banner ${done === 'lost' ? 'is-lost' : ''}`}>{done === 'won' ? '满园花开 · 藤蔓铺满全园' : '预算耗尽 · 藤蔓枯萎'}</div>}
    </div>
  )
}
