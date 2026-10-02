// Ported from hermes-agent tools/approval_floors.py @ 54bc5e50 (MIT, Nous Research)
import { posix } from 'node:path'
import { executableTokens, inspectCommand, shellCommands } from './dangerous.ts'
import type { DangerMatch } from './dangerous.ts'
import { normalizeCommand, scanShell, stripShellComments } from './sanitize.ts'

export type FloorVerdict = { action: 'block'; matches: DangerMatch[]; message: string }
  | { action: 'ask'; matches: DangerMatch[] } | { action: 'pass' }

// fnmatch-style command globs, including bracket classes. A small dynamic-programming
// matcher avoids regex backtracking on user-supplied patterns such as *a*a*a*a*b.
function globMatches(pattern: string, candidate: string): boolean {
  const atoms: (string | Set<string>)[] = []
  const negated = new Set<number>()
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '[') {
      const start = i + 1, end = pattern.indexOf(']', start + (pattern[start] === '!' ? 1 : 0))
      if (end >= 0) {
        const chars = new Set<string>()
        let j = start
        if (pattern[j] === '!') { negated.add(atoms.length); j++ }
        while (j < end) {
          if (pattern[j + 1] === '-' && j + 2 < end) {
            for (let c = pattern.charCodeAt(j); c <= pattern.charCodeAt(j + 2); c++) chars.add(String.fromCharCode(c))
            j += 3
          } else chars.add(pattern[j++])
        }
        atoms.push(chars); i = end; continue
      }
    }
    if (pattern[i] !== '*' || atoms.at(-1) !== '*') atoms.push(pattern[i])
  }
  let reachable = new Set([0])
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i], next = new Set<number>()
    if (atom === '*') {
      let first = candidate.length + 1
      for (const j of reachable) first = Math.min(first, j)
      for (let j = first; j <= candidate.length; j++) next.add(j)
    } else for (const j of reachable) {
      if (j < candidate.length && (atom === '?' || typeof atom === 'string' && atom === candidate[j] ||
        atom instanceof Set && atom.has(candidate[j]) !== negated.has(i))) next.add(j + 1)
    }
    reachable = next
    if (!reachable.size) return false
  }
  return reachable.has(candidate.length)
}

function denyCandidates(cmd: string, depth = 0): string[] {
  if (depth > 12 || cmd.length > 100_000) return [cmd]
  const candidates = [stripShellComments(cmd).trim(), normalizeCommand(cmd)]
  const scan = scanShell(cmd)
  for (const substitution of scan.substitutions) candidates.push(...denyCandidates(substitution, depth + 1))
  for (const segment of shellCommands(scan.tokens)) {
    for (const wrapper of ['sudo', 'env', 'exec', 'command', 'nohup', 'nice', 'timeout']) {
      const projected = executableTokens(segment.words, wrapper)
      if (projected.length && posix.basename(projected[0].value).toLowerCase() === wrapper)
        candidates.push([wrapper, ...projected.slice(1).map(t => t.value)].join(' '))
    }
    const words = executableTokens(segment.words)
    if (!words.length) continue
    candidates.push(words.map(t => t.raw).join(' '), words.map(t => t.value).join(' '))
    const name = posix.basename(words[0].value).toLowerCase()
    candidates.push([name, ...words.slice(1).map(t => t.value)].join(' '))
    if (['sh', 'bash', 'zsh', 'ksh', 'dash', 'fish'].includes(name)) {
      const i = words.findIndex(t => /^-[^-]*c/.test(t.value) || /^--command(?:=|$)/.test(t.value))
      const payload = i < 0 ? undefined : words[i].value.startsWith('--command=') ? words[i].value.slice(10) : words[i + 1]?.value
      if (payload) candidates.push(...denyCandidates(payload, depth + 1))
      for (const redir of segment.redirects) if (redir.target.heredoc !== undefined) candidates.push(...denyCandidates(redir.target.heredoc, depth + 1))
    }
    if (name === 'eval') candidates.push(...denyCandidates(words.slice(1).map(t => t.value).join(' '), depth + 1))
    if (name === 'env') {
      const i = words.findIndex(t => /^(?:-S|--split-string)(?:=|$)/.test(t.value))
      if (i >= 0) {
        const inline = words[i].value.includes('=')
        const payload = inline ? words[i].value.split('=').slice(1).join('=') : words[i + 1]?.value
        if (payload) candidates.push(...denyCandidates(payload + ' ' + words.slice(i + (inline ? 1 : 2)).map(t => t.raw).join(' '), depth + 1))
      }
    }
  }
  return candidates
}

export function evaluateFloors(cmd: string, ctx?: { cwd?: string; home?: string; userDenyGlobs?: string[] }): FloorVerdict {
  const findings = inspectCommand(cmd, ctx)
  const matches = findings.filter(f => f.match.severity !== 'medium' || f.outside).map(f => f.match)
  const globs = ctx?.userDenyGlobs?.map(p => p.trim()).filter(Boolean) ?? []
  if (globs.length) {
    const candidates = denyCandidates(cmd).map(c => c.toLowerCase().trim())
    for (const glob of globs) if (candidates.some(c => globMatches(glob.toLowerCase(), c))) {
      matches.push({ id: 'user.deny', severity: 'hardline', title: 'User deny rule', explanation: `Matches user deny rule ${glob}.`, fragment: cmd })
      break
    }
  }
  const hardline = matches.filter(m => m.severity === 'hardline')
  if (hardline.length) return { action: 'block', matches, message: `Blocked by command floors: ${hardline.map(m => m.title).join('; ')}. This command cannot run through Ant.` }
  return matches.length ? { action: 'ask', matches } : { action: 'pass' }
}
