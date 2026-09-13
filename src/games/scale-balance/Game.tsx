import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eraser, Heart, Link2, RotateCcw, Scale, Timer } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { applyPlace, applyRemove, applySubmit, createBalanceState, judgeBalance, leftSum, MAX_MISSES, scoreFor, slotFilled, type BalanceState } from './logic'
import { getBalanceLevel, BALANCE_LEVELS } from './levels'
import './scale-balance.css'

export default function ScaleBalanceGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(BALANCE_LEVELS, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const spec = useMemo(() => getBalanceLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [state, setState] = useState<BalanceState>(() => createBalanceState(spec))
  const [selected, setSelected] = useState<number | null>(null)
  const [done, setDone] = useState<'won' | 'lost' | null>(null)
  const [timeLeft, setTimeLeft] = useState(spec.timeLimit ?? 0)
  const [loaded, setLoaded] = useState(spec)
  if (loaded !== spec) {
    setLoaded(spec)
    setState(createBalanceState(spec))
    setSelected(null)
    setDone(null)
    setTimeLeft(spec.timeLimit ?? 0)
  }

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  const verdict = useMemo(() => judgeBalance(spec, state.placements), [spec, state])
  const parents = useMemo(
    () => spec.scales.map((_, index) => spec.scales.findIndex((other) => other.child === index)),
    [spec],
  )
  const placedIds = useMemo(() => new Set(state.placements.flat().filter((id): id is number => id !== null)), [state])
  const report = (next: BalanceState) => emit({ type: 'score', score: scoreFor(next.ops, spec.par, next.misses) })
  const leftRef = useRef(timeLeft)
  const stateRef = useRef(state)
  const doneRef = useRef(done)
  const lose = useCallback((next: BalanceState) => {
    audio.play('lose')
    doneRef.current = 'lost'
    setDone('lost')
    emit({ type: 'failed', score: scoreFor(next.ops, spec.par, next.misses) })
  }, [audio, emit, spec])
  const loseRef = useRef(lose)
  useEffect(() => {
    leftRef.current = timeLeft
    stateRef.current = state
    doneRef.current = done
    loseRef.current = lose
  }, [done, lose, state, timeLeft])

  useEffect(() => {
    if (!spec.timeLimit) return
    const timer = window.setInterval(() => {
      if (paused || doneRef.current) return
      const next = Math.max(0, leftRef.current - 1)
      leftRef.current = next
      setTimeLeft(next)
      if (next === 0) loseRef.current(stateRef.current)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [paused, spec])

  const submit = () => {
    if (paused || done || verdict.filled !== verdict.slots) return
    const result = applySubmit(spec, state)
    setState(result.state)
    if (result.solved) {
      audio.play('win')
      setDone('won')
      emit({ type: 'completed', score: scoreFor(state.ops, spec.par, state.misses) })
      return
    }
    audio.play('mismatch')
    report(result.state)
    if (result.state.misses >= MAX_MISSES) lose(result.state)
  }

  const onSlot = (scale: number, slot: number) => {
    if (paused || done) return
    const filled = slotFilled(state.placements, scale, slot)
    if (filled !== null) {
      const result = applyRemove(spec, state, scale, slot)
      if (result.applied) {
        setState(result.state)
        setSelected(filled)
        audio.play('select')
      }
      return
    }
    if (selected === null) {
      audio.play('select')
      return
    }
    const result = applyPlace(spec, state, scale, slot, selected)
    if (!result.applied) {
      audio.play('mismatch')
      return
    }
    setSelected(null)
    setState(result.state)
    audio.play('step')
    report(result.state)
  }

  const onPool = (poolId: number) => {
    if (paused || done) return
    setSelected((current) => (current === poolId ? null : poolId))
    audio.play('select')
  }

  const reset = () => {
    if (paused || done) return
    setState(createBalanceState(spec))
    setSelected(null)
    audio.play('mismatch')
  }

  const lives = Math.max(0, MAX_MISSES - state.misses)
  const lostByTime = done === 'lost' && Boolean(spec.timeLimit) && timeLeft === 0
  const poolLeft = spec.pool.filter((item) => !placedIds.has(item.id))
  return (
    <div className="balance-game" aria-label="天平推演游戏区">
      <div className="sb-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章</span>
        <strong>{state.ops}{spec.moveLimit ? ` / ${spec.moveLimit}` : ` · 参考 ${spec.par}`} 码</strong>
        {spec.timeLimit ? <span className="sb-timer"><Timer size={13} />{timeLeft}s</span> : null}
        <span className="sb-lives" aria-label={`剩余 ${lives} 次机会`}>
          {Array.from({ length: MAX_MISSES }, (_, heart) => <Heart key={heart} size={13} className={heart < lives ? 'is-on' : ''} />)}
        </span>
      </div>
      <div className="sb-rule">
        <span><Scale size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
      </div>
      <div className="sb-scales">
        {spec.scales.map((scale, index) => {
          const tilt = verdict.tilt[index]
          const tiltClass = tilt === 0 ? 'is-balanced' : tilt > 0 ? 'is-left-heavy' : 'is-right-heavy'
          return (
            <section key={index} className={`sb-scale ${scale.child !== null ? 'is-holding' : ''} ${parents[index] >= 0 ? 'is-hanging' : ''}`}>
              <header className="sb-scale-head">
                <span>天平 {index + 1}</span>
                {scale.child !== null && <em><Link2 size={11} />右盘托着天平 {scale.child + 1}</em>}
                {parents[index] >= 0 && <em><Link2 size={11} />挂于天平 {parents[index] + 1} 右盘</em>}
              </header>
              <div className={`sb-beam ${tiltClass}`}>
                <div className="sb-pan sb-pan-left" aria-label={`天平 ${index + 1} 左盘共 ${leftSum(scale)} 重`}>
                  {scale.left.map((weight, chip) => <b key={chip} className="sb-chip">{weight}</b>)}
                  <span className="sb-sum">{leftSum(scale)}</span>
                </div>
                <i className="sb-post" />
                <div className="sb-pan sb-pan-right">
                  {Array.from({ length: scale.slots }, (_, slot) => {
                    const poolId = slotFilled(state.placements, index, slot)
                    const weight = poolId === null ? null : spec.pool.find((item) => item.id === poolId)?.weight ?? null
                    return (
                      <button
                        key={slot} type="button"
                        className={`sb-slot ${poolId !== null ? 'is-filled' : ''} ${selected !== null && poolId === null ? 'is-armed' : ''}`}
                        onClick={() => onSlot(index, slot)} disabled={Boolean(done)}
                        aria-label={`天平 ${index + 1} 右盘第 ${slot + 1} 格${poolId !== null ? `，已放 ${weight}` : '，空位'}`}
                      >{weight ?? ''}</button>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>
      <div className="sb-palette-head">
        <span>砝码池 {poolLeft.length}</span>
        <small>{selected === null ? '点击砝码选中，再点空位放置' : '已选中砝码，点击空位放置或再点取消'}</small>
      </div>
      <div className="sb-pool">
        {poolLeft.map((item) => (
          <button
            key={item.id} type="button" aria-pressed={selected === item.id}
            className={`sb-weight ${selected === item.id ? 'is-selected' : ''}`}
            onClick={() => onPool(item.id)}
            aria-label={`砝码 ${item.weight}`}
          >{item.weight}</button>
        ))}
      </div>
      <div className="sb-actions">
        <button
          className="sb-button is-primary" type="button" onClick={submit}
          disabled={paused || Boolean(done) || verdict.filled !== verdict.slots}
        ><Check size={17} />提交验算</button>
        <button className="sb-button" type="button" onClick={reset} disabled={paused || Boolean(done)}><Eraser size={17} />清空重放</button>
        <button className="sb-button" type="button" onClick={() => emit({ type: 'request-restart' })} disabled={paused}><RotateCcw size={17} />重开本关</button>
      </div>
      {done && <div className={`sb-banner ${done === 'lost' ? 'is-lost' : ''}`}>{done === 'won' ? '天平皆平 · 推演成立' : lostByTime ? '限时已到 · 秤塔倾覆' : '三次失误 · 砝码散落'}</div>}
    </div>
  )
}
