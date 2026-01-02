// @agentmap
// OpenCode plugin that injects codebase map into system prompt.

import type { Plugin } from '@opencode-ai/plugin'
import { generateMapYaml } from 'agentmap'

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

        cachedYaml ??= await generateMapYaml({ dir: directory })
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
