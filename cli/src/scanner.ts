// Scan directory for files with header comments/docstrings and recurse into submodules.

import { execSync } from 'child_process'
import { realpathSync } from 'fs'
import pLimit from 'p-limit'
import picomatch from 'picomatch'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { extractMarkerFromCode, extractMarkdownDescription } from './extract/marker.js'
import { extractDefinitions } from './extract/definitions.js'
import { getAllDiffData, applyDiffToDefinitions } from './extract/git-status.js'
import { getSubmodules, getSubmodulePaths } from './extract/submodules.js'
import { createConsoleLogger } from './logger.js'
import { parseCode, detectLanguage, LANGUAGE_EXTENSIONS } from './parser/index.js'
import type { FileResult, GenerateOptions, FileDiff, FileDiffStats, SubmoduleInfo } from './types.js'
import type { Logger } from './logger.js'

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

interface ScanRepoOptions {
  repoDir: string
  pathPrefix: string
  includeDiff: boolean
  includeSubmodules: boolean
  logger: Logger
  isIncluded?: (path: string) => boolean
  isIgnored?: (path: string) => boolean
  visitedRepoDirs: Set<string>
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function joinRelativePath(prefix: string, path: string): string {
  const normalizedPath = normalizeRelativePath(path)
  return prefix ? `${prefix}/${normalizedPath}` : normalizedPath
}

function getCanonicalRepoDir(dir: string): string {
  try {
    return realpathSync(dir)
  } catch {
    return dir
  }
}

async function scanRepo(options: ScanRepoOptions): Promise<ScanResult> {
  const canonicalRepoDir = getCanonicalRepoDir(options.repoDir)
  if (options.visitedRepoDirs.has(canonicalRepoDir)) {
    return { files: [], submodules: [] }
  }
  options.visitedRepoDirs.add(canonicalRepoDir)

  let submodules: SubmoduleInfo[] = []
  const directSubmodules = options.includeSubmodules ? getSubmodules(options.repoDir) : []
  const directSubmodulePathSet = options.includeSubmodules
    ? new Set(directSubmodules.map(submodule => submodule.path))
    : getSubmodulePaths(options.repoDir)

  if (options.includeSubmodules) {
    submodules = directSubmodules.map(submodule => ({
      ...submodule,
      path: joinRelativePath(options.pathPrefix, submodule.path),
    }))
  }

  const normalizedSubmodulePaths = new Set<string>()
  for (const path of directSubmodulePathSet) {
    normalizedSubmodulePaths.add(normalize(path))
  }

  let files = getGitFiles(options.repoDir)
  files = files.filter(file => !normalizedSubmodulePaths.has(file))
  files = files.filter(file => isSupportedFile(file) || isReadmeFile(file))

  files = files.filter(file => {
    const relativePath = joinRelativePath(options.pathPrefix, file)

    if (options.isIncluded && !options.isIncluded(relativePath)) {
      return false
    }

    if (options.isIgnored && options.isIgnored(relativePath)) {
      return false
    }

    return true
  })

  if (files.length > MAX_FILES) {
    options.logger?.warn(`Warning: Too many files (${files.length} > ${MAX_FILES}), skipping scan`)
    return { files: [], submodules }
  }

  let fileStats: Map<string, FileDiffStats> | null = null
  let fileDiffs: Map<string, FileDiff> | null = null

  if (options.includeDiff) {
    try {
      const diffData = getAllDiffData(options.repoDir, directSubmodulePathSet, options.logger)
      fileStats = diffData.fileStats
      fileDiffs = diffData.fileDiffs
    } catch {
      fileStats = null
      fileDiffs = null
    }
  }

  const limit = pLimit(20)
  const resultPromises = files.map(relativePath => {
    const fullPath = join(options.repoDir, relativePath)
    const normalizedPath = normalizeRelativePath(relativePath)
    const prefixedRelativePath = joinRelativePath(options.pathPrefix, relativePath)
    const fileDiff = fileDiffs?.get(normalizedPath)
    const stats = fileStats?.get(normalizedPath)

    return limit(async () => {
      try {
        return await processFile(fullPath, prefixedRelativePath, fileDiff, stats)
      } catch {
        return null
      }
    })
  })

  const nestedResults = options.includeSubmodules
    ? await Promise.all(directSubmodules.map(async submodule => {
      if (!submodule.initialized) {
        return { files: [], submodules: [] }
      }

      return scanRepo({
        ...options,
        repoDir: join(options.repoDir, submodule.path),
        pathPrefix: joinRelativePath(options.pathPrefix, submodule.path),
      })
    }))
    : []

  const results = await Promise.all(resultPromises)

  for (const nested of nestedResults) {
    submodules.push(...nested.submodules)
  }

  return {
    files: [
      ...results.filter((result): result is FileResult => result !== null),
      ...nestedResults.flatMap(result => result.files),
    ],
    submodules,
  }
}

/**
 * Scan directory and process files with header comments
 */
export async function scanDirectory(options: GenerateOptions = {}): Promise<ScanResult> {
  const dir = options.dir ?? process.cwd()
  const logger = options.logger ?? createConsoleLogger()
  const ignorePatterns = (options.ignore ?? []).filter((p): p is string => !!p)
  const filterPatterns = (options.filter ?? []).filter((p): p is string => !!p)
  return scanRepo({
    repoDir: dir,
    pathPrefix: '',
    includeDiff: options.diff ?? false,
    includeSubmodules: options.submodules !== false,
    logger,
    isIncluded: filterPatterns.length > 0 ? picomatch(filterPatterns) : undefined,
    isIgnored: ignorePatterns.length > 0 ? picomatch(ignorePatterns) : undefined,
    visitedRepoDirs: new Set(),
  })
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
