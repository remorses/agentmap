// @agentmap
// Scan directory for files with @agentmap marker.

import { execSync } from 'child_process'
import fg from 'fast-glob'
import picomatch from 'picomatch'
import { readFile } from 'fs/promises'
import { join, normalize, dirname, relative } from 'path'
import { extractMarker } from './extract/marker.js'
import { extractDefinitions } from './extract/definitions.js'
import { parseCode, detectLanguage, LANGUAGE_EXTENSIONS } from './parser/index.js'
import type { FileResult, GenerateOptions } from './types.js'

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
 * Scan directory and process files with @agentmap marker
 */
export async function scanDirectory(options: GenerateOptions = {}): Promise<FileResult[]> {
  const dir = options.dir ?? process.cwd()
  // Filter out null/undefined/empty values from ignore patterns
  const ignorePatterns = (options.ignore ?? []).filter((p): p is string => typeof p === 'string' && p.length > 0)

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

  // Process each file
  const results: FileResult[] = []

  for (const relativePath of files) {
    const fullPath = join(dir, relativePath)

    try {
      const result = await processFile(fullPath, relativePath)
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
 * Resolve zone path to absolute path from project root
 * 
 * @param zone - Zone from marker (e.g., ".", "..", "src/common")
 * @param relativePath - File's path relative to project root
 * @returns Resolved zone path (e.g., "./" for root, "src/common/")
 */
function resolveZone(zone: string | undefined, relativePath: string): string {
  // No zone = root
  if (!zone) {
    return './'
  }
  
  // Get file's directory
  const fileDir = dirname(relativePath)
  
  // Relative zone (starts with .)
  if (zone.startsWith('.')) {
    // Resolve relative to file's directory
    const resolved = normalize(join(fileDir, zone))
    // Ensure it doesn't go above project root
    if (resolved.startsWith('..')) {
      return './'
    }
    // Normalize to ./ for root, otherwise add trailing slash
    return resolved === '.' ? './' : resolved + '/'
  }
  
  // Absolute zone (from project root)
  return zone.endsWith('/') ? zone : zone + '/'
}

/**
 * Process a single file - check for marker and extract definitions
 */
async function processFile(
  fullPath: string,
  relativePath: string
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
  const definitions = extractDefinitions(tree.rootNode, language)

  // Resolve zone
  const zone = resolveZone(marker.zone, relativePath)

  return {
    relativePath,
    description: marker.description,
    definitions,
    zone,
  }
}
