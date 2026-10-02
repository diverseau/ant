import { describe, expect, it } from 'vitest'
import { splitText } from '../../src/channels/split.ts'

describe('plain-text splitting', () => {
  it('keeps short text and exact-limit text intact, and skips blank messages', () => {
    expect(splitText('small', 5)).toEqual(['small'])
    expect(splitText('  small\n', 20)).toEqual(['  small\n'])
    expect(splitText('', 10)).toEqual([])
    expect(splitText(' \n\t', 10)).toEqual([])
  })

  it('prefers paragraphs, then lines, then word boundaries', () => {
    expect(splitText('aaa\n\nbbbb\ncccc dddd', 10)).toEqual(['aaa\n\n', 'bbbb\n', 'cccc dddd'])
    expect(splitText('aaaa bbbb cccc', 10)).toEqual(['aaaa bbbb ', 'cccc'])
    expect(splitText('aaaa\tbbbb cccc', 8)).toEqual(['aaaa\t', 'bbbb ', 'cccc'])
  })

  it('hard-splits long words without adding markers or changing formatting', () => {
    expect(splitText('abcdefghijk', 4)).toEqual(['abcd', 'efgh', 'ijk'])
    const text = '```ts\n' + 'x'.repeat(40) + '\n```'
    expect(splitText(text, 10).join('')).toBe(text)
  })

  it.each([2, 3, 25, 2000, 4096])('preserves Unicode and stays within %i UTF-16 units', limit => {
    const text = ('A😀🐜é 世界\nline\n\nnext paragraph\tword ').repeat(300)
    const chunks = splitText(text, limit)
    expect(chunks.join('')).toBe(text)
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0)
      expect(chunk.length).toBeLessThanOrEqual(limit)
      expect(chunk.isWellFormed()).toBe(true)
    }
  })

  it.each([0, 1, -1, 2.5, NaN, Infinity])('rejects unusable limits (%s)', limit => {
    expect(() => splitText('hello', limit)).toThrow(/integer of at least 2/)
  })
})
