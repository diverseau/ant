// Ported from hermes-agent tools/approval_detection.py @ 54bc5e50 (MIT, Nous Research)
import { posix } from 'node:path'
import { prepareShellText, scanShell } from './sanitize.ts'
import type { ShellToken } from './sanitize.ts'

export type Severity = 'hardline' | 'high' | 'medium'
export interface DangerMatch { id: string; severity: Severity; title: string; explanation: string; fragment: string }
type Context = { cwd?: string; home?: string }
export interface CommandFinding { match: DangerMatch; outside: boolean }
const shells = new Set(['sh', 'bash', 'zsh', 'ksh', 'dash', 'fish'])
const systemRoots = new Set(['/home', '/root', '/etc', '/usr', '/var', '/bin', '/sbin', '/boot', '/lib', '/lib64'])
const blockDevice = /^\/dev\/(?:sd[a-z]\d*|hd[a-z]\d*|(?:x?v)d[a-z]\d*|nvme\d+n\d+(?:p\d+)?|mmcblk\d+(?:p\d+)?|loop\d+|mapper\/[^/]+|disk\/by-[^/]+\/[^/]+)$/i
const assignment = /^[A-Za-z_]\w*=/
const basename = (word: string) => posix.basename(word).toLowerCase()

function resolveTarget(target: string, cwd?: string, home?: string): string {
  let path = target.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home ?? '~')
  if (!path.startsWith('/') && !path.startsWith('~') && !path.startsWith('$') && cwd) path = posix.join(cwd, path)
  return posix.normalize(path)
}

function outside(target: string, cwd?: string, home?: string): boolean {
  const path = resolveTarget(target, cwd, home)
  if (/[\$`]/.test(path) || path.startsWith('~')) return true
  // Relative targets without a context are workspace-relative; absolute targets need proof.
  if (!cwd) return path.startsWith('/') || path === '..' || path.startsWith('../')
  const root = posix.normalize(cwd).replace(/\/$/, '') || '/'
  return path !== root && !path.startsWith(root === '/' ? '/' : root + '/')
}

function sensitiveTarget(target: string, cwd?: string, home?: string): string | undefined {
  const path = resolveTarget(target, cwd, home)
  if (/^\/(?:private\/)?etc(?:\/|$)/.test(path)) return 'fs.write_system'
  if (blockDevice.test(path)) return 'fs.write_device'
  const userPath = home && (path === home || path.startsWith(home.replace(/\/$/, '') + '/'))
    ? '~' + path.slice(home.replace(/\/$/, '').length) : path
  if (/^(?:~|\/home\/[^/]+|\/Users\/[^/]+|\/root)\/\.ssh(?:\/|$)/.test(userPath)) return 'fs.write_ssh'
  if (/^(?:~|\/home\/[^/]+|\/Users\/[^/]+|\/root)\/(?:\.(?:bashrc|zshrc|profile|bash_profile|bash_login|zprofile|zlogin|zshenv)|\.config\/(?:fish\/config\.fish|(?:bash|zsh)\/[^/]+))$/.test(userPath)) return 'fs.write_startup'
  if (/^(?:~|\/home\/[^/]+|\/Users\/[^/]+|\/root)\/\.(?:netrc|pgpass|npmrc|pypirc)$/.test(userPath)) return 'fs.write_credentials'
}

function operands(args: string[], valueOptions: string[] = []): string[] {
  const result: string[] = []
  let literal = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!literal && arg === '--') { literal = true; continue }
    if (!literal && valueOptions.includes(arg)) { i++; continue }
    if (!literal && arg.startsWith('-') && arg !== '-') continue
    result.push(arg)
  }
  return result
}

function flags(args: string[], letter: string, long: string): boolean {
  const end = args.indexOf('--')
  return (end < 0 ? args : args.slice(0, end)).some(a => a === long || a.startsWith(long + '=') ||
    /^-[^-]/.test(a) && a.slice(1).includes(letter))
}

// Project wrapper commands to the actual executable, retaining the original tokens for deny globs.
export function executableTokens(tokens: ShellToken[], stopAt?: string): ShellToken[] {
  let i = 0
  while (i < tokens.length) {
    if (assignment.test(tokens[i].value)) { i++; continue }
    const name = basename(tokens[i].value)
    if (name === stopAt) break
    if (name === 'command' && tokens.slice(i + 1).some(t => /^-[p]*[vV]/.test(t.value))) return []
    if (!['sudo', 'env', 'command', 'builtin', 'exec', 'nohup', 'setsid', 'time', 'nice', 'timeout', 'stdbuf'].includes(name)) break
    const wrapperStart = i++
    const withValue = name === 'sudo' ? ['-u', '-g', '-h', '-p', '-C', '-T', '--user', '--group', '--prompt']
      : name === 'env' ? ['-u', '-C', '-a', '--unset', '--chdir', '--argv0']
        : name === 'exec' ? ['-a'] : name === 'nice' ? ['-n', '--adjustment']
          : name === 'timeout' ? ['-k', '--kill-after', '-s', '--signal'] : name === 'stdbuf' ? ['-i', '-o', '-e', '--input', '--output', '--error'] : []
    while (i < tokens.length && (tokens[i].value.startsWith('-') || assignment.test(tokens[i].value))) {
      if (name === 'env' && /^(?:-S|--split-string)(?:=|$)/.test(tokens[i].value)) break
      const option = tokens[i++].value
      if (withValue.includes(option)) i++
      if (option === '--') break
    }
    if (name === 'timeout') i++
    if (name === 'env' && /^(?:-S|--split-string)(?:=|$)/.test(tokens[i]?.value ?? '')) return tokens.slice(wrapperStart)
  }
  return tokens.slice(i)
}

export interface ShellCommand { words: ShellToken[]; redirects: { op: string; target: ShellToken }[]; separator: string }
export function shellCommands(tokens: ShellToken[]): ShellCommand[] {
  const commands: ShellCommand[] = []
  let words: ShellToken[] = [], redirects: ShellCommand['redirects'] = []
  const flush = (separator: string) => {
    if (words.length || redirects.length || separator === '(' || separator === ')') commands.push({ words, redirects, separator })
    words = []; redirects = []
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token.operator) { words.push(token); continue }
    if (/^[<>]/.test(token.value) && tokens[i + 1] && !tokens[i + 1].operator) {
      if (/^\d+$/.test(words.at(-1)?.value ?? '')) words.pop()
      redirects.push({ op: token.value, target: tokens[++i] })
    } else flush(token.value)
  }
  flush('')
  return commands
}

export function inspectCommand(cmd: string, ctx: Context = {}): CommandFinding[] {
  const findings: CommandFinding[] = []
  const seen = new Set<string>()
  const isOutside = (target: string, cwd?: string) => outside(resolveTarget(target, cwd, ctx.home), ctx.cwd, ctx.home)
  const add = (id: string, severity: Severity, title: string, explanation: string, fragment: string, external = true) => {
    const key = `${id}\0${severity}\0${fragment}\0${external}`
    if (!seen.has(key)) { seen.add(key); findings.push({ match: { id, severity, title, explanation, fragment }, outside: external }) }
  }
  const write = (target: string, fragment: string, cwd?: string) => {
    const id = sensitiveTarget(target, cwd, ctx.home)
    if (id) add(id, 'hardline', 'Protected write target', `Writes to protected target ${target}.`, fragment)
    else add('fs.write', 'medium', 'File write', `Writes to ${target}.`, fragment, isOutside(target, cwd))
  }
  const walk = (text: string, cwd: string | undefined, depth: number) => {
    if (depth > 12 || text.length > 100_000) {
      add('shell.analysis_limit', 'high', 'Command analysis limit', 'The inline command exceeds bounded static analysis.', text.slice(0, 200)); return
    }
    const scan = scanShell(text)
    if (scan.malformed) add('shell.unparsed', 'high', 'Unparsed shell syntax', 'Unclosed shell quoting or substitution needs review.', text.slice(0, 200))
    for (const substitution of scan.substitutions) walk(substitution, cwd, depth + 1)
    let remote = false, decoded = false, inPipeline = false
    const subshellCwds: (string | undefined)[] = []
    for (const segment of shellCommands(scan.tokens)) {
      const startsPipeline = segment.separator === '|' || segment.separator === '|&'
      const parentCwd = cwd
      let wrapperCwd = false
      const envWords = executableTokens(segment.words, 'env')
      if (basename(envWords[0]?.value ?? '') === 'env') {
        for (let i = 1; i < envWords.length && (envWords[i].value.startsWith('-') || assignment.test(envWords[i].value)); i++) {
          const option = envWords[i].value
          if (option === '-C' || option === '--chdir') {
            const target = envWords[++i]?.value
            cwd = target ? resolveTarget(target, cwd, ctx.home) : '$UNKNOWN'
            wrapperCwd = true
          } else if (option.startsWith('--chdir=')) {
            cwd = resolveTarget(option.slice(8), cwd, ctx.home); wrapperCwd = true
          } else if (['-u', '-a', '-S', '--unset', '--argv0', '--split-string'].includes(option)) i++
        }
      }
      const fragment = segment.words.map(w => w.raw).join(' ') + segment.redirects.map(r => ` ${r.op} ${r.target.raw}`).join('')
      for (const redir of segment.redirects) {
        if (/^(?:>|>>|<>|>&)$/.test(redir.op) && !/^\d+$/.test(redir.target.value)) write(redir.target.value, fragment, cwd)
      }
      let rawWords = segment.words
      while (['then', 'do', 'if', 'elif', 'while', 'until', '!'].includes(rawWords[0]?.value)) rawWords = rawWords.slice(1)
      // Inspect sudo's own flags before removing wrappers. -S is case-sensitive: -s is a shell.
      for (let i = 0; i < rawWords.length; i++) {
        if (basename(rawWords[i].value) !== 'sudo') continue
        if (executableTokens(rawWords, 'sudo')[0] !== rawWords[i]) continue
        const args = rawWords.slice(i + 1).map(w => w.value)
        const opts: string[] = []
        for (let j = 0; j < args.length && args[j].startsWith('-'); j++) {
          opts.push(args[j])
          if (['-u', '-g', '-h', '-p', '--user', '--group', '--prompt'].includes(args[j])) j++
          if (args[j] === '--') break
        }
        if (flags(opts, 'S', '--stdin') || opts.some(a => /^--st(?:d(?:i(?:n)?)?)?$/.test(a))) {
          add('privilege.sudo_stdin', 'hardline', 'Sudo password through stdin', 'Explicit sudo stdin password input is forbidden.', fragment)
        } else add('privilege.sudo', 'high', 'Elevated privileges', 'Runs a command with elevated privileges.', fragment)
      }
      let words = executableTokens(rawWords)
      while (['then', 'do', 'if', 'elif', 'while', 'until', '!'].includes(words[0]?.value)) words = executableTokens(words.slice(1))
      const name = basename(words[0]?.value ?? '')
      const args = words.slice(1).map(w => w.value)
      if (name === 'env' && args.some(a => /^(-S|--split-string)(=|$)/.test(a))) {
        const i = args.findIndex(a => /^(-S|--split-string)(=|$)/.test(a))
        const payload = args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : args[i + 1]
        if (payload) walk(payload + ' ' + args.slice(i + (args[i].includes('=') ? 1 : 2)).join(' '), cwd, depth + 1)
      }
      if (name === 'cd' && !inPipeline && !startsPipeline && segment.separator !== '&') {
        const target = operands(args)[0] ?? ctx.home ?? '~'
        cwd = target === '-' ? '$UNKNOWN' : resolveTarget(target, cwd, ctx.home)
      }
      if (shells.has(name)) {
        const i = args.findIndex(a => /^-[^-]*c/.test(a) || a === '--command' || a.startsWith('--command='))
        if (i >= 0) {
          const payload = args[i].startsWith('--command=') ? args[i].slice(10) : args[i + 1]
          if (payload) walk(payload, cwd, depth + 1)
        }
        for (const redir of segment.redirects) if (redir.target.heredoc !== undefined) walk(redir.target.heredoc, cwd, depth + 1)
      }
      if (name === 'eval') walk(args.join(' '), cwd, depth + 1)
      const fetch = ['curl', 'wget'].includes(name)
      if (fetch && args.some(a => /(?:^|\/)169\.254\.169\.254\b|100\.100\.100\.200|metadata\.google\.internal|fd00:ec2::254/.test(a)))
        add('net.cloud_metadata', 'high', 'Cloud instance credentials', 'Accesses a cloud instance metadata endpoint.', fragment)
      if (fetch) remote = true
      if (['base64', 'base32', 'base16', 'xxd', 'openssl', 'tr'].includes(name) &&
        (name === 'tr' || flags(args, 'd', '--decode') || name === 'xxd' && flags(args, 'r', '--reverse'))) decoded = true
      const embeddedRemote = [...args, ...segment.redirects.map(r => r.target.value)]
        .some(a => /(?:\$\(|`|[<>]\()\s*(?:\S*\/)?(?:curl|wget)\b/.test(a))
      if ((shells.has(name) || ['eval', 'source', '.'].includes(name)) && (remote || embeddedRemote))
        add('net.pipe_to_shell', 'hardline', 'Remote content executed by a shell', 'Executes downloaded content without review.', fragment)
      if (shells.has(name) && decoded)
        add('shell.decode_execute', 'high', 'Decoded content executed', 'A decoding pipeline hides the shell payload.', fragment)
      if (name === 'rm') {
        for (const target of operands(args)) {
          const path = resolveTarget(target.replace(/\/\*+$/, '') || '/', cwd, ctx.home)
          const home = /^(?:~|\$HOME|\$\{HOME\})\/?(?:\*)?$/.test(target) || !!ctx.home && path === posix.normalize(ctx.home)
          if (path === '/' || /^\/\*+$/.test(path)) add('fs.rm_root', 'hardline', 'Root filesystem deletion', 'Deletes the root filesystem or its contents.', fragment)
          else if (home) add('fs.rm_home', 'hardline', 'Home directory deletion', 'Deletes the entire home directory.', fragment)
          else if (systemRoots.has(path)) add('fs.rm_system', 'hardline', 'System directory deletion', `Deletes protected system directory ${path}.`, fragment)
          else if (sensitiveTarget(target, cwd, ctx.home)) write(target, fragment, cwd)
          else add('fs.delete', 'medium', 'File deletion', `Deletes ${target}.`, fragment, isOutside(target, cwd))
        }
      }
      const formatting = /^mkfs(?:\.[\w]+)?$/.test(name) || name === 'mkswap' ||
        name === 'wipefs' && !flags(args, 'n', '--no-act') && (flags(args, 'a', '--all') || flags(args, 'o', '--offset')) ||
        name === 'parted' && args.some(a => /^(?:mklabel|mkpart|rm|resizepart|resize)$/.test(a))
      if (formatting && !args.some(a => ['--help', '--version'].includes(a))) {
        const targets = operands(args)
        if (targets.some(t => blockDevice.test(resolveTarget(t, cwd, ctx.home))))
          add('fs.format_device', 'hardline', 'Block device formatting', 'Formats or repartitions a raw block device.', fragment)
        else if (targets.length) add('fs.format', 'high', 'Filesystem formatting', 'Formats a filesystem or disk image.', fragment)
      }
      if (name === 'fdisk' && !args.some(a => ['-l', '--list', '-h', '--help', '-v', '--version'].includes(a)))
        add('fs.partition', 'high', 'Disk partition editor', 'Can alter a disk partition table.', fragment)
      if (name === 'dd') {
        const target = args.find(a => a.startsWith('of='))?.slice(3)
        if (target) write(target, fragment, cwd)
      }
      if (['tee', 'touch', 'truncate', 'mkdir'].includes(name)) for (const target of operands(args, ['-s', '--size', '-m', '--mode', '-d', '-t', '-r'])) write(target, fragment, cwd)
      if (['cp', 'mv', 'install', 'ln'].includes(name)) {
        const index = args.findIndex(a => a === '-t' || a === '--target-directory' || a.startsWith('--target-directory='))
        const targets = operands(args, ['-t', '--target-directory', '-m', '-o', '-g', '--mode', '--owner', '--group'])
        const target = index >= 0 ? args[index].split('=')[1] ?? args[index + 1] : targets.at(-1)
        if (target) write(target, fragment, cwd)
        if (name === 'mv') for (const source of targets.slice(0, index >= 0 ? undefined : -1)) {
          if (sensitiveTarget(source, cwd, ctx.home)) write(source, fragment, cwd)
          else add('fs.delete', 'medium', 'File move', `Moves ${source}.`, fragment, isOutside(source, cwd))
        }
      }
      if (['sed', 'perl', 'ruby'].includes(name) && args.some(a => /^-[^-]*i/.test(a) || /^--in-place(?:=|$)/.test(a))) {
        const targets = operands(args, ['-e', '--expression', '-f', '--file'])
        if (!args.some(a => a === '-e' || a === '-f' || a.startsWith('--expression') || a.startsWith('--file'))) targets.shift()
        for (const target of targets) write(target, fragment, cwd)
      }
      if (['chmod', 'chown', 'chgrp'].includes(name)) {
        const targets = operands(args, ['--reference'])
        const mode = targets.shift() ?? ''
        const recursive = flags(args, 'R', '--recursive')
        for (const target of targets) {
          const path = resolveTarget(target.replace(/\/\*+$/, '') || '/', cwd, ctx.home)
          if (name === 'chmod' && recursive && /^(?:0?777|0?666|[oa]\+[rwx]*w[rwx]*)$/.test(mode) && (path === '/' || systemRoots.has(path)))
            add('fs.chmod_root', 'hardline', 'Unsafe system permissions', 'Recursively makes system files world-writable.', fragment)
          else if (sensitiveTarget(target, cwd, ctx.home)) write(target, fragment, cwd)
          else add('fs.permissions', 'medium', 'Permission change', `Changes permissions or ownership of ${target}.`, fragment, isOutside(target, cwd))
        }
      }
      if (name === 'find' && (args.includes('-delete') || args.some((a, i) => /^-exec(?:dir)?$/.test(a) && basename(args[i + 1] ?? '') === 'rm'))) {
        const targets = args.slice(0, args.findIndex(a => a.startsWith('-')))
        for (const target of targets.length ? targets : ['.']) {
          if (sensitiveTarget(target, cwd, ctx.home)) write(target, fragment, cwd)
          else add('fs.find_delete', 'medium', 'Find deletes files', `Deletes matching files under ${target}.`, fragment, isOutside(target, cwd))
        }
        const exec = args.findIndex(a => /^-exec(?:dir)?$/.test(a))
        if (exec >= 0) walk(args.slice(exec + 1).filter(a => a !== ';' && a !== '+').join(' '), cwd, depth + 1)
      }
      if (name === 'xargs' && args.includes('rm')) {
        add('fs.xargs_delete', 'medium', 'Input-driven deletion', 'Deletion targets are supplied dynamically through stdin.', fragment)
        walk(args.slice(args.indexOf('rm')).join(' '), cwd, depth + 1)
      }
      if (name === 'git') {
        let gitCwd = cwd, i = 0
        while (i < args.length && args[i].startsWith('-')) {
          const option = args[i++]
          if (option === '-C') gitCwd = resolveTarget(args[i++], gitCwd, ctx.home)
          else if (['-c', '--git-dir', '--work-tree'].includes(option)) { if (option !== '-c') gitCwd = resolveTarget(args[i], gitCwd, ctx.home); i++ }
          else if (/^--(?:git-dir|work-tree)=/.test(option)) gitCwd = resolveTarget(option.split('=')[1], gitCwd, ctx.home)
          else if (option.startsWith('-C')) gitCwd = resolveTarget(option.slice(2), gitCwd, ctx.home)
          if (option === '-c' && /^alias\.[^=]+=!/.test(args[i - 1] ?? '')) walk(args[i - 1].slice(args[i - 1].indexOf('!') + 1), gitCwd, depth + 1)
        }
        const verb = args[i++], options = args.slice(i)
        if (verb === 'push' && (flags(options, 'f', '--force') || options.some(a => /^--forc/.test(a) || a.startsWith('+'))))
          add('git.force_push', 'high', 'Force push', 'Can overwrite remote history.', fragment)
        if (verb === 'reset' && options.some(a => /^--h(?:a(?:r(?:d)?)?)?$/.test(a)))
          add('git.reset_hard', 'high', 'Discard tracked changes', 'Discards uncommitted tracked changes.', fragment)
        if (verb === 'branch' && (flags(options, 'D', '--force-delete') || flags(options, 'd', '--delete') && flags(options, 'f', '--force')))
          add('git.branch_delete', 'high', 'Force delete branch', 'Deletes a branch even if it has unmerged commits.', fragment)
        if (verb === 'clean' && !flags(options, 'n', '--dry-run') && flags(options, 'f', '--force')) {
          const targets = operands(options)
          for (const target of targets.length ? targets : ['.']) add('git.clean', 'medium', 'Delete untracked files', 'Deletes untracked repository files.', fragment,
            isOutside(target, gitCwd))
        }
      }
      if (['shutdown', 'reboot', 'halt', 'poweroff'].includes(name) || ['init', 'telinit'].includes(name) && /^[06]$/.test(args[0] ?? '') ||
        name === 'systemctl' && args.some(a => /^(?:poweroff|reboot|halt|kexec)$/.test(a)))
        add('system.shutdown', 'hardline', 'System shutdown', 'Stops or reboots the host.', fragment)
      if (name === 'kill' && (args.at(-1) === '-1' || args.indexOf('--') >= 0 && args.slice(args.indexOf('--') + 1).includes('-1')))
        add('process.kill_all', 'hardline', 'Kill all processes', 'Signals every permitted process.', fragment)
      if (['pkill', 'killall'].includes(name) && args.some(a => /^-(?:9|KILL|SIGKILL|r)$/.test(a) || /^(?:KILL|9)$/.test(a)))
        add('process.mass_kill', 'high', 'Force process sweep', 'Forcibly kills multiple processes.', fragment)
      if (['docker', 'docker-compose', 'podman'].includes(name)) {
        if (args.some(a => /^(?:-H|-H.+|--host|--context|--url|--connection|--remote)(?:=|$)/.test(a)) || rawWords.some(w => /^(?:DOCKER_HOST|DOCKER_CONTEXT|CONTAINER_HOST|CONTAINER_CONNECTION)=/.test(w.value)))
          add('container.remote', 'high', 'Alternate container daemon', 'Can operate on infrastructure outside the workspace.', fragment)
        if (args.some(a => /^(?:stop|kill|restart|down|prune)$/.test(a))) add('container.destructive', 'high', 'Container lifecycle change', 'Stops or removes containers or stored container data.', fragment)
      }
      if (['psql', 'mysql', 'mariadb', 'sqlite3'].includes(name) && args.some(a => /\b(?:drop\s+(?:database|schema|table)|truncate\s+(?:table\s+)?\w+|delete\s+from\s+\w+)\b/i.test(a)))
        add('data.destructive_sql', 'high', 'Destructive database operation', 'Removes database objects or rows.', fragment)
      if (['npm', 'pnpm', 'yarn'].includes(name) && args.some(a => /^(?:uninstall|unlink|remove|rm|r|un)$/.test(a)) && args.some(a => /^(?:-g|--global|global)$/.test(a)) ||
        ['brew', 'pip', 'pip3', 'apt', 'apt-get', 'pacman', 'dnf', 'yum'].includes(name) && args.some(a => /^(?:uninstall|remove|purge|autoremove|-R\w*)$/.test(a)))
        add('system.package_remove', 'high', 'Remove installed software', 'Removes software beyond a project dependency tree.', fragment)
      if (wrapperCwd) cwd = parentCwd
      if (segment.separator === '(') subshellCwds.push(cwd)
      if (segment.separator === ')') cwd = subshellCwds.pop()
      if (!startsPipeline) { remote = false; decoded = false }
      inPipeline = startsPipeline
    }
    // Function definitions have no ordinary command word. Mask quoted arguments first.
    const unquoted = scan.tokens.map(t => t.operator ? t.value : /['"]/.test(t.raw) ? '' : t.value).join(' ')
    if (/(?:^|\s)(\w+|:)\s*\(\s*\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}\s*;\s*\1(?:\s|$)/.test(unquoted))
      add('process.fork_bomb', 'hardline', 'Fork bomb', 'Creates an unbounded recursive process pipeline.', prepareShellText(text).trim())
  }
  walk(cmd, ctx.cwd, 0)
  return findings
}

export function detectDangerous(cmd: string, ctx?: Context): DangerMatch[] {
  return inspectCommand(cmd, ctx).map(finding => finding.match)
}
