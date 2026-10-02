// Ported from hermes-agent tools/threat_patterns.py @ 54bc5e50 (MIT, Nous Research)

const MAX_SCAN_CHARS = 65_536
const filler = String.raw`(?:\w+\s+){0,8}`
const secretVar = String.raw`\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)S?\b`
const modify = String.raw`(update|modify|edit|write|change|append|add\s+to)\s+[^\n]{0,2048}`
const invisible = /[\u200b\u200c\u200d\u2060\u2062\u2063\u2064\ufeff\u202a-\u202e\u2066-\u2069]/u

// Strict scope includes Hermes's all, context and strict patterns, in source order.
const patterns: Array<[string, string]> = [
  [String.raw`ignore\s+${filler}(previous|all|above|prior)\s+${filler}instructions`, 'prompt_injection'],
  [String.raw`system\s+prompt\s+override`, 'sys_prompt_override'],
  [String.raw`disregard\s+${filler}(your|all|any)\s+${filler}(instructions|rules|guidelines)`, 'disregard_rules'],
  [String.raw`act\s+as\s+(if|though)\s+${filler}you\s+${filler}(have\s+no|don't\s+have)\s+${filler}(restrictions|limits|rules)`, 'bypass_restrictions'],
  [String.raw`<!--[^>]{0,512}(?:ignore|override|system|secret|hidden)[^>]{0,512}-->`, 'html_comment_injection'],
  [String.raw`<\s*div\s+style\s*=\s*["'][^>]{0,2048}display\s*:\s*none`, 'hidden_div'],
  [String.raw`translate\s+[^\n]{0,512}\s+into\s+\w+(?:(?:\s|-)+\w+){0,2}\s+and\s+(execute|run|eval)\b`, 'translate_execute'],
  [String.raw`do\s+not\s+${filler}tell\s+${filler}the\s+user`, 'deception_hide'],
  [String.raw`you\s+are\s+${filler}now\s+(?:a|an|the)\s+`, 'role_hijack'],
  [String.raw`pretend\s+${filler}(you\s+are|to\s+be)\s+`, 'role_pretend'],
  [String.raw`output\s+${filler}(system|initial)\s+prompt`, 'leak_system_prompt'],
  [String.raw`(respond|answer|reply)\s+without\s+${filler}(restrictions|limitations|filters|safety)`, 'remove_filters'],
  [String.raw`you\s+have\s+been\s+${filler}(updated|upgraded|patched)\s+to`, 'fake_update'],
  [String.raw`\bname\s+yourself\s+\w+`, 'identity_override'],
  [String.raw`register\s+(as\s+)?a?\s*node`, 'c2_node_registration'],
  [String.raw`(heartbeat|beacon|check(?:\s|-)?in)\s+(to|with)\s+`, 'c2_heartbeat'],
  [String.raw`pull\s+(down\s+)?(?:new\s+)?task(?:ing|s)?\b`, 'c2_task_pull'],
  [String.raw`connect\s+to\s+the\s+network\b`, 'c2_network_connect'],
  [String.raw`you\s+must\s+(?:\w+\s+){0,3}(register|connect|report|beacon)\b`, 'forced_action'],
  [String.raw`only\s+use\s+one(?:\s|-)?liners?\b`, 'anti_forensic_oneliner'],
  [String.raw`never\s+${filler}(?:create|write)\s+${filler}(?:script|file)\s+${filler}disk`, 'anti_forensic_disk'],
  [String.raw`unset\s+\w*(?:CLAUDE|CODEX|HERMES|AGENT|OPENAI|ANTHROPIC)\w*`, 'env_var_unset_agent'],
  [String.raw`\b(?:cobalt\s*strike|sliver|havoc|mythic|metasploit|brainworm)\b`, 'known_c2_framework'],
  [String.raw`\bc2\s+(?:server|channel|infrastructure|beacon)\b`, 'c2_explicit'],
  [String.raw`\bcommand\s+and\s+control\b`, 'c2_explicit_long'],
  [String.raw`curl\s+[^\n]{0,2048}${secretVar}`, 'exfil_curl'],
  [String.raw`wget\s+[^\n]{0,2048}${secretVar}`, 'exfil_wget'],
  [String.raw`cat\s+[^\n]{0,2048}(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)`, 'read_secrets'],
  [String.raw`(send|post|upload|transmit)\s+[^\n]{0,2048}\s+(to|at)\s+https?://`, 'send_to_url'],
  [String.raw`(include|output|print|share)\s+${filler}(conversation|chat\s+history|previous\s+messages|full\s+context|entire\s+context)`, 'context_exfil'],
  [String.raw`authorized_keys`, 'ssh_backdoor'],
  [String.raw`(?:\b(?:echo|cat|cp|mv|dd|tee|install|printf|rsync|scp|ln|append|add|write|sed|chmod|chown|truncate|rm|touch|curl|wget|git)\b|\bopen\s*\(|>>?)[^\n]{0,512}(?:\$HOME/\.ssh|~/\.ssh)`, 'ssh_access'],
  [String.raw`\$HOME/\.hermes/\.env|~\/\.hermes/\.env`, 'hermes_env'],
  [String.raw`${modify}(?:AGENTS\.md|CLAUDE\.md|\.cursorrules|\.clinerules)`, 'agent_config_mod'],
  [String.raw`${modify}\.hermes/(config\.yaml|SOUL\.md)`, 'hermes_config_mod'],
  [String.raw`(?:api[_-]?key|token|secret|password)\s*[=:]\s*["'](?!(?-i:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)["'])[A-Za-z0-9+/=_-]{20,}`, 'hardcoded_secret'],
]

// Python's \w/\b/\s are Unicode-aware; retain that behavior in JavaScript regexes.
const word = String.raw`[\p{L}\p{N}_]`
const space = String.raw`[\p{White_Space}\u001c-\u001f]`
const boundary = String.raw`(?:(?<!${word})(?=${word})|(?<=${word})(?!${word}))`
const compiled = patterns.map(([pattern, id]) =>
  [new RegExp(pattern.replaceAll(String.raw`\w`, word).replaceAll(String.raw`\b`, boundary)
    .replaceAll(String.raw`\s`, space), 'iu'), id] as const)

export function firstThreat(content: string): string | null {
  const scanned = Array.from(content.slice(0, MAX_SCAN_CHARS * 2)).slice(0, MAX_SCAN_CHARS).join('')
  const hidden = scanned.match(invisible)?.[0]
  if (hidden) {
    const codepoint = hidden.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
    return `Blocked: content contains invisible unicode character U+${codepoint} (possible injection).`
  }
  const normalised = scanned.normalize('NFKC')
  for (const [pattern, id] of compiled) {
    if (pattern.test(normalised)) {
      return `Blocked: content matches threat pattern '${id}'. Content is injected into the system prompt and must not contain injection or exfiltration payloads.`
    }
  }
  return null
}
