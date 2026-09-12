import { useEffect, useMemo, useState } from 'react'
import { Flag, Lock, PenLine, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { buildAdjacency, initialStrokeState, judgeMove, MAX_LIVES, oathProgress } from './logic'
import { getStrokeLevel } from './levels'
import './one-stroke.css'

const BOARD = 340
const PAD = 30

function StrokeSession({ paused, muted, emit, levelNumber }: { paused: boolean; muted: boolean; emit: (event: GameEvent) => void; levelNumber: number }) {
  const spec = useMemo(() => getStrokeLevel(levelNumber), [levelNumber])
  const [stroke, setStroke] = useState(() => initialStrokeState(spec))
  const [ouch, setOuch] = useState(false)
  const audio = useMemo(() => createGameAudio(), [])
  const vertexCount = spec.size * spec.size
  const adjacency = useMemo(() => buildAdjacency(vertexCount, spec.edges), [spec, vertexCount])
  const walkedSet = useMemo(() => new Set(stroke.walked), [stroke.walked])
  const oathSet = useMemo(() => new Set(spec.oathEdges), [spec])
  const oathOrder = useMemo(() => new Map(spec.oathEdges.map((edge, order) => [edge, order + 1])), [spec])
  const oneWayMap = useMemo(() => new Map(spec.oneWay.map((item) => [item.edge, item])), [spec])
  const nextSet = useMemo(() => new Set(adjacency[stroke.at].map((item) => item.edge)), [adjacency, stroke.at])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    if (!ouch) return
    const timer = window.setTimeout(() => setOuch(false), 420)
    return () => window.clearTimeout(timer)
  }, [ouch])

  const tap = (vertex: number) => {
    if (paused || stroke.phase !== 'route' || vertex === stroke.at) return
    const result = judgeMove(spec, stroke, vertex)
    setStroke(result.state)
    if (result.valid) {
      audio.play(result.completed ? 'win' : 'step')
      if (result.completed) emit({ type: 'completed', score: result.state.score })
      else emit({ type: 'score', score: result.state.score })
    } else {
      setOuch(true)
      audio.play(result.failed ? 'lose' : 'mismatch')
      if (result.failed) emit({ type: 'failed', score: result.state.score })
      else emit({ type: 'score', score: result.state.score })
    }
  }

  const cell = (BOARD - PAD * 2) / (spec.size - 1)
  const point = (vertex: number) => ({ x: PAD + (vertex % spec.size) * cell, y: PAD + Math.floor(vertex / spec.size) * cell })
  const oathDone = oathProgress(stroke.walked, spec.oathEdges)
  const status = stroke.phase === 'complete' ? '一笔功成，千线归一'
    : stroke.phase === 'failed' ? '线断于此，再试一次'
      : `已走 ${stroke.walked.length} / ${spec.par} 条边 · 落笔 ${stroke.taps}/${spec.budget}`
  return (
    <div className={`stroke-game mode-${spec.mode}`} aria-label="一笔千线游戏区">
      <div className="stroke-readout"><span>关卡 {String(levelNumber).padStart(2, '0')} · {spec.size}×{spec.size} 点阵</span><strong>{stroke.score} 分</strong></div>
      <div className="stroke-rule">
        <span><PenLine size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.oathEdges.length > 0 && <em><Lock size={11} />契约 {oathDone}/{spec.oathEdges.length}</em>}
        <i className="stroke-lives">{'●'.repeat(stroke.lives)}{'○'.repeat(MAX_LIVES - stroke.lives)}</i>
      </div>
      <div className={`stroke-board ${ouch ? 'is-ouch' : ''} ${stroke.phase === 'failed' ? 'is-broken' : ''}`}>
        <svg viewBox={`0 0 ${BOARD} ${BOARD}`} role="img" aria-label="一笔画点阵图">
          {spec.edges.map(([a, b], index) => {
            const from = point(a)
            const to = point(b)
            const way = oneWayMap.get(index)
            const cls = walkedSet.has(index) ? (oathSet.has(index) ? 'is-walked is-oath' : 'is-walked')
              : oathSet.has(index) ? 'is-locked' : way ? 'is-way' : nextSet.has(index) ? 'is-next' : ''
            const order = oathOrder.get(index)
            const midX = (from.x + to.x) / 2
            const midY = (from.y + to.y) / 2
            const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
            return (
              <g key={index}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`stroke-edge ${cls}`} />
                {order !== undefined && (
                  <g className="stroke-oathmark" aria-label={`契约边第 ${order} 序`}>
                    <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r={7} className={`stroke-lockdot ${walkedSet.has(index) ? 'is-done' : ''}`} />
                    <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2} className="stroke-locknum">{order}</text>
                  </g>
                )}
                {way && (
                  <g
                    className="stroke-waymark"
                    transform={`translate(${midX} ${midY}) rotate(${angle.toFixed(2)})`}
                    aria-label={`单向边，只可从交点 ${way.from + 1} 走向 ${way.to + 1}`}
                  >
                    <polygon points="-5,-4 5,0 -5,4" />
                  </g>
                )}
              </g>
            )
          })}
          {Array.from({ length: vertexCount }, (_, vertex) => {
            const { x, y } = point(vertex)
            return (
              <g key={vertex} className={`stroke-dot ${vertex === stroke.at ? 'is-current' : ''} ${vertex === spec.start ? 'is-start' : ''}`} onClick={() => tap(vertex)} role="button" aria-label={`点阵交点 ${vertex + 1}${vertex === stroke.at ? '（当前）' : ''}`}>
                <circle cx={x} cy={y} r={26} className="stroke-hit" />
                {vertex === stroke.at && <circle cx={x} cy={y} r={17} className="stroke-pulse" />}
                <circle cx={x} cy={y} r={10} className="stroke-node" />
                {vertex === spec.start && <path d={`M ${x - 5} ${y + 6} L ${x - 5} ${y - 7} L ${x + 7} ${y - 3} L ${x - 5} ${y + 1}`} className="stroke-flag" />}
              </g>
            )
          })}
        </svg>
      </div>
      <p className="stroke-status"><Flag size={12} />{status}</p>
      <button className="stroke-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
    </div>
  )
}

export default function OneStrokeGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  return <StrokeSession key={levelNumber} paused={paused} muted={muted} emit={emit} levelNumber={levelNumber} />
}
