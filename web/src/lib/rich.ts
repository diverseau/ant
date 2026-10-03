// Tiny, safe markdown subset for agent messages: paragraphs, headings, "- " and "1." lists,
// quotes, fenced code, tables, **bold**, `code` and @Mentions. Produces data, never HTML strings.
import type { Ant } from './types'

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'code'; v: string }
  | { t: 'mention'; ant: Ant }
  | { t: 'tag'; v: string }

export type Align = 'left' | 'center' | 'right' | null

export type Block =
  | { t: 'p'; inl: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3; inl: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; start: number; items: Inline[][] }
  | { t: 'quote'; inl: Inline[] }
  | { t: 'pre'; v: string }
  | { t: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] }

// A /skill tag only counts at the very start of a message (how skills are invoked).
const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|@([A-Za-z][\w-]*)|(^)(\/[\w-]+)(?=\s|$)/g

export function inline(src: string, ants: Ant[]): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of src.matchAll(INLINE)) {
    let start = m.index!
    if (m[5]) start += m[4].length
    if (start > last) out.push({ t: 'text', v: src.slice(last, start) })
    if (m[1] !== undefined) out.push({ t: 'bold', v: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'code', v: m[2] })
    else if (m[3] !== undefined) {
      const ant = ants.find((a) => a.name.toLowerCase() === m[3].toLowerCase())
      out.push(ant ? { t: 'mention', ant } : { t: 'text', v: m[0] })
    } else if (m[5]) out.push({ t: 'tag', v: m[5] })
    last = m.index! + m[0].length
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) })
  return out
}

const FENCE = /^\s*(`{3,}|~{3,})/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const QUOTE = /^>\s?/
const UL = /^\s*[-*•]\s+/
const OL = /^\s*(\d{1,9})[.)]\s+/
const DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

// A table row's cells. Pipes inside `code` or escaped as \| stay in the cell.
export function cells(line: string): string[] {
  const out: string[] = []
  let cell = ''
  let code = false
  const s = line.trim().replace(/^\|/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && s[i + 1] === '|') {
      cell += '|'
      i++
    } else if (c === '`') {
      code = !code
      cell += c
    } else if (c === '|' && !code) {
      out.push(cell.trim())
      cell = ''
    } else cell += c
  }
  if (cell.trim()) out.push(cell.trim())
  return out
}

function isTableStart(lines: string[], i: number) {
  const next = lines[i + 1]
  return lines[i].includes('|') && next !== undefined && next.includes('-') && DIVIDER.test(next) && cells(next).length === cells(lines[i]).length
}

const isBlockStart = (lines: string[], i: number) =>
  FENCE.test(lines[i]) || HEADING.test(lines[i]) || QUOTE.test(lines[i]) || UL.test(lines[i]) || OL.test(lines[i]) || isTableStart(lines, i)

export function parse(src: string, ants: Ant[]): Block[] {
  const blocks: Block[] = []
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    const fence = line.match(FENCE)
    if (fence) {
      // An unclosed fence (still streaming) runs to the end.
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      i++
      blocks.push({ t: 'pre', v: body.join('\n') })
      continue
    }

    const h = line.match(HEADING)
    if (h) {
      blocks.push({ t: 'h', level: Math.min(h[1].length, 3) as 1 | 2 | 3, inl: inline(h[2], ants) })
      i++
      continue
    }

    if (isTableStart(lines, i)) {
      const head = cells(line)
      const align = cells(lines[i + 1]).map((c): Align => {
        const l = c.startsWith(':')
        const r = c.endsWith(':')
        return l && r ? 'center' : r ? 'right' : l ? 'left' : null
      })
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const row = cells(lines[i++])
        // Pad short rows and drop extra cells so every row has the header's width.
        rows.push(head.map((_, c) => inline(row[c] ?? '', ants)))
      }
      blocks.push({ t: 'table', align, head: head.map((c) => inline(c, ants)), rows })
      continue
    }

    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ''))
      blocks.push({ t: 'quote', inl: inline(body.join('\n'), ants) })
      continue
    }

    const ol = line.match(OL)
    if (ol || UL.test(line)) {
      const marker = ol ? OL : UL
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]
        if (marker.test(l)) items.push(l.replace(marker, ''))
        // An indented line carries on the item above it.
        else if (/^\s+\S/.test(l) && !isBlockStart(lines, i)) items[items.length - 1] += '\n' + l.trim()
        else break
        i++
      }
      const inl = items.map((t) => inline(t, ants))
      blocks.push(ol ? { t: 'ol', start: Number(ol[1]), items: inl } : { t: 'ul', items: inl })
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines, i))) para.push(lines[i++])
    blocks.push({ t: 'p', inl: inline(para.join('\n'), ants) })
  }
  return blocks
}
