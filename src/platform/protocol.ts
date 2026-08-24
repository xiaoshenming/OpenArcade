import { PROTOCOL, type GameEvent, type HostCommand } from '../sdk/contracts'
import { gameEnvelopeSchema } from '../sdk/schema'

export { PROTOCOL }

export function parseGameMessage(value: unknown, channel: string): GameEvent | null {
  const parsed = gameEnvelopeSchema.safeParse(value)
  return parsed.success && parsed.data.channel === channel ? parsed.data.event : null
}

export function hostMessage(command: HostCommand, channel: string) {
  return { protocol: PROTOCOL, source: 'host' as const, channel, command }
}
