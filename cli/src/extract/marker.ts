// Extract file header comment/docstring using tree-sitter.
// Detects standard comment styles from existing projects.
// Automatically skips license headers (Copyright, SPDX, etc.).

import { parseCode, detectLanguage } from '../parser/index.js'
import { readFirstLines } from './utils.js'
import type { MarkerResult, Language, SyntaxNode } from '../types.js'

export { extractMarkdownDescription } from './markdown.js'

const MAX_LINES = 50
const MAX_DESC_LINES = 20

/**
 * Patterns that strongly indicate a license/copyright comment.
 * These are checked against comment text.
 */
const LICENSE_PATTERNS = [
  /\bcopyright\s*(?:\(c\)|©|\d{4})/i,   // "Copyright (c)", "Copyright ©", "Copyright 2024"
  /\bspdx-license-identifier\s*:/i,     // "SPDX-License-Identifier: MIT"
  /\ball rights reserved\b/i,           // Common in copyright notices
  /\blicensed under\b/i,                // "Licensed under the MIT License", "Licensed under Apache 2.0"
  /\bpermission is hereby granted\b/i,  // MIT license text
  /\bredistribution and use\b/i,        // BSD license text
  /\bthis source code is licensed\b/i,  // Meta/Facebook style
  /\bwithout warranty\b/i,              // Common in license text
  /\bthe software is provided "as is"\b/i, // MIT license text
]

/**
 * Check if comment text looks like a license/copyright header.
 * Uses patterns specific to actual license text to avoid false positives.
 */
function isLicenseComment(text: string): boolean {
  return LICENSE_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Truncate lines to MAX_DESC_LINES, adding indicator if truncated
 */
function truncateDescription(lines: string[]): string {
  const trimmed = lines.join('\n').trim()
  const trimmedLines = trimmed.split('\n')
  
  if (trimmedLines.length <= MAX_DESC_LINES) {
    return trimmed
  }
  
  const truncated = trimmedLines.slice(0, MAX_DESC_LINES)
  const remaining = trimmedLines.length - MAX_DESC_LINES
  truncated.push(`... and ${remaining} more lines`)
  return truncated.join('\n')
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
  if (head === null) {
    // File couldn't be read - skip silently
    return { found: false }
  }
  
  return extractMarkerFromCode(head, language)
}

/**
 * Extract header comment/docstring from code string.
 * Use this when you already have the file content to avoid re-reading.
 */
export async function extractMarkerFromCode(code: string, language: Language): Promise<MarkerResult> {
  // Only parse first MAX_LINES worth of content for efficiency
  const lines = code.split('\n').slice(0, MAX_LINES)
  const head = lines.join('\n')
  
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
  let shebang: string | null = null

  // Capture shebang if present
  // Python/shell: comment node starting with #!
  // JS/TS: hash_bang_line node
  const firstChild = children[0]
  if (firstChild?.type === 'hash_bang_line' || 
      (firstChild?.type === 'comment' && firstChild.text.startsWith('#!'))) {
    shebang = firstChild.text.trim()
    startIdx = 1
  }

  // Skip JS/TS directives like "use strict", "use client"
  while (startIdx < children.length && isDirective(children[startIdx])) {
    startIdx++
  }

  if (startIdx >= children.length) {
    // Only shebang, no description
    return shebang
  }

  const first = children[startIdx]

  // Helper to prepend shebang to description
  const withShebang = (desc: string | null): string | null => {
    if (!desc) return shebang
    if (!shebang) return desc
    return `${shebang}\n${desc}`
  }

  // Python: check for module docstring (expression_statement containing string)
  if (language === 'python' && first.type === 'expression_statement') {
    const str = first.childForFieldName('expression') ?? first.child(0)
    if (str?.type === 'string') {
      const docstring = extractPythonDocstring(str)
      // Skip if it looks like a license
      if (docstring && isLicenseComment(docstring)) {
        // Try to find next comment after this docstring
        return withShebang(extractConsecutiveComments(children, startIdx + 1, language))
      }
      return withShebang(docstring)
    }
  }

  // Collect consecutive comment nodes at the start, skipping license comments
  if (isCommentNode(first)) {
    return withShebang(extractConsecutiveCommentsSkipLicense(children, startIdx, language))
  }

  return shebang
}

/**
 * Extract consecutive comments, skipping leading license comments
 */
function extractConsecutiveCommentsSkipLicense(
  children: SyntaxNode[],
  startIdx: number,
  language: Language
): string | null {
  let idx = startIdx
  
  while (idx < children.length) {
    const node = children[idx]
    
    // Skip non-comment nodes (might be blank lines, etc.)
    if (!isCommentNode(node)) {
      idx++
      continue
    }
    
    const text = extractCommentText(node, language)
    if (text === null) {
      idx++
      continue
    }
    
    // Check if this comment is a license
    if (isLicenseComment(text)) {
      // Skip this license comment
      idx++
      // Continue to skip any consecutive license comments
      continue
    }
    
    // Found a non-license comment - extract from here
    return extractConsecutiveComments(children, idx, language)
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
  }

  return truncateDescription(lines)
}

/**
 * Check if comment is a TypeScript triple-slash reference directive
 * These are compiler directives, not actual comments
 */
function isReferenceDirective(text: string): boolean {
  return /^\/\/\/\s*<reference\s/.test(text)
}

/**
 * Extract text content from a comment node
 */
function extractCommentText(node: SyntaxNode, language: Language): string | null {
  const text = node.text

  // Skip TypeScript triple-slash reference directives
  if (isReferenceDirective(text)) {
    return null
  }

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
    return truncateDescription(lines)
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
  return truncateDescription(lines)
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
