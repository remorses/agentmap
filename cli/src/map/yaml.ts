// Format map object to YAML string.

import type { MapNode } from '../types.js'

const yaml = await import('js-yaml').then((module) => {
  if (module && typeof module === 'object' && 'default' in module) {
    return module.default as typeof import('js-yaml')
  }
  return module as typeof import('js-yaml')
})

/**
 * Check if a key is a README file (case-insensitive)
 */
function isReadme(key: string): boolean {
  const lower = key.toLowerCase()
  return lower === 'readme.md' || lower === 'readme'
}

/**
 * Custom key sorter: description first, then submodule/dirty, then diff, then defs/exports, then README files, then alphabetical
 */
function sortKeys(a: string, b: string): number {
  // description always first
  if (a === 'description') return -1
  if (b === 'description') return 1
  // submodule second (for submodule entries)
  if (a === 'submodule') return -1
  if (b === 'submodule') return 1
  // dirty third (for submodule entries)
  if (a === 'dirty') return -1
  if (b === 'dirty') return 1
  // diff fourth
  if (a === 'diff') return -1
  if (b === 'diff') return 1
  // defs/exports fifth
  if (a === 'defs' || a === 'exports') return -1
  if (b === 'defs' || b === 'exports') return 1
  // README files come before other files
  const aIsReadme = isReadme(a)
  const bIsReadme = isReadme(b)
  if (aIsReadme && !bIsReadme) return -1
  if (bIsReadme && !aIsReadme) return 1
  // alphabetical for everything else
  return a.localeCompare(b)
}

/**
 * Convert __more_N__ markers to YAML comments
 */
function markersToComments(yamlStr: string): string {
  return yamlStr.replace(
    /^(\s*)__more_(\d+)__: (\d+ more (?:definitions|exports))$/gm,
    '$1# ... $3'
  )
}

/**
 * Convert map object to YAML string
 * Automatically converts truncation markers to comments
 */
export function toYaml(map: MapNode): string {
  const yamlStr = yaml.dump(map, {
    indent: 2,
    lineWidth: -1,  // Don't wrap lines
    noRefs: true,   // Don't use YAML references
    sortKeys,       // Custom ordering: description first
    quotingType: '"',
    forceQuotes: false,
  })
  return markersToComments(yamlStr)
}
