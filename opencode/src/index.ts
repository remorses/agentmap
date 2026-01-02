// @agentmap
// OpenCode plugin that injects codebase map into system prompt.

import type { Plugin } from '@opencode-ai/plugin'
import { generateMap, toYaml } from 'agentmap'
import type { MapNode, FileEntry, DefEntry } from 'agentmap'

const MAX_DEFS_PER_FILE = 25
const MAX_LINES = 1000

/**
 * Truncate definitions in a file entry to MAX_DEFS_PER_FILE
 * Adds a marker entry if truncated
 */
function truncateDefs(entry: FileEntry): FileEntry {
  if (!entry.defs) return entry

  const defNames = Object.keys(entry.defs)
  if (defNames.length <= MAX_DEFS_PER_FILE) return entry

  const truncated: DefEntry = {}
  for (let i = 0; i < MAX_DEFS_PER_FILE; i++) {
    const name = defNames[i]
    truncated[name] = entry.defs[name]
  }

  const remaining = defNames.length - MAX_DEFS_PER_FILE
  // Add marker that will be converted to comment
  truncated[`__more_${remaining}__`] = `${remaining} more definitions`

  return { ...entry, defs: truncated }
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
 * Recursively truncate defs in all files in the map
 */
function truncateMap(node: MapNode): MapNode {
  const result: MapNode = {}

  for (const [key, value] of Object.entries(node)) {
    if (isFileEntry(value)) {
      result[key] = truncateDefs(value)
    } else if (value && typeof value === 'object') {
      result[key] = truncateMap(value as MapNode)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Convert __more_N__ markers to YAML comments
 */
function markersToComments(yaml: string): string {
  // Match lines like: __more_25__: 25 more definitions
  // Replace with: # ... 25 more definitions
  return yaml.replace(
    /^(\s*)__more_(\d+)__: .+$/gm,
    '$1# ... $2 more definitions'
  )
}

/**
 * Truncate YAML to max lines, adding a comment if truncated
 */
function truncateLines(yaml: string): string {
  const lines = yaml.split('\n')
  if (lines.length <= MAX_LINES) return yaml

  const truncated = lines.slice(0, MAX_LINES)
  truncated.push('# ... truncated')
  return truncated.join('\n')
}

export const AgentMapPlugin: Plugin = async ({ directory }) => {
  let cachedYaml: string | undefined
  let lastSessionID: string | undefined

  return {
    'chat.message': async ({ sessionID }) => {
      if (sessionID !== lastSessionID) {
        lastSessionID = sessionID
        cachedYaml = undefined
      }
    },

    'experimental.chat.system.transform': async (_input, output) => {
      try {
        // Skip if already has agentmap tag
        if (output.system.some((s) => s.includes('<agentmap>'))) return

        if (!cachedYaml) {
          const map = await generateMap({ dir: directory })

          // Check if map is empty
          const rootKey = Object.keys(map)[0]
          const rootValue = map[rootKey]
          if (!rootValue || Object.keys(rootValue).length === 0) {
            cachedYaml = ''
          } else {
            const truncatedMap = truncateMap(map)
            let yaml = toYaml(truncatedMap)
            yaml = markersToComments(yaml)
            yaml = truncateLines(yaml)
            cachedYaml = yaml
          }
        }

        if (!cachedYaml.trim()) return

        output.system.push(`

<agentmap>
Tree of the most important files in the repo, showing descriptions and definitions:

${cachedYaml}
</agentmap>`)
      } catch (err) {
        console.error('[agentmap] Failed to generate map:', err)
      }
    },
  }
}
