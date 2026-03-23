// Extract top-level definitions using tree-sitter.

import type { Definition, DefinitionType, Language, SyntaxNode } from '../types.js'
import {
  FUNCTION_TYPES,
  CLASS_TYPES,
  STRUCT_TYPES,
  TRAIT_TYPES,
  INTERFACE_TYPES,
  TYPE_TYPES,
  ENUM_TYPES,
  CONST_TYPES,
  extractName,
  extractConstName,
  isExported,
  unwrapExport,
  isExtern,
  isZigConst,
  getZigTypeDeclaration,
  typescript,
} from '../languages/index.js'

/**
 * Minimum body lines for a function/class to be included in defs
 */
const MIN_BODY_LINES = 5

// ============================================================================
// Main extraction logic
// ============================================================================

interface ExtractOptions {
  node: SyntaxNode
  language: Language
}

interface ExtractInternalOptions extends ExtractOptions {
  /** Override: node is inside extern "C" block */
  forceExtern?: boolean
}

/**
 * Extract top-level definitions from a syntax tree
 */
export function extractDefinitions(
  rootNode: SyntaxNode,
  language: Language
): Definition[] {
  const definitions: Definition[] = []
  const seenNames = new Set<string>()

  for (let i = 0; i < rootNode.childCount; i++) {
    const node = rootNode.child(i)
    if (!node) continue

    // Handle C++ linkage_specification (extern "C" { ... })
    if (language === 'cpp' && node.type === 'linkage_specification') {
      for (let j = 0; j < node.childCount; j++) {
        const inner = node.child(j)
        if (!inner) continue
        if (inner.type === 'extern' || inner.type === 'string_literal') continue
        
        const defs = extractDefinition({ node: inner, language, forceExtern: true })
        for (const def of defs) {
          if (!seenNames.has(def.name)) {
            definitions.push(def)
            seenNames.add(def.name)
          }
        }
      }
      continue
    }

    const defs = extractDefinition({ node, language })
    for (const def of defs) {
      if (!seenNames.has(def.name)) {
        definitions.push(def)
        seenNames.add(def.name)
      }
    }
  }

  return definitions
}

/**
 * Extract definition(s) from a single node.
 * Handles export detection, unwrapping, and multiple declarations internally.
 */
function extractDefinition(opts: ExtractInternalOptions): Definition[] {
  const { node, language, forceExtern = false } = opts
  
  // Determine exported status and get actual node to process
  let exported: boolean
  let actualNode: SyntaxNode
  let nodeIsExtern = forceExtern
  
  switch (language) {
    case 'typescript':
    case 'javascript':
      exported = isExported(node, language)
      actualNode = unwrapExport(node, language)
      break
    case 'zig':
      exported = isExported(node, language)
      actualNode = node
      nodeIsExtern = nodeIsExtern || isExtern(node, language)
      break
    case 'rust':
      exported = isExported(node, language)
      actualNode = node
      break
    case 'go':
      // Go: exported determined per-name (uppercase = exported)
      // We'll handle this in createDefinition
      exported = false  // placeholder, resolved per-name
      actualNode = node
      break
    case 'cpp':
      exported = false  // C++ doesn't have module exports in this sense
      actualNode = node
      nodeIsExtern = nodeIsExtern || isExtern(node, language)
      break
    case 'python':
    default:
      exported = false
      actualNode = node
      break
  }

  const results: Definition[] = []
  
  // Helper to resolve export status (Go uses name-based exports)
  const resolveExported = (name: string): boolean => {
    if (language === 'go') return isExported(node, language, name)
    return exported
  }
  
  // Helper to create a definition
  const createDef = (
    name: string,
    type: DefinitionType,
    startLine: number,
    endLine: number
  ): Definition => ({
    name,
    line: startLine,
    endLine,
    type,
    exported: resolveExported(name),
    ...(nodeIsExtern ? { extern: true } : {})
  })

  const functionTypes = FUNCTION_TYPES[language]
  const classTypes = CLASS_TYPES[language]
  const structTypes = STRUCT_TYPES[language]
  const traitTypes = TRAIT_TYPES[language]
  const interfaceTypes = INTERFACE_TYPES[language]
  const typeTypes = TYPE_TYPES[language]
  const enumTypes = ENUM_TYPES[language]
  const constTypes = CONST_TYPES[language]

  // Functions
  if (functionTypes.includes(actualNode.type)) {
    const name = extractName(actualNode, language)
    if (name && getBodyLineCount(actualNode) > MIN_BODY_LINES) {
      results.push(createDef(name, 'function', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Classes
  if (classTypes.includes(actualNode.type)) {
    const name = extractName(actualNode, language)
    if (name && getBodyLineCount(actualNode) > MIN_BODY_LINES) {
      results.push(createDef(name, 'class', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Structs - only if exported
  if (structTypes.includes(actualNode.type)) {
    const name = extractName(actualNode, language)
    if (name && getBodyLineCount(actualNode) > MIN_BODY_LINES && resolveExported(name)) {
      results.push(createDef(name, 'struct', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Traits - only if exported
  if (traitTypes.includes(actualNode.type)) {
    const name = extractName(actualNode, language)
    if (name && getBodyLineCount(actualNode) > MIN_BODY_LINES && resolveExported(name)) {
      results.push(createDef(name, 'trait', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Interfaces - only if exported
  if (interfaceTypes.includes(actualNode.type)) {
    const name = extractName(actualNode, language)
    if (name && resolveExported(name)) {
      results.push(createDef(name, 'interface', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Type aliases - only if exported
  if (typeTypes.includes(actualNode.type)) {
    const name = extractName(actualNode, language)
    if (name && resolveExported(name)) {
      results.push(createDef(name, 'type', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Enums - only if exported
  if (enumTypes.includes(actualNode.type)) {
    const name = extractName(actualNode, language)
    if (name && resolveExported(name)) {
      results.push(createDef(name, 'enum', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Constants/variables
  if (constTypes.includes(actualNode.type)) {
    // Zig: pub const (may be struct/enum/union or plain const)
    if (language === 'zig') {
      if (!exported || !isZigConst(actualNode)) {
        return results
      }
      const name = extractName(actualNode, language)
      if (name) {
        // Use specific type if struct/enum/union, otherwise const
        const zigType = getZigTypeDeclaration(actualNode)
        const type = zigType ?? 'const'
        results.push(createDef(name, type, actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
      }
      return results
    }

    // TS/JS: handle arrow functions and multiple declarations
    if (language === 'typescript' || language === 'javascript') {
      // Non-exported: only include large arrow functions
      if (!exported) {
        const arrowFn = extractArrowFunction(actualNode)
        if (arrowFn && arrowFn.bodyLines > MIN_BODY_LINES) {
          results.push({
            name: arrowFn.name,
            line: arrowFn.line,
            endLine: arrowFn.endLine,
            type: 'function',
            exported: false
          })
        }
        return results
      }
      
      // Exported: extract all declarations
      return extractJSDeclarations({ node: actualNode, language, exported, isExtern: nodeIsExtern })
    }

    // Other languages: simple const extraction - only if exported
    const name = extractConstName(actualNode, language)
    if (name && resolveExported(name)) {
      results.push(createDef(name, 'const', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  return results
}

/**
 * Extract all declarations from a TS/JS lexical_declaration
 * Handles: const a = 1, const b = () => {}, const c = 1, d = 2
 */
function extractJSDeclarations(opts: {
  node: SyntaxNode
  language: Language
  exported: boolean
  isExtern: boolean
}): Definition[] {
  const { node, exported, isExtern: nodeIsExtern } = opts
  const results: Definition[] = []

  if (node.type !== 'lexical_declaration') {
    // Single const extraction fallback
    const name = extractConstName(node, opts.language)
    if (name) {
      results.push({
        name,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        type: 'const',
        exported,
        ...(nodeIsExtern ? { extern: true } : {})
      })
    }
    return results
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type !== 'variable_declarator') continue

    const nameNode = child.childForFieldName('name')
    const valueNode = child.childForFieldName('value')
    if (!nameNode) continue

    const isArrowFn = valueNode?.type === 'arrow_function'
    const type: DefinitionType = isArrowFn ? 'function' : 'const'

    // Skip small arrow functions
    if (isArrowFn && valueNode && getBodyLineCount(valueNode) <= MIN_BODY_LINES) {
      continue
    }

    results.push({
      name: nameNode.text,
      line: child.startPosition.row + 1,
      endLine: child.endPosition.row + 1,
      type,
      exported,
      ...(nodeIsExtern ? { extern: true } : {})
    })
  }

  return results
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Extract arrow function assigned to const/let
 */
function extractArrowFunction(node: SyntaxNode): { name: string; line: number; endLine: number; bodyLines: number } | null {
  if (node.type !== 'lexical_declaration') return null

  for (let i = 0; i < node.childCount; i++) {
    const declarator = node.child(i)
    if (declarator?.type !== 'variable_declarator') continue

    const nameNode = declarator.childForFieldName('name')
    const valueNode = declarator.childForFieldName('value')

    if (nameNode && valueNode?.type === 'arrow_function') {
      return {
        name: nameNode.text,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        bodyLines: getBodyLineCount(valueNode),
      }
    }
  }

  return null
}

/**
 * Find a child node by type
 */
function findChild(node: SyntaxNode, type: string): SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === type) return child
  }
  return null
}

/**
 * Get the number of lines in a node's body
 */
function getBodyLineCount(node: SyntaxNode): number {
  return node.endPosition.row - node.startPosition.row + 1
}
