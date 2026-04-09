// Repro harness for loading the local OpenCode plugin from example/opencode.json.

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { basename } from 'node:path'

const cwd = new URL('.', import.meta.url).pathname
const createdGitRepo = !existsSync(`${cwd}.git`)

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
  await runGit(['add', basename(new URL('./README.md', import.meta.url).pathname), basename(new URL('./opencode.json', import.meta.url).pathname), basename(new URL('./run.ts', import.meta.url).pathname)])

  const child = spawn('opencode', ['run', '--print-logs', '--dir', '.', 'Reply with OK'], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const relevantLogs: string[] = []
  let sawPluginLoad = false
  let sawPluginFailure = false
  let shutdownScheduled = false

  function rememberRelevantLines(chunk: Buffer | string) {
    const text = chunk.toString()
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      if (/service=plugin|failed to load plugin|example\/opencode\.json loading|directory=\/Users\/morse\/kimaki\/mappamundi\/example/.test(line)) {
        relevantLogs.push(line)
      }
      if (/service=plugin path=file:\/\/.*\/opencode\/src\/index\.ts loading plugin/i.test(line)) {
        sawPluginLoad = true
        scheduleShutdown()
      }
      if (/failed to load plugin/i.test(line)) {
        sawPluginFailure = true
        scheduleShutdown()
      }
    }
  }

  function scheduleShutdown() {
    if (shutdownScheduled) return
    shutdownScheduled = true
    setTimeout(() => {
      child.kill('SIGKILL')
    }, 500)
  }

  child.stdout.on('data', (chunk) => {
    rememberRelevantLines(chunk)
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

  if (!sawPluginLoad) {
    process.stdout.write(`plugin-load: inconclusive (exit=${exit.code ?? 'null'} signal=${exit.signal ?? 'null'})\n`)
    process.exit(2)
  }

  const { default: AgentMapPlugin } = await import('../opencode/src/index.ts')
  const plugin = await AgentMapPlugin({
    directory: cwd,
    client: {
      tui: {
        showToast: async () => {},
      },
    },
  } as never)
  const output = { system: [] as string[] }
  await plugin['experimental.chat.system.transform']({ sessionID: 'example-session' } as never, output as never)

  process.stdout.write(`plugin-load: ok (exit=${exit.code ?? 'null'} signal=${exit.signal ?? 'null'})\n`)
  process.stdout.write(`transform-injected: ${String(output.system.some((part) => part.includes('<agentmap>')))}\n`)
} finally {
  if (createdGitRepo) {
    await rm(`${cwd}.git`, { recursive: true, force: true })
  }
}
