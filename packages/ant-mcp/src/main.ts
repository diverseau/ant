#!/usr/bin/env node
// The `ant` MCP server: spawned by each ant's `claude` process, forwards every tool
// call to antd over its local socket. Holds no state of its own.
import { readFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { AntdClient } from './client.ts'

const socket = process.env.ANT_SOCKET
const token = process.env.ANT_TOKEN
if (!socket || !token) {
  console.error('ant-mcp: ANT_SOCKET and ANT_TOKEN are required')
  process.exit(1)
}

const antd = new AntdClient(socket, token)
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
const server = new McpServer({ name: 'ant', version })

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const call = async (method: string, params: Record<string, unknown>) => {
  try {
    const r = await antd.call(method, params)
    return text(typeof r === 'string' ? r : JSON.stringify(r ?? { ok: true }))
  } catch (err) {
    return { ...text(`Ant error: ${err instanceof Error ? err.message : String(err)}`), isError: true }
  }
}

// Target of --permission-prompt-tool. Not meant for the model to call directly.
server.registerTool(
  'permission',
  {
    description: 'Internal: Ant permission broker. Do not call this yourself.',
    inputSchema: { tool_name: z.string(), input: z.any(), tool_use_id: z.string().optional() },
  },
  async (args) => {
    try {
      const decision = await antd.call('permission', args as Record<string, unknown>)
      return text(JSON.stringify(decision))
    } catch (err) {
      return text(JSON.stringify({ behavior: 'deny', message: `Ant could not reach its approval service: ${String(err)}` }))
    }
  },
)

server.registerTool(
  'report_checklist',
  {
    description: 'Show the user a structured result as a checklist card. Use for multi-step results.',
    inputSchema: {
      items: z
        .array(z.object({ service: z.string(), result: z.string(), detail: z.string().optional(), ok: z.boolean().default(true) }))
        .min(1)
        .max(20),
    },
  },
  (args) => call('report_checklist', args),
)

server.registerTool(
  'present_draft',
  {
    description:
      'Propose a message that would be sent to a person (email, Slack, DM). The user can edit it and must approve before anything is sent. Never send messages to people any other way.',
    inputSchema: {
      channel: z.enum(['email', 'slack']),
      to: z.string(),
      subject: z.string().optional(),
      body: z.string(),
    },
  },
  (args) => call('present_draft', args),
)

server.registerTool(
  'request_approval',
  {
    description:
      'Ask the user before doing something irreversible or outward-facing that your tools would not otherwise ask about: purchases, payments, sends, deletions, publishing, or browser actions with real-world effect. Blocks until the user decides.',
    inputSchema: { action: z.string(), detail: z.string(), risk: z.enum(['low', 'medium', 'high']).default('medium') },
  },
  (args) => call('request_approval', args),
)

server.registerTool(
  'request_handoff',
  {
    description:
      'Ask the user to take over your browser for something only they should do: signing in, 2FA, CAPTCHAs, payment details. Blocks until they hand the browser back, then continue from the current page.',
    inputSchema: { reason: z.string().describe('What they need to do, e.g. "Sign in to Salesforce"') },
  },
  (args) => call('request_handoff', args),
)

server.registerTool(
  'set_status',
  { description: 'Set a short live status line shown next to your name, e.g. "Pulling the Salesforce list".', inputSchema: { text: z.string().max(80) } },
  (args) => call('set_status', args),
)

server.registerTool(
  'list_ants',
  { description: 'List the ants in this colony with their jobs and current status.', inputSchema: {} },
  () => call('list_ants', {}),
)

server.registerTool(
  'message_ant',
  {
    description:
      'Send a message to another ant (delegate a task or ask a question). Their reply arrives later as a new message starting with [Reply from <name>]. Keep requests specific and self-contained.',
    inputSchema: { to: z.string().describe('Ant name'), text: z.string() },
  },
  (args) => call('message_ant', args),
)

server.registerTool(
  'create_ant',
  {
    description:
      'Propose a new specialist ant (a helper) when a recurring kind of work deserves its own agent. The user must approve. Give it a short name, a job label and complete standing instructions, including what it must never do.',
    inputSchema: { name: z.string(), job: z.string().optional(), instructions: z.string() },
  },
  (args) => call('create_ant', args),
)

server.registerTool(
  'post_to_colony',
  { description: 'Post a message into a colony chat you are a member of.', inputSchema: { colony: z.string().describe('Colony name'), text: z.string() } },
  (args) => call('post_to_colony', args),
)

server.registerTool(
  'memory',
  {
    description:
      'Long-term memory, loaded at the start of every session. target "memory" is your own notes; target "user" is what every ant knows about the user (preferences, facts about them). add a durable fact, replace an entry containing old_text, or remove one. Keep entries short; never store secrets or task progress.',
    inputSchema: {
      op: z.enum(['add', 'replace', 'remove']),
      target: z.enum(['memory', 'user']).default('memory'),
      text: z.string().optional(),
      old_text: z.string().optional(),
    },
  },
  (args) => call('memory', args),
)

server.registerTool(
  'schedule_routine',
  {
    description:
      'Save a routine: work you will do automatically on a schedule, when an event happens, or when a webhook is called, even when the user is away. For a schedule, "when" accepts plain language or cron, e.g. "every weekday at 9am", "every 2 hours", "mondays at 14:00", "in 30m", "0 9 * * 1-5" (minimum interval 5 minutes). For an event, leave "when" empty and set "event": a GitHub repo event, Slack activity (needs the Slack channel set up), or a public web page changing. Confirm what it reacts to back to the user. It does not run immediately.',
    inputSchema: {
      name: z.string().max(80),
      instruction: z.string().describe('What to do each run, written as a self-contained task, including where to report results and what needs approval'),
      when: z.string().default(''),
      tz: z.string().optional().describe('IANA time zone; defaults to the user setting'),
      webhook: z.boolean().optional().describe('Trigger by HTTP webhook instead of a schedule'),
      event: z
        .discriminatedUnion('source', [
          z.object({ source: z.literal('github'), repo: z.string().describe('owner/repo'), events: z.array(z.enum(['issue.opened', 'pr.opened', 'pr.merged', 'push', 'comment', 'release'])) }),
          z.object({ source: z.literal('slack'), on: z.enum(['mention', 'message', 'phrase', 'reaction']), channel: z.string().optional(), phrase: z.string().optional(), emoji: z.string().optional() }),
          z.object({ source: z.literal('watch'), url: z.string().describe('Public http(s) page'), everyMinutes: z.number().int().min(5).max(1440), contains: z.string().optional().describe('Only fire once the page mentions this') }),
        ])
        .optional()
        .describe('React to an event instead of a schedule'),
    },
  },
  (args) => call('schedule_routine', args),
)

server.registerTool('list_routines', { description: 'List your routines.', inputSchema: {} }, () => call('list_routines', {}))

server.registerTool(
  'edit_routine',
  {
    description: 'Change one of your routines by name: its instruction, its schedule, or pause/resume it (enabled).',
    inputSchema: { name: z.string(), instruction: z.string().optional(), when: z.string().optional(), enabled: z.boolean().optional() },
  },
  (args) => call('edit_routine', args),
)

server.registerTool('delete_routine', { description: 'Delete one of your routines by name.', inputSchema: { name: z.string() } }, (args) => call('delete_routine', args))

server.registerTool(
  'save_skill',
  {
    description:
      'Save a reusable procedure as a skill the user can run with /<name> (and you can use later). Write the body as instructions: when to use it, inputs, steps, how to check the result, what to return, and what needs approval. Set shared to offer it to every ant (asks the user first).',
    inputSchema: {
      name: z.string().describe('lowercase-with-dashes, e.g. weekly-digest'),
      description: z.string().describe('One line: what it does and when to use it'),
      body: z.string().describe('Markdown instructions (without frontmatter)'),
      files: z.array(z.object({ path: z.string().describe('under references/, templates/, scripts/ or assets/'), content: z.string() })).optional(),
      shared: z.boolean().optional(),
    },
  },
  (args) => call('save_skill', args),
)

server.registerTool('delete_skill', { description: 'Delete one of your own skills by name.', inputSchema: { name: z.string() } }, (args) => call('delete_skill', args))

server.registerTool(
  'share_file',
  { description: 'Show a file from your folder to the user as a file card in chat.', inputSchema: { path: z.string() } },
  (args) => call('share_file', args),
)

server.registerTool(
  'notify',
  {
    description: 'Ping the user outside the app (desktop notification). Only for things that need attention soon.',
    inputSchema: { text: z.string().max(200), urgency: z.enum(['low', 'normal', 'high']).default('normal') },
  },
  (args) => call('notify', args),
)

await server.connect(new StdioServerTransport())
