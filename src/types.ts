// @agentmap
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
 * Symbol definitions mapping: name -> 1-based line number
 */
export interface DefEntry {
  [symbolName: string]: number
}

/**
 * A file entry in the map
 */
export interface FileEntry {
  desc?: string
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
  /** Zone path from marker (e.g., ".", "..", "src/common") */
  zone?: string
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
 * A definition extracted from source code
 */
export interface Definition {
  name: string
  line: number  // 1-based
  type: DefinitionType
}

/**
 * Result of processing a single file
 */
export interface FileResult {
  relativePath: string
  description?: string
  definitions: Definition[]
  /** Resolved zone path (absolute from project root, e.g., "./" or "src/common/") */
  zone: string
}

/**
 * Options for generating the map
 */
export interface GenerateOptions {
  /** Directory to scan (default: cwd) */
  dir?: string
  /** Glob patterns to ignore */
  ignore?: string[]
}

/**
 * Output format for map files
 */
export type OutputFormat = 'yaml' | 'md'

/**
 * Options for zoned output
 */
export interface ZonedOutputOptions {
  /** Output directory name (default: ".ruler") */
  outDir?: string
  /** Output format: yaml or md (default: yaml) */
  format?: OutputFormat
  /** Show what would be written without writing */
  dryRun?: boolean
  /** Show zone resolution details */
  verbose?: boolean
}

/**
 * A zone with its files
 */
export interface ZoneFiles {
  /** Zone path (e.g., "./" for root, "src/common/") */
  zone: string
  /** Files belonging to this zone */
  files: FileResult[]
}

/**
 * Output plan for a zone
 */
export interface ZoneOutput {
  /** Path where map.yaml will be written */
  outputPath: string
  /** Zone path */
  zone: string
  /** YAML content */
  content: string
}

/**
 * Re-export parser types
 */
export type SyntaxNode = Parser.SyntaxNode
export type SyntaxTree = Parser.Tree
