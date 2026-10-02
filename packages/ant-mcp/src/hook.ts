#!/usr/bin/env node
// PreToolUse hook (plan §4 "Floors"): asks antd for a verdict on every tool call.
// Prints a deny decision when antd blocks; prints nothing to let normal rules apply.
import { AntdClient } from './client.ts'

const socket = process.env.ANT_SOCKET
const token = process.env.ANT_TOKEN

async function main() {
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  if (!socket || !token) return
  let input: { tool_name?: string; tool_input?: unknown; tool_use_id?: string }
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return
  }
  const client = new AntdClient(socket, token)
  const verdict = (await Promise.race([
    client.call('pretool', { tool_name: input.tool_name, tool_input: input.tool_input, tool_use_id: input.tool_use_id }),
    new Promise((r) => setTimeout(() => r(null), 20_000)),
  ])) as { action?: 'block' | 'ask' | 'pass'; message?: string } | null
  if (verdict?.action === 'block' || verdict?.action === 'ask') {
    // "ask" sends the call through Claude Code's permission prompt, i.e. Ant's approval card.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: verdict.action === 'block' ? 'deny' : 'ask',
          permissionDecisionReason: verdict.message ?? 'Blocked by Ant',
        },
      }),
    )
  }
}

// antd unreachable: stay silent so Claude Code's own rules and sandbox still apply.
main()
  .catch(() => {})
  .finally(() => process.exit(0))
