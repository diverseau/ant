// Ported from hermes-agent tools/skill_linter.py @ 54bc5e50 (MIT, Nous Research)
// Ported from hermes-agent tools/skill_manager_tool.py @ 54bc5e50 (MIT, Nous Research)

export interface SkillDoc { name: string; description: string; body: string; frontmatter: Record<string, string> }
export type LintIssue = { level: 'error' | 'warning'; code: string; message: string }

const MAX_BYTES = 100_000
const chars = (text: string): number => Array.from(text).length
const issue = (code: string, message: string): LintIssue => ({ level: 'error', code, message })

// This is deliberately a scalar mapping parser, not a general YAML implementation.
function scalar(raw: string): string | null {
  if (raw.startsWith('"')) {
    const quoted = raw.match(/^"(?:[^"\\]|\\.)*"(?=\s*(?:#.*)?$)/)?.[0]
    if (!quoted) return null
    try { return JSON.parse(quoted) as string } catch { return null }
  }
  if (raw.startsWith("'")) {
    const quoted = raw.match(/^'(?:[^']|'')*'(?=\s*(?:#.*)?$)/)?.[0]
    return quoted ? quoted.slice(1, -1).replaceAll("''", "'") : null
  }
  const value = raw.replace(/\s+#.*$/, '').trim()
  if (/^[\[\]{}&*!|>@`]|:\s|\s[\[\]{}]/.test(value)) return null
  return value.startsWith('#') ? '' : value
}

function folded(lines: string[], marker: string): string | null {
  const nonempty = lines.filter(line => line.trim())
  if (!nonempty.length) return ''
  const indent = nonempty[0].match(/^ +/)?.[0].length ?? 0
  if (!indent || nonempty.some(line => (line.match(/^ */)?.[0].length ?? 0) < indent)) return null
  const parts = lines.map(line => line.trim() ? line.slice(indent) : '')
  let value = ''
  for (let i = 0; i < parts.length;) {
    if (!parts[i]) { value += '\n'; i++; continue }
    value += parts[i]
    let next = i + 1
    while (next < parts.length && !parts[next]) next++
    if (next === parts.length) { value += '\n'.repeat(next - i); break }
    const blanks = next - i - 1
    const indented = parts[i].startsWith(' ') || parts[next].startsWith(' ')
    value += !blanks && !indented ? ' ' : '\n'.repeat(blanks + (indented ? 1 : 0))
    i = next
  }
  return marker === '>-' ? value.replace(/\n+$/, '') : marker === '>+' ? value : value.replace(/\n*$/, '\n')
}

export function parseSkill(markdown: string): { doc: SkillDoc | null; issues: LintIssue[] } {
  const lines = markdown.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n')
  if (lines[0] !== '---') return { doc: null, issues: [issue('frontmatter-missing', 'SKILL.md must start with a --- frontmatter line.')] }
  const end = lines.findIndex((line, index) => index > 0 && /^---\s*$/.test(line))
  if (end < 0) return { doc: null, issues: [issue('frontmatter-unclosed', 'Frontmatter needs a closing --- line.')] }
  const frontmatter: Record<string, string> = Object.create(null) as Record<string, string>
  const issues: LintIssue[] = []
  for (let i = 1; i < end; i++) {
    const line = lines[i]
    if (!line.trim() || /^\s*#/.test(line)) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*)|\s*)$/)
    if (!match) { issues.push(issue('frontmatter-syntax', `Invalid scalar mapping on frontmatter line ${i + 1}.`)); continue }
    const [, key, raw = ''] = match
    if (Object.hasOwn(frontmatter, key)) issues.push(issue('frontmatter-duplicate', `Duplicate frontmatter key '${key}'.`))
    let value: string | null
    const marker = raw.replace(/\s+#.*$/, '').trim()
    if (/^>[+-]?$/.test(marker)) {
      const block: string[] = []
      while (i + 1 < end && (!lines[i + 1].trim() || /^ /.test(lines[i + 1]))) block.push(lines[++i])
      value = folded(block, marker)
    } else value = scalar(raw)
    if (value === null) issues.push(issue('frontmatter-syntax', `Unsupported or malformed value for '${key}'. Use a string or folded > block.`))
    else frontmatter[key] = value
  }
  const name = frontmatter.name ?? ''
  const description = frontmatter.description ?? ''
  const body = lines.slice(end + 1).join('\n')
  if (!name.trim()) issues.push(issue('name-required', 'Frontmatter name is required.'))
  else {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) issues.push(issue('name-format', 'Name must start with a letter or digit and contain only lowercase a-z, 0-9 and hyphens.'))
    if (chars(name) > 64) issues.push(issue('name-length', 'Name exceeds 64 characters.'))
  }
  if (!description.trim()) issues.push(issue('description-required', 'Frontmatter description is required.'))
  if (chars(description) > 1024) issues.push(issue('description-length', 'Description exceeds 1024 characters.'))
  if (!body.trim()) issues.push(issue('body-empty', 'SKILL.md needs instructions after the frontmatter.'))
  return { doc: issues.length ? null : { name, description, body, frontmatter }, issues }
}

export function lintSkill(markdown: string, opts?: { maxBytes?: number }): LintIssue[] {
  const maxBytes = opts?.maxBytes ?? MAX_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new TypeError('maxBytes must be a non-negative safe integer.')
  const { doc, issues } = parseSkill(markdown)
  if (Buffer.byteLength(markdown, 'utf8') > maxBytes) issues.push(issue('size-limit', `SKILL.md exceeds ${maxBytes} bytes. Move detail into supporting files.`))
  if (!doc) return issues
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message })
  if (chars(doc.body) > 24_000) warn('oversized-body', 'Body exceeds 24,000 characters; move topic detail into references/.')
  if (!/^#+\s+When to [Uu]se\b/m.test(doc.body)) warn('missing-section', "Add a 'When to Use' section with explicit trigger conditions.")
  if (/\b(powerful|comprehensive|seamless|advanced|cutting-edge|state-of-the-art|revolutionary|robust)\b/i.test(doc.description)) {
    warn('description-marketing', 'Description should state the capability and trigger instead of marketing adjectives.')
  }
  const prose = doc.body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
  const refs = prose.match(/(?<![\w/])#\d{3,6}\b|\b(?:PR|issue)\s*#?\d{3,6}\b/g)?.length ?? 0
  if (refs >= 4 && refs / Math.max(chars(prose), 1) * 1000 >= 0.5) warn('incident-log-shape', 'Replace dense PR/issue history with reusable instructions.')
  return issues
}
