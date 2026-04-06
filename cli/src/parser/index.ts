// Tree-sitter parser initialization and code parsing.

import type ParserType from 'web-tree-sitter'
import type { Language, SyntaxTree } from '../types.js'
import { loadGrammar } from './languages.js'
import { loadParserClass } from './web-tree-sitter.js'

let initialized = false
let sharedParser: ParserType | null = null

/**
 * Initialize the tree-sitter parser
 */
export async function initParser(): Promise<void> {
  if (initialized) return
  const Parser = await loadParserClass()
  await Parser.init()
  initialized = true
}

/**
 * Get the shared parser instance
 */
async function getParser(): Promise<ParserType> {
  if (sharedParser) return sharedParser
  await initParser()
  const Parser = await loadParserClass()
  const parser = new Parser()
  sharedParser = parser
  return parser
}

/**
 * Parse source code and return the syntax tree
 */
export async function parseCode(
  code: string,
  language: Language
): Promise<SyntaxTree> {
  const parser = await getParser()
  const grammar = await loadGrammar(language)
  parser.setLanguage(grammar)
  return parser.parse(code)
}

/**
 * Reset the parser (for testing)
 */
export function resetParser(): void {
  if (sharedParser) {
    sharedParser.delete()
    sharedParser = null
  }
  initialized = false
}

export { detectLanguage, loadGrammar, LANGUAGE_EXTENSIONS } from './languages.js'
