// Encrypted secrets (plan §11). The key lives in the OS keyring (libsecret via secret-tool),
// falling back to a 0600 key file in antd's data dir. Values are only ever decrypted to be
// injected as environment variables into the ants they're scoped to.
import { execFileSync } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ATTRS = ['service', 'ant', 'key', 'secrets-master']

export class Vault {
  private loaded: Buffer | null = null
  private dataDir: string
  source: 'keyring' | 'file' | null = null

  constructor(dataDir: string) {
    this.dataDir = dataDir
  }

  /** Loaded on first use so antd never prompts for the keyring unless secrets exist. */
  private get key(): Buffer {
    if (this.loaded) return this.loaded
    const file = join(this.dataDir, 'secrets.key')
    const fromKeyring = existsSync(file) ? null : readKeyring()
    if (fromKeyring) {
      this.source = 'keyring'
      return (this.loaded = fromKeyring)
    }
    if (existsSync(file)) {
      this.source = 'file'
      return (this.loaded = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64'))
    }
    const key = randomBytes(32)
    if (writeKeyring(key)) this.source = 'keyring'
    else {
      writeFileSync(file, key.toString('base64'), { mode: 0o600 })
      this.source = 'file'
    }
    return (this.loaded = key)
  }

  encrypt(plain: string): Uint8Array {
    const iv = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', this.key, iv)
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
    return Buffer.concat([iv, c.getAuthTag(), ct])
  }

  decrypt(blob: Uint8Array): string {
    const b = Buffer.from(blob)
    const d = createDecipheriv('aes-256-gcm', this.key, b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
  }
}

function readKeyring(): Buffer | null {
  try {
    const out = execFileSync('secret-tool', ['lookup', ...ATTRS], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return out ? Buffer.from(out, 'base64') : null
  } catch {
    return null
  }
}

function writeKeyring(key: Buffer): boolean {
  try {
    execFileSync('secret-tool', ['store', '--label=Ant secrets key', ...ATTRS], { input: key.toString('base64'), timeout: 5000, stdio: ['pipe', 'ignore', 'ignore'] })
    return readKeyring()?.equals(key) ?? false
  } catch {
    return false
  }
}

/** Secret names become environment variables. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{1,63}$/
const RESERVED = /^(PATH|HOME|USER|SHELL|LANG|TERM|PWD|TMPDIR|NODE_OPTIONS|LD_.*|ANT_.*|CLAUDE_.*|ANTHROPIC_.*|ENABLE_CLAUDEAI_MCP_SERVERS)$/
export const isReservedName = (n: string) => RESERVED.test(n)
