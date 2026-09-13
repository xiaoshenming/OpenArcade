import { describe, expect, it } from 'vitest'
import {
  FIELD, MAX_DEFLECT, PADDLE_BASE, PADDLE_SPEED, PADDLE_TOP, START_LIVES, ZONE_FACTOR, createGameState, inZone, step,
  withPaddle, type Ball, type GameState,
} from './logic'
import { LEVEL_COUNT, getJuggleLevel } from './levels'

const FRAME = 1 / 60
const FRAME_BUDGET = 30000

// 预测球到达托板高度的 x 与飞行时间：按 1/120 步长迷你模拟（重力带感知 + 墙/顶反射），
// 与游戏物理结构一致，避免跨重力带时的解析误差。
function landingOf(state: GameState, ball: Ball): { x: number; t: number; gravity: number } {
  const dt = 1 / 120
  const target = PADDLE_TOP - ball.r
  let { x, y, vx, vy } = ball
  let t = 0
  while (y < target && t < 6) {
    const gravity = state.gravity * (inZone(state.zones, y) ? ZONE_FACTOR : 1)
    vy += gravity * dt
    y += vy * dt
    x += vx * dt
    if (x < ball.r) {
      x = ball.r
      vx = Math.abs(vx)
    } else if (x > FIELD.width - ball.r) {
      x = FIELD.width - ball.r
      vx = -Math.abs(vx)
    }
    if (y < ball.r) {
      y = ball.r
      vy = Math.abs(vy)
    }
    t += dt
  }
  return { x, t, gravity: state.gravity * (inZone(state.zones, y) ? ZONE_FACTOR : 1) }
}

// 托板 bot：优先接「最快坠地」的球，落点用墙反射折算；托板站到落点减去导向偏移处，
// 让弹跳把球送向其余球落点的重心（向场地中心收拢）；导向角受触球前可达范围与温和角
// 限制（限速 PADDLE_SPEED），逐帧纯函数步进。
export function autopilot(level: number): GameState {
  let state = createGameState(getJuggleLevel(level), level)
  const half = PADDLE_BASE / 2
  let commitId = 0
  for (let frame = 0; frame < FRAME_BUDGET && state.status === 'playing'; frame += 1) {
    const scored = state.balls
      .filter((ball) => ball.vy > 0)
      .map((ball) => ({ ball, landing: landingOf(state, ball) }))
      .map((item) => ({ ...item, margin: item.landing.t - Math.abs(item.landing.x - state.paddle.x) / PADDLE_SPEED }))
      .sort((a, b) => a.landing.t - b.landing.t || b.ball.y - a.ball.y)
    // 锁定当前目标球直到接住/弹起（防止两球落地时间交错时来回摇摆）；
    // 但另一颗球进入「再不去就落地」的紧急窗口时立即切换。
    const committed = commitId ? scored.find((item) => item.ball.id === commitId) : undefined
    const urgent = scored.find((item) => item.ball.id !== commitId && item.margin < 0.1 &&
      item.landing.t < (committed?.landing.t ?? Infinity))
    const picked = urgent ?? committed ?? scored[0] ?? null
    commitId = picked?.ball.id ?? 0
    const fallback = state.balls.reduce<Ball | null>((best, ball) => (!best || ball.y > best.y ? ball : best), null)
    let target = FIELD.width / 2
    if (picked) {
      const landing = picked.landing
      // 导向目标：其余球里「最晚落地」的那颗（通常是刚入场的接力/金球）——提前把
      // 整个杂耍往新球的落点迁移，避免新球到场时被迫远征弃球；无它球时回中心。
      const others = scored.filter((item) => item.ball.id !== picked.ball.id)
      const focus = others.length
        ? others.reduce((best, item) => (item.landing.t > best.landing.t ? item : best), others[0]).landing.x * 0.65 +
          FIELD.width / 2 * 0.35
        : FIELD.width / 2
      const sin2 = Math.max(-1, Math.min(1, ((focus - landing.x) * landing.gravity) / (picked.ball.speed * picked.ball.speed)))
      const ideal = Math.asin(sin2) / (2 * MAX_DEFLECT)
      const reach = Math.min(half - 6, PADDLE_SPEED * landing.t)
      const uMin = (landing.x - state.paddle.x - reach) / half
      const uMax = (landing.x - state.paddle.x + reach) / half
      const angled = Math.max(-0.55, Math.min(0.55, ideal))
      const u = Math.max(uMin, Math.min(uMax, angled))
      target = Math.min(FIELD.width - half, Math.max(half, landing.x - u * half))
    } else if (fallback) {
      target = Math.min(FIELD.width - half, Math.max(half, fallback.x))
    }
    const drift = Math.max(-PADDLE_SPEED * FRAME, Math.min(PADDLE_SPEED * FRAME, target - state.paddle.x))
    state = step(withPaddle(state, state.paddle.x + drift), FRAME)
  }
  return state
}

describe('juggle keep autopilot solvability', () => {
  it('paddle bot reaches the quota on all sixty levels within three lives', () => {
    const fragile: string[] = []
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const end = autopilot(level)
      const lost = START_LIVES - end.lives
      if (end.status !== 'cleared' || lost > 2) fragile.push(`L${level}:${end.status}:-${lost}:${end.bounces}/${end.quota}`)
      expect(end.status, `level ${level} ended as ${end.status}`).toBe('cleared')
      expect(end.bounces, `level ${level} only reached ${end.bounces}`).toBeGreaterThanOrEqual(getJuggleLevel(level).quota)
      expect(lost, `level ${level} lost ${lost} lives`).toBeLessThanOrEqual(2)
    }
    expect(fragile, `unsolvable levels: ${fragile.join(', ')}`).toEqual([])
  })

  it('plays a level deterministically from a fixed seed', () => {
    expect(JSON.stringify(autopilot(30))).toBe(JSON.stringify(autopilot(30)))
    expect(autopilot(30).status).toBe('cleared')
  }, 30000)
})
