// Language detection and grammar loading for tree-sitter.

import Parser from 'web-tree-sitter'
import type { Language } from '../types.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/**
 * File extension to language mapping
 */
export const LANGUAGE_EXTENSIONS: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.rs': 'rust',
  '.go': 'go',
}

/**
 * Detect language from file path extension
 */
export function detectLanguage(filepath: string): Language | null {
  const ext = filepath.slice(filepath.lastIndexOf('.'))
  return LANGUAGE_EXTENSIONS[ext] ?? null
}

/**
 * Get the WASM grammar path for a language
 */
function getGrammarPath(language: Language): string {
  switch (language) {
    case 'typescript':
      return require.resolve('tree-sitter-typescript/tree-sitter-tsx.wasm')
    case 'javascript':
      return require.resolve('tree-sitter-javascript/tree-sitter-javascript.wasm')
    case 'python':
      return require.resolve('tree-sitter-python/tree-sitter-python.wasm')
    case 'rust':
      return require.resolve('tree-sitter-rust/tree-sitter-rust.wasm')
    case 'go':
      return require.resolve('tree-sitter-go/tree-sitter-go.wasm')
  }
}

/**
 * Cache for loaded grammars
 */
const grammarCache = new Map<Language, Parser.Language>()

/**
 * Ensure Parser is initialized before loading grammars
 */
let parserInitialized = false
async function ensureParserInit(): Promise<void> {
  if (!parserInitialized) {
    await Parser.init()
    parserInitialized = true
  }
}

/**
 * Load a tree-sitter grammar for the given language
 */
export async function loadGrammar(language: Language): Promise<Parser.Language> {
  await ensureParserInit()
  
  const cached = grammarCache.get(language)
  if (cached) return cached

  const path = getGrammarPath(language)
  const grammar = await Parser.Language.load(path)
  grammarCache.set(language, grammar)
  return grammar
}

/**
 * Clear grammar cache (for testing)
 */
export function clearGrammarCache(): void {
  grammarCache.clear()
}
