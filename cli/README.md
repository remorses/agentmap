# agentmap

TypeScript CLI and library for generating a compact YAML codebase map for coding agents.

## Install

```bash
bun add agentmap
```

## CLI

```bash
agentmap
agentmap . --output agentmap.yaml
```

If the repo root contains `.agentmapignore`, matching paths are excluded automatically. For example:

```gitignore
foldername
dist
generated/**
```

This keeps both CLI output and the OpenCode plugin context shorter without needing repeated `--ignore` flags.

## Library

```ts
import { generateMapYaml } from 'agentmap'

const yaml = await generateMapYaml({ dir: process.cwd(), diff: true })
```
