import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, EyeOff, Heart, RotateCcw, Shuffle } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { createTeaState, pressTea } from './logic'
import { CUSTOMER_NAMES, CUSTOMERS, INGREDIENTS, getTeaLevel, type TeaLevel } from './levels'
import './tea-orders.css'

const MODES = ['classic', 'fade', 'duo', 'reverse', 'storm']

export default function TeaOrdersGame({ level = 1, ...props }: GameModuleProps) {
  const spec = getTeaLevel(level)
  return <TeaRun key={spec.level} spec={spec} {...props} />
}

function TeaRun({ spec, paused, muted, emit }: GameModuleProps & { spec: TeaLevel }) {
  const audio = useMemo(() => createGameAudio(), [])
  const [state, setState] = useState(() => createTeaState(spec))
  const [revealed, setRevealed] = useState(true)
  const [flash, setFlash] = useState(0)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  useEffect(() => {
    if (spec.fadeMs === 0 || paused) return
    const timer = window.setTimeout(() => setRevealed(false), spec.fadeMs)
    return () => window.clearTimeout(timer)
  }, [spec.fadeMs, paused, state.wave])
  useEffect(() => {
    if (!flash || paused) return
    const timer = window.setTimeout(() => setFlash(0), 900)
    return () => window.clearTimeout(timer)
  }, [flash, paused])
  useEffect(() => {
    if (state.over === 'completed') {
      audio.play('win')
      emit({ type: 'completed', score: state.score })
    } else if (state.over === 'failed') {
      audio.play('lose')
      emit({ type: 'failed', score: state.score })
    }
  }, [audio, emit, state.over, state.score])

  const serve = (ingredient: number) => {
    if (paused || state.over !== 'playing') return
    const next = pressTea(spec, state, ingredient)
    if (next === state) return
    audio.play('select')
    audio.play(next.pulse === 'bad' || next.pulse === 'lost' ? 'mismatch' : next.pulse === 'served' ? 'match' : 'step')
    if (next.wave !== state.wave) setRevealed(true)
    if (next.pulse === 'bad' || next.pulse === 'lost') setFlash((value) => value + 1)
    setState(next)
    emit({ type: 'score', score: next.score })
  }

  const reveal = spec.fadeMs === 0 || revealed || flash > 0
  const currentOrder = state.queue[state.cursor]?.order
  const over = state.over !== 'playing'
  return (
    <div className={`tea-game mode-${MODES[spec.chapter - 1]}`} aria-label="茶韵流香游戏区">
      <div className="tea-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · {spec.title}</span>
        <strong>{state.completed}/{spec.quota} 单 · {state.score} 分</strong>
      </div>
      <div className="tea-rule">
        <span>
          {spec.fadeMs > 0 && <EyeOff size={14} />}
          {spec.reverseChance > 0 && <ArrowLeftRight size={14} />}
          {spec.distractors > 0 && <Shuffle size={14} />}
          {spec.detail}
        </span>
        <small>失误单 {state.failedOrders}/3{state.perfectStreak > 0 ? ` · 连对 ×${state.perfectStreak}` : ''}{state.streak > 1 ? ` · 连击 ${state.streak}` : ''}</small>
      </div>
      <div className="tea-counter">
        {state.active.map((order) => (
          <div key={order.index} className={`tea-customer ${currentOrder === order.index && !over ? 'is-active' : ''} ${order.done ? 'is-served' : ''} ${order.failed ? 'is-lost' : ''}`}>
            <span className="tea-avatar">{CUSTOMERS[order.customer]}<i>{CUSTOMER_NAMES[order.customer]}客{order.reverse ? ' ⇄' : ''}</i></span>
            <span className="tea-lives">
              {Array.from({ length: 2 }, (_, i) => <Heart key={i} size={11} className={i < order.lives ? 'is-on' : ''} />)}
            </span>
            <span className="tea-order">
              {order.recipe.map((ing, i) => {
                const poured = order.reverse ? i >= order.recipe.length - order.progress : i < order.progress
                return <em key={i} className={poured ? 'is-poured' : ''}>{reveal || poured ? INGREDIENTS[ing].icon : '?'}</em>
              })}
            </span>
            {order.done && <b className="tea-stamp">出茶</b>}
            {order.failed && <b className="tea-stamp is-bad">失单</b>}
          </div>
        ))}
      </div>
      <div className="tea-shelf">
        {state.shelf.map((ing) => (
          <button key={ing} className="tea-item" onClick={() => serve(ing)} disabled={over || paused} aria-label={`加入${INGREDIENTS[ing].name}`}>
            <span>{INGREDIENTS[ing].icon}</span>
            <i>{INGREDIENTS[ing].name}</i>
          </button>
        ))}
      </div>
      <div className="tea-actions">
        <button className="tea-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={16} />重开本关</button>
      </div>
      {spec.fadeMs > 0 && reveal && !over && <div className="tea-hint">记住订单,展示即将隐去</div>}
      {state.over === 'completed' && <div className="tea-panel"><span>茶香四溢</span><strong>{state.score}</strong></div>}
      {state.over === 'failed' && <div className="tea-panel is-fail"><span>三单尽失</span><strong>{state.score}</strong></div>}
    </div>
  )
}
