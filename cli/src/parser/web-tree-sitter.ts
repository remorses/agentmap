// Lazy runtime loader for web-tree-sitter with Bun/OpenCode-safe module interop.

type ParserClass = typeof import('web-tree-sitter')

let parserClassPromise: Promise<ParserClass> | null = null

function normalizeParserModule(module: unknown): ParserClass {
  if (module && typeof module === 'object' && 'default' in module) {
    return (module as { default: ParserClass }).default
  }
  return module as ParserClass
}

export async function loadParserClass(): Promise<ParserClass> {
  if (!parserClassPromise) {
    parserClassPromise = import('web-tree-sitter').then(normalizeParserModule)
  }

  return parserClassPromise
}
