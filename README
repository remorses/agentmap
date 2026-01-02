# agentmap

A compact, YAML-based inventory of your codebase, intended to be prepended to a coding agent's context at session start.

## Purpose

- Give the agent a fast, structured overview of files and responsibilities
- Provide jump targets via top-level `defs` (functions/classes with line numbers)

## Installation

```bash
npm install agentmap
```

## CLI Usage

```bash
# Map current directory
npx agentmap

# Map specific directory
npx agentmap ./src

# Write to file
npx agentmap -o map.yaml

# Ignore patterns
npx agentmap --ignore "dist/**" --ignore "**/test/**"
```

### Options

```
-o, --output <file>     Write output to file (default: stdout)
-i, --ignore <pattern>  Ignore pattern (can be repeated)
-h, --help              Show help
-v, --version           Show version
```

## Library Usage

```typescript
import { generateMap, generateMapYaml } from 'agentmap'

// Get as object
const map = await generateMap({ dir: './src' })

// Get as YAML string
const yaml = await generateMapYaml({ dir: './src' })

// With ignore patterns
const yaml = await generateMapYaml({
  dir: './src',
  ignore: ['**/test/**', '**/*.spec.ts']
})
```

## Marking Files

Only files with the `@agentmap` marker comment are included. Add it to the top of files you want in the map:

```typescript
// @agentmap
// CLI entrypoint.
// Parses args, wires deps, calls into lib/.

export function main() { ... }
```

```python
# @agentmap
# Parsing + normalization utilities.

def parse_input(): ...
```

Block comments also work:

```typescript
/**
 * @agentmap
 * Core data structures.
 */
```

## Output Format

```yaml
my-project:
  src:
    main.py:
      desc: |
        CLI entrypoint.
        Parses args, wires deps, calls into lib/.
      defs:
        main: 12
        parse_args: 34
        App: 58
  lib:
    parse.py:
      desc: |
        Parsing + normalization utilities.
      defs:
        parse_input: 10
        ASTNode: 41
```

### Format Rules

- Directories are YAML mappings
- Files have optional `desc` (description) and `defs` (definitions)
- `desc` uses YAML literal block scalar (`|`) for multi-line text
- `defs` maps symbol names to 1-based line numbers
- Only top-level `function` and `class` definitions are included

## Supported Languages

| Language   | Extensions                |
|------------|---------------------------|
| TypeScript | .ts .tsx .mts .cts        |
| JavaScript | .js .jsx .mjs .cjs        |
| Python     | .py .pyi                  |
| Rust       | .rs                       |
| Go         | .go                       |

## License

MIT
