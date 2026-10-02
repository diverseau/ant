// Ported from hermes-agent tools/memory_tool_store.py @ 54bc5e50 (MIT, Nous Research)
// Ported from hermes-agent tools/memory_tool.py @ 54bc5e50 (MIT, Nous Research)

import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { firstThreat } from './threats.ts'

export type MemoryTarget = 'memory' | 'user'
export interface MemoryLimits { memory: number; user: number }
export type MemoryResult =
  | { ok: true; target: MemoryTarget; entries: string[]; usage: string; message: string }
  | { ok: false; target: MemoryTarget; error: string; entries?: string[]; usage?: string }

type Operation = { op: 'add' | 'replace' | 'remove'; content?: string; oldText?: string }
const DELIMITER = '\n§\n'
const STALE_LOCK_MS = 10_000
const number = new Intl.NumberFormat('en-US')
const chars = (text: string): number => Array.from(text).length
// Match Python str.strip(), including NEL, without stripping invisible BOM payloads.
const trim = (text: string): string => text.replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu, '')
const parse = (raw: string): string[] => raw.split(DELIMITER).map(trim).filter(Boolean)
const dedup = (entries: string[]): string[] => [...new Set(entries)]
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)
const hasCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code

function readRaw(path: string): { raw: string; bytes: Buffer } {
  try {
    const bytes = fs.readFileSync(path)
    // Fatal decoding prevents a lossy read-modify-write from destroying corrupt bytes.
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n')
    return { raw, bytes }
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return { raw: '', bytes: Buffer.alloc(0) }
    throw error
  }
}

function atomicWrite(path: string, content: string | Buffer): void {
  const temp = join(dirname(path), `.mem_${randomUUID()}.tmp`)
  let fd: number | undefined
  try {
    fd = fs.openSync(temp, 'wx', 0o600)
    fs.writeFileSync(fd, content)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.renameSync(temp, path)
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
    try { fs.unlinkSync(temp) } catch { /* A successful rename already removed it. */ }
  }
}

function acquireLock(path: string): () => void {
  const lockPath = `${path}.lock`
  let fd: number
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600)
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error
    const stale = fs.lstatSync(lockPath)
    if (stale.isSymbolicLink() || Date.now() - stale.mtimeMs <= STALE_LOCK_MS) {
      throw new Error(`Memory file is locked: ${basename(path)}. Retry in a moment.`)
    }
    fs.unlinkSync(lockPath)
    fd = fs.openSync(lockPath, 'wx', 0o600)
  }
  const owned = fs.fstatSync(fd)
  return () => {
    try {
      const current = fs.lstatSync(lockPath)
      if (current.ino === owned.ino && current.dev === owned.dev) fs.unlinkSync(lockPath)
    } catch { /* Never remove a replacement lock or mask the operation's result. */ }
    finally {
      try { fs.closeSync(fd) } catch { /* Cleanup cannot change a persisted result. */ }
    }
  }
}

export class MemoryStore {
  private paths: Record<MemoryTarget, string>
  private limits: MemoryLimits
  private snapshot: Record<MemoryTarget, string>

  constructor(opts: { memoryPath: string; userPath: string; limits?: Partial<MemoryLimits> }) {
    this.paths = { memory: opts.memoryPath, user: opts.userPath }
    this.limits = { memory: opts.limits?.memory ?? 2200, user: opts.limits?.user ?? 1375 }
    for (const target of ['memory', 'user'] as const) {
      if (!this.paths[target] || !Number.isSafeInteger(this.limits[target]) || this.limits[target] < 0) {
        throw new TypeError('Memory paths must be non-empty and limits must be non-negative safe integers.')
      }
    }
    this.snapshot = { memory: this.renderEntries('memory', this.read('memory')),
      user: this.renderEntries('user', this.read('user')) }
  }

  read(target: MemoryTarget): string[] {
    const path = this.path(target)
    try { return dedup(parse(readRaw(path).raw)) } catch { return [] }
  }

  add(target: MemoryTarget, content: string): MemoryResult {
    return this.mutate(target, [{ op: 'add', content }], false)
  }

  replace(target: MemoryTarget, oldText: string, content: string): MemoryResult {
    return this.mutate(target, [{ op: 'replace', oldText, content }], false)
  }

  remove(target: MemoryTarget, oldText: string): MemoryResult {
    return this.mutate(target, [{ op: 'remove', oldText }], false)
  }

  batch(target: MemoryTarget, ops: Operation[]): MemoryResult {
    return this.mutate(target, ops, true)
  }

  /** Frozen constructor-time snapshot; create a store per session to refresh CLAUDE.md. */
  render(target: MemoryTarget): string {
    this.path(target)
    return this.snapshot[target]
  }

  private path(target: MemoryTarget): string {
    if (target !== 'memory' && target !== 'user') throw new TypeError(`Invalid memory target: ${target}`)
    return this.paths[target]
  }

  private usage(target: MemoryTarget, entries: string[]): string {
    const current = chars(entries.join(DELIMITER)), limit = this.limits[target]
    const pct = limit > 0 ? Math.min(100, Math.floor(current / limit * 100)) : 0
    return `${number.format(current)}/${number.format(limit)} chars (${pct}%)`
  }

  private renderEntries(target: MemoryTarget, entries: string[]): string {
    if (!entries.length) return ''
    const title = target === 'memory' ? 'Memory (your notes)' : 'User profile (who the user is)'
    const safe = entries.map(entry => {
      const threat = firstThreat(entry)
      return threat ? `[BLOCKED: ${basename(this.paths[target])} entry. ${threat} Use the memory tool to remove the original.]` : entry
    })
    return `## ${title}\n${safe.map(entry => `- ${entry.replaceAll('\n', '\n  ')}`).join('\n')}`
  }

  private mutate(target: MemoryTarget, ops: Operation[], isBatch: boolean): MemoryResult {
    const path = this.path(target)
    const fail = (error: string, entries?: string[]): MemoryResult => ({ ok: false, target,
      error: error + (isBatch ? ' No operations were applied (batch is all-or-nothing).' : ''),
      ...(entries ? { usage: this.usage(target, entries), ...(!isBatch ? { entries: [...entries] } : {}) } : {}) })
    if (!ops.length) return fail('operations list is empty.')
    const prepared = ops.map(op => ({ ...op, content: trim(op.content ?? ''), oldText: trim(op.oldText ?? '') }))
    for (const [i, op] of prepared.entries()) {
      const pos = isBatch ? `Operation ${i + 1}: ` : ''
      if (!['add', 'replace', 'remove'].includes(op.op)) return fail(`${pos}Unknown operation. Use add, replace, or remove.`)
      if (op.op !== 'add' && !op.oldText) return fail(`${pos}oldText cannot be empty.`)
      if (op.op !== 'remove') {
        if (!op.content) return fail(`${pos}Content cannot be empty.${op.op === 'replace' ? " Use 'remove' to delete entries." : ''}`)
        if (op.content.includes(DELIMITER)) return fail(`${pos}Content cannot contain the entry delimiter (\\n§\\n).`)
        const threat = firstThreat(op.content)
        if (threat) return fail(`${pos}${threat}`)
      }
    }
    let release: (() => void) | undefined
    try {
      fs.mkdirSync(dirname(path), { recursive: true })
      release = acquireLock(path)
      let source: ReturnType<typeof readRaw>
      try { source = readRaw(path) } catch {
        return fail(`Refusing to write ${basename(path)}: the file exists on disk but could not be read (permissions, invalid/corrupt text encoding, or a filesystem error). Treating it as empty would wipe existing memory. Nothing was changed — retry in a moment.`)
      }
      const parsed = parse(source.raw), entries = dedup(parsed)
      // Check the same read used for mutation, before discarding any foreign formatting.
      if (trim(source.raw) && (trim(source.raw) !== parsed.join(DELIMITER) || parsed.some(entry => chars(entry) > this.limits[target]))) {
        const backup = `${path}.bak`
        let detail: string
        try { atomicWrite(backup, source.bytes); detail = `A snapshot was saved to ${backup}.` }
        catch (error) { detail = `Backup to ${backup} failed: ${errorText(error)}. The original file is unchanged.` }
        return fail(`Refusing to write ${basename(path)}: file on disk has content that wouldn't round-trip through the memory tool. ${detail} Resolve the drift first: rewrite the file as a clean §-delimited list of entries, or move the extra content out, then retry.`, entries)
      }
      const working = [...entries]
      let duplicate = false
      for (const [i, op] of prepared.entries()) {
        const pos = isBatch ? `Operation ${i + 1} (${op.op}): ` : ''
        if (op.op === 'add') {
          if (working.includes(op.content)) duplicate = true
          else working.push(op.content)
          continue
        }
        const exact = working.indexOf(op.oldText)
        const matches = exact >= 0 ? [exact] : working.flatMap((entry, idx) => entry.includes(op.oldText) ? [idx] : [])
        if (new Set(matches.map(idx => working[idx])).size > 1) return fail(`${pos}Multiple entries matched '${op.oldText}'. Be more specific.`, entries)
        if (!matches.length) return fail(`${pos}No entry matched '${op.oldText}'. Retry with the exact text of the entry you want to ${op.op}.`, entries)
        working.splice(matches[0], 1, ...(op.op === 'replace' ? [op.content] : []))
      }
      if (isBatch && entries.length && !working.length) {
        return fail(`Refusing to empty ${basename(path)}: this batch would remove every entry. Keep at least one entry, or use single remove() calls to delete the final entry deliberately.`, entries)
      }
      const total = chars(working.join(DELIMITER)), limit = this.limits[target]
      // A duplicate add is a no-op even if hand-edited memory is over budget.
      const unchanged = working.length === entries.length && working.every((entry, idx) => entry === entries[idx])
      if (total > limit && !(unchanged && !isBatch && prepared[0].op === 'add') && !(prepared.length === 1 && !isBatch && prepared[0].op === 'remove')) {
        const message = isBatch
          ? `After applying all ${ops.length} operations, memory would be at ${number.format(total)}/${number.format(limit)} chars — over the limit. Remove or shorten more entries in the same batch, then retry.`
          : prepared[0].op === 'add'
            ? `Memory at ${number.format(chars(entries.join(DELIMITER)))}/${number.format(limit)} chars. Adding this entry (${chars(prepared[0].content)} chars) would exceed the limit. Use 'replace' to consolidate or 'remove' stale entries, then retry.`
            : `Replacement would put memory at ${number.format(total)}/${number.format(limit)} chars — over the limit. Shorten the new content or 'remove' stale entries to make room.`
        return fail(message, entries)
      }
      if (!unchanged) atomicWrite(path, working.join(DELIMITER))
      const message = isBatch ? `Applied ${ops.length} operation(s).${duplicate ? ' Duplicate adds were skipped (no duplicate added).' : ''}`
        : prepared[0].op === 'add' ? (duplicate ? 'Entry already exists (no duplicate added).' : 'Entry added.')
          : prepared[0].op === 'replace' ? 'Entry replaced.' : 'Entry removed.'
      return { ok: true, target, entries: [...working], usage: this.usage(target, working), message }
    } catch (error) {
      return fail(`Failed to update ${basename(path)}: ${errorText(error)}`)
    } finally {
      release?.()
    }
  }
}
