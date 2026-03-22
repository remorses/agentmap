// Helpers for creating temporary git repositories in tests.

import { execSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface TempRepo {
  dir: string
}

function run(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function initRepo(dir: string): TempRepo {
  run('git init', dir)
  run('git config user.name "agentmap tests"', dir)
  run('git config user.email "agentmap@example.com"', dir)
  return { dir }
}

export function createRepo(prefix: string): TempRepo {
  const dir = createTempDir(prefix)
  mkdirSync(dir, { recursive: true })
  return initRepo(dir)
}

export function writeTrackedFile(repo: TempRepo, relativePath: string, content: string): void {
  const filePath = join(repo.dir, relativePath)
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

export function commitAll(repo: TempRepo, message: string): void {
  run('git add .', repo.dir)
  run(`git commit -m ${JSON.stringify(message)}`, repo.dir)
}

export function shortHead(repo: TempRepo): string {
  return run('git rev-parse --short HEAD', repo.dir).trim()
}

export function addSubmodule(repo: TempRepo, sourceDir: string, targetPath: string): void {
  run(`git -c protocol.file.allow=always submodule add ${JSON.stringify(sourceDir)} ${JSON.stringify(targetPath)}`, repo.dir)
}

export function updateSubmodulesRecursive(repo: TempRepo): void {
  run('git -c protocol.file.allow=always submodule update --init --recursive', repo.dir)
}

export function deinitSubmodule(repo: TempRepo, targetPath: string): void {
  run(`git submodule deinit -f ${JSON.stringify(targetPath)}`, repo.dir)
}
