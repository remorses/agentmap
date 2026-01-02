#!/usr/bin/env node
// CLI entrypoint for generating codebase maps.

import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import { cac } from 'cac'
import { generateMap, generateMapYaml } from './index.js'

const cli = cac('agentmap')

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
  .option('-d, --diff', 'Include git diff status for definitions (added/updated, +N-M)')
  .action(async (dir: string | undefined, options: { output?: string; ignore?: string[]; diff?: boolean }) => {
    const targetDir = resolve(dir ?? '.')

    try {
      const map = await generateMap({
        dir: targetDir,
        ignore: options.ignore,
        diff: options.diff,
      })

      // Check if map is empty (only has root key with empty object)
      const rootKey = Object.keys(map)[0]
      const rootValue = map[rootKey]
      if (!rootValue || Object.keys(rootValue).length === 0) {
        console.error(NO_FILES_MESSAGE)
        process.exit(0)
      }

      const yaml = await generateMapYaml({
        dir: targetDir,
        ignore: options.ignore,
        diff: options.diff,
      })

      if (options.output) {
        await writeFile(options.output, yaml, 'utf8')
        console.error(`Wrote map to ${options.output}`)
      } else {
        console.log(yaml)
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

cli.help()
cli.version('0.1.0')

cli.parse()
