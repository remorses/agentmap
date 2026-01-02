import { describe, expect, test } from 'bun:test'
import { 
  parseDiff, 
  parseNumstat, 
  parseHunkHeader,
  calculateDefinitionDiff, 
  calculateFileDiff 
} from './git-status.js'
import type { Definition, DiffHunk } from '../types.js'

// ============================================================================
// parseNumstat - Machine-readable file stats (most reliable)
// ============================================================================

describe('parseNumstat', () => {
  test('parses simple numstat output', () => {
    const output = `10\t5\tsrc/foo.ts
3\t1\tsrc/bar.ts`
    const result = parseNumstat(output)
    expect(result.size).toBe(2)
    expect(result.get('src/foo.ts')).toMatchInlineSnapshot(`
{
  "added": 10,
  "deleted": 5,
}
`)
    expect(result.get('src/bar.ts')).toMatchInlineSnapshot(`
{
  "added": 3,
  "deleted": 1,
}
`)
  })

  test('handles additions only', () => {
    const output = `15\t0\tsrc/new-file.ts`
    const result = parseNumstat(output)
    expect(result.get('src/new-file.ts')).toMatchInlineSnapshot(`
{
  "added": 15,
  "deleted": 0,
}
`)
  })

  test('handles deletions only', () => {
    const output = `0\t20\tsrc/deleted-content.ts`
    const result = parseNumstat(output)
    expect(result.get('src/deleted-content.ts')).toMatchInlineSnapshot(`
{
  "added": 0,
  "deleted": 20,
}
`)
  })

  test('skips binary files (shown as - -)', () => {
    const output = `-\t-\timage.png
10\t5\tsrc/code.ts`
    const result = parseNumstat(output)
    expect(result.size).toBe(1)
    expect(result.has('image.png')).toBe(false)
    expect(result.has('src/code.ts')).toBe(true)
  })

  test('handles empty output', () => {
    const result = parseNumstat('')
    expect(result.size).toBe(0)
  })

  test('handles whitespace-only output', () => {
    const result = parseNumstat('   \n\n  ')
    expect(result.size).toBe(0)
  })

  test('skips malformed lines', () => {
    const output = `not valid
10\t5\tsrc/valid.ts
also invalid line`
    const result = parseNumstat(output)
    expect(result.size).toBe(1)
    expect(result.has('src/valid.ts')).toBe(true)
  })

  test('handles paths with spaces', () => {
    const output = `5\t3\tpath/with spaces/file.ts`
    const result = parseNumstat(output)
    expect(result.has('path/with spaces/file.ts')).toBe(true)
  })

  test('normalizes Windows backslashes to forward slashes', () => {
    const output = `5\t3\tpath\\to\\file.ts`
    const result = parseNumstat(output)
    expect(result.has('path/to/file.ts')).toBe(true)
  })

  test('handles quoted paths (special characters)', () => {
    const output = `5\t3\t"path/with\\"quotes\\"/file.ts"`
    const result = parseNumstat(output)
    // The path should be unquoted and escapes resolved
    expect(result.size).toBe(1)
  })

  test('skips files with zero changes', () => {
    const output = `0\t0\tsrc/unchanged.ts
5\t3\tsrc/changed.ts`
    const result = parseNumstat(output)
    expect(result.size).toBe(1)
    expect(result.has('src/unchanged.ts')).toBe(false)
    expect(result.has('src/changed.ts')).toBe(true)
  })
})

// ============================================================================
// parseHunkHeader - Extract line numbers from @@ headers
// ============================================================================

describe('parseHunkHeader', () => {
  test('parses standard hunk header', () => {
    const result = parseHunkHeader('@@ -10,5 +12,7 @@ function name() {')
    expect(result).toMatchInlineSnapshot(`
{
  "newCount": 7,
  "newStart": 12,
  "oldCount": 5,
  "oldStart": 10,
}
`)
  })

  test('parses hunk with single old line (no comma)', () => {
    const result = parseHunkHeader('@@ -10 +12,7 @@')
    expect(result).toMatchInlineSnapshot(`
{
  "newCount": 7,
  "newStart": 12,
  "oldCount": 1,
  "oldStart": 10,
}
`)
  })

  test('parses hunk with single new line (no comma)', () => {
    const result = parseHunkHeader('@@ -10,5 +12 @@')
    expect(result).toMatchInlineSnapshot(`
{
  "newCount": 1,
  "newStart": 12,
  "oldCount": 5,
  "oldStart": 10,
}
`)
  })

  test('parses hunk with both single lines', () => {
    const result = parseHunkHeader('@@ -1 +1 @@')
    expect(result).toMatchInlineSnapshot(`
{
  "newCount": 1,
  "newStart": 1,
  "oldCount": 1,
  "oldStart": 1,
}
`)
  })

  test('returns null for invalid header', () => {
    expect(parseHunkHeader('not a hunk')).toBeNull()
    expect(parseHunkHeader('@@@ invalid @@@')).toBeNull()
    expect(parseHunkHeader('')).toBeNull()
  })

  test('handles zero counts', () => {
    const result = parseHunkHeader('@@ -10,0 +10,5 @@')
    expect(result).toMatchInlineSnapshot(`
{
  "newCount": 5,
  "newStart": 10,
  "oldCount": 0,
  "oldStart": 10,
}
`)
  })
})

// ============================================================================
// parseDiff - Extract hunks from full diff output
// ============================================================================

describe('parseDiff', () => {
  test('parses single file with one hunk', () => {
    const diffOutput = `diff --git a/src/foo.ts b/src/foo.ts
index abc123..def456 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,3 +10,5 @@ function existing() {
+  const x = 1
+  const y = 2
`
    const result = parseDiff(diffOutput)
    expect(result.size).toBe(1)
    expect(result.get('src/foo.ts')).toMatchInlineSnapshot(`
{
  "hunks": [
    {
      "newCount": 5,
      "newStart": 10,
      "oldCount": 3,
      "oldStart": 10,
    },
  ],
  "path": "src/foo.ts",
}
`)
  })

  test('parses single file with multiple hunks', () => {
    const diffOutput = `diff --git a/src/bar.ts b/src/bar.ts
index abc123..def456 100644
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -5,2 +5,4 @@ header
+line1
+line2
@@ -20,1 +22,3 @@ other
+more
+lines
`
    const result = parseDiff(diffOutput)
    expect(result.size).toBe(1)
    const file = result.get('src/bar.ts')!
    expect(file.hunks).toHaveLength(2)
    expect(file.hunks[0]).toMatchInlineSnapshot(`
{
  "newCount": 4,
  "newStart": 5,
  "oldCount": 2,
  "oldStart": 5,
}
`)
    expect(file.hunks[1]).toMatchInlineSnapshot(`
{
  "newCount": 3,
  "newStart": 22,
  "oldCount": 1,
  "oldStart": 20,
}
`)
  })

  test('parses multiple files', () => {
    const diffOutput = `diff --git a/src/a.ts b/src/a.ts
index abc..def 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,2 @@
+added line
diff --git a/src/b.ts b/src/b.ts
index 123..456 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -10,2 +10,1 @@
-removed line
`
    const result = parseDiff(diffOutput)
    expect(result.size).toBe(2)
    expect(result.has('src/a.ts')).toBe(true)
    expect(result.has('src/b.ts')).toBe(true)
  })

  test('parses hunk with single line (no count)', () => {
    const diffOutput = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -5 +5,2 @@
+new line
`
    const result = parseDiff(diffOutput)
    const file = result.get('src/x.ts')!
    expect(file.hunks[0]).toMatchInlineSnapshot(`
{
  "newCount": 2,
  "newStart": 5,
  "oldCount": 1,
  "oldStart": 5,
}
`)
  })

  test('handles empty diff', () => {
    const result = parseDiff('')
    expect(result.size).toBe(0)
  })

  test('handles whitespace-only diff', () => {
    const result = parseDiff('   \n\n  ')
    expect(result.size).toBe(0)
  })

  test('skips binary files', () => {
    const diffOutput = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
diff --git a/src/code.ts b/src/code.ts
--- a/src/code.ts
+++ b/src/code.ts
@@ -1,1 +1,2 @@
+new line
`
    const result = parseDiff(diffOutput)
    expect(result.size).toBe(1)
    expect(result.has('image.png')).toBe(false)
    expect(result.has('src/code.ts')).toBe(true)
  })

  test('normalizes Windows paths', () => {
    const diffOutput = `diff --git a/src\\path\\file.ts b/src\\path\\file.ts
--- a/src\\path\\file.ts
+++ b/src\\path\\file.ts
@@ -1,1 +1,2 @@
+new line
`
    const result = parseDiff(diffOutput)
    expect(result.has('src/path/file.ts')).toBe(true)
  })

  test('skips files with no hunks', () => {
    const diffOutput = `diff --git a/src/empty.ts b/src/empty.ts
index abc..def 100644
diff --git a/src/real.ts b/src/real.ts
--- a/src/real.ts
+++ b/src/real.ts
@@ -1,1 +1,2 @@
+content
`
    const result = parseDiff(diffOutput)
    expect(result.size).toBe(1)
    expect(result.has('src/empty.ts')).toBe(false)
    expect(result.has('src/real.ts')).toBe(true)
  })
})

// ============================================================================
// calculateDefinitionDiff - Determine if definition is added/updated
// ============================================================================

describe('calculateDefinitionDiff', () => {
  function makeDef(line: number, endLine: number): Definition {
    return {
      name: 'test',
      line,
      endLine,
      type: 'function',
      exported: false,
    }
  }

  test('returns null for definition with no changes', () => {
    const def = makeDef(10, 20)
    const hunks: DiffHunk[] = [
      { oldStart: 1, oldCount: 2, newStart: 1, newCount: 3 }, // changes lines 1-3
    ]
    const result = calculateDefinitionDiff(def, hunks)
    expect(result).toBeNull()
  })

  test('detects fully added definition', () => {
    const def = makeDef(10, 15) // 6 lines
    const hunks: DiffHunk[] = [
      { oldStart: 5, oldCount: 0, newStart: 10, newCount: 6 }, // adds lines 10-15
    ]
    const result = calculateDefinitionDiff(def, hunks)
    expect(result).toMatchInlineSnapshot(`
{
  "added": 6,
  "deleted": 0,
  "status": "added",
}
`)
  })

  test('detects updated definition (partial overlap)', () => {
    const def = makeDef(10, 20) // 11 lines
    const hunks: DiffHunk[] = [
      { oldStart: 12, oldCount: 2, newStart: 12, newCount: 4 }, // changes lines 12-15
    ]
    const result = calculateDefinitionDiff(def, hunks)
    expect(result).toMatchInlineSnapshot(`
{
  "added": 4,
  "deleted": 2,
  "status": "updated",
}
`)
  })

  test('handles multiple hunks in definition range', () => {
    const def = makeDef(10, 30) // 21 lines
    const hunks: DiffHunk[] = [
      { oldStart: 12, oldCount: 1, newStart: 12, newCount: 2 }, // +1 line
      { oldStart: 20, oldCount: 3, newStart: 21, newCount: 5 }, // +2 lines
    ]
    const result = calculateDefinitionDiff(def, hunks)
    expect(result?.status).toBe('updated')
    expect(result?.added).toBe(7) // 2 + 5
  })

  test('handles definition at exact hunk boundary', () => {
    const def = makeDef(10, 12) // 3 lines
    const hunks: DiffHunk[] = [
      { oldStart: 8, oldCount: 0, newStart: 10, newCount: 3 }, // adds exactly lines 10-12
    ]
    const result = calculateDefinitionDiff(def, hunks)
    expect(result?.status).toBe('added')
  })

  test('handles hunk that extends beyond definition', () => {
    const def = makeDef(15, 20) // 6 lines
    const hunks: DiffHunk[] = [
      { oldStart: 10, oldCount: 5, newStart: 10, newCount: 20 }, // changes lines 10-29
    ]
    const result = calculateDefinitionDiff(def, hunks)
    // Definition lines 15-20 overlap with hunk's new lines 10-29
    expect(result?.status).toBe('updated')
    expect(result?.added).toBe(6) // all 6 lines of def are in the added range
  })

  test('handles empty hunks array', () => {
    const def = makeDef(10, 20)
    const result = calculateDefinitionDiff(def, [])
    expect(result).toBeNull()
  })
})

// ============================================================================
// calculateFileDiff - Sum hunks for file-level stats (legacy)
// ============================================================================

describe('calculateFileDiff', () => {
  test('returns null for empty hunks', () => {
    const result = calculateFileDiff([])
    expect(result).toBeNull()
  })

  test('sums single hunk correctly', () => {
    const hunks: DiffHunk[] = [
      { oldStart: 10, oldCount: 3, newStart: 10, newCount: 5 },
    ]
    const result = calculateFileDiff(hunks)
    expect(result).toMatchInlineSnapshot(`
{
  "added": 5,
  "deleted": 3,
}
`)
  })

  test('sums multiple hunks correctly', () => {
    const hunks: DiffHunk[] = [
      { oldStart: 5, oldCount: 2, newStart: 5, newCount: 4 },   // +4-2
      { oldStart: 20, oldCount: 5, newStart: 22, newCount: 3 }, // +3-5
      { oldStart: 40, oldCount: 0, newStart: 40, newCount: 10 }, // +10-0
    ]
    const result = calculateFileDiff(hunks)
    expect(result).toMatchInlineSnapshot(`
{
  "added": 17,
  "deleted": 7,
}
`)
  })

  test('handles additions only', () => {
    const hunks: DiffHunk[] = [
      { oldStart: 10, oldCount: 0, newStart: 10, newCount: 5 },
      { oldStart: 20, oldCount: 0, newStart: 25, newCount: 3 },
    ]
    const result = calculateFileDiff(hunks)
    expect(result).toMatchInlineSnapshot(`
{
  "added": 8,
  "deleted": 0,
}
`)
  })

  test('handles deletions only', () => {
    const hunks: DiffHunk[] = [
      { oldStart: 10, oldCount: 5, newStart: 10, newCount: 0 },
      { oldStart: 20, oldCount: 3, newStart: 15, newCount: 0 },
    ]
    const result = calculateFileDiff(hunks)
    expect(result).toMatchInlineSnapshot(`
{
  "added": 0,
  "deleted": 8,
}
`)
  })

  test('returns null when both added and deleted are zero', () => {
    const hunks: DiffHunk[] = [
      { oldStart: 10, oldCount: 0, newStart: 10, newCount: 0 },
    ]
    const result = calculateFileDiff(hunks)
    expect(result).toBeNull()
  })
})
