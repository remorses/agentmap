# Changelog

## 0.8.0

- Add submodule detection and display in the codebase map
- Submodules show their checked-out branch, short commit SHA, and dirty state (e.g. `submodule: "main @ a1b2c3d"`)
- Detached HEAD and uninitialized submodules are labeled accordingly
- Filter submodule paths from git diff output to prevent misleading stats (pointer changes were showing as `+1-1`)
- Add `--no-submodules` CLI flag to exclude submodule info from the map
- New types exported: `SubmoduleInfo`, `SubmoduleEntry`

## 0.7.1

- Update `prompt` command to include AGENTS.md/CLAUDE.md snippet for keeping file comments updated

## 0.7.0

- Add `--filter` flag to filter files by glob patterns (can be repeated)
- Git diff info now always included (removed `--diff` flag)
- Fix file reading errors - skip unreadable files silently instead of crashing

## 0.6.0

- Add Zig language support with struct, union, enum, and extern detection
- Add export detection for Rust (`pub`) and Go (uppercase names)
- Add `extern` field for FFI declarations (C/C++, Zig)
- Use correct definition types: `struct`, `union`, `trait` instead of generic `class`
- Skip license headers (Copyright, SPDX, etc.) when extracting file descriptions
- Include shebang lines in file descriptions
- Refactor language-specific code into `languages/` directory
- Remove `fast-glob` dependency - only use `git ls-files` for tracked files
- Add safety checks: skip if not in git repo or if running from home directory
- Export `isGitRepo` and `isHomeDirectory` utilities

## 0.5.0

- Add README.md support: include README files in the map with their content as description
- README files appear first in each folder's listing
- Case-insensitive matching for `readme`, `README`, `readme.md`, `README.md`
- Use `marked` lexer to parse markdown AST and extract plain text
- Skip images, HTML comments, and badges from markdown content
- Truncate descriptions to 25 lines with `... and N more lines` indicator
- Graceful fallback to raw content if markdown parsing fails

## 0.4.2

- Improve `prompt` command for monorepos: detect workspaces/packages and use Task tool for concurrent processing
- Update existing file comments instead of skipping them
- Add note about re-running prompt to keep descriptions up to date
- Update README with better OpenCode integration example using `-p` flag

## 0.4.1

- Simplify definition output to show only start line instead of line range

## 0.4.0

- Add `prompt` command to generate AI instructions for adding file descriptions
- Prompt instructs agent to analyze repo, add header comments to important files, and set up OpenCode plugin

## 0.3.0

- Add `--diff` flag to show git diff status for definitions
- Show line ranges (e.g., `line 10-25`) instead of just start line
- File-level diff stats (`+N-M`) using reliable `--numstat` parsing
- Definition-level status: `added (+N)` or `updated (+N-M)`
- Defensive git options for cross-platform reliability
- Handle edge cases: binary files, paths with spaces, Windows paths
- Graceful error handling - diff failures don't crash the system
- Decrease minimum body lines from 7 to 5

## 0.2.0

- Moved to bun workspace monorepo structure
- OpenCode plugin moved to separate package `@agentmap/opencode`

## 0.1.2

- Initial public release
- CLI tool to generate YAML maps of codebases
- Support for TypeScript, JavaScript, Python, Rust, and Go
- Tree-sitter based parsing for accurate definition extraction
- `@agentmap` marker system for selective file inclusion
