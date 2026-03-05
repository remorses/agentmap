// Shared logger abstraction used by CLI and integrations.

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const NOOP = () => {}

const NOOP_LOGGER: Logger = {
  debug: NOOP,
  info: NOOP,
  warn: NOOP,
  error: NOOP,
}

export function createNoopLogger(): Logger {
  return NOOP_LOGGER
}

function formatArg(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Error) {
    return value.stack ?? value.message
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function formatLogMessage(args: unknown[]): string {
  return args.map(formatArg).join(' ')
}

function writeLine(stream: Pick<NodeJS.WriteStream, 'write'>, args: unknown[]): void {
  const message = formatLogMessage(args)
  stream.write(message.endsWith('\n') ? message : `${message}\n`)
}

export function createConsoleLogger(): Logger {
  return {
    debug: (...args) => writeLine(process.stderr, args),
    info: (...args) => writeLine(process.stderr, args),
    warn: (...args) => writeLine(process.stderr, args),
    error: (...args) => writeLine(process.stderr, args),
  }
}
