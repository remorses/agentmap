# Agent Instructions

This is a bun workspace monorepo containing two packages:

- `cli/` - The main `agentmap` CLI and library (published as `agentmap` on npm)
- `opencode/` - OpenCode plugin (published as `@agentmap/opencode` on npm)

## Setup

This repo uses **bun** for package management and workspaces. Always use bun commands:

```bash
bun install        # Install dependencies
bun run build      # Build all packages
bun --filter cli build   # Build specific package
```

## Publishing

**Important**: Use `bun publish` instead of `npm publish`.

Bun automatically replaces `workspace:*` protocol with the actual version number when publishing. npm does not support this and will fail.

```bash
cd cli && bun publish      # Publish agentmap
cd opencode && bun publish # Publish @agentmap/opencode
```

## Workspace Structure

```
.
├── package.json       # Root workspace config (workspaces: ["./*"])
├── README             # Main documentation
├── AGENTS.md          # This file
├── cli/               # agentmap CLI package
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
└── opencode/          # @agentmap/opencode plugin
    ├── package.json
    ├── tsconfig.json
    └── src/
```

## Dependencies

The `@agentmap/opencode` package depends on `agentmap` using the workspace protocol:

```json
{
  "dependencies": {
    "agentmap": "workspace:*"
  }
}
```

This gets replaced with the actual version (e.g., `^0.2.0`) when publishing with bun.
