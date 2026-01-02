// @agentmap
// Zoned output logic for generating map files per zone.

import { mkdir, writeFile } from 'fs/promises'
import { join, dirname, relative, basename } from 'path'
import yaml from 'js-yaml'
import type { FileResult, FileEntry, MapNode, ZoneFiles, ZoneOutput, ZonedOutputOptions, OutputFormat } from './types.js'

/**
 * Group files by their resolved zone
 */
export function groupByZone(files: FileResult[]): ZoneFiles[] {
  const zoneMap = new Map<string, FileResult[]>()
  
  for (const file of files) {
    const zone = file.zone
    if (!zoneMap.has(zone)) {
      zoneMap.set(zone, [])
    }
    zoneMap.get(zone)!.push(file)
  }
  
  // Sort zones for consistent output
  const sortedZones = Array.from(zoneMap.keys()).sort()
  
  return sortedZones.map(zone => ({
    zone,
    files: zoneMap.get(zone)!,
  }))
}

/**
 * Check if a file is physically inside a zone directory
 */
function isInsideZone(filePath: string, zone: string): boolean {
  if (zone === './') return true
  const zonePath = zone.slice(0, -1) // Remove trailing /
  return filePath.startsWith(zonePath + '/')
}

/**
 * Get the root name for a zone
 */
function getZoneRootName(zone: string, projectDir: string): string {
  if (zone === './') {
    const name = basename(projectDir)
    return name === '.' || name === '' ? 'root' : name
  }
  // Use the last part of the zone path
  const zonePath = zone.slice(0, -1) // Remove trailing /
  return basename(zonePath)
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
 * Build full-detail nested map content for a zone's files
 */
function buildZoneContent(files: FileResult[], zone: string, projectDir: string): MapNode {
  const root: MapNode = {}
  const rootName = getZoneRootName(zone, projectDir)
  
  for (const file of files) {
    let relativePath: string
    
    if (zone === './') {
      // Root zone: use full relative path
      relativePath = file.relativePath
    } else if (isInsideZone(file.relativePath, zone)) {
      // File is inside zone: use relative path from zone
      relativePath = relative(zone.slice(0, -1), file.relativePath)
    } else {
      // File is outside zone but zoned here: prefix with _external/
      relativePath = '_external/' + file.relativePath
    }
    
    insertFile(root, relativePath, file)
  }
  
  // Wrap in root name
  return { [rootName]: root }
}

/**
 * Build summary-only nested content for files (used in root map's _zones)
 */
function buildZoneSummary(files: FileResult[], zone: string): MapNode {
  const root: MapNode = {}
  const zonePath = zone.slice(0, -1) // Remove trailing /
  const zoneName = basename(zonePath)
  
  for (const file of files) {
    // Get path relative to zone
    const relativePath = isInsideZone(file.relativePath, zone)
      ? relative(zonePath, file.relativePath)
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
  
  return { [zoneName]: root }
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
 * Generate zone output plans
 * 
 * @param files - All scanned files
 * @param projectDir - Project root directory
 * @param outDir - Output directory name (default: .ruler)
 * @param format - Output format (default: yaml)
 */
export function generateZoneOutputs(
  files: FileResult[],
  projectDir: string,
  outDir: string = '.ruler',
  format: OutputFormat = 'yaml'
): ZoneOutput[] {
  const zones = groupByZone(files)
  const outputs: ZoneOutput[] = []
  
  // Find root zone files
  const rootZone = zones.find(z => z.zone === './')
  const otherZones = zones.filter(z => z.zone !== './')
  
  // Build root map.yaml with nested structure
  let rootContent: MapNode = {}
  const rootName = getZoneRootName('./', projectDir)
  
  // Add full detail for root-zoned files
  if (rootZone) {
    rootContent = buildZoneContent(rootZone.files, './', projectDir)
  } else {
    // Create empty root wrapper
    rootContent = { [rootName]: {} }
  }
  
  // Add summary for other zones (nested under root, with _zones marker)
  if (otherZones.length > 0) {
    const zonesNode: MapNode = {}
    
    for (const zone of otherZones) {
      const zoneSummary = buildZoneSummary(zone.files, zone.zone)
      mergeMapNodes(zonesNode, zoneSummary)
    }
    
    // Add _submaps under root with explanatory comment
    ;(rootContent[rootName] as MapNode)['# See full detail & definitions per the paths below'] = null
    ;(rootContent[rootName] as MapNode)._submaps = zonesNode
  }
  
  const ext = getExtension(format)
  
  // Root output
  outputs.push({
    outputPath: join(projectDir, outDir, `map.${ext}`),
    zone: './',
    content: formatContent(rootContent, format),
  })
  
  // Zone outputs (full detail)
  for (const zone of otherZones) {
    const zonePath = zone.zone.slice(0, -1) // Remove trailing /
    const zoneContent = buildZoneContent(zone.files, zone.zone, projectDir)
    
    outputs.push({
      outputPath: join(projectDir, zonePath, outDir, `map.${ext}`),
      zone: zone.zone,
      content: formatContent(zoneContent, format),
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
 * Get file extension for format
 */
function getExtension(format: OutputFormat): string {
  return format === 'md' ? 'md' : 'yaml'
}

/**
 * Write zone outputs to disk
 */
export async function writeZoneOutputs(
  outputs: ZoneOutput[],
  options: ZonedOutputOptions = {}
): Promise<void> {
  const { dryRun = false, verbose = false } = options
  
  for (const output of outputs) {
    if (verbose) {
      console.error(`Zone: ${output.zone}`)
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
 * Get a summary of what zones will be written
 */
export function getZoneSummary(outputs: ZoneOutput[]): string {
  const lines: string[] = []
  
  for (const output of outputs) {
    const fileCount = (output.content.match(/^\S+.*:$/gm) || []).length
    lines.push(`  ${output.zone} -> ${output.outputPath} (${fileCount} entries)`)
  }
  
  return lines.join('\n')
}

/**
 * Generate content for a single file with submaps structure
 */
export function generateSingleFileContent(
  files: FileResult[],
  projectDir: string,
  format: OutputFormat = 'yaml'
): { content: string; zoneCount: number } {
  const zones = groupByZone(files)
  
  // Find root zone files
  const rootZone = zones.find(z => z.zone === './')
  const otherZones = zones.filter(z => z.zone !== './')
  
  // Build content with nested structure
  let rootContent: MapNode = {}
  const rootName = getZoneRootName('./', projectDir)
  
  // Add full detail for root-zoned files
  if (rootZone) {
    rootContent = buildZoneContent(rootZone.files, './', projectDir)
  } else {
    rootContent = { [rootName]: {} }
  }
  
  // Add summary for other zones under _submaps
  if (otherZones.length > 0) {
    const submapsNode: MapNode = {}
    
    for (const zone of otherZones) {
      const zoneSummary = buildZoneSummary(zone.files, zone.zone)
      mergeMapNodes(submapsNode, zoneSummary)
    }
    
    // Add _submaps under root with comment
    ;(rootContent[rootName] as MapNode)['# See full detail & definitions per the paths below'] = null
    ;(rootContent[rootName] as MapNode)._submaps = submapsNode
  }
  
  return {
    content: formatContent(rootContent, format),
    zoneCount: zones.length,
  }
}
