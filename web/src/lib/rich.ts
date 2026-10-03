// Tiny, safe markdown subset for agent messages: paragraphs, headings, "- " and "1." lists,
// quotes, fenced code, tables, **bold**, *italic*, `code`, links and @Mentions. Produces data, never HTML strings.
import type { Ant } from './types'

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'em'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string }
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

// Earliest match wins, so a URL swallows any @ or _ inside it. A /skill tag only counts at the
// very start of a message (how skills are invoked).
const INLINE = new RegExp(
  [
    /`(?<code>[^`]+)`/,
    /\[(?<label>[^\]\n]+)\]\((?<href>(?:[^()\s]|\([^()\s]*\))+)\)/,
    /(?<url>https?:\/\/[^\s<>]+)/,
    /\*\*(?<bold>.+?)\*\*/,
    /(?<![\w*])\*(?![\s*])(?<em>[^*\n]+?)\*(?![\w*])/,
    /(?<![\w_])_(?![\s_])(?<em2>[^_\n]+?)_(?![\w_])/,
    /@(?<mention>[A-Za-z][\w-]*)/,
    /^(?<tag>\/[\w-]+)(?=\s|$)/,
  ]
    .map((r) => r.source)
    .join('|'),
  'g',
)

// Only web and mail links become clickable; anything else (javascript:, file:) stays text.
export function safeHref(href: string): string | null {
  try {
    const u = new URL(href)
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null
  } catch {
    return null
  }
}

export function inline(src: string, ants: Ant[]): Inline[] {
  const out: Inline[] = []
  const text = (v: string) => {
    const prev = out[out.length - 1]
    if (prev?.t === 'text') prev.v += v
    else if (v) out.push({ t: 'text', v })
  }
  let last = 0
  for (const m of src.matchAll(INLINE)) {
    const g = m.groups!
    const raw = m[0]
    let end = m.index! + raw.length
    text(src.slice(last, m.index))
    if (g.code !== undefined) out.push({ t: 'code', v: g.code })
    else if (g.label !== undefined) {
      const href = safeHref(g.href)
      out.push(href ? { t: 'link', v: g.label.replace(/\*\*|`/g, ''), href } : { t: 'text', v: raw })
    } else if (g.url !== undefined) {
      // Sentence punctuation after a bare URL isn't part of it; a ")" only is when it closes a "(".
      let url = g.url.replace(/[.,;:!?'"]+$/, '')
      while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1)
      end = m.index! + url.length
      const href = safeHref(url)
      out.push(href ? { t: 'link', v: url, href } : { t: 'text', v: url })
    } else if (g.bold !== undefined) out.push({ t: 'bold', v: g.bold })
    else if (g.em !== undefined || g.em2 !== undefined) out.push({ t: 'em', v: g.em ?? g.em2 })
    else if (g.mention !== undefined) {
      const ant = ants.find((a) => a.name.toLowerCase() === g.mention.toLowerCase())
      if (ant) out.push({ t: 'mention', ant })
      else text(raw)
    } else if (g.tag !== undefined) out.push({ t: 'tag', v: g.tag })
    last = end
  }
  text(src.slice(last))
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
