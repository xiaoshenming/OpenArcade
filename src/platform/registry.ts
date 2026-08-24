import type { ComponentType } from 'react'
import { gameManifestSchema, type GameManifest, type GameModuleProps } from '../sdk'

type GameComponentModule = { default: ComponentType<GameModuleProps> }
type GameLoader = () => Promise<GameComponentModule>

const metadataFiles = import.meta.glob<unknown>('../games/*/game.json', { eager: true, import: 'default' })
const componentFiles = import.meta.glob<GameComponentModule>('../games/*/Game.tsx')

function idFromPath(path: string) {
  return path.split('/games/')[1]?.split('/')[0] ?? ''
}

const entries = Object.entries(metadataFiles).map(([path, value]) => {
  const directoryId = idFromPath(path)
  const manifest = gameManifestSchema.parse(value)
  if (manifest.id !== directoryId) throw new Error(`Game id "${manifest.id}" must match directory "${directoryId}"`)
  return manifest
})

const duplicateIds = entries.filter((game, index) => entries.findIndex((item) => item.id === game.id) !== index)
if (duplicateIds.length) throw new Error(`Duplicate game id: ${duplicateIds[0].id}`)

for (const game of entries) {
  const hasComponent = Object.keys(componentFiles).some((path) => idFromPath(path) === game.id)
  if (game.loader === 'module' && game.status === 'ready' && !hasComponent) {
    throw new Error(`Ready module "${game.id}" must provide Game.tsx`)
  }
}

export const games: GameManifest[] = entries.sort((a, b) => a.order - b.order)

export function getGameModule(id: string): GameLoader | undefined {
  return Object.entries(componentFiles).find(([path]) => idFromPath(path) === id)?.[1]
}
