
// OpenCode plugin that injects codebase map into system prompt.

import type { Plugin } from '@opencode-ai/plugin'
import { formatLogMessage } from 'agentmap/src/logger'
import type { Logger } from 'agentmap/src/logger'
import { generateMapYaml } from 'agentmap/src/index'

const MAX_LINES = 1000

export const AgentMapPlugin: Plugin = async ({ directory, client }) => {
  let cachedYaml: string | undefined
  let lastSessionID: string | undefined

  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (...args) => {
      const message = formatLogMessage(args)
      void client.tui.showToast({
        body: {
          title: 'agentmap',
          message,
          variant: 'error',
        },
      }).catch(() => {})
    },
  }

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
          let yaml = await generateMapYaml({ dir: directory, diff: true, logger })

          // Truncate to max lines
          const lines = yaml.split('\n')
          if (lines.length > MAX_LINES) {
            yaml = lines.slice(0, MAX_LINES).join('\n') + '\n# ... truncated'
          }

          cachedYaml = yaml
        }

        if (!cachedYaml.trim()) return

        output.system.push(`

<agentmap>
Tree of the most important files in the repo, showing descriptions and definitions:

${cachedYaml}
</agentmap>

<agentmap-instructions>
When creating new files, add a brief description comment at the top explaining the file's purpose. This makes the file discoverable in the agentmap.

When making significant changes to a file's purpose or responsibilities, update its header comment to reflect the changes.

These descriptions appear in the agentmap XML at the start of every agent session.
</agentmap-instructions>`)
      } catch (err) {
        logger.error('[agentmap] Failed to generate map:', err)
      }
    },
  }
}
