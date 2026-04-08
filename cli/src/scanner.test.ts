// Tests for recursive scanning across initialized git submodules.

import { describe, expect, test } from 'bun:test'
import { scanDirectory } from './scanner.js'
import { addSubmodule, commitAll, createRepo, deinitSubmodule, updateSubmodulesRecursive, writeTrackedFile } from './test-helpers/git-test-helpers.js'

describe('scanDirectory submodule recursion', () => {
  test('includes files from initialized nested submodules under prefixed paths', async () => {
    const nestedRepo = createRepo('agentmap-submodule-nested-')
    writeTrackedFile(nestedRepo, 'README.md', '# Nested repo\n\nNested submodule README.')
    commitAll(nestedRepo, 'Add nested repo README')

    const childRepo = createRepo('agentmap-submodule-child-')
    writeTrackedFile(childRepo, 'README.md', '# Child repo\n\nChild submodule README.')
    commitAll(childRepo, 'Add child repo README')
    addSubmodule(childRepo, nestedRepo.dir, 'deps/nested-lib')
    commitAll(childRepo, 'Add nested submodule')

    const rootRepo = createRepo('agentmap-submodule-root-')
    writeTrackedFile(rootRepo, 'README.md', '# Root repo\n\nRoot repo README.')
    commitAll(rootRepo, 'Add root README')
    addSubmodule(rootRepo, childRepo.dir, 'vendor/child-lib')
    commitAll(rootRepo, 'Add child submodule')
    updateSubmodulesRecursive(rootRepo)

    const result = await scanDirectory({ dir: rootRepo.dir })

    expect(result.files.map(file => file.relativePath).sort()).toMatchInlineSnapshot(`
[
  "README.md",
  "vendor/child-lib/README.md",
  "vendor/child-lib/deps/nested-lib/README.md",
]
`)

    expect(result.submodules.map(submodule => ({
      path: submodule.path,
      initialized: submodule.initialized,
      dirty: submodule.dirty,
      commitLength: submodule.commit.length,
    }))).toMatchInlineSnapshot(`
[
  {
    "commitLength": 7,
    "dirty": false,
    "initialized": true,
    "path": "vendor/child-lib",
  },
  {
    "commitLength": 7,
    "dirty": false,
    "initialized": true,
    "path": "vendor/child-lib/deps/nested-lib",
  },
]
`)
  })

  test('keeps uninitialized submodules as metadata-only nodes', async () => {
    const childRepo = createRepo('agentmap-submodule-uninit-child-')
    writeTrackedFile(childRepo, 'README.md', '# Child repo\n\nChild submodule README.')
    commitAll(childRepo, 'Add child repo README')

    const rootRepo = createRepo('agentmap-submodule-uninit-root-')
    writeTrackedFile(rootRepo, 'README.md', '# Root repo\n\nRoot repo README.')
    commitAll(rootRepo, 'Add root README')
    addSubmodule(rootRepo, childRepo.dir, 'vendor/child-lib')
    commitAll(rootRepo, 'Add child submodule')
    deinitSubmodule(rootRepo, 'vendor/child-lib')

    const result = await scanDirectory({ dir: rootRepo.dir })

    expect(result.files.map(file => file.relativePath).sort()).toMatchInlineSnapshot(`
[
  "README.md",
]
`)

    expect(result.submodules.map(submodule => ({
      path: submodule.path,
      initialized: submodule.initialized,
      dirty: submodule.dirty,
      commitLength: submodule.commit.length,
    }))).toMatchInlineSnapshot(`
[
  {
    "commitLength": 7,
    "dirty": false,
    "initialized": false,
    "path": "vendor/child-lib",
  },
]
`)
  })
})

describe('scanDirectory .agentmapignore', () => {
  test('excludes a directory matched by a bare folder name', async () => {
    const repo = createRepo('agentmap-ignore-root-')
    writeTrackedFile(repo, 'README.md', '# Root repo\n\nRoot repo README.')
    writeTrackedFile(repo, 'foldername/README.md', '# Ignored folder\n\nIgnored README.')
    writeTrackedFile(repo, 'src/README.md', '# Source folder\n\nIncluded README.')
    writeTrackedFile(repo, '.agentmapignore', 'foldername\n')
    commitAll(repo, 'Add repo files')

    const result = await scanDirectory({ dir: repo.dir })

    expect(result.files.map(file => file.relativePath).sort()).toMatchInlineSnapshot(`
[
  "README.md",
  "src/README.md",
]
`)
  })
})
