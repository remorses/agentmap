// @agentmap
// Parse git diff output and calculate definition-level diff stats.
// Uses defensive git options for cross-platform reliability.

import { execSync } from 'child_process'
import type { Definition, DefinitionDiff, DiffHunk, FileDiff, FileDiffStats } from '../types.js'

/**
 * Defensive git options to ensure consistent output across platforms/configs
 */
const GIT_DIFF_OPTIONS = [
  '--no-color',      // No ANSI color codes
  '--no-ext-diff',   // No external diff tools
  '--no-textconv',   // No text conversion filters
  '--no-renames',    // Don't detect renames (simpler parsing)
].join(' ')

/**
 * Normalize file path for cross-platform compatibility
 * - Converts backslashes to forward slashes
 * - Handles quoted paths from git (e.g., paths with spaces/unicode)
 */
function normalizePath(path: string): string {
  // Git quotes paths with special characters: "path/with spaces/file.ts"
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1)
    // Handle escaped characters in quoted paths
    path = path.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  // Normalize to forward slashes
  return path.replace(/\\/g, '/')
}

/**
 * Safely execute a git command, returning empty string on any error
 */
function safeExec(cmd: string, dir: string): string {
  try {
    return execSync(cmd, {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10, // 10MB
      stdio: ['pipe', 'pipe', 'pipe'], // Capture stderr too
    })
  } catch (err) {
    // Log error so user knows something happened
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Warning: git diff failed: ${message}`)
    return ''
  }
}

/**
 * Parse git diff --numstat output for file-level stats
 * Format: "added<TAB>deleted<TAB>path" or "-<TAB>-<TAB>path" for binary
 * 
 * This is much more reliable than parsing full diff output.
 */
export function parseNumstat(numstatOutput: string): Map<string, FileDiffStats> {
  const stats = new Map<string, FileDiffStats>()
  
  if (!numstatOutput.trim()) {
    return stats
  }

  const lines = numstatOutput.split('\n')
  
  for (const line of lines) {
    if (!line.trim()) continue
    
    // Split by tab - format is: added<TAB>deleted<TAB>path
    const parts = line.split('\t')
    if (parts.length < 3) continue
    
    const [addedStr, deletedStr, ...pathParts] = parts
    const path = normalizePath(pathParts.join('\t')) // Path might contain tabs (rare but possible)
    
    // Binary files show as "-" for both counts - skip them
    if (addedStr === '-' || deletedStr === '-') {
      continue
    }
    
    const added = parseInt(addedStr, 10)
    const deleted = parseInt(deletedStr, 10)
    
    // Skip if parsing failed or no changes
    if (isNaN(added) || isNaN(deleted)) continue
    if (added === 0 && deleted === 0) continue
    
    stats.set(path, { added, deleted })
  }
  
  return stats
}

/**
 * Parse a hunk header like "@@ -10,5 +12,7 @@" or "@@ -10 +12,7 @@"
 */
export function parseHunkHeader(line: string): DiffHunk | null {
  // Match: @@ -oldStart[,oldCount] +newStart[,newCount] @@
  const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
  if (!match) return null

  return {
    oldStart: parseInt(match[1], 10),
    oldCount: match[2] ? parseInt(match[2], 10) : 1,
    newStart: parseInt(match[3], 10),
    newCount: match[4] ? parseInt(match[4], 10) : 1,
  }
}

/**
 * Parse git diff output into structured file diffs (for definition-level analysis)
 * Only extracts hunk positions, not content.
 */
export function parseDiff(diffOutput: string): Map<string, FileDiff> {
  const files = new Map<string, FileDiff>()
  
  if (!diffOutput.trim()) {
    return files
  }

  const lines = diffOutput.split('\n')

  let currentFile: string | null = null
  let hunks: DiffHunk[] = []

  for (const line of lines) {
    // New file header: "diff --git a/path b/path"
    if (line.startsWith('diff --git ')) {
      // Save previous file
      if (currentFile && hunks.length > 0) {
        files.set(currentFile, { path: currentFile, hunks })
      }
      
      // Extract path from "diff --git a/path b/path"
      // Use the b/ path (destination) as the canonical path
      const match = line.match(/diff --git a\/.+ b\/(.+)/)
      if (match) {
        currentFile = normalizePath(match[1])
      } else {
        currentFile = null
      }
      hunks = []
      continue
    }

    // Skip binary files indicator
    if (line.startsWith('Binary files ')) {
      currentFile = null
      hunks = []
      continue
    }

    // Hunk header
    if (line.startsWith('@@') && currentFile) {
      try {
        const hunk = parseHunkHeader(line)
        if (hunk) {
          hunks.push(hunk)
        }
      } catch {
        // Skip malformed hunk headers
      }
    }
  }

  // Save last file
  if (currentFile && hunks.length > 0) {
    files.set(currentFile, { path: currentFile, hunks })
  }

  return files
}

/**
 * Get file-level diff stats using --numstat (most reliable)
 */
export function getFileStats(dir: string): Map<string, FileDiffStats> {
  const cmd = `git diff ${GIT_DIFF_OPTIONS} --numstat HEAD`
  const output = safeExec(cmd, dir)
  return parseNumstat(output)
}

/**
 * Get hunk-level diff for definition analysis
 */
export function getHunkDiff(dir: string): Map<string, FileDiff> {
  const cmd = `git diff ${GIT_DIFF_OPTIONS} --unified=0 HEAD`
  const output = safeExec(cmd, dir)
  return parseDiff(output)
}

/**
 * Combined function to get all diff data needed
 * Returns both file stats and hunk data, with error isolation
 */
export function getAllDiffData(dir: string): {
  fileStats: Map<string, FileDiffStats>
  fileDiffs: Map<string, FileDiff>
} {
  // Get file stats (for file-level +N-M display)
  let fileStats: Map<string, FileDiffStats>
  try {
    fileStats = getFileStats(dir)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Warning: failed to get file stats: ${message}`)
    fileStats = new Map()
  }

  // Get hunk data (for definition-level analysis)
  let fileDiffs: Map<string, FileDiff>
  try {
    fileDiffs = getHunkDiff(dir)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Warning: failed to get hunk diff: ${message}`)
    fileDiffs = new Map()
  }

  return { fileStats, fileDiffs }
}

/**
 * Calculate diff stats for a single definition based on file hunks
 * 
 * A definition is "added" if all its lines are new additions.
 * Otherwise it's "updated" if any of its lines were changed.
 */
export function calculateDefinitionDiff(
  def: Definition,
  hunks: DiffHunk[]
): DefinitionDiff | null {
  try {
    const defStart = def.line
    const defEnd = def.endLine
    const defLineCount = defEnd - defStart + 1

    let addedInDef = 0
    let deletedInDef = 0

    for (const hunk of hunks) {
      // Check if this hunk's NEW lines overlap with definition range
      const hunkNewStart = hunk.newStart
      const hunkNewEnd = hunk.newStart + hunk.newCount - 1

      // Calculate overlap between [defStart, defEnd] and [hunkNewStart, hunkNewEnd]
      const overlapStart = Math.max(defStart, hunkNewStart)
      const overlapEnd = Math.min(defEnd, hunkNewEnd)

      if (overlapStart <= overlapEnd) {
        // There's overlap - count the added lines in this overlap
        const addedLines = overlapEnd - overlapStart + 1
        addedInDef += addedLines
      }

      // For deleted lines, check if hunk's new position overlaps with definition
      if (hunk.oldCount > 0) {
        if (hunkNewStart <= defEnd && hunkNewEnd >= defStart) {
          deletedInDef += hunk.oldCount
        }
      }
    }

    // No changes in this definition
    if (addedInDef === 0 && deletedInDef === 0) {
      return null
    }

    // Determine status
    // "added" = the entire definition consists of new lines AND nothing was deleted
    const status = addedInDef >= defLineCount && deletedInDef === 0 ? 'added' : 'updated'

    return {
      status,
      added: addedInDef,
      deleted: deletedInDef,
    }
  } catch {
    // Any calculation error - return null (no diff info)
    return null
  }
}

/**
 * Calculate total diff stats for a file by summing all hunks
 * @deprecated Use getFileStats() with --numstat instead for reliability
 */
export function calculateFileDiff(hunks: DiffHunk[]): FileDiffStats | null {
  if (hunks.length === 0) {
    return null
  }

  let added = 0
  let deleted = 0

  for (const hunk of hunks) {
    added += hunk.newCount
    deleted += hunk.oldCount
  }

  if (added === 0 && deleted === 0) {
    return null
  }

  return { added, deleted }
}

/**
 * Apply diff information to definitions for a file
 */
export function applyDiffToDefinitions(
  definitions: Definition[],
  fileDiff: FileDiff | undefined
): Definition[] {
  if (!fileDiff || fileDiff.hunks.length === 0) {
    return definitions
  }

  return definitions.map(def => {
    try {
      const diff = calculateDefinitionDiff(def, fileDiff.hunks)
      if (diff) {
        return { ...def, diff }
      }
    } catch {
      // Skip diff for this definition on error
    }
    return def
  })
}

// Legacy exports for backwards compatibility
export { getFileStats as getGitDiffAll }
