// Persist per-session agentmap prompt snapshots.

export interface ResolvedSessionPrompt {
  changed: boolean
  prompt: string
}

export type PromptState = Record<string, string>
type StoredPromptValue = string | { prompt?: string } | null | undefined

export function createPromptState(): PromptState {
  return {}
}

function getStoredPrompt(value: StoredPromptValue): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  return typeof value?.prompt === 'string' ? value.prompt : undefined
}

export function normalizePromptState(
  value: (Record<string, StoredPromptValue> & { sessions?: Record<string, StoredPromptValue> }) | null | undefined,
): PromptState {
  if (!value) {
    return createPromptState()
  }

  const raw = value.sessions && !Array.isArray(value.sessions) ? value.sessions : value

  const state = createPromptState()
  for (const [sessionID, prompt] of Object.entries(raw)) {
    const storedPrompt = getStoredPrompt(prompt)
    if (storedPrompt !== undefined) {
      state[sessionID] = storedPrompt
    }
  }

  return state
}

export async function resolveSessionPrompt(input: {
  state: PromptState
  sessionID: string
  createPrompt: () => Promise<string>
}): Promise<ResolvedSessionPrompt> {
  const existing = input.state[input.sessionID]
  if (existing !== undefined) {
    return { changed: false, prompt: existing }
  }

  const prompt = await input.createPrompt()
  input.state[input.sessionID] = prompt
  return { changed: true, prompt }
}
