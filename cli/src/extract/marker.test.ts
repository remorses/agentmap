import { beforeAll, describe, expect, test } from 'bun:test'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { extractMarker } from './marker.js'
import { initParser } from '../parser/index.js'

// ============================================================================
// Setup
// ============================================================================

beforeAll(async () => {
  await initParser()
})

const TEST_DIR = join(tmpdir(), 'agentmap-marker-test')

async function testFile(filename: string, content: string): Promise<string | undefined> {
  await mkdir(TEST_DIR, { recursive: true })
  const filepath = join(TEST_DIR, filename)
  await writeFile(filepath, content, 'utf8')
  try {
    const result = await extractMarker(filepath)
    return result.found ? result.description : undefined
  } finally {
    await unlink(filepath).catch(() => {})
  }
}

// ============================================================================
// TypeScript / JavaScript
// ============================================================================

describe('TypeScript/JavaScript', () => {
  test('single line // comment', async () => {
    const desc = await testFile('test.ts', `// This is a header comment.

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`"This is a header comment."`)
  })

  test('multiple // comments', async () => {
    const desc = await testFile('test.ts', `// First line of description.
// Second line continues.
// Third line ends.

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"First line of description.
Second line continues.
Third line ends."
`)
  })

  test('block comment /* */', async () => {
    const desc = await testFile('test.ts', `/* This is a block comment. */

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`"This is a block comment."`)
  })

  test('multi-line block comment', async () => {
    const desc = await testFile('test.ts', `/*
 * JSDoc style comment.
 * With multiple lines.
 */

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"JSDoc style comment.
With multiple lines."
`)
  })

  test('JSDoc /** style', async () => {
    const desc = await testFile('test.ts', `/**
 * Module description here.
 * Another line of info.
 */

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"Module description here.
Another line of info."
`)
  })

  test('no header comment returns undefined', async () => {
    const desc = await testFile('test.ts', `export function foo() {}
`)
    expect(desc).toBeUndefined()
  })

  test('.js extension works', async () => {
    const desc = await testFile('test.js', `// JavaScript file header.

function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`"JavaScript file header."`)
  })

  test('.jsx extension works', async () => {
    const desc = await testFile('test.jsx', `// React component file.

export function App() {}
`)
    expect(desc).toMatchInlineSnapshot(`"React component file."`)
  })

  test('.tsx extension works', async () => {
    const desc = await testFile('test.tsx', `// TypeScript React component.

export function App() {}
`)
    expect(desc).toMatchInlineSnapshot(`"TypeScript React component."`)
  })
})

// ============================================================================
// Python
// ============================================================================

describe('Python', () => {
  test('module docstring """', async () => {
    const desc = await testFile('test.py', `"""
This is a module docstring.
It describes the module.
"""

def foo():
    pass
`)
    expect(desc).toMatchInlineSnapshot(`
"This is a module docstring.
It describes the module."
`)
  })

  test("module docstring '''", async () => {
    const desc = await testFile('test.py', `'''
Single quote docstring.
Also works fine.
'''

def foo():
    pass
`)
    expect(desc).toMatchInlineSnapshot(`
"Single quote docstring.
Also works fine."
`)
  })

  test('single line docstring', async () => {
    const desc = await testFile('test.py', `"""Single line docstring."""

def foo():
    pass
`)
    expect(desc).toMatchInlineSnapshot(`"Single line docstring."`)
  })

  test('# hash comments', async () => {
    const desc = await testFile('test.py', `# Hash comment header.
# Second line of hash comment.

def foo():
    pass
`)
    expect(desc).toMatchInlineSnapshot(`
"Hash comment header.
Second line of hash comment."
`)
  })

  test('shebang is skipped, docstring extracted', async () => {
    const desc = await testFile('test.py', `#!/usr/bin/env python3
"""Module with shebang."""

def foo():
    pass
`)
    expect(desc).toMatchInlineSnapshot(`
      "#!/usr/bin/env python3
      Module with shebang."
    `)
  })

  test('.pyi extension works', async () => {
    const desc = await testFile('test.pyi', `"""Type stub file."""

def foo() -> None: ...
`)
    expect(desc).toMatchInlineSnapshot(`"Type stub file."`)
  })
})

// ============================================================================
// Rust
// ============================================================================

describe('Rust', () => {
  test('//! inner doc comments', async () => {
    const desc = await testFile('test.rs', `//! Module documentation.
//! Describes the crate.

fn main() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"Module documentation.
Describes the crate."
`)
  })

  test('// regular comments', async () => {
    const desc = await testFile('test.rs', `// Regular comment header.
// Another line.

fn main() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"Regular comment header.
Another line."
`)
  })

  test('/* block comment */', async () => {
    const desc = await testFile('test.rs', `/* Block comment in Rust. */

fn main() {}
`)
    expect(desc).toMatchInlineSnapshot(`"Block comment in Rust."`)
  })
})

// ============================================================================
// Go
// ============================================================================

describe('Go', () => {
  test('// line comments', async () => {
    const desc = await testFile('test.go', `// Package main provides the entry point.
// It handles CLI arguments.

package main

func main() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"Package main provides the entry point.
It handles CLI arguments."
`)
  })

  test('/* block comment */', async () => {
    const desc = await testFile('test.go', `/*
Package utils provides helper functions.
Used throughout the application.
*/

package utils
`)
    expect(desc).toMatchInlineSnapshot(`
"Package utils provides helper functions.
Used throughout the application."
`)
  })
})

// ============================================================================
// Directives (use strict, use client, etc.)
// ============================================================================

describe('Directives', () => {
  test('"use strict" followed by comment', async () => {
    const desc = await testFile('test.ts', `"use strict"
// This is the header comment.
// After the directive.

function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"This is the header comment.
After the directive."
`)
  })

  test('"use client" followed by comment', async () => {
    const desc = await testFile('test.tsx', `"use client"
// React client component.
// Renders on the client side.

export function App() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"React client component.
Renders on the client side."
`)
  })

  test('"use server" followed by comment', async () => {
    const desc = await testFile('test.ts', `"use server"
// Server action module.

export async function submitForm() {}
`)
    expect(desc).toMatchInlineSnapshot(`"Server action module."`)
  })

  test('single quotes directive works', async () => {
    const desc = await testFile('test.js', `'use strict'
// Header after single-quote directive.

function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`"Header after single-quote directive."`)
  })

  test('directive with no comment returns undefined', async () => {
    const desc = await testFile('test.ts', `"use strict"

function foo() {}
`)
    expect(desc).toBeUndefined()
  })

  test('directive followed by block comment', async () => {
    const desc = await testFile('test.ts', `"use strict"
/**
 * Module description.
 * After directive.
 */

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"Module description.
After directive."
`)
  })

  test('shebang + directive + comment', async () => {
    const desc = await testFile('test.ts', `#!/usr/bin/env node
"use strict"
// CLI tool for processing data.
// Handles input and output.

function main() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"#!/usr/bin/env node
CLI tool for processing data.
Handles input and output."
`)
  })

  test('shebang + comment (no directive)', async () => {
    const desc = await testFile('test.js', `#!/usr/bin/env node
// Simple script runner.

console.log("hello")
`)
    expect(desc).toMatchInlineSnapshot(`
      "#!/usr/bin/env node
      Simple script runner."
    `)
  })

  test('shebang + use client + comment', async () => {
    const desc = await testFile('test.tsx', `#!/usr/bin/env node
"use client"
// React client app entry.

export function App() {}
`)
    expect(desc).toMatchInlineSnapshot(`
      "#!/usr/bin/env node
      React client app entry."
    `)
  })
})

// ============================================================================
// License Comments (should be skipped)
// ============================================================================

describe('License comments', () => {
  test('Meta/Facebook style license header is skipped', async () => {
    const desc = await testFile('test.ts', `/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// This is the actual file description.
// It describes what the file does.

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"This is the actual file description.
It describes what the file does."
`)
  })

  test('MIT license header is skipped', async () => {
    const desc = await testFile('test.ts', `/**
 * MIT License
 *
 * Copyright (c) 2024 Some Company
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files.
 */

// File description after license.

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`"File description after license."`)
  })

  test('SPDX license identifier is skipped', async () => {
    const desc = await testFile('test.ts', `// SPDX-License-Identifier: MIT

// Actual description of the module.
// More details here.

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"Actual description of the module.
More details here."
`)
  })

  test('BSD license is skipped', async () => {
    const desc = await testFile('test.go', `/*
 * Copyright 2024 Some Corp. All rights reserved.
 * Redistribution and use in source and binary forms are permitted.
 */

// Package main handles the CLI.

package main
`)
    expect(desc).toMatchInlineSnapshot(`"Package main handles the CLI."`)
  })

  test('Python license docstring is skipped', async () => {
    const desc = await testFile('test.py', `"""
Copyright (c) 2024 Company Inc.
All Rights Reserved.
"""

# This module handles data processing.
# It provides utilities for ETL workflows.

def process():
    pass
`)
    expect(desc).toMatchInlineSnapshot(`
"This module handles data processing.
It provides utilities for ETL workflows."
`)
  })

  test('multiple consecutive license comments are skipped', async () => {
    const desc = await testFile('test.ts', `// Copyright 2024 Company
// Licensed under Apache 2.0

// This is the real description.

export function foo() {}
`)
    expect(desc).toMatchInlineSnapshot(`"This is the real description."`)
  })

  test('license only file returns undefined', async () => {
    const desc = await testFile('test.ts', `/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function foo() {}
`)
    expect(desc).toBeUndefined()
  })

  test('Rust inner doc license is skipped', async () => {
    const desc = await testFile('test.rs', `//! Copyright 2024 Rust Foundation
//! This source code is licensed under MIT.

//! This module provides HTTP utilities.
//! Use it for making web requests.

fn main() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"This module provides HTTP utilities.
Use it for making web requests."
`)
  })

  test('non-license comment is not skipped', async () => {
    const desc = await testFile('test.ts', `// This module handles user authentication.
// It provides login and logout functionality.

export function login() {}
`)
    expect(desc).toMatchInlineSnapshot(`
"This module handles user authentication.
It provides login and logout functionality."
`)
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  test('empty file returns undefined', async () => {
    const desc = await testFile('test.ts', ``)
    expect(desc).toBeUndefined()
  })

  test('whitespace only returns undefined', async () => {
    const desc = await testFile('test.ts', `

   
`)
    expect(desc).toBeUndefined()
  })

  test('unsupported extension returns undefined', async () => {
    const desc = await testFile('test.txt', `// This is a comment.
`)
    expect(desc).toBeUndefined()
  })

  test('description limited to 20 lines with truncation indicator', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `// Line ${i + 1}`).join('\n')
    const desc = await testFile('test.ts', lines + '\n\nexport function foo() {}')
    const descLines = desc?.split('\n') ?? []
    // 20 content lines + 1 truncation indicator
    expect(descLines.length).toBe(21)
    expect(descLines[20]).toBe('... and 10 more lines')
  })

  test('empty comment returns undefined (no meaningful description)', async () => {
    const desc = await testFile('test.ts', `//

export function foo() {}
`)
    expect(desc).toBeUndefined()
  })
})
