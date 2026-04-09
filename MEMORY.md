# Memory

- `@agentmap/opencode` must treat `experimental.chat.system.transform` as the authoritative session boundary for prompt-cached state. In OpenCode, `chat.message` runs after system prompt construction, so clearing per-session caches there can leak the previous session's system prompt into the first turn of the next session.
- In OpenCode source-mode, CommonJS-ish packages like `ignore` and `picomatch` can fail both default-import interop and top-level `require()`. In `agentmap`, lazy `await import()` from async scanner code is the safe path.
