// Format map object to YAML string.

import yaml from 'js-yaml'
import type { MapNode } from '../types.js'

/**
 * Custom key sorter: description first, then diff, then defs, then alphabetical
 */
function sortKeys(a: string, b: string): number {
  // description always first
  if (a === 'description') return -1
  if (b === 'description') return 1
  // diff second
  if (a === 'diff') return -1
  if (b === 'diff') return 1
  // defs third
  if (a === 'defs') return -1
  if (b === 'defs') return 1
  // alphabetical for everything else
  return a.localeCompare(b)
}

/**
 * Convert map object to YAML string
 */
export function toYaml(map: MapNode): string {
  return yaml.dump(map, {
    indent: 2,
    lineWidth: -1,  // Don't wrap lines
    noRefs: true,   // Don't use YAML references
    sortKeys,       // Custom ordering: description first
    quotingType: '"',
    forceQuotes: false,
  })
}
