// @agentmap
// Extract @agentmap marker and description from file header.

import { open } from 'fs/promises'
import type { MarkerResult } from '../types.js'

const MARKER = '@agentmap'
const MAX_BYTES = 30_000  // ~300 lines worth

/**
 * Regex to match @agentmap marker with optional zone
 * Captures: zone (optional, the part after :)
 * Examples:
 *   @agentmap        -> zone: undefined
 *   @agentmap:.      -> zone: "."
 *   @agentmap:..     -> zone: ".."
 *   @agentmap:src/common -> zone: "src/common"
 */
const MARKER_REGEX = /[@#]\s*agentmap(?::([^\s*]+))?/

/**
 * Read the first N bytes of a file
 */
async function readHead(filepath: string, maxBytes: number): Promise<string> {
  const handle = await open(filepath, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Check if file has @agentmap marker and extract description and zone.
 * Only reads first ~30KB of file for performance.
 */
export async function extractMarker(filepath: string): Promise<MarkerResult> {
  const head = await readHead(filepath, MAX_BYTES)
  const lines = head.split('\n')

  // Find the marker line
  let markerLineIndex = -1
  let zone: string | undefined
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Skip empty lines at start
    if (line === '') continue
    // Check if this line contains the marker using regex
    const match = MARKER_REGEX.exec(line)
    if (match) {
      markerLineIndex = i
      zone = match[1] // Captured zone (may be undefined)
      break
    }
    // Check for old-style marker without regex (backwards compatibility)
    if (line.includes(MARKER)) {
      markerLineIndex = i
      break
    }
    // If we hit a non-comment, non-empty line before finding marker, stop
    if (!isCommentLine(line)) {
      return { found: false }
    }
  }

  if (markerLineIndex === -1) {
    return { found: false }
  }

  // Extract description from lines after marker
  const description = extractDescription(lines, markerLineIndex)

  return {
    found: true,
    description: description || undefined,
    zone,
  }
}

/**
 * Check if a line is a comment
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('"""') ||
    trimmed.startsWith("'''") ||
    trimmed.endsWith('*/') ||
    trimmed.endsWith('"""') ||
    trimmed.endsWith("'''")
  )
}

/**
 * Extract description text from comment lines after marker
 */
function extractDescription(lines: string[], markerLineIndex: number): string {
  const descLines: string[] = []
  
  // Check if marker is on its own line or has text after it
  const markerLine = lines[markerLineIndex]
  const markerText = extractTextAfterMarker(markerLine)
  if (markerText) {
    descLines.push(markerText)
  }

  // Continue reading comment lines after marker
  for (let i = markerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Empty line in comments is ok, include it
    if (trimmed === '') {
      // But stop if we've already collected some description
      if (descLines.length > 0) {
        // Check if next non-empty line is still a comment
        let nextNonEmpty = i + 1
        while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') {
          nextNonEmpty++
        }
        if (nextNonEmpty < lines.length && !isCommentLine(lines[nextNonEmpty].trim())) {
          break
        }
      }
      continue
    }

    // Stop at non-comment line
    if (!isCommentLine(trimmed)) {
      break
    }

    // Stop at end of block comment
    if (trimmed === '*/' || trimmed === '"""' || trimmed === "'''") {
      break
    }

    // Extract text from comment line
    const text = stripCommentPrefix(trimmed)
    if (text !== null) {
      descLines.push(text)
    }
  }

  return descLines.join('\n').trim()
}

/**
 * Extract text after @agentmap marker on the same line
 * Skips any zone specifier (e.g., :., :.., :src/common)
 */
function extractTextAfterMarker(line: string): string {
  const match = MARKER_REGEX.exec(line)
  if (!match) return ''
  
  // Get position after the full match (including zone if any)
  const afterMatch = line.slice(match.index + match[0].length).trim()
  return afterMatch
}

/**
 * Strip comment prefix from a line
 */
function stripCommentPrefix(line: string): string | null {
  // Handle various comment styles
  if (line.startsWith('///')) return line.slice(3).trim()
  if (line.startsWith('//')) return line.slice(2).trim()
  if (line.startsWith('##')) return line.slice(2).trim()
  if (line.startsWith('#')) return line.slice(1).trim()
  if (line.startsWith('*')) return line.slice(1).trim()
  if (line.startsWith('/*')) return line.slice(2).trim()
  return line
}
