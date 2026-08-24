import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const failures = []
const inventories = new Set()
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html'])
const ignoredDirectories = new Set(['node_modules', 'dist', '.git', 'coverage'])
const allowedLicenses = new Set(['MIT', 'Apache-2.0', 'CC0-1.0'])

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirectories.has(entry.name)) return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function checkSourceSize() {
  for (const path of walk(root)) {
    if (!sourceExtensions.has(extname(path))) continue
    const lines = readFileSync(path, 'utf8').split(/\r?\n/).length
    if (lines > 300) failures.push(`${relative(root, path)} has ${lines} lines (limit: 300)`)
  }
}

function checkInventory(gameId, directory) {
  const inventoryPath = join(directory, 'assets.json')
  if (!existsSync(inventoryPath)) return failures.push(`src/games/${gameId}/assets.json is required`)
  try {
    const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
    if (!Array.isArray(inventory.assets)) throw new Error('assets must be an array')
    for (const asset of inventory.assets) {
      if (!asset.path || !asset.author || !asset.license || !asset.source || !asset.sha256) throw new Error('each asset needs path, author, license, source, and sha256')
      if (!allowedLicenses.has(asset.license)) throw new Error(`unsupported SPDX license: ${asset.license}`)
      const assetPath = join(root, asset.path)
      if (!existsSync(assetPath)) throw new Error(`missing asset: ${asset.path}`)
      const digest = createHash('sha256').update(readFileSync(assetPath)).digest('hex')
      if (digest !== asset.sha256) throw new Error(`hash mismatch: ${asset.path}`)
      inventories.add(asset.path)
    }
  } catch (error) {
    failures.push(`src/games/${gameId}/assets.json: ${error.message}`)
  }
}

function checkGameDescriptors() {
  const gamesRoot = join(root, 'src/games')
  for (const entry of readdirSync(gamesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = join(gamesRoot, entry.name)
    const descriptorPath = join(directory, 'game.json')
    if (!existsSync(descriptorPath)) failures.push(`src/games/${entry.name}/game.json is required`)
    else {
      const game = JSON.parse(readFileSync(descriptorPath, 'utf8'))
      if (game.id !== entry.name) failures.push(`src/games/${entry.name}/game.json id must match its directory`)
      if (game.loader === 'module' && game.status === 'ready' && !existsSync(join(directory, 'Game.tsx'))) failures.push(`src/games/${entry.name}/Game.tsx is required`)
      if (game.loader === 'iframe') {
        const expected = `/games/${game.id}/`
        const unsafe = game.entry?.includes('..') || game.entry?.includes('\\') || game.entry?.includes('?') || game.entry?.includes('#')
        if (!game.entry?.startsWith(expected) || game.entry.startsWith('//') || unsafe) failures.push(`${game.id} entry must stay inside ${expected}`)
        else if (!existsSync(join(root, 'public', game.entry.slice(1)))) failures.push(`${game.id} entry does not exist: ${game.entry}`)
      }
    }
    checkInventory(entry.name, directory)
  }
}

function checkStaticGames() {
  const publicGames = join(root, 'public/games')
  for (const path of walk(publicGames)) {
    const relativePath = relative(root, path)
    if (!inventories.has(relativePath)) failures.push(`${relativePath} is missing from assets.json`)
    if (statSync(path).size > 5_000_000) failures.push(`${relativePath} exceeds the 5 MB file budget`)
    if (extname(path) !== '.html') continue
    const html = readFileSync(path, 'utf8')
    if (!html.includes('</body>') || !html.trimEnd().endsWith('</html>')) failures.push(`${relativePath} has an invalid document ending`)
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) failures.push(`${relativePath} contains inline script blocked by CSP`)
  }
}

function checkDeploymentPolicy() {
  try {
    const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
    const cspFor = (source) => config.headers
      ?.find((rule) => rule.source === source)?.headers
      ?.find((header) => header.key === 'Content-Security-Policy')?.value ?? ''
    const rootCsp = cspFor('/')
    const gameCsp = cspFor('/games/(.*)')
    if (!rootCsp.includes("object-src 'none'") || !rootCsp.includes("frame-ancestors 'none'")) failures.push('root CSP must block objects and framing')
    if (!gameCsp.includes("script-src 'self'") || !gameCsp.includes("object-src 'none'") || !gameCsp.includes("frame-ancestors 'self'")) failures.push('game CSP must constrain scripts, objects, and framing')
  } catch (error) {
    failures.push(`vercel.json: ${error.message}`)
  }
}

function checkBundleBudgets() {
  const assets = join(root, 'dist/assets')
  if (!existsSync(assets)) return failures.push('dist is missing; run the production build first')
  for (const name of readdirSync(assets)) {
    if (!name.endsWith('.js')) continue
    const bytes = gzipSync(readFileSync(join(assets, name))).byteLength
    const limit = name.startsWith('index-') ? 130_000 : 500_000
    if (bytes > limit) failures.push(`dist/assets/${name} is ${bytes} gzip bytes (limit: ${limit})`)
  }
}

checkSourceSize()
checkGameDescriptors()
checkStaticGames()
checkDeploymentPolicy()
checkBundleBudgets()
if (failures.length) {
  console.error(['Quality gate failed:', ...failures.map((item) => `- ${item}`)].join('\n'))
  process.exit(1)
}
console.log('Quality gate passed: source size, descriptors, asset hashes, CSP, and bundle budgets.')
