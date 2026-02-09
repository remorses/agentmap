// Scan directory for files with header comments/docstrings.

import { execSync } from 'child_process'
import pLimit from 'p-limit'
import picomatch from 'picomatch'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { extractMarkerFromCode, extractMarkdownDescription } from './extract/marker.js'
import { extractDefinitions } from './extract/definitions.js'
import { getAllDiffData, applyDiffToDefinitions } from './extract/git-status.js'
import { getSubmodules, getSubmodulePaths } from './extract/submodules.js'
import { parseCode, detectLanguage, LANGUAGE_EXTENSIONS } from './parser/index.js'
import type { FileResult, GenerateOptions, FileDiff, FileDiffStats, SubmoduleInfo } from './types.js'

/**
 * Maximum number of files to process (safety limit)
 * If exceeded, returns empty results to avoid scanning huge directories
 */
const MAX_FILES = 5_000_000

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
 * Check if a file is a README file (case-insensitive, with or without .md extension)
 */
function isReadmeFile(filepath: string): boolean {
  const filename = filepath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  return filename === 'readme.md' || filename === 'readme'
}

/**
 * Get tracked files using git ls-files
 * Only returns files that are tracked by git (committed or staged)
 */
function getGitFiles(dir: string): string[] {
  const maxBuffer = 1024 * 10000000
  try {
    // Get only tracked files
    const stdout = execSync('git ls-files', {
      cwd: dir,
      maxBuffer,
      encoding: 'utf8',
    })
    
    return stdout
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean)
      .map(normalize)
  } catch {
    return []
  }
}



/**
 * Result of scanning a directory, including both file results and submodule info
 */
export interface ScanResult {
  files: FileResult[]
  submodules: SubmoduleInfo[]
}

/**
 * Scan directory and process files with header comments
 */
export async function scanDirectory(options: GenerateOptions = {}): Promise<ScanResult> {
  const dir = options.dir ?? process.cwd()
  // Filter out null/undefined/empty patterns (cac can pass [null] when option not used)
  const ignorePatterns = (options.ignore ?? []).filter((p): p is string => !!p)
  const filterPatterns = (options.filter ?? []).filter((p): p is string => !!p)
  const includeDiff = options.diff ?? false
  const includeSubmodules = options.submodules !== false // default true

  // Detect submodules first (needed for both map entries and diff filtering)
  let submodules: SubmoduleInfo[] = []
  let submodulePathSet: Set<string> = new Set()
  if (includeSubmodules) {
    submodules = getSubmodules(dir)
    submodulePathSet = new Set(submodules.map(s => s.path))
  } else {
    // Even when not showing submodules, detect paths for diff filtering
    submodulePathSet = getSubmodulePaths(dir)
  }

  // Build a normalized set for filtering (handles Windows backslash paths)
  const normalizedSubmodulePaths = new Set<string>()
  for (const p of submodulePathSet) {
    normalizedSubmodulePaths.add(normalize(p))
  }

  // Get file list from git (caller should ensure we're in a git repo)
  let files = getGitFiles(dir)

  // Filter out submodule gitlink entries (they appear as paths in ls-files)
  // Use normalized paths to handle Windows backslash vs forward slash differences
  files = files.filter(f => !normalizedSubmodulePaths.has(f))

  // Filter by supported extensions or README files
  files = files.filter(f => isSupportedFile(f) || isReadmeFile(f))

  // Filter by filter patterns (only include matching files)
  if (filterPatterns.length > 0) {
    const isIncluded = picomatch(filterPatterns)
    files = files.filter(f => isIncluded(f))
  }

  // Filter by ignore patterns
  if (ignorePatterns.length > 0) {
    const isIgnored = picomatch(ignorePatterns)
    files = files.filter(f => !isIgnored(f))
  }

  // Safety check: bail if too many files to avoid scanning huge directories
  if (files.length > MAX_FILES) {
    console.error(`Warning: Too many files (${files.length} > ${MAX_FILES}), skipping scan`)
    return { files: [], submodules }
  }

  // Get git diff data if needed (isolated from main processing)
  let fileStats: Map<string, FileDiffStats> | null = null
  let fileDiffs: Map<string, FileDiff> | null = null
  
  if (includeDiff) {
    try {
      const diffData = getAllDiffData(dir, submodulePathSet)
      fileStats = diffData.fileStats
      fileDiffs = diffData.fileDiffs
    } catch {
      // Diff failed - continue without diff info
      fileStats = null
      fileDiffs = null
    }
  }

  // Process files in parallel with concurrency limit
  const limit = pLimit(20)
  
  const resultPromises = files.map(relativePath => {
    const fullPath = join(dir, relativePath)
    // Normalize path for lookup (handle Windows backslashes)
    const normalizedPath = relativePath.replace(/\\/g, '/')
    const fileDiff = fileDiffs?.get(normalizedPath)
    const stats = fileStats?.get(normalizedPath)
    
    return limit(async () => {
      try {
        return await processFile(fullPath, relativePath, fileDiff, stats)
      } catch (err) {
        // Skip files that fail to process
        console.error(`Warning: Failed to process ${relativePath}:`, err)
        return null
      }
    })
  })

  const results = await Promise.all(resultPromises)
  return {
    files: results.filter((r): r is FileResult => r !== null),
    submodules,
  }
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
  // Handle README.md files specially
  if (isReadmeFile(relativePath)) {
    const description = await extractMarkdownDescription(fullPath)
    if (!description) {
      return null
    }
    return {
      relativePath,
      description,
      definitions: [],
      diff: fileStats,
    }
  }

  // Detect language first
  const language = detectLanguage(relativePath)
  if (!language) {
    return null
  }

  // Read file once for both marker extraction and definition parsing
  const code = await readFile(fullPath, 'utf8')

  // Check for marker using the code we already read
  const marker = await extractMarkerFromCode(code, language)
  if (!marker.found) {
    return null
  }

  // Parse and extract definitions using the same code
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
