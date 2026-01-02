// @agentmap
// Library exports for programmatic usage.

import { resolve } from 'path'
import { scanDirectory } from './scanner.js'
import { buildMap, getRootName } from './map/builder.js'
import { toYaml } from './map/yaml.js'
import type { GenerateOptions, MapNode } from './types.js'

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
} from './types.js'

/**
 * Generate a map object from a directory
 */
export async function generateMap(options: GenerateOptions = {}): Promise<MapNode> {
  const dir = resolve(options.dir ?? '.')
  const results = await scanDirectory({ ...options, dir })
  const rootName = getRootName(dir)
  return buildMap(results, rootName)
}

/**
 * Generate a YAML string map from a directory
 */
export async function generateMapYaml(options: GenerateOptions = {}): Promise<string> {
  const dir = resolve(options.dir ?? '.')
  const results = await scanDirectory({ ...options, dir })

  if (results.length === 0) {
    return ''
  }

  const rootName = getRootName(dir)
  const map = buildMap(results, rootName)
  return toYaml(map)
}
