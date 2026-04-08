**agentmap**

A compact, YAML-based inventory of your codebase, intended to be prepended to a coding agent's context at session start.

**Purpose**

- Give the agent a fast, structured overview of files and responsibilities
- Provide jump targets via top-level `defs` (functions/classes with line numbers)

**Example Output**

```yaml
my-project:
  src:
    cli.ts:
      description: CLI entrypoint for generating codebase maps.
      defs:
        main: exported fn
        parseArgs: fn
    lib:
      parser.ts:
        description: Tree-sitter parser initialization and code parsing.
        defs:
          parseCode: exported fn
          resetParser: exported fn
      types.ts:
        description: Core type definitions for the codebase map.
```

> [!NOTE]
> Descriptions are extracted from header comments or docstrings at the top of each file. Files without a header comment are not included in the map. See [File Detection](#file-detection) below for examples.

The map contains:
- **File tree structure** — nested directories and files
- **Descriptions** — extracted from header comments/docstrings in each file
- **Definitions** — top-level functions and classes with export status (compact format: `exported fn`, `fn`, `exported class`)
- **Git diff stats** — `+N-M` change indicators for modified files and definitions
- **Submodule trees** — initialized git submodules rendered as real directory trees with their full file structure
- **Duplicate detection** — files with identical content shown as `duplicate of <path>` stubs

This gives the agent a workflow for checking codebase structure at session start and keeping file descriptions up to date.

**OpenCode Plugin**

agentmap includes a plugin for [OpenCode](https://opencode.ai) that automatically injects the codebase map into the system prompt at session start.

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["@agentmap/opencode"]
}
```

The plugin will scan your project for files with header comments and inject the map into the system prompt wrapped in `<agentmap>` tags. This gives the AI agent immediate context about your codebase structure without needing to explore files first.

**Quick Setup**

The `agentmap prompt` command generates instructions for an AI agent to add header comments to your most important files. This bootstraps your codebase so agentmap can discover and describe files automatically.

Why add descriptions? Without them, agents must read files to understand what they do. With descriptions in the map, agents can navigate your codebase structure instantly and jump directly to relevant code.

```bash
opencode run "$(npx -y agentmap prompt)"
```

This generates a prompt that instructs the agent to:
1. Analyze your repository structure
2. Identify the most important files (entry points, core modules, utilities)
3. Add descriptive comments at the top of each file
4. Mark entry points as such
5. Set up the `@agentmap/opencode` plugin in `opencode.json`

These comments make your files discoverable in the agentmap. The plugin automatically injects the map into future sessions.

**CLI Usage**

```bash
# Map current directory
npx agentmap

# Map specific directory
npx agentmap ./src

# Write to file
npx agentmap -o map.yaml

# Filter to specific directories or files
npx agentmap --filter "src/**" --filter "lib/**"

# Ignore patterns
npx agentmap --ignore "dist/**" --ignore "**/test/**"
```

**.agentmapignore**

If the repo root contains a `.agentmapignore` file, agentmap excludes matching paths from the generated map automatically.

The format is intentionally simple and line-based, similar to `.gitignore`. A bare directory name excludes everything under that folder:

```gitignore
foldername
dist
generated/**
```

Use `--ignore` for one-off CLI patterns and `.agentmapignore` for repo-local defaults that should also affect the OpenCode plugin context.

**Options**

```
-o, --output <file>           Write output to file (default: stdout)
-f, --filter <pattern>        Filter pattern - only include matching files (can be repeated)
-i, --ignore <pattern>        Ignore pattern (can be repeated)
    --no-submodules           Exclude submodule info from the map
    --max-desc-chars <chars>  Max characters for descriptions (default: 300)
-h, --help                    Show help
-v, --version                 Show version
```

**Commands**

```bash
# Generate a prompt to help AI agents add file descriptions
npx agentmap prompt
```

**File Detection**

Files with a header comment or docstring are automatically included. agentmap detects standard comment styles used in existing projects - no special markers needed. Place the header comment above any import statements in the file.

**TypeScript / JavaScript:**

```typescript
// CLI entrypoint.
// Parses args, wires deps, calls into lib/.
import { parseArgs } from "./args"

export function main() { ... }
```

```typescript
/**
 * Core data structures.
 * Used throughout the application.
 */
import type { Config } from "./config"

export class App { ... }
```

**Python:**

```python
"""
Parsing and normalization utilities.
Handles input validation and transformation.
"""

from .schema import InputSchema

def parse_input(): ...
```

```python
# Configuration loader.
# Reads from environment and config files.

import os

def load_config(): ...
```

**Rust:**

```rust
//! HTTP client module.
//! Provides async request handling.

use crate::http::client

pub fn fetch() { ... }
```

**Go:**

```go
// Package utils provides helper functions.
// Includes string manipulation and validation.

import "strings"

func Helper() { ... }
```

Descriptions are limited to the first 20 lines of the header comment (and 300 characters by default, configurable via `--max-desc-chars`).

**Supported Languages**

| Language   | Extensions                |
|------------|---------------------------|
| TypeScript | .ts .tsx .mts .cts        |
| JavaScript | .js .jsx .mjs .cjs        |
| Python     | .py .pyi                  |
| Rust       | .rs                       |
| Go         | .go                       |
| Zig        | .zig                      |
| C/C++      | .c .h .cpp .hpp .cc .cxx  |

**Library Usage**

```typescript
import { generateMap, generateMapYaml } from 'agentmap'

// Get as object
const map = await generateMap({ dir: './src' })

// Get as YAML string
const yaml = await generateMapYaml({ dir: './src' })

// With filter patterns (only include matching files)
const yaml = await generateMapYaml({
  dir: './src',
  filter: ['src/**', 'lib/**']
})

// With ignore patterns
const yaml = await generateMapYaml({
  dir: './src',
  ignore: ['**/test/**', '**/*.spec.ts']
})
```

**License**

MIT
