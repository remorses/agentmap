// Core type definitions for the codebase map.

import type Parser from 'web-tree-sitter'
import type { Logger } from './logger.js'

/**
 * Supported programming languages
 */
export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'zig'
  | 'cpp'

/**
 * Symbol definitions mapping: name -> description string
 */
export interface DefEntry {
  [symbolName: string]: string
}

/**
 * Git diff stats for a file (total lines added/deleted)
 */
export interface FileDiffStats {
  added: number
  deleted: number
}

/**
 * A file entry in the map
 */
export interface FileEntry {
  description?: string
  diff?: string  // formatted as "+N-M" or "+N" or "-M"
  defs?: DefEntry
  exports?: DefEntry  // used instead of defs when truncating files with exported symbols
}

/**
 * A submodule entry in the map
 */
export interface SubmoduleEntry {
  submodule: string   // "branch @ sha" or "detached @ sha"
  dirty?: string      // "modified" if submodule has uncommitted changes
}

/**
 * A submodule node in the map.
 * Carries submodule metadata and can also contain nested files/directories.
 */
export interface SubmoduleNode extends SubmoduleEntry {
  [name: string]: MapNode | FileEntry | SubmoduleNode | string | undefined
}

/**
 * Info about a git submodule discovered in the repo
 */
export interface SubmoduleInfo {
  /** Relative path of the submodule in the parent repo */
  path: string
  /** Current HEAD commit SHA (short) */
  commit: string
  /** Checked-out branch name, or undefined if detached HEAD */
  branch?: string
  /** Remote URL from .gitmodules */
  url?: string
  /** Whether the submodule has uncommitted changes */
  dirty?: boolean
  /** Whether the submodule is initialized */
  initialized: boolean
}

/**
 * Recursive map node - either a directory (with children), a file entry, or a submodule entry
 */
export interface MapNode {
  [name: string]: MapNode | FileEntry | SubmoduleNode
}

/**
 * Result of extracting marker and description from a file
 */
export interface MarkerResult {
  found: boolean
  description?: string
}

/**
 * Types of definitions we extract
 */
export type DefinitionType = 
  | 'function' 
  | 'class' 
  | 'struct'
  | 'union'
  | 'trait'
  | 'type' 
  | 'interface' 
  | 'const' 
  | 'enum'

/**
 * Git status for a definition
 */
export type DefinitionStatus = 'added' | 'updated'

/**
 * Git diff stats for a definition
 */
export interface DefinitionDiff {
  status: DefinitionStatus
  added: number    // lines added
  deleted: number  // lines deleted
}

/**
 * A definition extracted from source code
 */
export interface Definition {
  name: string
  line: number     // 1-based start line
  endLine: number  // 1-based end line
  type: DefinitionType
  exported: boolean
  extern?: boolean  // true for extern declarations (C/C++/Zig)
  diff?: DefinitionDiff  // only present when --diff flag used
}

/**
 * Result of processing a single file
 */
export interface FileResult {
  relativePath: string
  description?: string
  definitions: Definition[]
  diff?: FileDiffStats  // only present when --diff flag used
}

/**
 * Options for generating the map
 */
export interface GenerateOptions {
  /** Directory to scan (default: cwd) */
  dir?: string
  /** Glob patterns to ignore */
  ignore?: string[]
  /** Glob patterns to filter - only include matching files */
  filter?: string[]
  /** Include git diff status for definitions */
  diff?: boolean
  /** Git ref to diff against (default: HEAD for unstaged, --cached for staged) */
  diffBase?: string
  /** Max definitions per file before truncation (default: 25) */
  maxDefs?: number
  /** Include submodule info in the map (default: true) */
  submodules?: boolean
  /** Logger implementation (default: console logger) */
  logger?: Logger
}

/**
 * A hunk from git diff output
 */
export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
}

/**
 * Parsed diff for a single file
 */
export interface FileDiff {
  path: string
  hunks: DiffHunk[]
}

/**
 * Re-export parser types
 */
export type SyntaxNode = Parser.SyntaxNode
export type SyntaxTree = Parser.Tree
