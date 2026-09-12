import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, EyeOff, LockKeyhole, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { birthValueAt, createSpawner, hasAnyMove, maxValue, placeTile, slideGrid, type Direction, type Grid, type Spawner } from './logic'
import { createStartGrid, getMergeLevel, LEVEL_COUNT, type MergeLevel } from './levels'
import './merge-square.css'

const SCORE_CAP = 10000
const POP_MS = 260
const KEY_MAP: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
const PAD: { direction: Direction; label: string; Icon: typeof ArrowUp }[] = [
  { direction: 'up', label: '向上滑动', Icon: ArrowUp },
  { direction: 'left', label: '向左滑动', Icon: ArrowLeft },
  { direction: 'down', label: '向下滑动', Icon: ArrowDown },
  { direction: 'right', label: '向右滑动', Icon: ArrowRight },
]

interface RunProps {
  levelNumber: number
  spec: MergeLevel
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

export default function MergeSquareGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level || 1)))
  const spec = useMemo(() => getMergeLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return <MergeSquareRun key={`${levelNumber}-${epoch}`} levelNumber={levelNumber} spec={spec} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
}

function MergeSquareRun({ levelNumber, spec, paused, emit, audio, onRestart }: RunProps) {
  const spawnerRef = useRef<Spawner | null>(null)
  if (spawnerRef.current == null) spawnerRef.current = createSpawner(levelNumber, spec.spawnLocks, spec.spawnLockChance)
  const spawnIndexRef = useRef(0)
  const idRef = useRef(64)
  const [grid, setGrid] = useState<Grid>(() => createStartGrid(levelNumber, spec))
  const [moves, setMoves] = useState(0)
  const [score, setScore] = useState(0)
  const [spawnIndex, setSpawnIndex] = useState(0)
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing')
  const [popped, setPopped] = useState<number[]>([])

  const attemptMove = useCallback((direction: Direction) => {
    if (paused || status !== 'playing') return
    const result = slideGrid(grid, direction)
    if (!result.moved) return
    let nextGrid = result.grid
    const index = spawnIndexRef.current
    const cell = spawnerRef.current?.cell(nextGrid, index) ?? -1
    if (cell >= 0) {
      idRef.current += 1
      nextGrid = placeTile(nextGrid, cell, spawnerRef.current?.value(index) ?? 2, idRef.current, spawnerRef.current?.locked(index) ?? false)
      spawnIndexRef.current = index + 1
      setSpawnIndex(index + 1)
    }
    const nextMoves = moves + 1
    const nextScore = Math.min(SCORE_CAP, score + result.gained)
    setGrid(nextGrid)
    setMoves(nextMoves)
    setScore(nextScore)
    setPopped(result.mergedIds)
    audio.play('step')
    if (result.gained > 0) audio.play('match')
    emit({ type: 'score', score: nextScore })
    if (maxValue(nextGrid) >= spec.target) {
      setStatus('won')
      audio.play('win')
      emit({ type: 'completed', score: nextScore })
      return
    }
    if (nextMoves >= spec.budget || !hasAnyMove(nextGrid)) {
      setStatus('lost')
      audio.play('lose')
      emit({ type: 'failed', score: nextScore })
    }
  }, [audio, emit, grid, moves, paused, score, spec.budget, spec.target, status])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = KEY_MAP[event.key]
      if (!direction) return
      event.preventDefault()
      attemptMove(direction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [attemptMove])

  useEffect(() => {
    if (paused || !popped.length) return
    const timer = window.setTimeout(() => setPopped([]), POP_MS)
    return () => window.clearTimeout(timer)
  }, [paused, popped])

  const nextValue = useMemo(() => birthValueAt(levelNumber, spawnIndex), [levelNumber, spawnIndex])
  const progress = Math.min(100, Math.round((moves / spec.budget) * 100))
  return (
    <div className={`msq-game chapter-${spec.chapter} mode-${status}`} aria-label="合并方阵游戏区">
      <div className="msq-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{moves} / {spec.budget} 步</strong>
      </div>
      <div className="msq-rule">
        <span>{spec.fog ? <EyeOff size={14} /> : null}{spec.detail}</span>
        <em className="msq-target">目标 {spec.target}</em>
        <em>下一块 {spec.fog ? '?' : nextValue}</em>
      </div>
      <div className="msq-stage">
        <div className="msq-board" style={{ '--gap': '10px' } as React.CSSProperties}>
          <div className="msq-cells">{Array.from({ length: 16 }, (_, cell) => <span key={cell} />)}</div>
          <div className="msq-tiles">
            {grid.map((tile, index) => tile && (
              <div key={tile.id} className="msq-tile" style={{ '--x': index % 4, '--y': Math.floor(index / 4) } as React.CSSProperties}>
                <span className={`msq-face v-${Math.min(2048, tile.value)} ${tile.locked ? 'is-locked' : ''} ${popped.includes(tile.id) ? 'is-popped' : ''}`}>
                  {tile.value}
                  {tile.locked && <LockKeyhole size={11} />}
                </span>
              </div>
            ))}
          </div>
          {status !== 'playing' && (
            <div className="msq-stamp">
              <span>{status === 'won' ? '目标达成' : '预算耗尽'}</span>
              <strong>{status === 'won' ? `+${score}` : `${moves} 步`}</strong>
              <button onClick={onRestart}><RotateCcw size={15} />再来一次</button>
            </div>
          )}
        </div>
        <div className="msq-budget"><span style={{ width: `${progress}%` } as React.CSSProperties} /></div>
      </div>
      <div className="msq-actions">
        <div className="msq-pad">
          {PAD.map(({ direction, label, Icon }) => (
            <button key={direction} className="msq-pad-button" onClick={() => attemptMove(direction)} aria-label={label} disabled={paused || status !== 'playing'}><Icon size={20} /></button>
          ))}
        </div>
        <button className="msq-restart" onClick={onRestart}><RotateCcw size={17} />重开本关</button>
      </div>
    </div>
  )
}
