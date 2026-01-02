#!/usr/bin/env node
// CLI entrypoint for generating codebase maps.

import { writeFile } from 'fs/promises'
import { resolve, extname } from 'path'
import { cac } from 'cac'
import { generateMap, generateMapYaml, generateSubmaps } from './index.js'
import type { OutputFormat } from './types.js'

const cli = cac('agentmap')

const NO_FILES_MESSAGE = `No files found with header comments.

To include a file in the map, add a comment at the top:

  // Description of this file.
  // What it does and why.

  export function main() { ... }

The description will appear in the 'desc' field of the output.
`

/**
 * Detect format from filename extension
 */
function detectFormat(filename: string): OutputFormat {
  const ext = extname(filename).toLowerCase()
  return ext === '.md' ? 'md' : 'yaml'
}

cli
  .command('[dir]', 'Generate a YAML map of the codebase')
  .option('-o, --output <file>', 'Output filename (default: map.yaml)')
  .option('--submaps', 'Enable submaps: respect @agentmap:path markers, output nested files')
  .option('--dir <dir>', 'Subdirectory for map files (e.g., .ruler)')
  .option('--dry-run', 'Show what would be written without writing')
  .option('--verbose', 'Show submap resolution details')
  .option('-i, --ignore <pattern>', 'Ignore pattern (can be repeated)', { type: [] })
  .option('-d, --diff', 'Include git diff status for definitions (added/updated, +N-M)')
  .action(async (dir: string | undefined, options: { 
    output?: string
    submaps?: boolean
    dir?: string
    dryRun?: boolean
    verbose?: boolean
    ignore?: string[]
    diff?: boolean
  }) => {
    const targetDir = resolve(dir ?? '.')
    const outputFile = options.output ?? 'map.yaml'
    const format = detectFormat(outputFile)

    try {
      // Submaps mode: create root + nested files
      if (options.submaps) {
        const result = await generateSubmaps({
          dir: targetDir,
          ignore: options.ignore,
          outDir: options.dir,
          outputFile,
          format,
          dryRun: options.dryRun,
          verbose: options.verbose,
        })
        
        if (result.fileCount === 0) {
          console.error(NO_FILES_MESSAGE)
          process.exit(0)
        }
        
        if (options.verbose || options.dryRun) {
          console.error(`\nProcessed ${result.fileCount} files across ${result.submapCount} submaps`)
        }
        
        if (!options.dryRun) {
          console.error(`Wrote ${result.submapCount} map file(s)`)
        }
        return
      }
      
      // Legacy single-file mode (no submaps, everything expanded)
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
