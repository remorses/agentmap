// @agentmap
// Submap generation: grouping, formatting, and output logic.

import { mkdir, writeFile } from 'fs/promises'
import { join, dirname, relative, basename } from 'path'
import yaml from 'js-yaml'
import type { FileResult, FileEntry, MapNode, SubmapFiles, SubmapOutput, SubmapOutputOptions, OutputFormat } from './types.js'

/**
 * Group files by their resolved submap
 */
export function groupBySubmap(files: FileResult[]): SubmapFiles[] {
  const submapMap = new Map<string, FileResult[]>()
  
  for (const file of files) {
    const submap = file.submap
    if (!submapMap.has(submap)) {
      submapMap.set(submap, [])
    }
    submapMap.get(submap)!.push(file)
  }
  
  // Sort submaps for consistent output
  const sortedSubmaps = Array.from(submapMap.keys()).sort()
  
  return sortedSubmaps.map(submap => ({
    submap,
    files: submapMap.get(submap)!,
  }))
}

/**
 * Check if a file is physically inside a submap directory
 */
function isInsideSubmap(filePath: string, submap: string): boolean {
  if (submap === './') return true
  const submapPath = submap.slice(0, -1) // Remove trailing /
  return filePath.startsWith(submapPath + '/')
}

/**
 * Get the root name for a submap
 */
function getSubmapRootName(submap: string, projectDir: string): string {
  if (submap === './') {
    const name = basename(projectDir)
    return name === '.' || name === '' ? 'root' : name
  }
  // Use the last part of the submap path
  const submapPath = submap.slice(0, -1) // Remove trailing /
  return basename(submapPath)
}

/**
 * Insert a file into a nested map structure
 */
function insertFile(root: MapNode, relativePath: string, result: FileResult): void {
  const parts = relativePath.split('/')
  let current = root

  // Navigate/create directory structure
  for (let i = 0; i < parts.length - 1; i++) {
    const dir = parts[i]
    if (!current[dir]) {
      current[dir] = {}
    }
    current = current[dir] as MapNode
  }

  // Create file entry
  const filename = parts[parts.length - 1]
  const entry: FileEntry = {}

  if (result.description) {
    entry.desc = result.description
  }

  if (result.definitions.length > 0) {
    entry.defs = {}
    for (const def of result.definitions) {
      entry.defs[def.name] = def.line
    }
  }

  current[filename] = entry
}

/**
 * Build full-detail nested map content for a submap's files
 */
function buildSubmapContent(files: FileResult[], submap: string, projectDir: string): MapNode {
  const root: MapNode = {}
  const rootName = getSubmapRootName(submap, projectDir)
  
  for (const file of files) {
    let relativePath: string
    
    if (submap === './') {
      // Root submap: use full relative path
      relativePath = file.relativePath
    } else if (isInsideSubmap(file.relativePath, submap)) {
      // File is inside submap: use relative path from submap
      relativePath = relative(submap.slice(0, -1), file.relativePath)
    } else {
      // File is outside submap but assigned here: prefix with _external/
      relativePath = '_external/' + file.relativePath
    }
    
    insertFile(root, relativePath, file)
  }
  
  // Wrap in root name
  return { [rootName]: root }
}

/**
 * Build summary-only nested content for files (used in root map's _submaps)
 */
function buildSubmapSummary(files: FileResult[], submap: string): MapNode {
  const root: MapNode = {}
  const submapPath = submap.slice(0, -1) // Remove trailing /
  const submapName = basename(submapPath)
  
  for (const file of files) {
    // Get path relative to submap
    const relativePath = isInsideSubmap(file.relativePath, submap)
      ? relative(submapPath, file.relativePath)
      : file.relativePath
    
    const parts = relativePath.split('/')
    let current = root
    
    // Navigate/create directory structure
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i]
      if (!current[dir]) {
        current[dir] = {}
      }
      current = current[dir] as MapNode
    }
    
    // Just description for summary
    const filename = parts[parts.length - 1]
    current[filename] = { desc: file.description || 'No description' }
  }
  
  return { [submapName]: root }
}

/**
 * Deep merge two MapNode objects
 */
function mergeMapNodes(target: MapNode, source: MapNode): MapNode {
  for (const key of Object.keys(source)) {
    if (key in target && typeof target[key] === 'object' && typeof source[key] === 'object' 
        && !('desc' in target[key]) && !('desc' in source[key])
        && !('defs' in target[key]) && !('defs' in source[key])) {
      // Both are directory nodes, merge recursively
      target[key] = mergeMapNodes(target[key] as MapNode, source[key] as MapNode)
    } else {
      // File entry or new key, just assign
      target[key] = source[key]
    }
  }
  return target
}

/**
 * Options for generating submap outputs
 */
interface GenerateSubmapOutputsOptions {
  /** Subdirectory for map files (e.g., ".ruler"). If not set, files go directly in submap dirs */
  outDir?: string
  /** Output filename (default: "map.yaml") */
  outputFile?: string
  /** Output format (default: yaml) */
  format?: OutputFormat
}

/**
 * Generate submap output plans
 * 
 * @param files - All scanned files
 * @param projectDir - Project root directory
 * @param options - Output options
 */
export function generateSubmapOutputs(
  files: FileResult[],
  projectDir: string,
  options: GenerateSubmapOutputsOptions = {}
): SubmapOutput[] {
  const { outDir, outputFile = 'map.yaml', format = 'yaml' } = options
  const submaps = groupBySubmap(files)
  const outputs: SubmapOutput[] = []
  
  // Find root submap files
  const rootSubmap = submaps.find(s => s.submap === './')
  const otherSubmaps = submaps.filter(s => s.submap !== './')
  
  // Build root map with nested structure
  let rootContent: MapNode = {}
  const rootName = getSubmapRootName('./', projectDir)
  
  // Add full detail for root submap files
  if (rootSubmap) {
    rootContent = buildSubmapContent(rootSubmap.files, './', projectDir)
  } else {
    // Create empty root wrapper
    rootContent = { [rootName]: {} }
  }
  
  // Add summary for other submaps (nested under root)
  if (otherSubmaps.length > 0) {
    const submapsNode: MapNode = {}
    
    for (const submap of otherSubmaps) {
      const submapSummary = buildSubmapSummary(submap.files, submap.submap)
      mergeMapNodes(submapsNode, submapSummary)
    }
    
    // Add _submaps under root with explanatory comment
    const rootNode = rootContent[rootName] as MapNode
    rootNode['# See full detail & definitions per the paths below'] = null
    rootNode._submaps = submapsNode
  }
  
  // Build output path: projectDir / [outDir] / outputFile
  const rootOutputPath = outDir 
    ? join(projectDir, outDir, outputFile)
    : join(projectDir, outputFile)
  
  // Root output
  outputs.push({
    outputPath: rootOutputPath,
    submap: './',
    content: formatContent(rootContent, format),
  })
  
  // Submap outputs (full detail)
  for (const submap of otherSubmaps) {
    const submapPath = submap.submap.slice(0, -1) // Remove trailing /
    const submapContent = buildSubmapContent(submap.files, submap.submap, projectDir)
    
    // Build output path: projectDir / submapPath / [outDir] / outputFile
    const submapOutputPath = outDir
      ? join(projectDir, submapPath, outDir, outputFile)
      : join(projectDir, submapPath, outputFile)
    
    outputs.push({
      outputPath: submapOutputPath,
      submap: submap.submap,
      content: formatContent(submapContent, format),
    })
  }
  
  return outputs
}

/**
 * Custom sort that puts _submaps and comments first
 */
function sortKeysWithSubmapsFirst(a: string, b: string): number {
  // Comments first
  if (a.startsWith('#') && !b.startsWith('#')) return -1
  if (!a.startsWith('#') && b.startsWith('#')) return 1
  // _submaps second
  if (a === '_submaps' && b !== '_submaps') return -1
  if (a !== '_submaps' && b === '_submaps') return 1
  // Then alphabetical
  return a.localeCompare(b)
}

/**
 * Convert object to YAML string
 */
function toYaml(obj: Record<string, unknown>): string {
  return yaml.dump(obj, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: sortKeysWithSubmapsFirst,
    quotingType: '"',
    forceQuotes: false,
  })
}

/**
 * Convert MapNode to Markdown format
 */
function toMarkdown(obj: MapNode, depth: number = 0): string {
  const lines: string[] = []
  const indent = '  '.repeat(Math.max(0, depth - 2))
  
  // Sort entries with _submaps first
  const entries = Object.entries(obj).sort(([a], [b]) => sortKeysWithSubmapsFirst(a, b))
  
  for (const [key, value] of entries) {
    // Skip comment keys
    if (key.startsWith('#')) continue
    
    if (value === null) continue
    
    // Check if it's a file entry (has desc or defs)
    const isFile = value && typeof value === 'object' && ('desc' in value || 'defs' in value)
    
    if (isFile) {
      const entry = value as FileEntry
      // File: use bold for filename
      lines.push(`${indent}- **${key}**${entry.desc ? `: ${entry.desc}` : ''}`)
      
      if (entry.defs && Object.keys(entry.defs).length > 0) {
        const defList = Object.entries(entry.defs)
          .map(([name, line]) => `\`${name}\`:${line}`)
          .join(', ')
        lines.push(`${indent}  - Defs: ${defList}`)
      }
    } else if (key === '_submaps') {
      // Submaps section
      lines.push('')
      lines.push(`${'#'.repeat(Math.min(depth + 1, 6))} Submaps`)
      lines.push('')
      lines.push('> See full detail & definitions per the paths below')
      lines.push('')
      lines.push(toMarkdown(value as MapNode, depth + 1).trim())
      lines.push('')
    } else {
      // Directory: use heading for top levels, list for nested
      if (depth === 0) {
        lines.push(`# ${key}`)
        lines.push('')
        lines.push(toMarkdown(value as MapNode, depth + 1))
      } else if (depth === 1) {
        lines.push(`## ${key}/`)
        lines.push('')
        lines.push(toMarkdown(value as MapNode, depth + 1))
      } else {
        lines.push(`${indent}- **${key}/**`)
        lines.push(toMarkdown(value as MapNode, depth + 1))
      }
    }
  }
  
  return lines.join('\n')
}

/**
 * Format content based on output format
 */
function formatContent(obj: MapNode, format: OutputFormat): string {
  if (format === 'md') {
    return toMarkdown(obj)
  }
  return toYaml(obj)
}

/**
 * Write submap outputs to disk
 */
export async function writeSubmapOutputs(
  outputs: SubmapOutput[],
  options: SubmapOutputOptions = {}
): Promise<void> {
  const { dryRun = false, verbose = false } = options
  
  for (const output of outputs) {
    if (verbose) {
      console.error(`Submap: ${output.submap}`)
      console.error(`  -> ${output.outputPath}`)
    }
    
    if (dryRun) {
      console.error(`[dry-run] Would write: ${output.outputPath}`)
      if (verbose) {
        console.error('---')
        console.error(output.content)
        console.error('---')
      }
    } else {
      // Ensure directory exists
      await mkdir(dirname(output.outputPath), { recursive: true })
      await writeFile(output.outputPath, output.content, 'utf8')
      if (verbose) {
        console.error(`Wrote: ${output.outputPath}`)
      }
    }
  }
}

/**
 * Get a summary of what submaps will be written
 */
export function getSubmapSummary(outputs: SubmapOutput[]): string {
  const lines: string[] = []
  
  for (const output of outputs) {
    const fileCount = (output.content.match(/^\S+.*:$/gm) || []).length
    lines.push(`  ${output.submap} -> ${output.outputPath} (${fileCount} entries)`)
  }
  
  return lines.join('\n')
}
