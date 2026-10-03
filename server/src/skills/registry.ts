// Skills (plan §9): Claude Code skills in each ant's protected .claude/skills, plus colony-wide
// skills in ~/Ants/.colony/skills that are copied into every ant at provisioning.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillView } from '@ant/shared'
import { deleteSkill, listSkills, readSkill, saveSkill, type SaveSkillInput } from './store.ts'

/** Marks a skill folder in an ant that was copied from the colony library. */
const SHARED_MARK = '.ant-shared'

export class SkillRegistry {
  readonly sharedDir: string

  constructor(antHome: string) {
    this.sharedDir = join(antHome, '.colony', 'skills')
  }

  antDir(folder: string) {
    return join(folder, '.claude', 'skills')
  }

  list(folder: string): SkillView[] {
    const shared = existsSync(this.sharedDir) ? listSkills(this.sharedDir) : []
    const own = existsSync(this.antDir(folder))
      ? listSkills(this.antDir(folder)).filter((s) => !existsSync(join(this.antDir(folder), s.name, SHARED_MARK)))
      : []
    return [
      ...own.map((s) => ({ name: s.name, description: s.description, scope: 'ant' as const })),
      ...shared.filter((s) => !own.some((o) => o.name === s.name)).map((s) => ({ name: s.name, description: s.description, scope: 'colony' as const })),
    ].sort((a, b) => a.name.localeCompare(b.name))
  }

  save(folder: string, input: SaveSkillInput, scope: 'ant' | 'colony') {
    const dir = scope === 'colony' ? this.sharedDir : this.antDir(folder)
    mkdirSync(dir, { recursive: true })
    return saveSkill(dir, input)
  }

  remove(folder: string, name: string, scope: 'ant' | 'colony'): boolean {
    return deleteSkill(scope === 'colony' ? this.sharedDir : this.antDir(folder), name)
  }

  read(folder: string, name: string, scope: 'ant' | 'colony') {
    const s = readSkill(scope === 'colony' ? this.sharedDir : this.antDir(folder), name)
    return s && { ...s, scope }
  }

  /** Move an ant's own skill into the colony library, keeping its supporting files. */
  share(folder: string, name: string): { ok: true } | { ok: false; errors: string[] } {
    const src = join(this.antDir(folder), name)
    const s = readSkill(this.antDir(folder), name)
    if (!s) return { ok: false, errors: ['No such skill'] }
    mkdirSync(this.sharedDir, { recursive: true })
    const dest = join(this.sharedDir, name)
    if (existsSync(dest)) return { ok: false, errors: [`The colony already has a skill called ${name}.`] }
    cpSync(src, dest, { recursive: true })
    rmSync(src, { recursive: true, force: true })
    return { ok: true }
  }

  /** Copy colony skills into an ant (own skills of the same name win); drop stale copies. */
  sync(folder: string) {
    const target = this.antDir(folder)
    mkdirSync(target, { recursive: true })
    const shared = existsSync(this.sharedDir) ? listSkills(this.sharedDir).map((s) => s.name) : []
    for (const entry of readdirSync(target)) {
      if (existsSync(join(target, entry, SHARED_MARK)) && !shared.includes(entry)) rmSync(join(target, entry), { recursive: true, force: true })
    }
    for (const name of shared) {
      const dest = join(target, name)
      if (existsSync(dest) && !existsSync(join(dest, SHARED_MARK))) continue
      rmSync(dest, { recursive: true, force: true })
      cpSync(join(this.sharedDir, name), dest, { recursive: true })
      writeFileSync(join(dest, SHARED_MARK), '')
    }
  }
}
