// Tiny, safe markdown subset for agent messages: paragraphs, "- " lists,
// **bold**, `code` and @Mentions. Produces data, never HTML strings.
import type { Ant } from './types'

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'code'; v: string }
  | { t: 'mention'; ant: Ant }
  | { t: 'tag'; v: string }

export type Block = { t: 'p'; inl: Inline[] } | { t: 'ul'; items: Inline[][] }

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|@([A-Za-z][\w-]*)|(^|\s)(\/[\w-]+)/g

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

export function parse(src: string, ants: Ant[]): Block[] {
  const blocks: Block[] = []
  for (const chunk of src.split(/\n{2,}/)) {
    const lines = chunk.split('\n')
    if (lines.every((l) => /^\s*[-•]\s+/.test(l) || !l.trim())) {
      blocks.push({ t: 'ul', items: lines.filter((l) => l.trim()).map((l) => inline(l.replace(/^\s*[-•]\s+/, ''), ants)) })
    } else {
      // Mixed chunk: paragraph lines, then any trailing list lines.
      const para: string[] = []
      const items: string[] = []
      for (const l of lines) (/^\s*[-•]\s+/.test(l) ? items : para).push(l)
      if (para.length) blocks.push({ t: 'p', inl: inline(para.join('\n'), ants) })
      if (items.length) blocks.push({ t: 'ul', items: items.map((l) => inline(l.replace(/^\s*[-•]\s+/, ''), ants)) })
    }
  }
  return blocks
}
