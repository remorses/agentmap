// Library exports for programmatic usage.

import { execSync } from 'child_process'
import { homedir } from 'os'
import { resolve } from 'path'
import { scanDirectory } from './scanner.js'
import { buildMap, getRootName } from './map/builder.js'
import { toYaml } from './map/yaml.js'
import { truncateMap } from './map/truncate.js'
import type { GenerateOptions, MapNode } from './types.js'

export { toYaml } from './map/yaml.js'
export { truncateMap, truncateDefs } from './map/truncate.js'

export type {
  DefEntry,
  Definition,
  DefinitionDiff,
  DefinitionStatus,
  DiffHunk,
  FileDiffStats,
  FileEntry,
  FileDiff,
  FileResult,
  GenerateOptions,
  Language,
  MapNode,
  MarkerResult,
  SubmoduleEntry,
  SubmoduleInfo,
} from './types.js'

/**
 * Check if directory is inside a git repository
 */
export function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Check if directory is the user's home directory
 */
export function isHomeDirectory(dir: string): boolean {
  const home = homedir()
  const resolved = resolve(dir)
  return resolved === home
}

const DEFAULT_MAX_DEFS = 25

/**
 * Generate a map object from a directory
 * Returns empty map if not in a git repo or if directory is home
 */
export async function generateMap(options: GenerateOptions = {}): Promise<MapNode> {
  const dir = resolve(options.dir ?? '.')
  const rootName = getRootName(dir)

  // Safety checks - return empty map
  if (!isGitRepo(dir) || isHomeDirectory(dir)) {
    return { [rootName]: {} }
  }

  const { files, submodules } = await scanDirectory({ ...options, dir })
  const map = buildMap(files, rootName, submodules)
  
  // Apply truncation (default 25)
  const maxDefs = options.maxDefs ?? DEFAULT_MAX_DEFS
  return truncateMap(map, maxDefs)
}

/**
 * Generate a YAML string map from a directory
 * Returns empty string if not in a git repo or if directory is home
 */
export async function generateMapYaml(options: GenerateOptions = {}): Promise<string> {
  const dir = resolve(options.dir ?? '.')

  // Safety checks - return empty
  if (!isGitRepo(dir) || isHomeDirectory(dir)) {
    return ''
  }

  const { files, submodules } = await scanDirectory({ ...options, dir })

  if (files.length === 0 && submodules.length === 0) {
    return ''
  }

  const rootName = getRootName(dir)
  const map = buildMap(files, rootName, submodules)
  
  // Apply truncation (default 25)
  const maxDefs = options.maxDefs ?? DEFAULT_MAX_DEFS
  const truncated = truncateMap(map, maxDefs)
  return toYaml(truncated)
}
