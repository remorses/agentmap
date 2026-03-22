// Truncate definitions in map to limit context size.

import type { DefEntry, FileEntry, MapNode, SubmoduleEntry, SubmoduleNode } from '../types.js'

const DEFAULT_MAX_DEFS = 25

/**
 * Check if a def value indicates exported or extern
 */
function isExportedDef(value: string): boolean {
  return value.includes('exported') || value.includes('extern')
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
function truncateSubmoduleNode(entry: SubmoduleNode, maxDefs: number): SubmoduleNode {
  const result: SubmoduleNode = { submodule: entry.submodule }

  if (entry.dirty) {
    result.dirty = entry.dirty
  }

  for (const [key, value] of Object.entries(entry)) {
    if (key === 'submodule' || key === 'dirty') {
      continue
    }

    if (isFileEntry(value)) {
      result[key] = truncateDefs(value, maxDefs)
    } else if (isSubmoduleEntry(value)) {
      result[key] = truncateSubmoduleNode(value as SubmoduleNode, maxDefs)
    } else if (value && typeof value === 'object') {
      result[key] = truncateMap(value as MapNode, maxDefs)
    }
  }

  return result
}

/**
 * Truncate definitions in a file entry to maxDefs
 * If file has exported symbols, shows only exports field instead
 * Otherwise uses current truncation behavior
 */
export function truncateDefs(entry: FileEntry, maxDefs: number = DEFAULT_MAX_DEFS): FileEntry {
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
 * Recursively truncate defs in all files in the map
 */
export function truncateMap(node: MapNode, maxDefs: number = DEFAULT_MAX_DEFS): MapNode {
  const result: MapNode = {}

  for (const [key, value] of Object.entries(node)) {
    if (isFileEntry(value)) {
      result[key] = truncateDefs(value, maxDefs)
    } else if (isSubmoduleEntry(value)) {
      result[key] = truncateSubmoduleNode(value as SubmoduleNode, maxDefs)
    } else if (value && typeof value === 'object') {
      result[key] = truncateMap(value as MapNode, maxDefs)
    }
  }

  return result
}
