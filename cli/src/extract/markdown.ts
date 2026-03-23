// Extract description from markdown files using marked AST.

import { Lexer, type Token, type Tokens } from 'marked'
import { readFirstLines } from './utils.js'

const MAX_LINES = 50
const MAX_DESC_LINES = 20

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
 * Extract plain text from inline tokens, skipping images.
 */
function extractInlineText(tokens: Token[] | undefined): string {
  if (!tokens) return ''
  
  const parts: string[] = []
  for (const token of tokens) {
    // Skip images
    if (token.type === 'image') {
      continue
    }
    
    // Handle text
    if (token.type === 'text') {
      const text = token as Tokens.Text
      if (text.text) {
        parts.push(text.text)
      }
      continue
    }
    
    // Handle links - extract the text content
    if (token.type === 'link') {
      const link = token as Tokens.Link
      if (link.text) {
        parts.push(link.text)
      }
      continue
    }
    
    // Handle strong/em - extract nested text
    if (token.type === 'strong' || token.type === 'em') {
      const styled = token as Tokens.Strong | Tokens.Em
      const inner = extractInlineText(styled.tokens)
      if (inner) {
        parts.push(inner)
      }
      continue
    }
    
    // Handle codespan (inline code)
    if (token.type === 'codespan') {
      const code = token as Tokens.Codespan
      if (code.text) {
        parts.push('`' + code.text + '`')
      }
      continue
    }
  }
  
  return parts.join('')
}

/**
 * Extract text content from markdown tokens recursively.
 * Skips HTML, comments, and images. Returns plain text lines.
 */
function extractTextFromTokens(tokens: Token[]): string[] {
  const lines: string[] = []
  
  for (const token of tokens) {
    // Skip HTML (includes comments)
    if (token.type === 'html') {
      continue
    }
    
    // Skip spaces
    if (token.type === 'space') {
      continue
    }
    
    // Handle headings - extract inline text
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading
      const text = extractInlineText(heading.tokens)
      if (text) {
        lines.push(text)
      }
      continue
    }
    
    // Handle paragraphs - extract inline text (skips images)
    if (token.type === 'paragraph') {
      const para = token as Tokens.Paragraph
      const text = extractInlineText(para.tokens)
      if (text) {
        lines.push(text)
      }
      continue
    }
    
    // Handle lists - extract text from items
    if (token.type === 'list') {
      const list = token as Tokens.List
      for (const item of list.items) {
        const text = extractInlineText(item.tokens)
        if (text) {
          lines.push('- ' + text.split('\n')[0])
        }
      }
      continue
    }
    
    // Handle blockquotes - extract nested tokens
    if (token.type === 'blockquote') {
      const quote = token as Tokens.Blockquote
      if (quote.tokens) {
        const nestedLines = extractTextFromTokens(quote.tokens)
        lines.push(...nestedLines.map(l => '> ' + l))
      }
      continue
    }
    
    // Handle code blocks - include with fence
    if (token.type === 'code') {
      const code = token as Tokens.Code
      if (code.lang) {
        lines.push('```' + code.lang)
      } else {
        lines.push('```')
      }
      lines.push(...code.text.split('\n'))
      lines.push('```')
      continue
    }
    
    // Handle text tokens (inline)
    if (token.type === 'text') {
      const text = token as Tokens.Text
      if (text.text) {
        lines.push(text.text)
      }
      continue
    }
  }
  
  return lines
}

/**
 * Extract description from a markdown file using marked lexer.
 * Parses first N lines, extracts plain text from AST nodes,
 * ignoring HTML comments and images.
 * Falls back to raw content if parsing fails.
 */
export async function extractMarkdownDescription(filepath: string): Promise<string | null> {
  const head = await readFirstLines(filepath, MAX_LINES)
  if (head === null) {
    // File couldn't be read - skip silently
    return null
  }
  
  try {
    // Parse markdown to tokens using marked lexer
    const lexer = new Lexer()
    const tokens = lexer.lex(head)
    
    // Extract text from tokens
    const lines = extractTextFromTokens(tokens)
    
    // Filter empty lines
    const contentLines = lines.filter(l => l.trim() !== '')
    if (contentLines.length === 0) {
      return null
    }
    
    return truncateDescription(contentLines)
  } catch {
    // Fallback: return raw content if parsing fails
    const lines = head.split('\n').filter(l => l.trim() !== '')
    if (lines.length === 0) {
      return null
    }
    return truncateDescription(lines)
  }
}
