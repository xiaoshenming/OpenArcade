import { z } from 'zod'
import type { GameEvent, HostCommand } from './types'

export const PROTOCOL = 'openarcade:v1' as const

const gameEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('started') }),
  z.object({ type: z.literal('score'), score: z.number().finite() }),
  z.object({ type: z.literal('completed'), score: z.number().finite() }),
  z.object({ type: z.literal('failed'), score: z.number().finite() }),
  z.object({ type: z.literal('request-restart') }),
])

const envelopeSchema = z.object({ protocol: z.literal(PROTOCOL), source: z.literal('game'), event: gameEventSchema })

export function parseGameMessage(value: unknown): GameEvent | null {
  const parsed = envelopeSchema.safeParse(value)
  return parsed.success ? parsed.data.event : null
}

export function hostMessage(command: HostCommand) {
  return { protocol: PROTOCOL, source: 'host' as const, command }
}
