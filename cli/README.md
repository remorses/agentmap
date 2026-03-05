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

## Library

```ts
import { generateMapYaml } from 'agentmap'

const yaml = await generateMapYaml({ dir: process.cwd(), diff: true })
```
