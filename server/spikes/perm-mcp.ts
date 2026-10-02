// Spike: minimal permission-prompt MCP server. Logs every call, denies inputs containing DENYME.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { appendFileSync } from 'node:fs'
import { z } from 'zod'

const log = process.env.SPIKE_LOG ?? '/tmp/perm-spike.log'
const server = new McpServer({ name: 'ant', version: '0.0.1' })

server.registerTool(
  'permission',
  { description: 'Permission prompt handler', inputSchema: { tool_name: z.string(), input: z.any(), tool_use_id: z.string().optional() } },
  async (args) => {
    appendFileSync(log, JSON.stringify({ at: Date.now(), args }) + '\n')
    const deny = JSON.stringify(args).includes('DENYME')
    const decision = deny
      ? { behavior: 'deny', message: 'Denied by Ant spike' }
      : { behavior: 'allow', updatedInput: args.input }
    return { content: [{ type: 'text', text: JSON.stringify(decision) }] }
  },
)

server.registerTool('ping', { description: 'Say pong', inputSchema: {} }, async () => ({ content: [{ type: 'text', text: 'pong' }] }))

await server.connect(new StdioServerTransport())
