
// OpenCode plugin that injects codebase map into system prompt.

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Plugin } from '@opencode-ai/plugin'
import { formatLogMessage, generateMapYaml } from 'agentmap'
import type { Logger } from 'agentmap'
import { normalizePromptState, resolveSessionPrompt } from './prompt-state.js'

const MAX_LINES = 1000
const STATE_DIR = join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'agentmap')

async function writeDebugFile(path: string | undefined, content: string) {
  if (!path) return
  await writeFile(path, content, 'utf8')
}

function getSessionID(input: { sessionID?: string } | null | undefined): string | undefined {
  const sessionID = input?.sessionID
  return typeof sessionID === 'string' ? sessionID : undefined
}

function getStateFilePath(directory: string): string {
  const key = createHash('sha256').update(directory).digest('hex').slice(0, 16)
  return join(STATE_DIR, `opencode-${key}.json`)
}

function buildInjectedPrompt(yaml: string): string {
  return `

<agentmap>
Tree of the most important files in the repo, showing descriptions and definitions:

${yaml}
</agentmap>

<agentmap-instructions>
When creating new files, add a brief description comment at the top explaining the file's purpose. This makes the file discoverable in the agentmap.

When making significant changes to a file's purpose or responsibilities, update its header comment to reflect the changes.

These descriptions appear in the agentmap XML at the start of every agent session.
</agentmap-instructions>`
}

async function loadPromptState(directory: string) {
  const stateFilePath = getStateFilePath(directory)
  try {
    const raw = await readFile(stateFilePath, 'utf8')
    return {
      filePath: stateFilePath,
      state: normalizePromptState(JSON.parse(raw)),
    }
  } catch {
    return {
      filePath: stateFilePath,
      state: normalizePromptState(undefined),
    }
  }
}

async function savePromptState(filePath: string, state: ReturnType<typeof normalizePromptState>) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(state), 'utf8')
}

const AgentMapPlugin: Plugin = async ({ directory, client }) => {
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

  const { filePath: stateFilePath, state } = await loadPromptState(directory)
  const sessionPromptCache = new Map<string, Promise<string | undefined>>()
  let writeQueue = Promise.resolve()

  function queueStateWrite() {
    writeQueue = writeQueue
      .then(() => savePromptState(stateFilePath, state))
      .catch((err) => {
        logger.error('[agentmap] Failed to persist prompt state:', err)
      })
  }

  async function createPrompt() {
    let yaml = await generateMapYaml({ dir: directory, diff: true, logger })

    const lines = yaml.split('\n')
    if (lines.length > MAX_LINES) {
      yaml = lines.slice(0, MAX_LINES).join('\n') + '\n# ... truncated'
    }

    if (!yaml.trim()) return undefined
    return buildInjectedPrompt(yaml)
  }

  async function getPromptForSession(sessionID: string | undefined) {
    if (!sessionID) {
      return createPrompt()
    }

    const cachedPrompt = sessionPromptCache.get(sessionID)
    if (cachedPrompt) {
      return cachedPrompt
    }

    const pendingPrompt = (async () => {
      const resolved = await resolveSessionPrompt({
        state,
        sessionID,
        createPrompt: async () => (await createPrompt()) ?? '',
      })

      if (resolved.changed) {
        queueStateWrite()
      }

      return resolved.prompt
    })().catch((err) => {
      sessionPromptCache.delete(sessionID)
      throw err
    })

    sessionPromptCache.set(sessionID, pendingPrompt)
    return pendingPrompt
  }

  return {
    'experimental.chat.system.transform': async (input, output) => {
      try {
        // Skip if already has agentmap tag
        if (output.system.some((s) => s.includes('<agentmap>'))) return

        const prompt = await getPromptForSession(getSessionID(input))
        if (!prompt?.trim()) return

        output.system.push(prompt)

        await writeDebugFile(process.env.AGENTMAP_DEBUG_SYSTEM_PROMPT_FILE, output.system.join('\n'))
      } catch (err) {
        await writeDebugFile(process.env.AGENTMAP_DEBUG_ERROR_FILE, String(err))
        logger.error('[agentmap] Failed to generate map:', err)
      }
    },
  }
}

export { AgentMapPlugin }
export default AgentMapPlugin
