// Extract file header comment/docstring using tree-sitter.
// Detects standard comment styles from existing projects.

import { open } from 'fs/promises'
import { parseCode, detectLanguage } from '../parser/index.js'
import type { MarkerResult, Language, SyntaxNode } from '../types.js'

const MAX_LINES = 50
const MAX_DESC_LINES = 20

/**
 * Read the first N lines of a file
 */
async function readFirstLines(filepath: string, maxLines: number): Promise<string> {
  const handle = await open(filepath, 'r')
  try {
    // Read enough bytes for ~50 lines (generous estimate)
    const buffer = Buffer.alloc(maxLines * 200)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const content = buffer.toString('utf8', 0, bytesRead)
    const lines = content.split('\n').slice(0, maxLines)
    return lines.join('\n')
  } finally {
    await handle.close()
  }
}

/**
 * Extract header comment/docstring from a file.
 * Uses tree-sitter for clean AST-based extraction.
 * 
 * Supports:
 * - // line comments (JS/TS/Go/Rust)
 * - /* block comments (JS/TS/Go/Rust)
 * - # line comments (Python)
 * - """ docstrings (Python)
 * - //! inner doc comments (Rust)
 */
export async function extractMarker(filepath: string): Promise<MarkerResult> {
  const language = detectLanguage(filepath)
  if (!language) {
    return { found: false }
  }

  const head = await readFirstLines(filepath, MAX_LINES)
  const tree = await parseCode(head, language)
  const description = extractHeaderFromAST(tree.rootNode, language)

  if (description === null) {
    return { found: false }
  }

  return {
    found: true,
    description: description || undefined,
  }
}

/**
 * Check if a node is a JS/TS directive like "use strict" or "use client"
 */
function isDirective(node: SyntaxNode): boolean {
  if (node.type !== 'expression_statement') return false
  const str = node.child(0)
  if (str?.type !== 'string') return false
  const text = str.text
  // Check for known directives (with quotes)
  return /^["']use (strict|client|server)["']$/.test(text)
}

/**
 * Extract header comment from AST root node
 */
function extractHeaderFromAST(root: SyntaxNode, language: Language): string | null {
  const children = getChildren(root)
  if (children.length === 0) {
    return null
  }

  let startIdx = 0

  // Skip shebang if present
  // Python/shell: comment node starting with #!
  // JS/TS: hash_bang_line node
  const firstChild = children[0]
  if (firstChild?.type === 'hash_bang_line' || 
      (firstChild?.type === 'comment' && firstChild.text.startsWith('#!'))) {
    startIdx = 1
  }

  // Skip JS/TS directives like "use strict", "use client"
  while (startIdx < children.length && isDirective(children[startIdx])) {
    startIdx++
  }

  if (startIdx >= children.length) {
    return null
  }

  const first = children[startIdx]

  // Python: check for module docstring (expression_statement containing string)
  if (language === 'python' && first.type === 'expression_statement') {
    const str = first.childForFieldName('expression') ?? first.child(0)
    if (str?.type === 'string') {
      return extractPythonDocstring(str)
    }
  }

  // Collect consecutive comment nodes at the start
  if (isCommentNode(first)) {
    return extractConsecutiveComments(children, startIdx, language)
  }

  return null
}

/**
 * Check if a node is a comment
 */
function isCommentNode(node: SyntaxNode): boolean {
  return (
    node.type === 'comment' ||
    node.type === 'line_comment' ||
    node.type === 'block_comment'
  )
}

/**
 * Extract consecutive comment nodes and combine their text
 */
function extractConsecutiveComments(
  children: SyntaxNode[],
  startIdx: number,
  language: Language
): string {
  const lines: string[] = []

  for (let i = startIdx; i < children.length; i++) {
    const node = children[i]
    if (!isCommentNode(node)) {
      break
    }

    const text = extractCommentText(node, language)
    if (text !== null) {
      lines.push(...text.split('\n'))
    }

    // Limit description length
    if (lines.length >= MAX_DESC_LINES) {
      break
    }
  }

  return lines.slice(0, MAX_DESC_LINES).join('\n').trim()
}

/**
 * Extract text content from a comment node
 */
function extractCommentText(node: SyntaxNode, language: Language): string | null {
  const text = node.text

  // Rust: line_comment may have doc_comment child with actual content
  if (language === 'rust' && node.type === 'line_comment') {
    const docComment = findChild(node, 'doc_comment')
    if (docComment) {
      return docComment.text.trim()
    }
    // Regular // comment - strip prefix
    return stripLinePrefix(text, '//')
  }

  // Block comment /* */ or /** */ (including Rust block_comment)
  if (text.startsWith('/*') || node.type === 'block_comment') {
    return extractBlockCommentText(text)
  }

  // Line comment // or #
  if (text.startsWith('//')) {
    return stripLinePrefix(text, '//')
  }
  if (text.startsWith('#')) {
    return stripLinePrefix(text, '#')
  }

  return text.trim()
}

/**
 * Strip comment prefix and optional following space
 * Handles //!, ///, //, ##, #
 */
function stripLinePrefix(text: string, prefix: string): string {
  let content = text.slice(prefix.length)
  // Strip optional ! or / after // (for //! and ///)
  if (prefix === '//' && (content.startsWith('!') || content.startsWith('/'))) {
    content = content.slice(1)
  }
  // Strip optional extra # after # (for ##)
  if (prefix === '#' && content.startsWith('#')) {
    content = content.slice(1)
  }
  // Strip optional leading space
  if (content.startsWith(' ')) {
    content = content.slice(1)
  }
  return content.trimEnd()
}

/**
 * Extract text from block comment, stripping delimiters and * prefixes
 */
function extractBlockCommentText(text: string): string {
  // Remove /* and */
  let content = text.slice(2)
  if (content.endsWith('*/')) {
    content = content.slice(0, -2)
  }
  // Remove leading * for JSDoc style
  if (content.startsWith('*')) {
    content = content.slice(1)
  }

  // Process lines, removing * prefixes
  const lines = content.split('\n').map(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith('* ')) {
      return trimmed.slice(2)
    }
    if (trimmed === '*') {
      return ''
    }
    if (trimmed.startsWith('*')) {
      return trimmed.slice(1).trim()
    }
    return trimmed
  })

  return lines.join('\n').trim()
}

/**
 * Extract Python docstring content from string node
 */
function extractPythonDocstring(node: SyntaxNode): string {
  // Find string_content child which has the actual text
  const content = findChild(node, 'string_content')
  if (content) {
    const lines = content.text.trim().split('\n')
    return lines.slice(0, MAX_DESC_LINES).join('\n').trim()
  }

  // Fallback: extract from full text
  let text = node.text
  // Remove triple quotes
  if (text.startsWith('"""') || text.startsWith("'''")) {
    text = text.slice(3)
  }
  if (text.endsWith('"""') || text.endsWith("'''")) {
    text = text.slice(0, -3)
  }

  const lines = text.trim().split('\n')
  return lines.slice(0, MAX_DESC_LINES).join('\n').trim()
}

/**
 * Get all children of a node as array
 */
function getChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = []
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) children.push(child)
  }
  return children
}

/**
 * Find first child of given type
 */
function findChild(node: SyntaxNode, type: string): SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === type) return child
  }
  return null
}
