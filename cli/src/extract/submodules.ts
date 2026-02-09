// Detect git submodules, their branches, and dirty state.
// Uses multiple git commands with safeExec for cross-platform reliability.

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import type { SubmoduleInfo } from '../types.js'

/**
 * Safely execute a git command, returning empty string on any error
 */
function safeExec(cmd: string, dir: string): string {
  try {
    return execSync(cmd, {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10, // 10MB
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    return ''
  }
}

/**
 * Detect submodule paths by looking for gitlink entries (mode 160000) in git ls-files --stage.
 * This is the most reliable method - works even if submodules are not initialized.
 */
function detectSubmodulePaths(dir: string): Set<string> {
  const output = safeExec('git ls-files --stage', dir)
  const paths = new Set<string>()

  if (!output.trim()) return paths

  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    // Format: <mode> <hash> <stage>\t<path>
    // Submodules have mode 160000
    if (line.startsWith('160000 ')) {
      const tabIdx = line.indexOf('\t')
      if (tabIdx !== -1) {
        paths.add(line.slice(tabIdx + 1).trim())
      }
    }
  }

  return paths
}

/**
 * Parse `git submodule status --recursive` output.
 * Format: " <sha> <path> (<describe>)" or "-<sha> <path>" (uninitialized) or "+<sha> <path> (<describe>)" (out of sync)
 */
function parseSubmoduleStatus(dir: string): Map<string, { commit: string; initialized: boolean }> {
  const output = safeExec('git submodule status --recursive', dir)
  const result = new Map<string, { commit: string; initialized: boolean }>()

  if (!output.trim()) return result

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    // First char: ' ' = OK, '-' = uninitialized, '+' = out of sync, 'U' = merge conflict
    const prefix = line[0]
    const initialized = prefix !== '-'

    // Rest: <sha> <path> [(<describe>)]
    const rest = line.slice(1).trim()
    const spaceIdx = rest.indexOf(' ')
    if (spaceIdx === -1) continue

    const commit = rest.slice(0, spaceIdx)
    let path = rest.slice(spaceIdx + 1)

    // Remove optional describe suffix: " (v1.2.3)" or " (heads/main)"
    const parenIdx = path.lastIndexOf(' (')
    if (parenIdx !== -1) {
      path = path.slice(0, parenIdx)
    }

    result.set(path.trim(), {
      commit: commit.slice(0, 7), // short SHA
      initialized,
    })
  }

  return result
}

/**
 * Get the checked-out branch for each initialized submodule.
 * Returns a map of submodule path -> branch name (or undefined for detached HEAD).
 */
function getSubmoduleBranches(dir: string): Map<string, string | undefined> {
  // Use foreach to run git symbolic-ref in each submodule
  const output = safeExec(
    'git submodule foreach --quiet --recursive \'echo "$sm_path|$(git symbolic-ref --short -q HEAD 2>/dev/null || echo __detached__)"\'',
    dir
  )
  const result = new Map<string, string | undefined>()

  if (!output.trim()) return result

  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    const pipeIdx = line.indexOf('|')
    if (pipeIdx === -1) continue

    const path = line.slice(0, pipeIdx).trim()
    const branch = line.slice(pipeIdx + 1).trim()

    result.set(path, branch === '__detached__' || branch === '' ? undefined : branch)
  }

  return result
}

/**
 * Get submodule URLs from .gitmodules config.
 * Returns a map of submodule path -> URL.
 */
function getSubmoduleUrls(dir: string): Map<string, string> {
  // Check if .gitmodules exists first
  if (!existsSync(join(dir, '.gitmodules'))) {
    return new Map()
  }

  const output = safeExec(
    'git config -f .gitmodules --get-regexp "^submodule\\..*\\.url$"',
    dir
  )
  const pathOutput = safeExec(
    'git config -f .gitmodules --get-regexp "^submodule\\..*\\.path$"',
    dir
  )

  // Build name -> url map
  const nameToUrl = new Map<string, string>()
  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    // Format: submodule.<name>.url <url>
    const match = line.match(/^submodule\.(.+)\.url\s+(.+)$/)
    if (match) {
      nameToUrl.set(match[1], match[2].trim())
    }
  }

  // Build path -> url map via name -> path mapping
  const result = new Map<string, string>()
  for (const line of pathOutput.split('\n')) {
    if (!line.trim()) continue
    // Format: submodule.<name>.path <path>
    const match = line.match(/^submodule\.(.+)\.path\s+(.+)$/)
    if (match) {
      const name = match[1]
      const path = match[2].trim()
      const url = nameToUrl.get(name)
      if (url) {
        result.set(path, url)
      }
    }
  }

  return result
}

/**
 * Check which submodules have dirty working trees.
 * Uses git status --porcelain=2 to detect modified submodule content.
 *
 * Porcelain v2 "changed entry" format (type 1):
 *   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 * Fields are space-separated but the path (field 9) may contain spaces,
 * so we split on the first 8 spaces and take the remainder as the path.
 */
function getDirtySubmodules(dir: string, submodulePaths: Set<string>): Set<string> {
  if (submodulePaths.size === 0) return new Set()

  const output = safeExec('git status --porcelain=2', dir)
  const dirty = new Set<string>()

  if (!output.trim()) return dirty

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // Split only the first 8 spaces to preserve path with spaces
      const fields = splitNFields(line, 9)
      if (fields.length < 9) continue

      // fields[2] is the sub field (N... for non-submodule, S... for submodule)
      const subField = fields[2]
      // fields[8] is the full path (may contain spaces)
      const path = fields[8]

      if (subField && subField.startsWith('S') && subField !== 'S...' && submodulePaths.has(path)) {
        dirty.add(path)
      }
    }
  }

  return dirty
}

/**
 * Split a string into exactly N fields by spaces.
 * The last field gets the remainder (preserving spaces in paths).
 */
function splitNFields(str: string, n: number): string[] {
  const fields: string[] = []
  let pos = 0
  for (let i = 0; i < n - 1 && pos < str.length; i++) {
    const spaceIdx = str.indexOf(' ', pos)
    if (spaceIdx === -1) break
    fields.push(str.slice(pos, spaceIdx))
    pos = spaceIdx + 1
  }
  if (pos < str.length) {
    fields.push(str.slice(pos))
  }
  return fields
}

/**
 * Get all submodule info for a repository.
 * Combines detection, status, branches, URLs, and dirty state.
 */
export function getSubmodules(dir: string): SubmoduleInfo[] {
  // Step 1: Detect all submodule paths (works even if uninitialized)
  const submodulePaths = detectSubmodulePaths(dir)
  if (submodulePaths.size === 0) return []

  // Step 2: Get status (commit SHAs and initialized state)
  const statusMap = parseSubmoduleStatus(dir)

  // Step 3: Get branches for initialized submodules
  const branchMap = getSubmoduleBranches(dir)

  // Step 4: Get URLs from .gitmodules
  const urlMap = getSubmoduleUrls(dir)

  // Step 5: Check dirty state
  const dirtySet = getDirtySubmodules(dir, submodulePaths)

  // Combine all info
  const submodules: SubmoduleInfo[] = []
  for (const path of submodulePaths) {
    const status = statusMap.get(path)
    submodules.push({
      path,
      commit: status?.commit ?? 'unknown',
      branch: branchMap.get(path),
      url: urlMap.get(path),
      dirty: dirtySet.has(path),
      initialized: status?.initialized ?? false,
    })
  }

  return submodules
}

/**
 * Get the set of submodule paths for filtering from diff output.
 * Lightweight version that only detects paths without full info.
 */
export function getSubmodulePaths(dir: string): Set<string> {
  return detectSubmodulePaths(dir)
}
