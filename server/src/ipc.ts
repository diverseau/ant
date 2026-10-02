// Local socket between antd and each ant's `ant-mcp` server. Newline-delimited JSON:
//   → {"id":1,"token":"…","method":"report_checklist","params":{…}}
//   ← {"id":1,"result":…} | {"id":1,"error":"…"}
// The token identifies the ant; methods never trust an ant id sent in params.
import { chmodSync, rmSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { createInterface } from 'node:readline'

export type IpcHandler = (antId: string, params: Record<string, unknown>) => Promise<unknown> | unknown

export class IpcServer {
  private handlers = new Map<string, IpcHandler>()
  private tokens = new Map<string, string>() // token → antId
  private server: Server
  private path: string

  constructor(path: string) {
    this.path = path
    this.server = createServer((sock) => this.accept(sock))
  }

  on(method: string, handler: IpcHandler) {
    this.handlers.set(method, handler)
  }

  issueToken(antId: string, token: string) {
    for (const [t, id] of this.tokens) if (id === antId) this.tokens.delete(t)
    this.tokens.set(token, antId)
  }

  listen(): Promise<void> {
    rmSync(this.path, { force: true })
    return new Promise((resolve) =>
      this.server.listen(this.path, () => {
        chmodSync(this.path, 0o600)
        resolve()
      }),
    )
  }

  close() {
    this.server.close()
    rmSync(this.path, { force: true })
  }

  private accept(sock: Socket) {
    createInterface({ input: sock }).on('line', async (line) => {
      let req: { id?: unknown; token?: string; method?: string; params?: Record<string, unknown> }
      try {
        req = JSON.parse(line)
      } catch {
        return
      }
      const reply = (o: object) => sock.writable && sock.write(JSON.stringify({ id: req.id, ...o }) + '\n')
      const antId = req.token ? this.tokens.get(req.token) : undefined
      if (!antId) return reply({ error: 'unauthorised' })
      const handler = req.method ? this.handlers.get(req.method) : undefined
      if (!handler) return reply({ error: `unknown method ${req.method}` })
      try {
        reply({ result: (await handler(antId, req.params ?? {})) ?? null })
      } catch (err) {
        reply({ error: err instanceof Error ? err.message : String(err) })
      }
    })
    sock.on('error', () => {})
  }
}
