// Ported from hermes-agent tools/skill_manager_tool.py @ 54bc5e50 (MIT, Nous Research)
// Ported from hermes-agent tools/skill_manager_guards.py @ 54bc5e50 (MIT, Nous Research)

import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, parse, resolve, sep } from 'node:path'
import { lintSkill, parseSkill } from './lint.ts'
import { scanSkill } from './guard.ts'

export interface SaveSkillInput { name: string; description: string; body: string; files?: Array<{ path: string; content: string }> }
type SaveResult = { ok: true; path: string; warnings: string[] } | { ok: false; errors: string[] }
const validName = (name: string): boolean => /^[a-z0-9][a-z0-9-]{0,63}$/.test(name)
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)
const hasCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code

function stat(path: string): fs.Stats | null {
  try { return fs.lstatSync(path) } catch (error) { if (hasCode(error, 'ENOENT')) return null; throw error }
}

function safeDirectories(path: string): void {
  const absolute = resolve(path)
  const root = parse(absolute).root
  let current = root
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    const entry = stat(current)
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) throw new Error(`Refusing redirected or non-directory path: ${current}`)
  }
}

function readText(path: string, maxBytes: number): string {
  const entry = stat(path)
  if (!entry?.isFile() || entry.isSymbolicLink() || entry.nlink !== 1) throw new Error(`Refusing non-regular or linked file: ${path}`)
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  try {
    const opened = fs.fstatSync(fd)
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== entry.ino || opened.dev !== entry.dev) throw new Error(`File changed while reading: ${path}`)
    if (opened.size > maxBytes) throw new Error(`Existing file exceeds ${maxBytes} bytes: ${path}`)
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(fd))
  } finally { fs.closeSync(fd) }
}

// Never follow an existing link, including a link in a file that would be replaced.
function existingFiles(skillDir: string, replacements: Set<string>): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = []
  const walk = (dir: string, prefix: string) => {
    for (const name of fs.readdirSync(dir)) {
      const path = prefix ? `${prefix}/${name}` : name
      const absolute = join(dir, name)
      const entry = fs.lstatSync(absolute)
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()) || (entry.isFile() && entry.nlink !== 1)) {
        throw new Error(`Refusing non-regular or linked skill entry: ${path}`)
      }
      if (!prefix && path !== 'SKILL.md' && !['references', 'templates', 'scripts', 'assets'].includes(path)) {
        throw new Error(`Unexpected existing skill entry: ${path}`)
      }
      if (entry.isDirectory()) {
        if (path === 'SKILL.md') throw new Error('Existing SKILL.md is a directory.')
        walk(absolute, path)
      } else if (!replacements.has(path)) files.push({ path, content: readText(absolute, 1_048_576) })
    }
  }
  walk(skillDir, '')
  return files
}

function writeText(path: string, content: string): void {
  fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const fd = fs.openSync(path, 'wx', 0o600)
  try { fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

export function saveSkill(dir: string, input: SaveSkillInput): SaveResult {
  const markdown = `---\nname: ${JSON.stringify(input.name)}\ndescription: ${JSON.stringify(input.description)}\n---\n${input.body}`
  const lint = lintSkill(markdown)
  const incoming = [{ path: 'SKILL.md', content: markdown }, ...(input.files ?? [])]
  const findings = scanSkill(incoming)
  const errors = [...lint.filter(issue => issue.level === 'error').map(issue => issue.message),
    ...findings.filter(finding => finding.severity === 'block').map(finding => finding.message)]
  if (input.files?.some(file => file.path === 'SKILL.md')) errors.push('files may only contain supporting files, not SKILL.md.')
  if (errors.length) return { ok: false, errors }
  const root = resolve(dir)
  const target = join(root, input.name)
  const lock = join(root, `.skill-${input.name}.lock`)
  let locked = false
  let stage: string | undefined
  let backup: string | undefined
  try {
    safeDirectories(root)
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    safeDirectories(root)
    try { fs.mkdirSync(lock, { mode: 0o700 }); locked = true } catch (error) {
      if (hasCode(error, 'EEXIST')) throw new Error(`Skill '${input.name}' is locked by another operation.`)
      throw error
    }
    safeDirectories(target)
    const existing = stat(target)
    let retained: Array<{ path: string; content: string }> = []
    if (existing) {
      if (fs.readdirSync(target).length) {
        const oldDoc = parseSkill(readText(join(target, 'SKILL.md'), 1_048_576)).doc
        if (!oldDoc) throw new Error('Refusing to overwrite an existing SKILL.md that fails to parse.')
        if (oldDoc.name !== input.name) throw new Error('Existing frontmatter name does not match the skill directory.')
      }
      retained = existingFiles(target, new Set(incoming.map(file => file.path)))
    }
    const allFiles = [...incoming, ...retained]
    const allFindings = scanSkill(allFiles)
    const blocked = allFindings.filter(finding => finding.severity === 'block')
    if (blocked.length) return { ok: false, errors: blocked.map(finding => finding.message) }
    stage = fs.mkdtempSync(join(root, `.skill-${input.name}-`))
    for (const file of allFiles) writeText(join(stage, file.path), file.content)
    safeDirectories(target)
    // Portable rename cannot replace a non-empty directory. Keep a recoverable
    // backup during the two-rename swap; readers may briefly see no skill.
    if (existing) {
      backup = join(root, `.skill-${input.name}-backup-${randomUUID()}`)
      fs.renameSync(target, backup)
    }
    try { fs.renameSync(stage, target); stage = undefined } catch (error) {
      if (backup) {
        try { fs.renameSync(backup, target); backup = undefined } catch (restoreError) {
          throw new Error(`Publish failed: ${message(error)}. Restore failed: ${message(restoreError)}. Original skill preserved at ${backup}.`)
        }
      }
      throw error
    }
    const warnings = [...lint.filter(issue => issue.level === 'warning').map(issue => issue.message),
      ...allFindings.filter(finding => finding.severity === 'warn').map(finding => finding.message)]
    if (backup) {
      try { fs.rmSync(backup, { recursive: true }); backup = undefined } catch (error) {
        warnings.push(`Saved skill, but could not remove backup ${backup}: ${message(error)}`)
      }
    }
    return { ok: true, path: join(target, 'SKILL.md'), warnings }
  } catch (error) {
    return { ok: false, errors: [message(error)] }
  } finally {
    if (stage) { try { fs.rmSync(stage, { recursive: true, force: true }) } catch { /* Never remove the original on cleanup failure. */ } }
    // A failed restore leaves the backup for recovery rather than destroying it.
    if (locked) { try { fs.rmdirSync(lock) } catch { /* A leftover lock fails closed on the next operation. */ } }
  }
}

/** One skill's SKILL.md (parsed) and the names of its supporting files. */
export function readSkill(dir: string, name: string): { name: string; description: string; body: string; files: string[] } | null {
  if (!validName(name)) return null
  try {
    const target = join(resolve(dir), name)
    safeDirectories(target)
    const doc = parseSkill(readText(join(target, 'SKILL.md'), 1_048_576)).doc
    if (!doc || doc.name !== name) return null
    const files: string[] = []
    const walkNames = (d: string, rel: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue
        const r = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) walkNames(join(d, e.name), r)
        else if (e.isFile() && r !== 'SKILL.md') files.push(r)
      }
    }
    walkNames(target, '')
    return { name, description: doc.description, body: doc.body, files: files.sort() }
  } catch {
    return null
  }
}

export function listSkills(dir: string): Array<{ name: string; description: string; path: string }> {
  const skills: Array<{ name: string; description: string; path: string }> = []
  const root = resolve(dir)
  try {
    safeDirectories(root)
    for (const name of fs.readdirSync(root).sort()) {
      if (!validName(name)) continue
      try {
        const target = join(root, name)
        safeDirectories(target)
        const path = join(target, 'SKILL.md')
        const doc = parseSkill(readText(path, 100_000)).doc
        if (doc && doc.name === name) skills.push({ name, description: doc.description, path })
      } catch { /* One malformed or inaccessible skill does not hide the others. */ }
    }
  } catch { /* Missing or inaccessible roots have no readable skills. */ }
  return skills
}

export function deleteSkill(dir: string, name: string): boolean {
  if (!validName(name)) return false
  const root = resolve(dir)
  const target = join(root, name)
  const lock = join(root, `.skill-${name}.lock`)
  let locked = false
  try {
    safeDirectories(target)
    if (!stat(target)) return false
    fs.mkdirSync(lock, { mode: 0o700 }); locked = true
    // Validate the tree without reading its contents; broken skills remain deletable.
    const paths: string[] = []
    const walk = (path: string) => {
      for (const entry of fs.readdirSync(path, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error('Unsafe skill entry.')
        const child = join(path, entry.name)
        paths.push(child)
        if (entry.isDirectory()) walk(child)
      }
    }
    walk(target)
    for (const path of paths) if (fs.lstatSync(path).isSymbolicLink()) throw new Error('Skill entry changed.')
    fs.rmSync(target, { recursive: true })
    return true
  } catch { return false } finally {
    if (locked) { try { fs.rmdirSync(lock) } catch { /* Fail closed if the lock cannot be removed. */ } }
  }
}
