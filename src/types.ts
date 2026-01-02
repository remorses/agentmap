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
 * Re-export parser types
 */
export type SyntaxNode = Parser.SyntaxNode
export type SyntaxTree = Parser.Tree
