// Human-readable titles for tool calls: tool rows in chat and approval cards.
import { relative } from 'node:path'

export interface Described {
  title: string
  detail?: string
  connector: string
}

const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function shortPath(path: string, folder?: string): string {
  if (!path) return ''
  if (folder) {
    const rel = relative(folder, path)
    if (!rel.startsWith('..')) return rel || '.'
  }
  return path.replace(/^\/home\/[^/]+/, '~')
}

function prettyConnector(server: string): string {
  return server.replace(/^claude_ai_/, '').replace(/_/g, ' ')
}

export function describeTool(name: string, input: unknown, folder?: string): Described {
  const i = (input ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  switch (name) {
    case 'Bash':
      return { title: s('description') || 'Ran a command', detail: clip(s('command'), 400), connector: 'Terminal' }
    case 'Read':
      return { title: `Read ${shortPath(s('file_path'), folder)}`, connector: 'Files' }
    case 'Write':
      return { title: `Wrote ${shortPath(s('file_path'), folder)}`, detail: clip(s('content'), 200), connector: 'Files' }
    case 'Edit':
    case 'MultiEdit':
      return { title: `Edited ${shortPath(s('file_path'), folder)}`, connector: 'Files' }
    case 'NotebookEdit':
      return { title: `Edited ${shortPath(s('notebook_path'), folder)}`, connector: 'Files' }
    case 'Glob':
      return { title: `Searched files for ${s('pattern')}`, connector: 'Files' }
    case 'Grep':
      return { title: `Searched for "${clip(s('pattern'), 60)}"`, connector: 'Files' }
    case 'WebSearch':
      return { title: `Searched the web for "${clip(s('query'), 80)}"`, connector: 'Web' }
    case 'WebFetch':
      return { title: `Read ${s('url').replace(/^https?:\/\//, '').slice(0, 80)}`, connector: 'Web' }
    case 'Task':
    case 'Agent':
      return { title: s('description') || 'Started a helper', detail: clip(s('prompt'), 200), connector: 'Helpers' }
    case 'TodoWrite':
      return { title: 'Updated its plan', connector: 'Plan' }
    case 'Skill':
      return { title: `Used skill ${s('skill') || s('name')}`, connector: 'Skills' }
    case 'ToolSearch':
      return { title: 'Looked up a tool', connector: 'Tools' }
  }
  if (name.startsWith('mcp__browser__')) return describeBrowser(name.slice('mcp__browser__browser_'.length), i)
  if (name.startsWith('mcp__')) {
    const [, server = '', ...rest] = name.split('__')
    const action = rest.join('__').replace(/_/g, ' ')
    const connector = prettyConnector(server)
    const keys = Object.entries(i)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${clip(String(v), 60)}`)
      .join(' · ')
    return { title: `${connector}: ${action}`, detail: keys || undefined, connector }
  }
  return { title: name, detail: clip(JSON.stringify(i), 200), connector: 'Tools' }
}

/** Tools that are plumbing, not worth a row in chat. */
export function isQuietTool(name: string): boolean {
  return name === 'ToolSearch' || name === 'TodoWrite' || name.startsWith('mcp__ant__')
}

function host(url: string): string {
  try {
    const u = new URL(url)
    return (u.host + (u.pathname === '/' ? '' : u.pathname)).slice(0, 80)
  } catch {
    return url.slice(0, 80)
  }
}

function describeBrowser(action: string, i: Record<string, unknown>): Described {
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  const target = s('element') || s('ref')
  const titles: Record<string, string> = {
    navigate: `Opened ${host(s('url'))}`,
    navigate_back: 'Went back',
    click: `Clicked ${target || 'on the page'}`,
    type: `Typed into ${target || 'a field'}`,
    fill_form: 'Filled in a form',
    select_option: `Chose an option in ${target || 'a list'}`,
    press_key: `Pressed ${s('key')}`,
    hover: `Hovered ${target}`,
    snapshot: 'Read the page',
    take_screenshot: 'Took a screenshot',
    wait_for: 'Waited for the page',
    tabs: 'Switched tabs',
    file_upload: 'Uploaded a file',
    evaluate: 'Ran a script on the page',
    close: 'Closed the page',
    resize: 'Resized the window',
    console_messages: 'Read the console',
    network_requests: 'Checked network requests',
    handle_dialog: 'Answered a dialog',
    drag: 'Dragged on the page',
  }
  return { title: titles[action] ?? `Browser: ${action.replace(/_/g, ' ')}`, detail: s('text') ? clip(s('text'), 120) : undefined, connector: 'Browser' }
}
