import type { GamePermission, IframeManifest } from '../sdk'

const permissionPolicy: Record<GamePermission, string> = {
  audio: 'autoplay',
  gamepad: 'gamepad',
  'clipboard-write': 'clipboard-write',
}

export function createChannel() {
  return crypto.randomUUID().replaceAll('-', '')
}

export function createGameUrl(entry: string, channel: string, base = window.location.href) {
  const url = new URL(entry, base)
  url.hash = new URLSearchParams({ 'oa-channel': channel }).toString()
  return url.toString()
}

export function getIframePolicy(game: IframeManifest, hostOrigin = window.location.origin) {
  const opaque = game.isolation === 'opaque-origin'
  return {
    sandbox: opaque ? 'allow-scripts' : 'allow-scripts allow-same-origin',
    allow: game.permissions.map((permission) => permissionPolicy[permission]).join('; '),
    targetOrigin: opaque ? '*' : hostOrigin,
  }
}
