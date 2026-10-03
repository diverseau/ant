// Remote MCP servers that work without an interactive sign-in (checked to answer MCP
// `initialize`). Connectors that need OAuth live on claude.ai instead.
export interface DirectoryEntry {
  name: string
  domain: string
  description: string
  url: string
  headers?: Record<string, string>
  /** Secret the ant needs for this to work (Connectors → Secrets). */
  needsSecret?: string
}

export const DIRECTORY: DirectoryEntry[] = [
  { name: 'context7', domain: 'context7.com', description: 'Up-to-date docs and code examples for libraries', url: 'https://mcp.context7.com/mcp' },
  { name: 'deepwiki', domain: 'deepwiki.com', description: 'Ask questions about any public GitHub repo', url: 'https://mcp.deepwiki.com/mcp' },
  { name: 'cloudflare-docs', domain: 'cloudflare.com', description: 'Search Cloudflare’s documentation', url: 'https://docs.mcp.cloudflare.com/mcp' },
  { name: 'huggingface', domain: 'huggingface.co', description: 'Models, datasets, Spaces and papers', url: 'https://huggingface.co/mcp' },
  { name: 'exa', domain: 'exa.ai', description: 'Web search built for agents', url: 'https://mcp.exa.ai/mcp' },
  {
    name: 'github',
    domain: 'github.com',
    description: 'Issues, pull requests, code and Actions',
    url: 'https://api.githubcopilot.com/mcp/',
    // Claude Code fills ${…} from the ant's environment, so the token never sits in a config file.
    headers: { Authorization: 'Bearer ${GITHUB_TOKEN}' },
    needsSecret: 'GITHUB_TOKEN',
  },
]
