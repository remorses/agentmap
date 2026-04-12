// Tests for building nested map nodes and root key formatting.

import { describe, expect, test } from 'bun:test'
import { buildMap, getRootName } from './builder.js'

describe('getRootName', () => {
  test('uses the full absolute path', () => {
    expect(getRootName('/Users/morse/kimaki/mappamundi')).toBe('/Users/morse/kimaki/mappamundi')
    expect(getRootName('/Users/morse/kimaki/mappamundi/')).toBe('/Users/morse/kimaki/mappamundi')
  })

  test('preserves filesystem root', () => {
    expect(getRootName('/')).toBe('/')
  })
})

describe('buildMap with recursive submodules', () => {
  test('renders submodule metadata and nested files under the same node', () => {
    const map = buildMap(
      [
        {
          relativePath: 'README.md',
          description: 'Root repo\nRoot README.',
          definitions: [],
        },
        {
          relativePath: 'vendor/child-lib/README.md',
          description: 'Child repo\nChild README.',
          definitions: [],
        },
        {
          relativePath: 'vendor/child-lib/deps/nested-lib/README.md',
          description: 'Nested repo\nNested README.',
          definitions: [],
        },
      ],
      'repo',
      [
        {
          path: 'vendor/child-lib',
          commit: 'abc1234',
          branch: undefined,
          dirty: false,
          initialized: true,
          url: undefined,
        },
        {
          path: 'vendor/child-lib/deps/nested-lib',
          commit: 'def5678',
          branch: undefined,
          dirty: true,
          initialized: true,
          url: undefined,
        },
      ]
    )

    expect(map).toEqual({
      repo: {
        'README.md': {
          description: 'Root repo\nRoot README.',
        },
        vendor: {
          'child-lib': {
            'README.md': {
              description: 'Child repo\nChild README.',
            },
            deps: {
              'nested-lib': {
                'README.md': {
                  description: 'Nested repo\nNested README.',
                },
                dirty: 'modified',
                submodule: 'detached @ def5678',
              },
            },
            submodule: 'detached @ abc1234',
          },
        },
      },
    })
  })
})
