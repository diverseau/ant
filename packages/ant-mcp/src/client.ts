// Minimal client for antd's ant socket (see server/src/ipc.ts).
import { connect, type Socket } from 'node:net'
import { createInterface } from 'node:readline'

export class AntdClient {
  private sock: Socket | null = null
  private seq = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readonly path: string
  private readonly token: string

  constructor(path: string, token: string) {
    this.path = path
    this.token = token
  }

  private ensure(): Socket {
    if (this.sock && !this.sock.destroyed) return this.sock
    const sock = connect(this.path)
    createInterface({ input: sock }).on('line', (line) => {
      let msg: { id: number; result?: unknown; error?: string }
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error))
      else p.resolve(msg.result)
    })
    const fail = (err: Error) => {
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
      this.sock = null
    }
    sock.on('error', fail)
    sock.on('close', () => fail(new Error('antd connection closed')))
    this.sock = sock
    return sock
  }

  call(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ensure().write(JSON.stringify({ id, token: this.token, method, params }) + '\n')
    })
  }
}
