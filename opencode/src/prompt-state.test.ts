// Tests for persisted per-session agentmap prompt decisions.

import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import test from 'node:test'
import { createPromptState, resolveSessionPrompt } from './prompt-state.js'

test('reuses the first generated prompt for the same session', async () => {
  const state = createPromptState()
  let promptCalls = 0

  const first = await resolveSessionPrompt({
    state,
    sessionID: 'ses-1',
    createPrompt: async () => {
      promptCalls += 1
      return `agentmap prompt ${promptCalls}`
    },
  })

  deepStrictEqual(first, { changed: true, prompt: 'agentmap prompt 1' })

  const second = await resolveSessionPrompt({
    state,
    sessionID: 'ses-1',
    createPrompt: async () => {
      promptCalls += 1
      return `agentmap prompt ${promptCalls}`
    },
  })

  deepStrictEqual(second, { changed: false, prompt: 'agentmap prompt 1' })
  strictEqual(promptCalls, 1)
})

test('stores a separate prompt snapshot per session', async () => {
  const state = createPromptState()
  let promptCalls = 0

  const first = await resolveSessionPrompt({
    state,
    sessionID: 'ses-1',
    createPrompt: async () => {
      promptCalls += 1
      return `agentmap prompt ${promptCalls}`
    },
  })

  deepStrictEqual(first, { changed: true, prompt: 'agentmap prompt 1' })

  const second = await resolveSessionPrompt({
    state,
    sessionID: 'ses-2',
    createPrompt: async () => {
      promptCalls += 1
      return `agentmap prompt ${promptCalls}`
    },
  })

  deepStrictEqual(second, { changed: true, prompt: 'agentmap prompt 2' })
  strictEqual(promptCalls, 2)
})
