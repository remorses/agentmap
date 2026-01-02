// Extract top-level definitions using tree-sitter.

import type { Definition, DefinitionType, Language, SyntaxNode } from '../types.js'

/**
 * Minimum body lines for a function/class to be included in defs
 */
const MIN_BODY_LINES = 5

/**
 * Node types that represent functions per language
 */
const FUNCTION_TYPES: Record<Language, string[]> = {
  typescript: ['function_declaration', 'method_definition'],
  javascript: ['function_declaration', 'method_definition'],
  python: ['function_definition'],
  rust: ['function_item'],
  go: ['function_declaration', 'method_declaration'],
}

/**
 * Node types that represent classes per language
 */
const CLASS_TYPES: Record<Language, string[]> = {
  typescript: ['class_declaration', 'abstract_class_declaration'],
  javascript: ['class_declaration'],
  python: ['class_definition'],
  rust: ['struct_item', 'impl_item', 'trait_item'],
  go: ['type_declaration'],
}

/**
 * Node types that represent interfaces per language
 */
const INTERFACE_TYPES: Record<Language, string[]> = {
  typescript: ['interface_declaration'],
  javascript: [],
  python: [],
  rust: ['trait_item'],
  go: [],
}

/**
 * Node types that represent type aliases per language
 */
const TYPE_TYPES: Record<Language, string[]> = {
  typescript: ['type_alias_declaration'],
  javascript: [],
  python: [],
  rust: ['type_item'],
  go: ['type_declaration'],
}

/**
 * Node types that represent enums per language
 */
const ENUM_TYPES: Record<Language, string[]> = {
  typescript: ['enum_declaration'],
  javascript: [],
  python: [],
  rust: ['enum_item'],
  go: [],
}

/**
 * Node types that represent constants per language
 */
const CONST_TYPES: Record<Language, string[]> = {
  typescript: ['lexical_declaration'],
  javascript: ['lexical_declaration'],
  python: [],  // Python constants handled separately
  rust: ['const_item', 'static_item'],
  go: ['const_declaration', 'var_declaration'],
}

/**
 * Check if a node is an exported statement
 */
function isExported(node: SyntaxNode): boolean {
  return node.type === 'export_statement'
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

  // Walk immediate children of root (top-level only)
  for (let i = 0; i < rootNode.childCount; i++) {
    const node = rootNode.child(i)
    if (!node) continue

    const exported = isExported(node)
    const actualNode = unwrapExport(node)
    
    // Try to extract definition
    const def = extractDefinition(actualNode, language, exported)
    if (def && !seenNames.has(def.name)) {
      definitions.push(def)
      seenNames.add(def.name)
    }

    // Handle multiple declarations in one statement (e.g., const a = 1, b = 2)
    const extraDefs = extractMultipleDeclarations(actualNode, language, exported)
    for (const d of extraDefs) {
      if (!seenNames.has(d.name)) {
        definitions.push(d)
        seenNames.add(d.name)
      }
    }
  }

  return definitions
}

/**
 * Extract a single definition from a node
 */
function extractDefinition(
  node: SyntaxNode,
  language: Language,
  exported: boolean
): Definition | null {
  const functionTypes = FUNCTION_TYPES[language]
  const classTypes = CLASS_TYPES[language]
  const interfaceTypes = INTERFACE_TYPES[language]
  const typeTypes = TYPE_TYPES[language]
  const enumTypes = ENUM_TYPES[language]
  const constTypes = CONST_TYPES[language]

  // Functions
  if (functionTypes.includes(node.type)) {
    const name = extractName(node, language)
    if (name && getBodyLineCount(node) > MIN_BODY_LINES) {
      return { 
        name, 
        line: node.startPosition.row + 1, 
        endLine: node.endPosition.row + 1,
        type: 'function', 
        exported 
      }
    }
  }

  // Classes
  if (classTypes.includes(node.type)) {
    const name = extractName(node, language)
    if (name && getBodyLineCount(node) > MIN_BODY_LINES) {
      return { 
        name, 
        line: node.startPosition.row + 1, 
        endLine: node.endPosition.row + 1,
        type: 'class', 
        exported 
      }
    }
  }

  // Interfaces
  if (interfaceTypes.includes(node.type)) {
    const name = extractName(node, language)
    if (name) {
      return { 
        name, 
        line: node.startPosition.row + 1, 
        endLine: node.endPosition.row + 1,
        type: 'interface', 
        exported 
      }
    }
  }

  // Type aliases
  if (typeTypes.includes(node.type)) {
    const name = extractName(node, language)
    if (name) {
      return { 
        name, 
        line: node.startPosition.row + 1, 
        endLine: node.endPosition.row + 1,
        type: 'type', 
        exported 
      }
    }
  }

  // Enums
  if (enumTypes.includes(node.type)) {
    const name = extractName(node, language)
    if (name) {
      return { 
        name, 
        line: node.startPosition.row + 1, 
        endLine: node.endPosition.row + 1,
        type: 'enum', 
        exported 
      }
    }
  }

  // Constants/variables (only if exported for TS/JS)
  if (constTypes.includes(node.type)) {
    // For TS/JS, only include if exported
    if ((language === 'typescript' || language === 'javascript') && !exported) {
      // Check for arrow functions assigned to const (these are always included if large enough)
      const arrowFn = extractArrowFunction(node)
      if (arrowFn && arrowFn.bodyLines > MIN_BODY_LINES) {
        return { 
          name: arrowFn.name, 
          line: arrowFn.line, 
          endLine: arrowFn.endLine,
          type: 'function', 
          exported: false 
        }
      }
      return null
    }
    
    // Check for arrow functions first
    const arrowFn = extractArrowFunction(node)
    if (arrowFn && arrowFn.bodyLines > MIN_BODY_LINES) {
      return { 
        name: arrowFn.name, 
        line: arrowFn.line, 
        endLine: arrowFn.endLine,
        type: 'function', 
        exported 
      }
    }
    
    // Otherwise it's a constant
    const name = extractConstName(node, language)
    if (name) {
      return { 
        name, 
        line: node.startPosition.row + 1, 
        endLine: node.endPosition.row + 1,
        type: 'const', 
        exported 
      }
    }
  }

  return null
}

/**
 * Extract multiple declarations from a single statement
 */
function extractMultipleDeclarations(
  node: SyntaxNode,
  language: Language,
  exported: boolean
): Definition[] {
  const defs: Definition[] = []

  // Handle lexical_declaration with multiple variable_declarators
  if (node.type === 'lexical_declaration') {
    if ((language === 'typescript' || language === 'javascript') && !exported) {
      return defs
    }

    let count = 0
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child?.type === 'variable_declarator') {
        count++
        if (count > 1) {
          const nameNode = child.childForFieldName('name')
          const valueNode = child.childForFieldName('value')
          if (nameNode) {
            const isArrowFn = valueNode?.type === 'arrow_function'
            const type: DefinitionType = isArrowFn ? 'function' : 'const'
            // Skip small arrow functions
            if (isArrowFn && valueNode && getBodyLineCount(valueNode) <= MIN_BODY_LINES) {
              continue
            }
            defs.push({
              name: nameNode.text,
              line: child.startPosition.row + 1,
              endLine: child.endPosition.row + 1,
              type,
              exported,
            })
          }
        }
      }
    }
  }

  return defs
}

/**
 * Unwrap export statement to get the actual declaration
 */
function unwrapExport(node: SyntaxNode): SyntaxNode {
  if (node.type === 'export_statement') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (!child) continue
      if (child.type !== 'export' && !child.type.includes('comment') && child.type !== 'default') {
        return child
      }
    }
  }
  return node
}

/**
 * Extract the name from a definition node
 */
function extractName(node: SyntaxNode, language: Language): string | null {
  // Try to find 'name' field first
  const nameNode = node.childForFieldName('name')
  if (nameNode) {
    return nameNode.text
  }

  // Language-specific fallbacks
  switch (language) {
    case 'typescript':
    case 'javascript':
      return extractJSName(node)
    case 'python':
      return extractPythonName(node)
    case 'rust':
      return extractRustName(node)
    case 'go':
      return extractGoName(node)
  }

  return null
}

/**
 * Extract name from a const/let declaration
 */
function extractConstName(node: SyntaxNode, language: Language): string | null {
  if (language === 'typescript' || language === 'javascript') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child?.type === 'variable_declarator') {
        const nameNode = child.childForFieldName('name')
        return nameNode?.text ?? null
      }
    }
  }

  if (language === 'rust') {
    return extractName(node, language)
  }

  if (language === 'go') {
    // Look for const_spec or var_spec
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child?.type === 'const_spec' || child?.type === 'var_spec') {
        const nameNode = child.childForFieldName('name')
        return nameNode?.text ?? null
      }
    }
  }

  return null
}

function extractJSName(node: SyntaxNode): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (!child) continue
    if (child.type === 'identifier' || child.type === 'type_identifier') {
      return child.text
    }
    if (child.type === 'property_identifier') {
      return child.text
    }
  }
  return null
}

function extractPythonName(node: SyntaxNode): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'identifier') {
      return child.text
    }
  }
  return null
}

function extractRustName(node: SyntaxNode): string | null {
  if (node.type === 'impl_item') {
    const typeNode = node.childForFieldName('type')
    if (typeNode) {
      const ident = typeNode.type === 'type_identifier' 
        ? typeNode 
        : findChild(typeNode, 'type_identifier')
      return ident?.text ?? null
    }
  }
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'identifier' || child?.type === 'type_identifier') {
      return child.text
    }
  }
  return null
}

function extractGoName(node: SyntaxNode): string | null {
  if (node.type === 'type_declaration') {
    const spec = findChild(node, 'type_spec')
    if (spec) {
      const nameNode = spec.childForFieldName('name')
      return nameNode?.text ?? null
    }
  }
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'identifier' || child?.type === 'field_identifier') {
      return child.text
    }
  }
  return null
}

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
