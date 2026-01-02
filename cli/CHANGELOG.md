# Changelog

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
