// @agentmap
// Library exports for programmatic usage.

import { resolve } from 'path'
import { scanDirectory } from './scanner.js'
import { buildMap, getRootName } from './map/builder.js'
import { toYaml } from './map/yaml.js'
import { generateZoneOutputs, writeZoneOutputs, groupByZone, getZoneSummary, generateSingleFileContent } from './output.js'
import type { GenerateOptions, MapNode, ZonedOutputOptions } from './types.js'

export type {
  DefEntry,
  Definition,
  FileEntry,
  FileResult,
  GenerateOptions,
  Language,
  MapNode,
  MarkerResult,
  OutputFormat,
  ZonedOutputOptions,
  ZoneFiles,
  ZoneOutput,
} from './types.js'

export { scanDirectory, groupByZone, generateZoneOutputs, writeZoneOutputs, getZoneSummary }

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
  const map = await generateMap(options)
  return toYaml(map)
}

/**
 * Options for generating zoned maps
 */
export interface GenerateZonedOptions extends GenerateOptions, ZonedOutputOptions {}

/**
 * Result of generating zoned maps
 */
export interface GenerateZonedResult {
  /** Number of files processed */
  fileCount: number
  /** Number of zones written */
  zoneCount: number
}

/**
 * Generate zoned map files
 */
export async function generateZonedMaps(
  options: GenerateZonedOptions = {}
): Promise<GenerateZonedResult> {
  const dir = resolve(options.dir ?? '.')
  const results = await scanDirectory({ ...options, dir })
  
  if (results.length === 0) {
    return { fileCount: 0, zoneCount: 0 }
  }
  
  const outputs = generateZoneOutputs(results, dir, options.outDir, options.format)
  
  await writeZoneOutputs(outputs, {
    dryRun: options.dryRun,
    verbose: options.verbose,
  })
  
  return {
    fileCount: results.length,
    zoneCount: outputs.length,
  }
}

/**
 * Result of generating a single file with submaps
 */
export interface GenerateZonedSingleResult {
  /** Number of files processed */
  fileCount: number
  /** Number of zones found */
  zoneCount: number
  /** The generated content */
  content: string
}

/**
 * Generate a single file with submaps structure
 */
export async function generateZonedSingleFile(
  options: GenerateZonedOptions = {}
): Promise<GenerateZonedSingleResult> {
  const dir = resolve(options.dir ?? '.')
  const results = await scanDirectory({ ...options, dir })
  
  if (results.length === 0) {
    return { fileCount: 0, zoneCount: 0, content: '' }
  }
  
  const { content, zoneCount } = generateSingleFileContent(results, dir, options.format)
  
  return {
    fileCount: results.length,
    zoneCount,
    content,
  }
}
