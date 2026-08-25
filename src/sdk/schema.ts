import { z } from 'zod'
import { PROTOCOL, SDK_VERSION } from './contracts'

const commonManifest = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  sdkVersion: z.literal(SDK_VERSION),
  title: z.string().min(1).max(40),
  shortTitle: z.string().min(1).max(12),
  description: z.string().min(1).max(160),
  category: z.enum(['logic', 'arcade', 'cozy']),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number().int().nonnegative(),
  status: z.enum(['ready', 'soon']),
  gameVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  owner: z.string().regex(/^@[a-zA-Z0-9-]+$/),
  license: z.enum(['MIT', 'Apache-2.0', 'CC0-1.0']),
  scorePolicy: z.object({
    max: z.number().int().positive().max(1_000_000_000),
    eventsPerSecond: z.number().int().min(1).max(120),
  }),
  levelCount: z.number().int().min(1).max(500).optional(),
  instructions: z.array(z.string().min(4).max(80)).min(2).max(6).optional(),
  highlights: z.array(z.string().min(2).max(30)).min(1).max(8).optional(),
})

const manifestByLoader = z.discriminatedUnion('loader', [
  commonManifest.extend({
    loader: z.literal('module'),
    isolation: z.literal('trusted-module'),
  }),
  commonManifest.extend({
    loader: z.literal('iframe'),
    entry: z.string().startsWith('/'),
    isolation: z.enum(['opaque-origin', 'trusted-same-origin']),
    permissions: z.array(z.enum(['audio', 'gamepad', 'clipboard-write'])).max(3),
  }),
])

export const gameManifestSchema = manifestByLoader.superRefine((game, context) => {
  if (game.loader !== 'iframe') return
  const expectedPrefix = `/games/${game.id}/`
  const unsafe = game.entry.includes('..') || game.entry.includes('\\') || game.entry.includes('?') || game.entry.includes('#')
  if (!game.entry.startsWith(expectedPrefix) || game.entry.startsWith('//') || unsafe) {
    context.addIssue({ code: 'custom', path: ['entry'], message: `entry must stay inside ${expectedPrefix}` })
  }
})

export const gameEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('started') }),
  z.object({ type: z.literal('score'), score: z.number().finite().nonnegative() }),
  z.object({ type: z.literal('completed'), score: z.number().finite().nonnegative() }),
  z.object({ type: z.literal('failed'), score: z.number().finite().nonnegative() }),
  z.object({ type: z.literal('request-restart') }),
])

export const gameEnvelopeSchema = z.object({
  protocol: z.literal(PROTOCOL),
  source: z.literal('game'),
  channel: z.string().min(16),
  event: gameEventSchema,
})
