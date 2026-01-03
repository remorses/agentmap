// Core type definitions for the codebase map.

import type Parser from 'web-tree-sitter'

/**
 * Supported programming languages
 */
export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'

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
}

/**
 * Recursive map node - either a directory (with children) or a file entry
 */
export interface MapNode {
  [name: string]: MapNode | FileEntry
}

/**
 * Result of extracting marker and description from a file
 */
export interface MarkerResult {
  found: boolean
  description?: string
  /** Submap path from marker (e.g., ".", "..", "src/common") */
  submap?: string
}

/**
 * Types of definitions we extract
 */
export type DefinitionType = 
  | 'function' 
  | 'class' 
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
  diff?: DefinitionDiff  // only present when --diff flag used
}

/**
 * Result of processing a single file
 */
export interface FileResult {
  relativePath: string
  description?: string
  definitions: Definition[]
  /** Resolved submap path (absolute from project root, e.g., "./" or "src/common/") */
  submap: string
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
  /** Include git diff status for definitions */
  diff?: boolean
  /** Git ref to diff against (default: HEAD for unstaged, --cached for staged) */
  diffBase?: string
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
 * Output format for map files
 */
export type OutputFormat = 'yaml' | 'md'

/**
 * Options for submap output
 */
export interface SubmapOutputOptions {
  /** Subdirectory for map files (e.g., ".ruler") */
  outDir?: string
  /** Output filename (default: "map.yaml") */
  outputFile?: string
  /** Output format: yaml or md (default: yaml) */
  format?: OutputFormat
  /** Show what would be written without writing */
  dryRun?: boolean
  /** Show submap resolution details */
  verbose?: boolean
}

/**
 * A submap with its files
 */
export interface SubmapFiles {
  /** Submap path (e.g., "./" for root, "src/common/") */
  submap: string
  /** Files belonging to this submap */
  files: FileResult[]
}

/**
 * Output plan for a submap
 */
export interface SubmapOutput {
  /** Path where map.yaml will be written */
  outputPath: string
  /** Submap path */
  submap: string
  /** YAML content */
  content: string
}

/**
 * Re-export parser types
 */
export type SyntaxNode = Parser.SyntaxNode
export type SyntaxTree = Parser.Tree
