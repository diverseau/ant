// Ported from hermes-agent tools/approval_detection.py @ 54bc5e50 (MIT, Nous Research)
// Ported from hermes-agent tools/approval_smart.py @ 54bc5e50 (MIT, Nous Research)

export function stripShellComments(cmd: string): string {
  let result = ''
  let quote = ''
  const heredocs: { delimiter: string; tabs: boolean }[] = []
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (ch === '\\' && quote !== "'") {
      result += ch + (cmd[++i] ?? '')
      continue
    }
    if (!quote && cmd.startsWith('<<', i) && cmd[i + 2] !== '<') {
      const match = /^<<(-)?\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))/.exec(cmd.slice(i))
      if (match) heredocs.push({ delimiter: match[2] ?? match[3] ?? match[4], tabs: !!match[1] })
    }
    if (ch === quote) quote = ''
    else if (!quote && (ch === "'" || ch === '"')) quote = ch
    else if (!quote && ch === '#' && (i === 0 || /[\s;&|()<>]/.test(cmd[i - 1]))) {
      result = result.trimEnd()
      while (i < cmd.length && cmd[i] !== '\n') i++
      if (i === cmd.length) break
    }
    result += cmd[i]
    if (cmd[i] === '\n' && !quote && heredocs.length) {
      for (const doc of heredocs.splice(0)) {
        while (++i < cmd.length) {
          const end = cmd.indexOf('\n', i)
          const next = end < 0 ? cmd.length : end
          const line = cmd.slice(i, next)
          result += line + (end < 0 ? '' : '\n')
          i = next
          if ((doc.tabs ? line.replace(/^\t+/, '') : line) === doc.delimiter) break
        }
      }
    }
  }
  return result.trimEnd()
}

// NFKC covers fullwidth forms; these additional lookalikes cover common Cyrillic/Greek splices.
const confusables: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X',
  Ι: 'I', Ο: 'O', ο: 'o', ϲ: 'c', ѕ: 's', '−': '-', '–': '-', '—': '-', '⁄': '/', '∕': '/',
}

export function prepareShellText(cmd: string): string {
  return cmd.replace(/(?:\x1b\]|\x9d)[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00\u200b-\u200d\ufeff]/g, '')
    .normalize('NFKC').replace(/./gu, ch => confusables[ch] ?? ch)
    .replace(/\\\r?\n/g, '')
}

export interface ShellToken { value: string; raw: string; operator: boolean; heredoc?: string }
export interface ShellScan { tokens: ShellToken[]; substitutions: string[]; malformed: boolean }

function substitutionEnd(text: string, start: number): number {
  let depth = 1
  let quote = ''
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && quote !== "'") { i++; continue }
    if (ch === quote) { quote = ''; continue }
    if (!quote && (ch === "'" || ch === '"')) { quote = ch; continue }
    if (!quote && ch === '(') depth++
    if (!quote && ch === ')' && --depth === 0) return i
  }
  return -1
}

function literalOutput(script: string, depth: number): string | undefined {
  const { tokens, malformed } = scanShell(script, depth + 1)
  if (malformed || tokens.some(t => t.operator)) return
  const [name, ...args] = tokens.map(t => t.value)
  if (name === 'echo') {
    while (/^-[nEe]+$/.test(args[0] ?? '')) args.shift()
    if (args.length === 1 && /^[\w./-]+$/.test(args[0])) return args[0]
  }
  if (name === 'printf') {
    const value = args.length === 1 ? args[0] : args.length === 2 && args[0] === '%s' ? args[1] : ''
    if (/^[\w./-]+$/.test(value)) return value
  }
}

// A bounded lexer, not a shell evaluator. Quoted arguments remain single tokens, so prose
// cannot turn into executable commands. Substitutions are returned separately for inspection.
export function scanShell(input: string, depth = 0): ShellScan {
  const text = stripShellComments(prepareShellText(input))
  const tokens: ShellToken[] = []
  const substitutions: string[] = []
  let value = '', raw = '', quote = '', active = false
  let malformed = depth > 12
  if (malformed) return { tokens, substitutions, malformed }
  const flush = () => {
    if (active) tokens.push({ value, raw, operator: false })
    value = ''; raw = ''; active = false
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && quote !== "'") {
      active = true
      const next = text[++i] ?? ''
      raw += ch + next
      // In double quotes a backslash only escapes shell-special characters.
      value += quote === '"' && !/[\\$`"]/.test(next) ? ch + next : next
      continue
    }
    if (quote !== "'" && (text.startsWith('$(', i) || text.startsWith('<(', i) || text.startsWith('>(', i) || ch === '`')) {
      const backtick = ch === '`'
      const start = i + (backtick ? 1 : 2)
      const end = backtick ? text.indexOf('`', start) : substitutionEnd(text, start)
      if (end < 0) { malformed = true; raw += text.slice(i); value += text.slice(i); active = true; break }
      const script = text.slice(start, end)
      const replacement = depth < 12 ? literalOutput(script, depth) : undefined
      if (replacement === undefined) substitutions.push(script)
      raw += text.slice(i, end + 1)
      value += replacement ?? text.slice(i, end + 1)
      active = true; i = end; continue
    }
    if (ch === quote) { raw += ch; quote = ''; continue }
    if (!quote && (ch === "'" || ch === '"')) {
      active = true; raw += ch; quote = ch
      // ANSI-C quoting is used to splice hex/octal escapes into command names.
      if (ch === "'" && value.endsWith('$')) {
        value = value.slice(0, -1)
        const end = text.indexOf("'", i + 1)
        if (end >= 0) {
          const body = text.slice(i + 1, end)
          value += body.replace(/\\(?:x([\da-f]{1,2})|u([\da-f]{4})|([0-7]{1,3})|([nrt\\']))/gi,
            (_, hex: string, unicode: string, octal: string, simple: string) =>
              hex || unicode || octal ? String.fromCodePoint(parseInt(hex || unicode || octal, octal ? 8 : 16))
                : ({ n: '\n', r: '\r', t: '\t' }[simple] ?? simple))
          raw += body + "'"; quote = ''; i = end
        }
      }
      continue
    }
    if (!quote && ch === '$') {
      const ifs = /^(?:\$\{IFS\b[^}]*\}|\$IFS\b)/.exec(text.slice(i))
      if (ifs) { flush(); i += ifs[0].length - 1; continue }
      const parameter = /^\$\{[A-Za-z_]\w*(?::[-+]|[-+])([\w./-]+)\}/.exec(text.slice(i))
      if (parameter) { active = true; raw += parameter[0]; value += parameter[1]; i += parameter[0].length - 1; continue }
    }
    if (!quote && /\s/.test(ch)) {
      flush()
      if (ch === '\n') {
        // Heredoc bodies are data unless passed to a shell. Do not lex their contents here.
        const lineStart = tokens.findLastIndex(t => t.operator && t.value === '\n') + 1
        for (let j = lineStart; j < tokens.length - 1; j++) {
          if (!['<<', '<<-'].includes(tokens[j].value) || !tokens[j].operator) continue
          const delimiter = tokens[j + 1]
          const body: string[] = []
          while (i + 1 < text.length) {
            const start = i + 1, end = text.indexOf('\n', start)
            const next = end < 0 ? text.length : end
            const line = text.slice(start, next)
            i = next
            if ((tokens[j].value === '<<-' ? line.replace(/^\t+/, '') : line) === delimiter.value) break
            body.push(line)
            if (end < 0) { malformed = true; break }
          }
          delimiter.heredoc = body.join('\n')
          if (!/['"\\]/.test(delimiter.raw)) substitutions.push(...scanShell(delimiter.heredoc, depth + 1).substitutions)
        }
        tokens.push({ value: '\n', raw: '\n', operator: true })
      }
      continue
    }
    if (!quote && /[;&|<>(){}]/.test(ch) && !(ch === '{' && text[i - 1] === '$')) {
      // Braces embedded in a word are expansions, not command separators.
      if (/[{}]/.test(ch) && (active || !/\s|$/.test(text[i + 1] ?? ''))) {
        active = true; raw += ch; value += ch; continue
      }
      flush()
      const op = /^(?:&&|\|\||\|&|>>|<<-|<<<|<<|<>|>&|<&|[;&|<>(){}])/.exec(text.slice(i))![0]
      tokens.push({ value: op, raw: op, operator: true }); i += op.length - 1
      continue
    }
    active = true; value += ch; raw += ch
  }
  flush()
  return { tokens, substitutions, malformed: malformed || !!quote }
}

export function normalizeCommand(cmd: string): string {
  return scanShell(cmd).tokens.map(t => t.value).join(' ').replace(/\s+/g, ' ').trim()
}

export function delimitUntrusted(label: string, text: string): string {
  if (!/^[A-Za-z_][\w.-]*$/.test(label)) throw new Error('Invalid untrusted-text label')
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<${label}>\n${escaped}\n</${label}>`
}
