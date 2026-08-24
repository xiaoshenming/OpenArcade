import { z } from 'zod'

export const gameManifestSchema = z.discriminatedUnion('loader', [
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    shortTitle: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(['logic', 'arcade', 'cozy']),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    loader: z.literal('module'),
    moduleId: z.string(),
    status: z.enum(['ready', 'soon']).default('ready'),
  }),
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    shortTitle: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(['logic', 'arcade', 'cozy']),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    loader: z.literal('iframe'),
    src: z.string().startsWith('/'),
    status: z.enum(['ready', 'soon']).default('ready'),
  }),
])

export type GameManifest = z.infer<typeof gameManifestSchema>
export type GameStatus = 'idle' | 'playing' | 'won' | 'lost'

export type GameEvent =
  | { type: 'ready' }
  | { type: 'started' }
  | { type: 'score'; score: number }
  | { type: 'completed'; score: number }
  | { type: 'failed'; score: number }
  | { type: 'request-restart' }

export type HostCommand =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'mute'; muted: boolean }

export interface GameModuleProps {
  sessionKey: number
  paused: boolean
  muted: boolean
  emit: (event: GameEvent) => void
}
