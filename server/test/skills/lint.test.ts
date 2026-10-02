import { describe, expect, it } from 'vitest'
import { lintSkill, parseSkill } from '../../src/skills/lint.ts'

const skill = (name = 'build-app', description = 'Build an app when requested.', body = '## When to Use\nFollow the project conventions.') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n${body}`
const codes = (markdown: string) => lintSkill(markdown).filter(issue => issue.level === 'error').map(issue => issue.code)

describe('skill frontmatter parsing', () => {
  it('parses a valid native Claude Code skill and retains unknown scalar fields', () => {
    const { doc, issues } = parseSkill(skill().replace('description:', 'allowed-tools: Read, Write\nversion: 1.0\ndescription:'))
    expect(issues).toEqual([])
    expect(doc).toEqual({ name: 'build-app', description: 'Build an app when requested.',
      body: '## When to Use\nFollow the project conventions.', frontmatter: { name: 'build-app', description: 'Build an app when requested.', 'allowed-tools': 'Read, Write', version: '1.0' } })
    expect(lintSkill(skill())).toEqual([])
  })

  it('accepts a UTF-8 BOM and CRLF without losing body text', () => {
    expect(parseSkill(`\ufeff${skill().replaceAll('\n', '\r\n')}`).doc).toEqual(parseSkill(skill()).doc)
  })

  it('parses quoted strings, escapes, embedded colons/hashes and comments', () => {
    const raw = `---\n# comment\nname: 'build-app' # inline\ndescription: "Use: \\"quoted\\" paths\\nAnd \\u00e9." # comment\nauthor: 'O''Brien: #1'\nplain: value # inline comment\n---\nBody`
    expect(parseSkill(raw).doc?.frontmatter).toMatchObject({ name: 'build-app', description: 'Use: "quoted" paths\nAnd é.', author: "O'Brien: #1", plain: 'value' })
  })

  it.each([
    ['>', 'First line second line.\n'],
    ['>-', 'First line second line.'],
    ['>+', 'First line second line.\n\n'],
  ])('folds %s blocks with YAML chomping', (marker, description) => {
    expect(parseSkill(`---\nname: build-app\ndescription: ${marker}\n  First line\n  second line.\n\n---\nBody`).doc?.description).toBe(description)
  })

  it('preserves paragraphs and more-indented text in folded blocks', () => {
    const doc = parseSkill(`---\nname: build-app\ndescription: >-\n  Paragraph one.\n\n  Paragraph two.\n    Indented.\n  Last line.\n---\nBody`).doc
    expect(doc?.description).toBe('Paragraph one.\nParagraph two.\n  Indented.\nLast line.')
  })

  it('accepts closing frontmatter at EOF and reports the missing body', () => {
    expect(codes('---\nname: build-app\ndescription: Test\n---')).toEqual(['body-empty'])
  })

  it('safely stores prototype-like keys without prototype pollution', () => {
    const { doc } = parseSkill(skill().replace('description:', '__proto__: harmless\nconstructor: harmless\ndescription:'))
    expect(doc?.frontmatter.__proto__).toBe('harmless')
    expect(Object.getPrototypeOf(doc?.frontmatter)).toBeNull()
  })

  it.each([
    ['', 'frontmatter-missing'],
    ['Body without frontmatter', 'frontmatter-missing'],
    [' ---\nname: app\n---\nBody', 'frontmatter-missing'],
    ['---extra\nname: app\n---\nBody', 'frontmatter-missing'],
    ['---\nname: build-app\ndescription: Test', 'frontmatter-unclosed'],
    ['---\n- name: app\n---\nBody', 'frontmatter-syntax'],
    [skill().replace('name: build-app', 'name: build-app\nname: other'), 'frontmatter-duplicate'],
    [skill().replace('description: Build an app when requested.', 'description: [one, two]'), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', 'description: {a: b}'), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', 'description: &anchor test'), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', 'description: *alias'), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', 'description: |\n  literal'), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', 'description: "unclosed'), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', "description: 'unclosed"), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', 'description: "value" extra'), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', 'description: "bad\\q"'), 'frontmatter-syntax'],
    [skill().replace('description: Build an app when requested.', 'description: >\n    first\n  second'), 'frontmatter-syntax'],
    [skill().replace('name: build-app\n', ''), 'name-required'],
    [skill(''), 'name-required'],
    [skill('Build-app'), 'name-format'],
    [skill('under_score'), 'name-format'],
    [skill('dot.name'), 'name-format'],
    [skill('-leading'), 'name-format'],
    [skill('../outside'), 'name-format'],
    [skill('a'.repeat(65)), 'name-length'],
    [skill().replace('description: Build an app when requested.\n', ''), 'description-required'],
    [skill('app', ''), 'description-required'],
    [skill('app', "'   '"), 'description-required'],
    [skill('app', 'x'.repeat(1025)), 'description-length'],
    [skill('app', 'Test', ' \n '), 'body-empty'],
  ])('rejects invalid document %j with %s', (markdown, code) => {
    expect(codes(markdown)).toContain(code)
    expect(parseSkill(markdown).doc).toBeNull()
  })
})

describe('lint limits and advice', () => {
  it('accepts exact name/description boundaries and counts Unicode codepoints', () => {
    expect(codes(skill('a'.repeat(64), '🐜'.repeat(1024)))).toEqual([])
    expect(codes(skill('app', '🐜'.repeat(1025)))).toEqual(['description-length'])
  })

  it('checks byte limits including frontmatter, Unicode, BOM and exact custom boundaries', () => {
    const markdown = `\ufeff${skill('app', 'Test', '🐜')}`
    const bytes = Buffer.byteLength(markdown)
    expect(lintSkill(markdown, { maxBytes: bytes }).filter(issue => issue.level === 'error')).toEqual([])
    expect(lintSkill(markdown, { maxBytes: bytes - 1 })).toContainEqual(expect.objectContaining({ code: 'size-limit', level: 'error' }))
    expect(lintSkill(skill('app', 'Test', 'a'.repeat(100_000)))).toContainEqual(expect.objectContaining({ code: 'size-limit' }))
    expect(lintSkill('', { maxBytes: 0 }).map(issue => issue.code)).not.toContain('size-limit')
    for (const maxBytes of [-1, NaN, Infinity, 1.5]) expect(() => lintSkill(skill(), { maxBytes })).toThrow(TypeError)
  })

  it.each([
    [skill('app', 'Test', 'Read this.'), 'missing-section'],
    [skill('app', 'A powerful app.'), 'description-marketing'],
    [skill('app', 'Test', '## When to Use\n' + 'a'.repeat(24_001)), 'oversized-body'],
    [skill('app', 'Test', '## When to Use\nPR #1234 issue #2345 #3456 #4567'), 'incident-log-shape'],
  ])('emits advisory %s', (markdown, code) => {
    expect(lintSkill(markdown)).toContainEqual(expect.objectContaining({ level: 'warning', code }))
    expect(codes(markdown)).toEqual([])
  })

  it('excludes fenced examples from incident-history advice', () => {
    expect(lintSkill(skill('app', 'Test', '## When to use\n```\n#1234 #2345 #3456 #4567\n```'))).toEqual([])
  })
})
