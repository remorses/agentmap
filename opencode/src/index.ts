// @agentmap
// OpenCode plugin that injects codebase map into system prompt.

import type { Plugin } from '@opencode-ai/plugin'
import { generateMapYaml } from 'agentmap'

export const AgentMapPlugin: Plugin = async ({ directory }) => {
  return {
    'experimental.chat.system.transform': async (_input, output) => {
      const yaml = await generateMapYaml({ dir: directory })
      if (!yaml.trim()) return

      output.system.push(`<agentmap>
Tree of the most important files in the repo, showing descriptions and definitions:

${yaml}
</agentmap>`)
    },
  }
}
