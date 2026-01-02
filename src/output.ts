// @agentmap
// Zoned output logic for generating map files per zone.

import { mkdir, writeFile } from 'fs/promises'
import { join, dirname, relative, basename } from 'path'
import yaml from 'js-yaml'
import type { FileResult, ZoneFiles, ZoneOutput, ZonedOutputOptions, DefEntry } from './types.js'

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
 * Build full-detail map content for a zone's files
 */
function buildZoneContent(files: FileResult[], zone: string): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  
  for (const file of files) {
    let key: string
    
    if (zone === './') {
      // Root zone: use full relative path
      key = file.relativePath
    } else if (isInsideZone(file.relativePath, zone)) {
      // File is inside zone: use relative path from zone
      key = relative(zone.slice(0, -1), file.relativePath)
    } else {
      // File is outside zone but zoned here: use absolute path with leading /
      key = '/' + file.relativePath
    }
    
    const entry: Record<string, unknown> = {}
    
    if (file.description) {
      entry.description = file.description
    }
    
    if (file.definitions.length > 0) {
      const defs: DefEntry = {}
      for (const def of file.definitions) {
        defs[def.name] = def.line
      }
      entry.defs = defs
    }
    
    content[key] = entry
  }
  
  return content
}

/**
 * Build summary-only content for files (used in root map's _zones)
 */
function buildZoneSummary(files: FileResult[]): Record<string, string> {
  const summary: Record<string, string> = {}
  
  for (const file of files) {
    summary[file.relativePath] = file.description || 'No description'
  }
  
  return summary
}

/**
 * Generate zone output plans
 * 
 * @param files - All scanned files
 * @param projectDir - Project root directory
 * @param outDir - Output directory name (default: .ruler)
 */
export function generateZoneOutputs(
  files: FileResult[],
  projectDir: string,
  outDir: string = '.ruler'
): ZoneOutput[] {
  const zones = groupByZone(files)
  const outputs: ZoneOutput[] = []
  
  // Find root zone files
  const rootZone = zones.find(z => z.zone === './')
  const otherZones = zones.filter(z => z.zone !== './')
  
  // Build root map.yaml
  const rootContent: Record<string, unknown> = {}
  
  // Add full detail for root-zoned files
  if (rootZone) {
    Object.assign(rootContent, buildZoneContent(rootZone.files, './'))
  }
  
  // Add summary for other zones under _zones key
  if (otherZones.length > 0) {
    const zonesSection: Record<string, Record<string, string>> = {}
    
    for (const zone of otherZones) {
      const zonePath = zone.zone.slice(0, -1) // Remove trailing /
      zonesSection[zonePath] = buildZoneSummary(zone.files)
    }
    
    rootContent._zones = zonesSection
  }
  
  // Root output
  outputs.push({
    outputPath: join(projectDir, outDir, 'map.yaml'),
    zone: './',
    content: toYaml(rootContent),
  })
  
  // Zone outputs
  for (const zone of otherZones) {
    const zonePath = zone.zone.slice(0, -1) // Remove trailing /
    const zoneContent = buildZoneContent(zone.files, zone.zone)
    
    outputs.push({
      outputPath: join(projectDir, zonePath, outDir, 'map.yaml'),
      zone: zone.zone,
      content: toYaml(zoneContent),
    })
  }
  
  return outputs
}

/**
 * Convert object to YAML string
 */
function toYaml(obj: Record<string, unknown>): string {
  return yaml.dump(obj, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: true,
    quotingType: '"',
    forceQuotes: false,
  })
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
