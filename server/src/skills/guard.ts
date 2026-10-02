// Ported from hermes-agent tools/skills_guard.py @ 54bc5e50 (MIT, Nous Research)
// Ported from hermes-agent tools/skill_manager_tool.py @ 54bc5e50 (MIT, Nous Research)

import { extname } from 'node:path'
import { firstThreat } from '../memory/threats.ts'
import { parseSkill } from './lint.ts'

export type GuardFinding = { severity: 'block' | 'warn'; code: string; message: string }

const allowed = new Set(['references', 'templates', 'scripts', 'assets'])
const binaries = new Set(['.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.com', '.msi', '.dmg', '.app',
  '.deb', '.rpm', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.wasm', '.pyc'])
const credential = String.raw`(?:\.ssh[/\\]id_(?:rsa|ed25519|ecdsa|dsa)(?!\.pub)|\.env\b|credentials\b|\.netrc\b|\.pgpass\b|\.npmrc\b|\.pypirc\b|\.aws[/\\]credentials)`
const literal = String.raw`["'][^"'\n]*${credential}[^"'\n]*["']`
const shell = String.raw`(?:(?:/usr)?/bin/)?(?:bash|sh|zsh|ksh|dash|python(?:3)?|perl|ruby|node)\b`
const rules: Array<[RegExp, GuardFinding['severity'], string, string]> = [
  [new RegExp(String.raw`\b(?:curl|wget)\b[^\n]*\|\s*(?:(?:env|sudo)\s+)?${shell}`, 'i'), 'block', 'download-execute', 'Remote download piped to an interpreter.'],
  [new RegExp(String.raw`\b${shell}\s+[^\n]*<\(\s*(?:curl|wget)\b`, 'i'), 'block', 'download-execute', 'Interpreter executes a remote download.'],
  [new RegExp(String.raw`\b(?:readFile(?:Sync)?|readTextFile)\s*\(\s*${literal}`, 'i'), 'block', 'credential-harvesting', 'Reads a credential file.'],
  [new RegExp(String.raw`\bopen\s*\(\s*(?:os\.path\.expanduser\s*\(\s*)?${literal}\s*\)?(?!\s*,\s*["'][^"']*[wax])`, 'i'), 'block', 'credential-harvesting', 'Reads a credential file.'],
  [new RegExp(String.raw`\bPath\s*\(\s*${literal}\s*\)\.(?:read_text|read_bytes|readlines|readline)\s*\(`, 'i'), 'block', 'credential-harvesting', 'Reads a credential file.'],
  [/\b(?:cat|head|tail|less|more)\s+(?!>)[^\n]*(?:\.aws\/credentials|\.kube\/config|\.docker\/config\.json|\.ssh\/id_(?:rsa|ed25519|ecdsa|dsa)(?!\.pub))/i, 'block', 'credential-harvesting', 'Reads a private key or credential store.'],
  [/\b(?:read|collect|harvest|extract|gather)\b[^\n]{0,120}\b(?:credentials|passwords|private keys|api keys|access tokens)\b/i, 'block', 'credential-harvesting', 'Instructs collection of credentials.'],
  [/\b(?:fetch|(?:requests|httpx?)\.(?:get|post|put|patch))\s*\([^\n]{0,2048}(?:\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD)\b|(?:process\.env|os\.environ)[^\n]*(?:KEY|TOKEN|SECRET|PASSWORD))/i, 'block', 'exfiltration', 'HTTP request includes secret environment data.'],
  [/\b(?:requests|httpx?)\.(?:get|post|put|patch)\s*\([^\n]{0,2048}\b\w*(?:KEY|TOKEN|SECRET|PASSWORD)\b/i, 'block', 'exfiltration', 'HTTP request includes a secret-shaped variable.'],
  [/\b(?:send|post|upload|transmit|share)\b[^\n]{0,160}\b(?:credentials|passwords|secrets|private keys|api keys|chat history|conversation|context)\b[^\n]{0,160}\b(?:to|at|with)\b/i, 'block', 'exfiltration', 'Transfers credentials or conversation data.'],
  [/\b(?:dig|nslookup|host)\s+[^\n]{0,200}\$(?:\{[^}]+\}|\([^\n]+\)|\w+)[\w-]*\.[a-z]/i, 'block', 'dns-exfiltration', 'Interpolates data into a DNS query.'],
  [/!\[[^\]\n]*\]\(https?:\/\/[^)\n]*\$\{?/i, 'block', 'link-exfiltration', 'Markdown image URL interpolates data.'],
  [/\bprintenv\b|\benv\s*\||\b(?:JSON\.stringify|dict)\s*\(\s*(?:process\.env|os\.environ)/i, 'block', 'environment-dump', 'Dumps the environment, which may contain secrets.'],
  [/\bbase64\b[^\n]*\benv\b/i, 'block', 'environment-dump', 'Encodes environment data for transfer.'],
  [/\bENV\[\s*["'][^"'\n]*(?:KEY|TOKEN|SECRET|PASSWORD)/, 'block', 'credential-harvesting', 'Reads credentials through Ruby ENV.'],
  [/>\s*\/tmp\/[^\s]*\s*&&\s*(?:curl|wget|nc|python)/i, 'block', 'exfiltration-staging', 'Stages data in /tmp immediately before a transfer.'],
  [/-----BEGIN\s+(?:(?:RSA|EC|OPENSSH)\s+)?PRIVATE\s+KEY-----/, 'block', 'embedded-credential', 'Contains a private key.'],
  [/\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{20,})\b/, 'block', 'embedded-credential', 'Contains a possible access token.'],
  [/\bDAN\s+mode\b|Do\s+Anything\s+Now|\bdeveloper\s+mode\b[^\n]*\benabled?\b/i, 'block', 'jailbreak', 'Attempts to enable an unrestricted mode.'],
  [new RegExp(String.raw`\b(?:echo|printf)\b[^\n]*\|\s*${shell}|\bbase64\s+(?:-d|--decode)\s*\|\s*${shell}`, 'i'), 'block', 'obfuscated-execution', 'Encoded or generated text piped to an interpreter.'],
  [/\brm\s+-[a-z]*r[a-z]*\s+(?:\/(?!tmp(?:\/|\s|$)|var\/tmp(?:\/|\s|$))|\$HOME\b|~(?:\/|\s|$))/i, 'block', 'destructive-command', 'Recursive deletion targets root or home files.'],
  [/\brm\s+-[a-z]*r[a-z]*\s+\/(?:var\/)?tmp\/(?:[^/\s]+\/)*\.\.(?:\/|\s|$)/i, 'block', 'destructive-command', 'Temporary cleanup escapes its directory.'],
  [/\bmkfs(?:\.[a-z0-9]+)?\b|\bdd\s+[^\n]*of=\/dev\/|>\s*\/etc\//i, 'block', 'destructive-command', 'Formats a disk or overwrites system files.'],
  [/\btruncate\s+-s\s*0\s+\/|\bshutil\.rmtree\s*\(\s*["']\//i, 'block', 'destructive-command', 'Truncates or recursively deletes an absolute path.'],
  [/\b(?:setuid|setgid|cap_setuid|NOPASSWD)\b|\bchmod\s+(?:[ug]\+s|[2467][0-7]{3})\b/i, 'block', 'privilege-escalation', 'Installs a privilege escalation mechanism.'],
  [/\/etc\/sudoers|\bvisudo\b/i, 'block', 'privilege-escalation', 'Targets sudoers configuration.'],
  [/\/etc\/(?:passwd|shadow)\b/i, 'block', 'system-credentials', 'References system password files.'],
  [/\bnc\s+-[lp]|\bncat\s+-[lp]|\bsocat\b[^\n]*\b(?:tcp|udp|openssl|ssl|exec|system|pty|unix)[\w-]*:|\/bin\/(?:bash|sh|zsh|ksh|dash)\s+-i\s+[^\n]*>\s*&?\s*\/dev\/tcp\/|\bpython[23]?\s+-c\s+["']import\s+socket/i, 'block', 'reverse-shell', 'Opens a potential reverse shell or listener.'],
  [/(?:>>|[\w"'`)\]]\s*>)\s*[~\w./-]*(?:AGENTS\.md|CLAUDE\.md|\.claude\/settings[\w.]*|\.codex\/config[\w.]*)\b|\b(?:tee\s+(?:-a\s+)?|sed\s+-i\b[^\n]*)(?:[~\w./-]*)(?:AGENTS\.md|CLAUDE\.md|\.claude\/settings[\w.]*|\.codex\/config[\w.]*)\b/i, 'block', 'config-persistence', 'Shell write targets agent configuration.'],
  [/\b(?:cp|mv)\s+[^\s|;&]+\s+[^\n|;&]{0,40}?(?:AGENTS\.md|CLAUDE\.md|\.claude\/settings[\w.]*|\.codex\/config[\w.]*)(?!\.?\w)/i, 'block', 'config-persistence', 'Copy or move targets agent configuration.'],
  [/\b(?:xmrig|stratum\+tcp|coinhive|cryptonight)\b/i, 'block', 'crypto-mining', 'Contains cryptocurrency mining instructions.'],
  [/!`[^`\s][^`\n]*`/, 'warn', 'inline-shell', 'Inline shell snippet executes during skill loading.'],
  [/\b(?:eval|exec)\s*\(\s*["']/i, 'warn', 'dynamic-execution', 'Executes a string as code; review its source.'],
  [/\b(?:subprocess\.(?:run|call|Popen|check_output)|os\.(?:system|popen)|child_process\.(?:exec|spawn|fork))\s*\(/i, 'warn', 'process-execution', 'Starts a process; review its arguments.'],
  [/\bchmod\s+777\b/i, 'warn', 'insecure-permissions', 'Sets world-writable permissions.'],
  [/\bsudo\b(?!\.(?:request|respond)\b)|\bcrontab\b/i, 'warn', 'privileged-operation', 'Uses elevated privileges or persistent scheduling.'],
  [/\b(?:pip|npm)\s+install\s+(?!-r\s)(?![^\n]*(?:==|@\d))[^\n]+/i, 'warn', 'unpinned-dependency', 'Installs a dependency without a pinned version.'],
  [/\b(?:curl|wget)\s+[^\n]*https?:\/\/|\b(?:fetch|(?:requests|httpx?)\.get)\s*\(\s*["']https?:\/\/|\b(?:git\s+clone|docker\s+pull)\s+/i, 'warn', 'remote-fetch', 'Fetches a remote resource; verify its source.'],
  [/\b(?:ngrok|localtunnel|serveo|cloudflared)\b|0\.0\.0\.0:\d+|\bINADDR_ANY\b|\bsocket\.connect\s*\(\s*\(/i, 'warn', 'network-exposure', 'Opens a tunnel, external listener or socket connection.'],
  [/\b(?:webhook\.site|requestbin\.com|pipedream\.net|hookbin\.com|pastebin\.com|hastebin\.com|ghostbin\.)/i, 'warn', 'data-staging-service', 'References a service that can stage or collect data.'],
  [/\.(?:bashrc|zshrc|bash_profile|bash_login|zprofile|zlogin)\b|(?<![\w)\]?])\.profile\b|\bssh-keygen\b|\bsystemctl\s+(?:enable|start)\b|\/etc\/init\.d\/|\blaunchctl\s+load\b|\bLaunch(?:Agents|Daemons)\b|\bgit\s+config\s+--global\s+/i, 'warn', 'persistent-configuration', 'Touches persistent user or system configuration.'],
  [/\batob\s*\(|\bbtoa\s*\(|\bString\.fromCharCode\b|\bcodecs\.decode\s*\(|(?:\\x[0-9a-f]{2})[^\n]*(?:\\x[0-9a-f]{2})[^\n]*(?:\\x[0-9a-f]{2})/i, 'warn', 'obfuscation', 'Decodes or constructs encoded text; inspect the resulting content.'],
  [/\b(?:os\.(?:getenv|environ\.get))\s*\(\s*["'][^"'\n]*(?:KEY|TOKEN|SECRET|PASSWORD)|\bprocess\.env(?:\.[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)\b|\[)/i, 'warn', 'secret-environment-access', 'Accesses environment credentials; keep them local.'],
]

export function scanSkill(files: Array<{ path: string; content: string }>): GuardFinding[] {
  const findings: GuardFinding[] = []
  const seen = new Set<string>()
  let totalBytes = 0
  for (const { path, content } of files) {
    const add = (severity: GuardFinding['severity'], code: string, message: string) => {
      if (!findings.some(finding => finding.code === code && finding.message === `${path}: ${message}`)) {
        findings.push({ severity, code, message: `${path}: ${message}` })
      }
    }
    const parts = path.split('/')
    if (/^[\\/~]|^[A-Za-z]:|[\\:%\x00-\x1f\x7f]/.test(path) || parts.some(part => part === '..' || part === '.' || !part)) {
      add('block', 'path-traversal', 'Use a canonical relative path without traversal, drive names or encoded separators.')
    } else if (path !== 'SKILL.md' && (parts.length < 2 || !allowed.has(parts[0]))) {
      add('block', 'supporting-path', 'Supporting files must be under references/, templates/, scripts/ or assets/.')
    }
    if (seen.has(path)) add('block', 'duplicate-path', 'File path is duplicated.')
    for (const other of seen) {
      if (path.startsWith(`${other}/`) || other.startsWith(`${path}/`)) add('block', 'path-conflict', 'A file path is also used as a directory.')
    }
    seen.add(path)
    const bytes = Buffer.byteLength(content, 'utf8')
    totalBytes += bytes
    if (path !== 'SKILL.md' && (bytes > 1_048_576 || Array.from(content).length > 100_000)) {
      add('block', 'file-size-limit', 'Supporting file exceeds 100,000 characters or 1 MiB.')
    }
    if (bytes > 256 * 1024) add('warn', 'oversized-file', 'File exceeds the 256 KiB advisory budget.')
    let text = content.replace(/^\ufeff/, '')
    // Scan decoded frontmatter too: YAML escapes must not conceal instructions.
    if (path === 'SKILL.md') {
      const doc = parseSkill(content).doc
      if (doc) text += `\n${Object.values(doc.frontmatter).join('\n')}`
    }
    if (binaries.has(extname(path).toLowerCase()) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) || !text.isWellFormed()) {
      add('block', 'binary-file', 'Binary files and non-text payloads are not allowed.')
    }
    text = text.replace(/\r\n?/g, '\n')
    // firstThreat intentionally caps memory scans. Overlap covers long skill files and
    // matches crossing chunk boundaries (its longest bounded pattern is < 4K chars).
    for (let offset = 0; offset < text.length; offset += 32_768) {
      const threat = firstThreat(text.slice(offset, offset + 65_536))
      if (threat) add('block', threat.match(/pattern '([^']+)'/)?.[1] ?? 'invisible-unicode', threat)
    }
    const normalized = text.normalize('NFKC').replace(/\\\n/g, '')
    for (const [pattern, severity, code, message] of rules) {
      if (pattern.test(normalized)) add(severity, code, message)
    }
  }
  if (files.length > 50) findings.push({ severity: 'warn', code: 'too-many-files', message: 'Skill exceeds the 50-file advisory budget.' })
  if (totalBytes > 5 * 1024 * 1024) findings.push({ severity: 'warn', code: 'oversized-skill', message: 'Skill exceeds the 5 MiB advisory budget.' })
  return findings
}
