// Tests for markdown description extraction.

import { describe, expect, test } from 'bun:test'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { extractMarkdownDescription } from './markdown.js'

const TEST_DIR = join(tmpdir(), 'agentmap-markdown-test')

async function testMarkdown(content: string): Promise<string | null> {
  await mkdir(TEST_DIR, { recursive: true })
  const filepath = join(TEST_DIR, 'README.md')
  await writeFile(filepath, content, 'utf8')
  try {
    return await extractMarkdownDescription(filepath)
  } finally {
    await unlink(filepath).catch(() => {})
  }
}

describe('Markdown extraction', () => {
  test('simple heading and paragraph', async () => {
    const desc = await testMarkdown(`# My Project

This is a description of my project.
It does amazing things.
`)
    expect(desc).toMatchInlineSnapshot(`
"My Project
This is a description of my project.
It does amazing things."
`)
  })

  test('ignores HTML comments', async () => {
    const desc = await testMarkdown(`<!-- This is a comment -->
# Title

Some content here.
`)
    expect(desc).toMatchInlineSnapshot(`
"Title
Some content here."
`)
  })

  test('ignores badge images', async () => {
    const desc = await testMarkdown(`![Build Status](https://shields.io/badge/build-passing)
![Coverage](https://img.shields.io/coverage/80)

# My Library

A useful library.
`)
    expect(desc).toMatchInlineSnapshot(`
"My Library
A useful library."
`)
  })

  test('handles lists', async () => {
    const desc = await testMarkdown(`# Features

- Feature one
- Feature two
- Feature three
`)
    expect(desc).toMatchInlineSnapshot(`
"Features
- Feature one
- Feature two
- Feature three"
`)
  })

  test('handles code blocks', async () => {
    const desc = await testMarkdown(`# Usage

Install the package:

\`\`\`bash
npm install mypackage
\`\`\`
`)
    expect(desc).toMatchInlineSnapshot(`
"Usage
Install the package:
\`\`\`bash
npm install mypackage
\`\`\`"
`)
  })

  test('handles blockquotes', async () => {
    const desc = await testMarkdown(`# Quote Example

> This is a blockquote
> with multiple lines
`)
    expect(desc).toMatchInlineSnapshot(`
"Quote Example
> This is a blockquote
with multiple lines"
`)
  })

  test('truncates long content with indicator', async () => {
    // Create 40 lines without blank lines between (so all fit in first 50 lines read)
    const lines = Array.from({ length: 40 }, (_, i) => `- Item ${i + 1}`).join('\n')
    const desc = await testMarkdown(`# Title\n\n${lines}`)
    const descLines = desc?.split('\n') ?? []
    // 20 content lines + 1 truncation indicator (Title + 19 items, then indicator)
    expect(descLines.length).toBe(21)
    expect(descLines[20]).toBe('... and 21 more lines')
  })

  test('returns null for empty markdown', async () => {
    const desc = await testMarkdown(``)
    expect(desc).toBeNull()
  })

  test('returns null for only HTML comments', async () => {
    const desc = await testMarkdown(`<!-- Just a comment -->

<!-- Another comment -->
`)
    expect(desc).toBeNull()
  })

  test('handles mixed content', async () => {
    const desc = await testMarkdown(`<!-- Header comment -->
![Badge](https://example.com/badge.svg)

# agentmap

A compact, YAML-based inventory of your codebase.

## Features

- Fast scanning
- Tree-sitter parsing

\`\`\`bash
npm install agentmap
\`\`\`
`)
    expect(desc).toMatchInlineSnapshot(`
"agentmap
A compact, YAML-based inventory of your codebase.
Features
- Fast scanning
- Tree-sitter parsing
\`\`\`bash
npm install agentmap
\`\`\`"
`)
  })
})
