# Changelog

## 0.7.2

1. **Fixed system prompt changing mid-session** — the agentmap block injected into the system prompt was being regenerated on every turn (including resumed sessions), causing the prompt to shift as git diff stats changed. The plugin now persists a snapshot of the first generated prompt per session ID to `~/.local/state/agentmap/` and reuses it for all subsequent turns, keeping the context stable across the entire session.

## 0.7.1

1. **Fixed plugin boot reliability in OpenCode** — the plugin entrypoint now exports a loader-safe default export and uses the updated `agentmap` scanner imports, so OpenCode can load the plugin and inject `<agentmap>` context without repeated startup errors.

## 0.7.0

1. **Fixed plugin loading under OpenCode loaders** — the plugin failed to start whenever agentmap pulled in `web-tree-sitter`, `picomatch`, or other transitive CJS/async dependencies through the OpenCode ESM runtime. Switched to interop-safe imports so the plugin now loads cleanly every time.

2. **Fixed system prompt stability across sessions** — the injected agentmap context was sometimes reused from the previous session on the first turn of a new session, then swapped on the second turn, breaking prompt-cache stability. Cache invalidation now happens at system-prompt construction time so the map is always correct from turn 1.

## 0.6.0

1. **Error toast notifications** — plugin errors now surface as OpenCode TUI toast notifications instead of being silently swallowed or polluting the terminal UI.

2. **Updated to use agentmap 0.9.0** — benefits from recursive submodule trees, symlink filtering, duplicate file detection, and compressed output.

## 0.5.0

- Update to use agentmap 0.8.0 with submodule support
- Submodules now appear in the generated codebase map with branch and commit info

## 0.4.0

- Include git diff info in generated map by default
- Update to use agentmap 0.7.0

## 0.3.0

- Show only exported symbols when truncating files with many definitions
- Add `<agentmap-instructions>` section with guidance for maintaining file descriptions
- Safety checks now handled by agentmap library (non-git repos, home directory)
- Update to use agentmap 0.6.0

## 0.2.0

- Update to use agentmap 0.3.0 with new diff features
- Improved system prompt description

## 0.1.0

- Initial release
- OpenCode plugin that injects codebase map into system prompt
- Uses `experimental.chat.system.transform` hook to inject map wrapped in `<agentmap>` tags
