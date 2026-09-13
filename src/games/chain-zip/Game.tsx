import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { createAnchors, getZipLevel, LEVEL_COUNT, type AnchorSpec, type ZipLevel } from './levels'
import { METERS_PER_UNIT, WORLD, createRun, metersOf, pivotOf, scoreFor, step, toggle, type ZipState } from './logic'
import './chain-zip.css'

const PPU = 5
const FIELD_W = WORLD.width * PPU

interface AnchorView {
  index: number
  x: number
  y: number
  baseY: number
  amp: number
  gold: boolean
  passed: boolean
  mover: boolean
}

interface ZipView {
  cam: number
  bobX: number
  bobY: number
  pivotX: number
  pivotY: number
  theta: number
  swing: boolean
  anchors: AnchorView[]
  meters: number
  score: number
  golds: number
  lives: number
  status: ZipState['status']
}

function snapshot(state: ZipState, anchors: readonly AnchorSpec[]): ZipView {
  const tail = anchors[anchors.length - 1].x + 26
  const cam = Math.max(0, Math.min(state.x - 58, tail - WORLD.width))
  const pivot = pivotOf(anchors[state.anchor], state.time)
  return {
    cam,
    bobX: state.x,
    bobY: state.y,
    pivotX: pivot.x,
    pivotY: pivot.y,
    theta: state.theta,
    swing: state.phase === 'swing',
    anchors: anchors
      .filter((anchor) => anchor.x >= cam - 12 && anchor.x <= cam + WORLD.width + 12)
      .map((anchor) => {
        const live = pivotOf(anchor, state.time)
        return {
          index: anchor.index,
          x: live.x,
          y: live.y,
          baseY: anchor.baseY,
          amp: anchor.amp,
          gold: anchor.gold,
          passed: anchor.index <= state.anchor,
          mover: anchor.amp > 0,
        }
      }),
    meters: metersOf(state.progress),
    score: scoreFor(state.progress, state.golds),
    golds: state.golds,
    lives: state.lives,
    status: state.status,
  }
}

interface RunProps {
  spec: ZipLevel
  anchors: AnchorSpec[]
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

export default function ChainZipGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const spec = useMemo(() => getZipLevel(levelNumber), [levelNumber])
  const anchors = useMemo(() => createAnchors(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return (
    <ZipRun
      key={`${levelNumber}-${epoch}`}
      spec={spec}
      anchors={anchors}
      paused={paused}
      emit={emit}
      audio={audio}
      onRestart={() => setEpoch((value) => value + 1)}
    />
  )
}

function ZipRun({ spec, anchors, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  const stateRef = useRef(createRun(spec, anchors))
  const [view, setView] = useState(() => snapshot(createRun(spec, anchors), anchors))
  const doneRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)

  const act = () => {
    if (pausedRef.current) return
    const before = stateRef.current
    if (before.status !== 'run') {
      onRestart()
      return
    }
    const after = toggle(before, spec, anchors)
    stateRef.current = after
    if (after.phase === 'fly') audio.play('select')
    else if (after.anchor > before.anchor) audio.play('match')
    else audio.play('mismatch')
  }
  const actRef = useRef(act)
  useEffect(() => {
    actRef.current = act
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault()
        actRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    const field = fieldRef.current
    if (!stage || !field) return
    const fit = () => {
      field.style.transform = `scale(${stage.clientWidth / FIELD_W})`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const delta = Math.min(0.05, (now - last) / 1000)
      last = now
      const world = stateRef.current
      if (pausedRef.current || world.status !== 'run' || delta <= 0) return
      const before = world
      const next = step(world, spec, anchors, delta, 'none')
      stateRef.current = next
      const score = scoreFor(next.progress, next.golds)
      if (score !== scoreFor(before.progress, before.golds)) {
        emit({ type: 'score', score })
        audio.play('step')
      }
      if (next.lives < before.lives) audio.play('mismatch')
      if (next.status !== 'run' && !doneRef.current) {
        doneRef.current = true
        if (next.status === 'completed') {
          audio.play('win')
          emit({ type: 'completed', score })
        } else {
          audio.play('lose')
          emit({ type: 'failed', score })
        }
      }
      setView(snapshot(next, anchors))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anchors, audio, emit, spec])

  const finish = spec.meters / METERS_PER_UNIT
  const ticks: number[] = []
  for (let mark = 25; mark <= finish + 25; mark += 25) ticks.push(mark)

  return (
    <div className={`cz-game mode-${spec.mode} is-${view.status}${paused ? ' is-paused' : ''}`} aria-label="锁链飞渡游戏区">
      <div className="cz-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · {spec.title}</span>
        <strong>{view.score} 分</strong>
      </div>
      <div className="cz-rule">
        <span>{spec.detail}</span>
        <small>{Math.round(view.meters)}/{spec.meters}m · {'♥'.repeat(view.lives) || '—'}{spec.gold ? ` · 金锚 ${view.golds}` : ''}</small>
        <em className="cz-bar"><i style={{ width: `${Math.min(100, (view.meters / spec.meters) * 100)}%` }} /></em>
      </div>
      <div
        ref={stageRef}
        className="cz-stage"
        onPointerDown={(event) => {
          event.preventDefault()
          act()
        }}
        aria-label="点击画面：摆荡中松手抛出，飞行中吸附下一锚"
      >
        <div ref={fieldRef} className="cz-field">
          <div className="cz-ground" />
          <div className="cz-finish" style={{ left: (finish - view.cam) * PPU }} />
          {ticks.map((mark) => (
            <div key={mark} className={`cz-tick${mark % 100 === 0 ? ' is-major' : ''}`} style={{ left: (mark - view.cam) * PPU }} />
          ))}
          {view.anchors.map((anchor) => (
            <Fragment key={anchor.index}>
              {anchor.mover && (
                <i
                  className="cz-rail"
                  style={{ left: (anchor.x - view.cam) * PPU - 1, top: (anchor.baseY - anchor.amp) * PPU, height: anchor.amp * 2 * PPU }}
                />
              )}
              <b
                className={`cz-node${anchor.gold ? ' is-gold' : ''}${anchor.passed ? ' is-passed' : ''}`}
                style={{ left: (anchor.x - view.cam) * PPU, top: anchor.y * PPU }}
              />
            </Fragment>
          ))}
          {view.swing && (
            <div
              className="cz-rope"
              style={{ left: (view.pivotX - view.cam) * PPU, top: view.pivotY * PPU, height: spec.rope * PPU, transform: `rotate(${-view.theta}rad)` }}
            />
          )}
          <div
            className={`cz-hero${view.swing ? '' : ' is-flying'}`}
            style={{ left: (view.bobX - view.cam) * PPU, top: view.bobY * PPU, transform: `translate(-50%, -50%) rotate(${-view.theta}rad)` }}
          />
        </div>
        {view.status !== 'run' && (
          <div className={`cz-stamp ${view.status === 'completed' ? 'is-win' : 'is-lose'}`}>
            <span>{view.status === 'completed' ? '飞渡告捷' : '坠入深渊'}</span>
            <strong>{view.score} 分</strong>
            <small>{Math.round(view.meters)}m · 金锚 {view.golds} · 点击画面再来一次</small>
          </div>
        )}
      </div>
      <div className="cz-actions">
        <span>摆荡中点击松手 · 飞行中点击吸附下一锚 · 空格键同样有效</span>
        <button type="button" onClick={() => { if (!paused) onRestart() }} disabled={paused}>
          <RotateCcw size={15} />重开本关
        </button>
      </div>
    </div>
  )
}
