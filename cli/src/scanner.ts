// Scan directory for files with header comments/docstrings.

import { execSync } from 'child_process'
import fg from 'fast-glob'
import picomatch from 'picomatch'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { extractMarker } from './extract/marker.js'
import { extractDefinitions } from './extract/definitions.js'
import { getAllDiffData, applyDiffToDefinitions } from './extract/git-status.js'
import { parseCode, detectLanguage, LANGUAGE_EXTENSIONS } from './parser/index.js'
import type { FileResult, GenerateOptions, FileDiff, FileDiffStats } from './types.js'

/**
 * Supported file extensions (from LANGUAGE_EXTENSIONS)
 */
const SUPPORTED_EXTENSIONS = new Set(Object.keys(LANGUAGE_EXTENSIONS))

/**
 * Check if a file has a supported extension
 */
function isSupportedFile(filepath: string): boolean {
  const ext = filepath.slice(filepath.lastIndexOf('.'))
  return SUPPORTED_EXTENSIONS.has(ext)
}

/**
 * Check if running inside a git repository
 */
function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Get files using git ls-files
 * Uses --cached --others to get tracked + untracked files
 * Uses --exclude-standard to respect .gitignore
 */
function getGitFiles(dir: string): string[] {
  const maxBuffer = 1024 * 10000000
  try {
    // Get tracked and untracked files (respecting .gitignore)
    const stdout = execSync('git ls-files --cached --others --exclude-standard', {
      cwd: dir,
      maxBuffer,
      encoding: 'utf8',
    })
    
    // Get deleted files to exclude
    const deleted = execSync('git ls-files --deleted', {
      cwd: dir,
      maxBuffer,
      encoding: 'utf8',
    })
    
    const paths = stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    const deletedPaths = new Set(deleted.split(/\r?\n/).map(x => x.trim()).filter(Boolean))
    
    return paths
      .filter(p => !deletedPaths.has(p))
      .map(normalize)
  } catch {
    return []
  }
}

/**
 * Get files using fast-glob (fallback when not in git repo)
 */
async function getGlobFiles(dir: string): Promise<string[]> {
  const patterns = Object.keys(LANGUAGE_EXTENSIONS).map(ext => `**/*${ext}`)
  return fg(patterns, {
    cwd: dir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
    absolute: false,
    dot: false,
  })
}

/**
 * Scan directory and process files with header comments
 */
export async function scanDirectory(options: GenerateOptions = {}): Promise<FileResult[]> {
  const dir = options.dir ?? process.cwd()
  // Filter out null/undefined/empty patterns (cac can pass [null] when option not used)
  const ignorePatterns = (options.ignore ?? []).filter((p): p is string => !!p)
  const includeDiff = options.diff ?? false

  // Get file list - prefer git, fallback to glob
  let files: string[]
  if (isGitRepo(dir)) {
    files = getGitFiles(dir)
  } else {
    files = await getGlobFiles(dir)
  }

  // Filter by supported extensions
  files = files.filter(isSupportedFile)

  // Filter by ignore patterns
  if (ignorePatterns.length > 0) {
    const isIgnored = picomatch(ignorePatterns)
    files = files.filter(f => !isIgnored(f))
  }

  // Get git diff data if needed (isolated from main processing)
  let fileStats: Map<string, FileDiffStats> | null = null
  let fileDiffs: Map<string, FileDiff> | null = null
  
  if (includeDiff && isGitRepo(dir)) {
    try {
      const diffData = getAllDiffData(dir)
      fileStats = diffData.fileStats
      fileDiffs = diffData.fileDiffs
    } catch {
      // Diff failed - continue without diff info
      fileStats = null
      fileDiffs = null
    }
  }

  // Process each file
  const results: FileResult[] = []

  for (const relativePath of files) {
    const fullPath = join(dir, relativePath)
    // Normalize path for lookup (handle Windows backslashes)
    const normalizedPath = relativePath.replace(/\\/g, '/')

    try {
      const fileDiff = fileDiffs?.get(normalizedPath)
      const stats = fileStats?.get(normalizedPath)
      const result = await processFile(fullPath, relativePath, fileDiff, stats)
      if (result) {
        results.push(result)
      }
    } catch (err) {
      // Skip files that fail to process
      console.error(`Warning: Failed to process ${relativePath}:`, err)
    }
  }

  return results
}

/**
 * Process a single file - check for marker and extract definitions
 */
async function processFile(
  fullPath: string,
  relativePath: string,
  fileDiff?: FileDiff,
  fileStats?: FileDiffStats
): Promise<FileResult | null> {
  // Check for marker first (only reads first 30KB)
  const marker = await extractMarker(fullPath)
  if (!marker.found) {
    return null
  }

  // Detect language
  const language = detectLanguage(relativePath)
  if (!language) {
    return null
  }

  // Read full file for parsing
  const code = await readFile(fullPath, 'utf8')

  // Parse and extract definitions
  const tree = await parseCode(code, language)
  let definitions = extractDefinitions(tree.rootNode, language)

  // Apply diff info if available (for definition-level stats)
  if (fileDiff) {
    definitions = applyDiffToDefinitions(definitions, fileDiff)
  }

  return {
    relativePath,
    description: marker.description,
    definitions,
    // Use pre-calculated file stats from --numstat (more reliable)
    diff: fileStats,
  }
}
