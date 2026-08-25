export const SDK_VERSION = 1 as const
export const PROTOCOL = `openarcade:v${SDK_VERSION}` as const

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
  | { type: 'load-level'; level: number }
  | { type: 'mute'; muted: boolean }

export type GameCategory = 'logic' | 'arcade' | 'cozy'
export type GamePermission = 'audio' | 'gamepad' | 'clipboard-write'

export interface ManifestBase {
  id: string
  sdkVersion: typeof SDK_VERSION
  title: string
  shortTitle: string
  description: string
  category: GameCategory
  accent: string
  order: number
  status: 'ready' | 'soon'
  gameVersion: string
  owner: string
  license: string
  scorePolicy: { max: number; eventsPerSecond: number }
  levelCount?: number
  instructions?: string[]
  highlights?: string[]
}

export interface ModuleManifest extends ManifestBase {
  loader: 'module'
  isolation: 'trusted-module'
}

export interface IframeManifest extends ManifestBase {
  loader: 'iframe'
  entry: string
  isolation: 'opaque-origin' | 'trusted-same-origin'
  permissions: GamePermission[]
}

export type GameManifest = ModuleManifest | IframeManifest

export interface GameModuleProps {
  sessionKey: number
  paused: boolean
  muted: boolean
  level?: number
  emit: (event: GameEvent) => void
}
