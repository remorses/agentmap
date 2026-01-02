// @agentmap
// Library exports for programmatic usage.

import { resolve } from 'path'
import { scanDirectory } from './scanner.js'
import { buildMap, getRootName } from './map/builder.js'
import { toYaml } from './map/yaml.js'
import { generateSubmapOutputs, writeSubmapOutputs, groupBySubmap, getSubmapSummary } from './submaps.js'
import type { GenerateOptions, MapNode, SubmapOutputOptions } from './types.js'

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
  SubmapOutputOptions,
  SubmapFiles,
  SubmapOutput,
} from './types.js'

export { scanDirectory, groupBySubmap, generateSubmapOutputs, writeSubmapOutputs, getSubmapSummary }

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
 * Options for generating submaps
 */
export interface GenerateSubmapOptions extends GenerateOptions, SubmapOutputOptions {}

/**
 * Result of generating submaps
 */
export interface GenerateSubmapResult {
  /** Number of files processed */
  fileCount: number
  /** Number of submaps written */
  submapCount: number
}

/**
 * Generate submap files
 */
export async function generateSubmaps(
  options: GenerateSubmapOptions = {}
): Promise<GenerateSubmapResult> {
  const dir = resolve(options.dir ?? '.')
  const results = await scanDirectory({ ...options, dir })
  
  if (results.length === 0) {
    return { fileCount: 0, submapCount: 0 }
  }
  
  const outputs = generateSubmapOutputs(results, dir, {
    outDir: options.outDir,
    outputFile: options.outputFile,
    format: options.format,
  })
  
  await writeSubmapOutputs(outputs, {
    dryRun: options.dryRun,
    verbose: options.verbose,
  })
  
  return {
    fileCount: results.length,
    submapCount: outputs.length,
  }
}
