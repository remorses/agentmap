// @agentmap
// Build the nested map object from file results.

import { basename } from 'path'
import type { Definition, FileEntry, FileResult, FileDiffStats, MapNode } from '../types.js'

/**
 * Build a nested map object from file results
 */
export function buildMap(results: FileResult[], rootName: string): MapNode {
  const root: MapNode = {}

  for (const result of results) {
    insertFile(root, result)
  }

  // Wrap in root name
  return { [rootName]: root }
}

/**
 * Format file diff stats as a string like "+15-3" or "+15" or "-3"
 */
function formatFileDiff(diff: FileDiffStats): string {
  const parts: string[] = []
  if (diff.added > 0) {
    parts.push(`+${diff.added}`)
  }
  if (diff.deleted > 0) {
    parts.push(`-${diff.deleted}`)
  }
  return parts.join('')
}

/**
 * Format a definition as a string like "line 13-25, function, exported, updated (+5-2)"
 */
function formatDefinition(def: Definition): string {
  // Line range - show single line or range
  const lineStr = def.line === def.endLine 
    ? `line ${def.line}` 
    : `line ${def.line}-${def.endLine}`
  
  const parts = [lineStr, def.type]
  
  if (def.exported) {
    parts.push('exported')
  }
  
  // Add diff info if present
  if (def.diff) {
    // Format as +N-M or just +N or -M
    const diffParts: string[] = []
    if (def.diff.added > 0) {
      diffParts.push(`+${def.diff.added}`)
    }
    if (def.diff.deleted > 0) {
      diffParts.push(`-${def.diff.deleted}`)
    }
    
    // Combine status with counts: "updated (+5-2)" or just "added"
    if (diffParts.length > 0) {
      parts.push(`${def.diff.status} (${diffParts.join('')})`)
    } else {
      parts.push(def.diff.status)
    }
  }
  
  return parts.join(', ')
}

/**
 * Insert a file result into the map at its path location
 */
function insertFile(root: MapNode, result: FileResult): void {
  const parts = result.relativePath.split('/')
  let current = root

  // Navigate/create directory structure
  for (let i = 0; i < parts.length - 1; i++) {
    const dir = parts[i]
    if (!current[dir]) {
      current[dir] = {}
    }
    current = current[dir] as MapNode
  }

  // Create file entry - description first, then diff, then defs
  const filename = parts[parts.length - 1]
  const entry: FileEntry = {}

  if (result.description) {
    entry.description = result.description
  }

  if (result.diff) {
    entry.diff = formatFileDiff(result.diff)
  }

  if (result.definitions.length > 0) {
    entry.defs = {}
    for (const def of result.definitions) {
      entry.defs[def.name] = formatDefinition(def)
    }
  }

  current[filename] = entry
}

/**
 * Get the root name from a directory path
 */
export function getRootName(dir: string): string {
  // Handle trailing slashes
  const cleaned = dir.replace(/\/+$/, '')
  // Get basename, or use 'root' for current directory
  const name = basename(cleaned)
  return name === '.' || name === '' ? 'root' : name
}
