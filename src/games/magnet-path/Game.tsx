import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, ChevronRight, CircleDot, Compass, Crown, Flag, Layers, Magnet as MagnetIcon, RotateCcw, Target, Zap } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { canPlace, magnetAt, sameCell, scoreFor, stepBall, type BallState, type Magnet, type MagnetLevel, type Polarity } from './logic'
import { createMagnetLevel, getMagnetSpec } from './levels'
import './magnet-path.css'

interface Round {
  readonly data: MagnetLevel
  readonly ball: BallState
  readonly magnets: readonly Magnet[]
  readonly turns: number
  readonly over: 'win' | 'lose' | null
}

const MODE_ICONS: Record<string, typeof MagnetIcon> = { attract: MagnetIcon, budget: Layers, walls: Compass, tight: Zap, gauntlet: Crown }

const freshRound = (levelNumber: number): Round => {
  const data = createMagnetLevel(levelNumber)
  return { data, ball: { row: data.start.row, col: data.start.col, filled: 0 }, magnets: [], turns: 0, over: null }
}

export default function MagnetPathGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getMagnetSpec(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [rounds, setRounds] = useState<Record<number, Round>>(() => ({ [levelNumber]: freshRound(levelNumber) }))
  const round = useMemo(() => rounds[levelNumber] ?? freshRound(levelNumber), [rounds, levelNumber])
  const [brush, setBrush] = useState<Polarity>('N')

  const update = (next: Round) => setRounds((prev) => ({ ...prev, [levelNumber]: next }))

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  const place = (row: number, col: number) => {
    if (paused || round.over) return
    const existing = magnetAt(round.magnets, { row, col })
    if (existing) {
      update({ ...round, magnets: round.magnets.filter((magnet) => magnet !== existing) })
      audio.play('select')
      return
    }
    if (!canPlace(round.data, round.data.start, round.magnets, round.data.capacity, round.ball, { row, col })) {
      audio.play('mismatch')
      return
    }
    update({ ...round, magnets: [...round.magnets, { row, col, polarity: brush }] })
    audio.play('select')
  }

  const advance = () => {
    if (paused || round.over) return
    const ball = stepBall(round.data, round.ball, round.magnets)
    const turns = round.turns + 1
    const solved = ball.filled === round.data.holes.length
    const entered = ball.filled > round.ball.filled
    const moved = ball.row !== round.ball.row || ball.col !== round.ball.col
    const score = scoreFor(turns, round.data.par)
    const hot = !solved && turns >= round.data.budget
    update({ ...round, ball, turns, over: solved ? 'win' : hot ? 'lose' : null })
    emit({ type: 'score', score })
    if (solved) {
      audio.play('win')
      emit({ type: 'completed', score })
      return
    }
    audio.play(entered ? 'match' : moved ? 'step' : 'mismatch')
    if (hot) {
      audio.play('lose')
      emit({ type: 'failed', score })
    }
  }

  const chooseBrush = (polarity: Polarity) => {
    if (paused || round.over) return
    setBrush(polarity)
    audio.play('select')
  }

  const Icon = MODE_ICONS[spec.mode] ?? MagnetIcon
  const hot = round.turns >= round.data.budget - 1
  const size = round.data.size
  return (
    <div className={`magnet-game mode-${spec.mode}`} aria-label="磁石探径游戏区">
      <div className={`magnet-readout ${hot ? 'is-hot' : ''}`}>
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {round.data.par} 回合</span>
        <strong>{round.turns} / {round.data.budget} 回合</strong>
      </div>
      <div className="magnet-rule">
        <span><Icon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        <em>磁石 {round.magnets.length}/{round.data.capacity}</em>
      </div>
      <div className="magnet-stage">
        <div className="magnet-board" style={{ '--magnet-size': size } as React.CSSProperties}>
          {Array.from({ length: size * size }, (_, index) => {
            const row = Math.floor(index / size)
            const col = index % size
            const cell = { row, col }
            const wall = round.data.walls.some((item) => sameCell(item, cell))
            const holeIndex = round.data.holes.findIndex((hole) => sameCell(hole, cell))
            const magnet = magnetAt(round.magnets, cell)
            const isBall = sameCell(round.ball, cell)
            const holeFilled = holeIndex >= 0 && holeIndex < round.ball.filled
            return (
              <button
                key={index}
                className={`magnet-cell ${wall ? 'is-wall' : ''} ${holeIndex >= 0 ? 'is-hole' : ''} ${holeFilled ? 'is-filled' : ''} ${magnet ? 'is-magnet' : ''} ${isBall ? 'is-ball' : ''}`}
                data-pol={magnet?.polarity ?? ''}
                aria-label={`格 ${row + 1},${col + 1}${wall ? '：障碍墙' : holeIndex >= 0 ? `：目标穴${holeFilled ? '已入穴' : ''}` : magnet ? `：${magnet.polarity} 极磁石` : isBall ? '：铁球' : '：空格'}`}
                onClick={() => place(row, col)}
              >
                {magnet && <MagnetIcon size={17} />}
                {isBall && <CircleDot size={17} />}
                {holeIndex >= 0 && <Target size={15} />}
              </button>
            )
          })}
        </div>
        <div className="magnet-legend">
          <small><MagnetIcon size={12} />磁力</small>
          <span data-pol="N"><b>N</b>吸引铁球</span>
          <span data-pol="S"><b>S</b>推斥铁球</span>
          <span><CircleDot size={12} />铁球每回合按合力走一格</span>
          <span><Flag size={12} />{round.data.holes.length > 1 ? '双穴：先浅后深依次入穴' : '把球送入目标穴'}</span>
          <span className="magnet-scroll-hint"><ArrowLeftRight size={12} />小屏棋盘过宽时，可左右滑动棋盘</span>
        </div>
      </div>
      <div className="magnet-tools" role="toolbar" aria-label="磁石工具">
        {(['N', 'S'] as const).map((polarity) => (
          <button key={polarity} className={`magnet-brush ${brush === polarity ? 'is-active' : ''}`} data-pol={polarity} aria-pressed={brush === polarity} onClick={() => chooseBrush(polarity)}>
            <MagnetIcon size={15} /><span>{polarity} 极磁石</span>
          </button>
        ))}
        <button className="magnet-step" onClick={advance} disabled={!!round.over}>
          <ChevronRight size={16} />推进回合
        </button>
      </div>
      {round.over === 'win' && <div className="magnet-banner is-win">入穴成功！</div>}
      {round.over === 'lose' && <div className="magnet-banner is-lose">回合预算用尽，再试一次</div>}
      <button className="magnet-restart" onClick={() => emit({ type: 'request-restart' })} disabled={paused}><RotateCcw size={17} />重开本关</button>
    </div>
  )
}
