// Composer dictation, transcribed on this computer: ffmpeg turns the browser's recording into
// 16 kHz mono WAV and voxtype (local Whisper) transcribes it. No audio leaves the machine.
import { execFile, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.ts'

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024

const bin = (name: string, envName: string) => process.env[envName] || name

export function dictationAvailable(): { available: boolean; missing: string[] } {
  const missing = [
    ['voxtype', 'ANT_VOXTYPE_BIN'],
    ['ffmpeg', 'ANT_FFMPEG_BIN'],
  ]
    .filter(([name, env]) => {
      try {
        execFileSync('which', [bin(name, env)], { stdio: 'ignore' })
        return false
      } catch {
        return true
      }
    })
    .map(([name]) => name)
  return { available: !missing.length, missing }
}

function run(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout, maxBuffer: 4 << 20 }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr || err.message).trim().split('\n').at(-1) || 'failed')) : resolve(stdout),
    ),
  )
}

// One transcription at a time: Whisper already uses every core.
let queue: Promise<unknown> = Promise.resolve()

export function transcribe(cfg: Config, audio: Buffer): Promise<string> {
  const job = queue.then(() => transcribeNow(cfg, audio))
  queue = job.catch(() => {})
  return job
}

async function transcribeNow(cfg: Config, audio: Buffer): Promise<string> {
  const dir = join(cfg.dataDir, 'dictation', randomUUID())
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try {
    const input = join(dir, 'in.audio')
    const wav = join(dir, 'in.wav')
    writeFileSync(input, audio, { mode: 0o600 })
    try {
      await run(bin('ffmpeg', 'ANT_FFMPEG_BIN'), ['-loglevel', 'error', '-nostdin', '-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], 30_000)
    } catch {
      throw new Error("Couldn't read the recording")
    }
    const out = await run(bin('voxtype', 'ANT_VOXTYPE_BIN'), ['-q', 'transcribe', wav], 120_000)
    return cleanTranscript(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** voxtype prints a few progress lines to stdout before the text; Whisper marks silence in brackets. */
export function cleanTranscript(stdout: string): string {
  return stdout
    .split('\n')
    .filter((l) => !/^(Loading audio file|Audio format|Processing \d+ samples)/.test(l.trim()))
    .join(' ')
    .replace(/\[(BLANK_AUDIO|MUSIC|NOISE|SILENCE|INAUDIBLE)[^\]]*\]|\((silence|music|inaudible|blank audio)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
