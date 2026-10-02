import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHarness, toolCommand, waitFor, type Harness } from './helpers.ts'

let h: Harness

beforeEach(async () => {
  h = await createHarness()
})

afterEach(async () => {
  await h.close()
})

describe('skills', () => {
  it('save_skill writes a valid skill into the ant\'s protected skills dir', async () => {
    const a = h.ant('Skilly')
    h.svc.sendFromUser(a.threadId, toolCommand('mcp__ant__save_skill', { name: 'weekly-digest', description: 'Summarise the week', body: '# Weekly digest\n\n1. Read the notes.\n2. Summarise.' }))
    await h.finished(a.id)
    const file = join(a.paths.folder, '.claude', 'skills', 'weekly-digest', 'SKILL.md')
    await waitFor(() => existsSync(file), 'skill file')
    expect(readFileSync(file, 'utf8')).toMatch(/name: "?weekly-digest"?/)
    expect(h.svc.skills.list(a.paths.folder)).toEqual([{ name: 'weekly-digest', description: 'Summarise the week', scope: 'ant' }])
  })

  it('rejects an invalid skill name with an explanation', async () => {
    const a = h.ant('Bad')
    h.svc.sendFromUser(a.threadId, toolCommand('mcp__ant__save_skill', { name: 'Bad Name!', description: 'x', body: 'y' }))
    await h.finished(a.id)
    expect(h.svc.skills.list(a.paths.folder)).toEqual([])
  })

  it('colony skills sync into every ant without overriding their own', () => {
    const a = h.ant('One')
    const b = h.ant('Two')
    expect(h.svc.skills.save(a.paths.folder, { name: 'shared-thing', description: 'Shared', body: 'Do it.' }, 'colony').ok).toBe(true)
    h.svc.skills.sync(b.paths.folder)
    expect(existsSync(join(b.paths.folder, '.claude', 'skills', 'shared-thing', 'SKILL.md'))).toBe(true)
    expect(h.svc.skills.list(b.paths.folder)).toEqual([{ name: 'shared-thing', description: 'Shared', scope: 'colony' }])
  })
})
