// Repro harness for loading the local OpenCode plugin from example/opencode.json.

import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { basename, join } from 'node:path'

const cwd = new URL('.', import.meta.url).pathname
const createdGitRepo = !existsSync(`${cwd}.git`)
const systemPromptFile = join(cwd, '.opencode', 'system-prompt.txt')
const errorFile = join(cwd, '.opencode', 'system-prompt-error.txt')
const prompt = 'Reply exactly TEST'
const model = 'google/gemini-flash-latest'

function runGit(args: string[]) {
  const child = spawn('git', args, {
    cwd,
    env: process.env,
    stdio: 'ignore',
  })

  return new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`git ${args.join(' ')} failed with code ${code}`))
    })
  })
}

if (createdGitRepo) {
  await runGit(['init'])
}

try {
  await rm(systemPromptFile, { force: true })
  await rm(errorFile, { force: true })
  await runGit(['add', basename(new URL('./README.md', import.meta.url).pathname), basename(new URL('./opencode.json', import.meta.url).pathname), basename(new URL('./run.ts', import.meta.url).pathname), '.opencode/package.json', '.opencode/.gitignore'])

  if (createdGitRepo) {
    await runGit(['commit', '-m', 'init'])
  }

  const child = spawn('opencode', ['run', '--format', 'json', '--print-logs', '--model', model, '--dir', '.', prompt], {
    cwd,
    env: {
      ...process.env,
      AGENTMAP_DEBUG_SYSTEM_PROMPT_FILE: systemPromptFile,
      AGENTMAP_DEBUG_ERROR_FILE: errorFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const relevantLogs: string[] = []
  let sawPluginFailure = false
  let stdout = ''

  function rememberRelevantLines(chunk: Buffer | string) {
    const text = chunk.toString()
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      if (/service=plugin|failed to load plugin|example\/opencode\.json loading|directory=\/Users\/morse\/kimaki\/mappamundi\/example/.test(line)) {
        relevantLogs.push(line)
      }
      if (/failed to load plugin/i.test(line)) {
        sawPluginFailure = true
      }
    }
  }

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString()
  })

  child.stderr.on('data', (chunk) => {
    rememberRelevantLines(chunk)
  })

  const exit = await new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, 8000)

    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })

  process.stdout.write('--- plugin logs ---\n')
  process.stdout.write(relevantLogs.length > 0 ? `${relevantLogs.join('\n')}\n` : '(empty)\n')

  if (sawPluginFailure) {
    process.stdout.write('plugin-load: failed\n')
    process.exit(1)
  }

  const textParts: string[] = []
  let sawToolPart = false
  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue
    const event = JSON.parse(line) as { type?: string, part?: { type?: string, text?: string } }
    if (event.type === 'text' && event.part?.text) {
      textParts.push(event.part.text)
    }
    if (event.part?.type?.includes('tool')) {
      sawToolPart = true
    }
  }

  const assistantText = textParts.at(-1)?.trim() ?? ''
  const systemPrompt = existsSync(systemPromptFile) ? await readFile(systemPromptFile, 'utf8') : ''
  const pluginError = existsSync(errorFile) ? await readFile(errorFile, 'utf8') : ''
  const hasAgentmap = systemPrompt.includes('<agentmap>')
  const mentionsExample = systemPrompt.includes('Agentmap Example')

  process.stdout.write(`model: ${model}\n`)
  process.stdout.write(`assistant-text: ${assistantText || '(empty)'}\n`)
  process.stdout.write(`used-tools: ${String(sawToolPart)}\n`)
  process.stdout.write(`system-prompt-has-agentmap: ${String(hasAgentmap)}\n`)
  process.stdout.write(`system-prompt-has-example-title: ${String(mentionsExample)}\n`)
  process.stdout.write(`plugin-error: ${pluginError || '(none)'}\n`)

  if (assistantText !== 'TEST') {
    process.exit(3)
  }

  if (sawToolPart) {
    process.exit(4)
  }

  if (!hasAgentmap || !mentionsExample) {
    process.exit(5)
  }

  process.stdout.write(`prompt-run: ok (exit=${exit.code ?? 'null'} signal=${exit.signal ?? 'null'})\n`)
} finally {
  await rm(systemPromptFile, { force: true })
  await rm(errorFile, { force: true })
  if (createdGitRepo) {
    await rm(`${cwd}.git`, { recursive: true, force: true })
  }
}
