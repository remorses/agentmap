// Truncate definitions and descriptions in map to limit context size.

import type { DefEntry, FileEntry, MapNode, SubmoduleEntry, SubmoduleNode } from '../types.js'

const DEFAULT_MAX_DEFS = 25
const DEFAULT_MAX_DESC_CHARS = 300

export interface TruncateOptions {
  maxDefs?: number
  maxDescChars?: number
}

/**
 * Check if a def value indicates exported or extern
 */
function isExportedDef(value: string): boolean {
  return value.includes('exported') || value.includes('extern')
}

/**
 * Truncate description by character count, rounding up to include the full line
 * that crosses the limit (in excess).
 */
function truncateDescriptionByChars(description: string, maxChars: number): string {
  if (description.length <= maxChars) return description

  const lines = description.split('\n')

  // Single-line fallback: hard-truncate at maxChars
  if (lines.length === 1) {
    return description.slice(0, maxChars) + '...'
  }

  let charCount = 0

  for (let i = 0; i < lines.length; i++) {
    // +1 for the newline separator (except first line)
    charCount += lines[i].length + (i > 0 ? 1 : 0)
    if (charCount >= maxChars) {
      // Include this line (in excess), then stop
      const kept = lines.slice(0, i + 1)
      const remaining = lines.length - kept.length
      if (remaining > 0) {
        kept.push(`... and ${remaining} more lines`)
      }
      return kept.join('\n')
    }
  }

  return description
}

/**
 * Check if a value is a FileEntry (has description or defs)
 */
function isFileEntry(value: unknown): value is FileEntry {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return 'description' in obj || 'defs' in obj
}

/**
 * Check if a value is a SubmoduleEntry (has submodule key)
 */
function isSubmoduleEntry(value: unknown): value is SubmoduleEntry {
  if (!value || typeof value !== 'object') return false
  return 'submodule' in (value as Record<string, unknown>)
}

/**
 * Recursively truncate a submodule node while preserving its metadata keys.
 */
function truncateSubmoduleNode(entry: SubmoduleNode, options: TruncateOptions): SubmoduleNode {
  const result: SubmoduleNode = { submodule: entry.submodule }

  if (entry.dirty) {
    result.dirty = entry.dirty
  }

  for (const [key, value] of Object.entries(entry)) {
    if (key === 'submodule' || key === 'dirty') {
      continue
    }

    if (isFileEntry(value)) {
      result[key] = truncateFileEntry(value, options)
    } else if (isSubmoduleEntry(value)) {
      result[key] = truncateSubmoduleNode(value as SubmoduleNode, options)
    } else if (value && typeof value === 'object') {
      result[key] = truncateMap(value as MapNode, options)
    }
  }

  return result
}

/**
 * Truncate a file entry: cap description by chars and defs by count.
 */
function truncateFileEntry(entry: FileEntry, options: TruncateOptions): FileEntry {
  let result = entry

  // Truncate description by character count
  const maxDescChars = options.maxDescChars ?? DEFAULT_MAX_DESC_CHARS
  if (result.description && result.description.length > maxDescChars) {
    result = { ...result, description: truncateDescriptionByChars(result.description, maxDescChars) }
  }

  // Truncate defs
  result = truncateDefs(result, options.maxDefs)
  return result
}

/**
 * Truncate definitions in a file entry to maxDefs
 * If file has exported symbols, shows only exports field instead
 * Otherwise uses current truncation behavior
 */
export function truncateDefs(entry: FileEntry, maxDefsOrOptions?: number | TruncateOptions): FileEntry {
  const maxDefs = typeof maxDefsOrOptions === 'number'
    ? maxDefsOrOptions
    : (maxDefsOrOptions?.maxDefs ?? DEFAULT_MAX_DEFS)

  if (!entry.defs) return entry

  const defNames = Object.keys(entry.defs)
  if (defNames.length <= maxDefs) return entry

  // Filter to only exported/extern definitions
  const exportedNames = defNames.filter(name => isExportedDef(entry.defs![name]))

  // If we have exports, use exports field instead of defs
  if (exportedNames.length > 0) {
    const exports: DefEntry = {}
    const maxExports = Math.min(exportedNames.length, maxDefs)

    for (let i = 0; i < maxExports; i++) {
      const name = exportedNames[i]
      exports[name] = entry.defs[name]
    }

    // Add marker if exports were also truncated
    if (exportedNames.length > maxDefs) {
      const remaining = exportedNames.length - maxDefs
      exports[`__more_${remaining}__`] = `${remaining} more exports`
    }

    // Return with exports instead of defs
    const { defs, ...rest } = entry
    return { ...rest, exports }
  }

  // No exports found - use current truncation behavior
  const truncated: DefEntry = {}
  for (let i = 0; i < maxDefs; i++) {
    const name = defNames[i]
    truncated[name] = entry.defs[name]
  }

  const remaining = defNames.length - maxDefs
  // Add marker that will be converted to comment
  truncated[`__more_${remaining}__`] = `${remaining} more definitions`

  return { ...entry, defs: truncated }
}

/**
 * Recursively truncate defs and descriptions in all files in the map
 */
export function truncateMap(node: MapNode, maxDefsOrOptions?: number | TruncateOptions): MapNode {
  const options: TruncateOptions = typeof maxDefsOrOptions === 'number'
    ? { maxDefs: maxDefsOrOptions }
    : (maxDefsOrOptions ?? {})

  const result: MapNode = {}

  for (const [key, value] of Object.entries(node)) {
    if (isFileEntry(value)) {
      result[key] = truncateFileEntry(value, options)
    } else if (isSubmoduleEntry(value)) {
      result[key] = truncateSubmoduleNode(value as SubmoduleNode, options)
    } else if (value && typeof value === 'object') {
      result[key] = truncateMap(value as MapNode, options)
    }
  }

  return result
}
