// Ported from hermes-agent gateway/platforms/base.py @ 54bc5e50 (MIT, Nous Research)

/** Plain-text chunks, measured in UTF-16 units; joining them preserves the input. */
export function splitText(text: string, limit: number): string[] {
  if (!Number.isInteger(limit) || limit < 2) throw new Error('Message limit must be an integer of at least 2')
  if (!text.trim()) return []
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    let end = limit
    // A platform limit must never cut an emoji's surrogate pair in half.
    const last = rest.charCodeAt(end - 1)
    const next = rest.charCodeAt(end)
    if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--
    const region = rest.slice(0, end)
    const paragraph = region.lastIndexOf('\n\n')
    const line = region.lastIndexOf('\n')
    const word = region.search(/\s+\S*$/)
    if (paragraph > 0) end = paragraph + 2
    else if (line > 0) end = line + 1
    else if (word > 0) end = word + 1
    chunks.push(rest.slice(0, end))
    rest = rest.slice(end)
  }
  if (rest) chunks.push(rest)
  return chunks
}
