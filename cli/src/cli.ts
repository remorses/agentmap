#!/usr/bin/env node
// CLI entrypoint for generating codebase maps.

import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import { cac } from 'cac'
import { generateMap, toYaml } from './index.js'
import { createConsoleLogger } from './logger.js'

const cli = cac('agentmap')
const logger = createConsoleLogger()

const NO_FILES_MESSAGE = `No files found with header comments.

To include a file in the map, add a comment at the top:

  // Description of this file.
  // What it does and why.

  export function main() { ... }

The description will appear in the 'desc' field of the output.
`

cli
  .command('[dir]', 'Generate a YAML map of the codebase')
  .option('-o, --output <file>', 'Write output to file (default: stdout)')
  .option('-i, --ignore <pattern>', 'Ignore pattern (can be repeated)', { type: [] })
  .option('-f, --filter <pattern>', 'Filter pattern - only include matching files (can be repeated)', { type: [] })
  .option('--no-submodules', 'Exclude submodule info from the map')
  .action(async (dir: string | undefined, options: { output?: string; ignore?: string[]; filter?: string[]; submodules?: boolean }) => {
    const targetDir = resolve(dir ?? '.')

    try {
      const map = await generateMap({
        dir: targetDir,
        ignore: options.ignore,
        filter: options.filter,
        diff: true,
        submodules: options.submodules,
        logger,
      })

      // Check if map is empty (only has root key with empty object)
      const rootKey = Object.keys(map)[0]
      const rootValue = map[rootKey]
      if (!rootValue || Object.keys(rootValue).length === 0) {
        logger.warn(NO_FILES_MESSAGE.trimEnd())
        process.exit(0)
      }

      const yaml = toYaml(map)

      if (options.output) {
        await writeFile(options.output, yaml, 'utf8')
        logger.info(`Wrote map to ${options.output}`)
      } else {
        process.stdout.write(yaml.endsWith('\n') ? yaml : `${yaml}\n`)
      }
    } catch (err) {
      logger.error('Error:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

const PROMPT_TEXT = `Analyze the repository structure first. Look for clear separation of concerns:
- Monorepo workspaces (package.json workspaces, pnpm-workspace.yaml, etc.)
- Separate packages or modules
- Different languages or technology stacks
- Independent services or apps

If you find well-separated packages, use the Task tool to process them concurrently - assign each package/workspace to a separate task agent for speed.

For each package/area, identify the most important files - entry points, core modules, main utilities, and key abstractions.

For each important file, add a descriptive comment at the top (before any imports or code). The comment should:
- Be 2-4 lines describing what the file does and why it exists
- Use the appropriate comment style for the language (// for JS/TS, # for Python, //! for Rust modules, etc.)
- If the file is an entry point (CLI, main, server start, etc.), mark it as such in the description
- If the file already has a top comment, review and update it to be accurate and descriptive - don't skip it
- If the file has a shebang (#!/...), keep it as the first line and add the description comment immediately after
- Ensure the description comment appears above any import statements in the file

Examples:

TypeScript/JavaScript:
// CLI entrypoint for the application.
// Parses command-line arguments and orchestrates the main workflow.
import { run } from "./runner"

Python:
# Database connection manager.
# Handles connection pooling and provides transaction helpers.
import asyncio

Rust:
//! HTTP server module.
//! Entry point for the web API, configures routes and middleware.
use crate::server::start

With shebang (shell scripts, node CLI, etc.):
#!/usr/bin/env node
// CLI entrypoint for the build tool.
// Handles argument parsing and runs the build pipeline.
import { build } from "./build"

After adding comments to all important files, run \`npx -y agentmap\` to verify the files appear in the generated map.

You can run this prompt again anytime to keep file descriptions up to date as the codebase evolves.

Finally, add these instructions to the project's AGENTS.md or CLAUDE.md file (create it if it doesn't exist):

\`\`\`markdown
## Codebase Map

Run \`npx -y agentmap\` to see the repo structure with file descriptions, definitions, and git diff status.

When editing files with top-level description comments, keep them accurate and up-to-date with your changes.
\`\`\`

For OpenCode users, also set up the agentmap plugin so future sessions automatically get the codebase map:
1. Add "@agentmap/opencode" to the plugin array in ~/.config/opencode/config.json
   - Create the file if it doesn't exist
   - If a plugin array already exists, append to it
   - Example: { "plugin": ["@agentmap/opencode"] }
2. Tell the user to restart OpenCode to activate the plugin.`

cli
  .command('prompt', 'Generate a prompt to help AI agents add file descriptions')
  .action(() => {
    process.stdout.write(`${PROMPT_TEXT}\n`)
  })

cli.help()
cli.version('0.8.0')

cli.parse()
