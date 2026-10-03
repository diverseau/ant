// Microphone capture for composer dictation. Records compressed audio for antd to transcribe
// locally, and reports a live input level for the waveform.

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

export class Recorder {
  /** True once anything louder than room noise was heard: Whisper invents words for silence. */
  heard = false
  private stream: MediaStream
  private rec: MediaRecorder
  private chunks: Blob[] = []
  private ctx: AudioContext
  private analyser: AnalyserNode
  private buf: Float32Array<ArrayBuffer>
  private stopped: Promise<void>

  private constructor(stream: MediaStream) {
    this.stream = stream
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    this.rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined)
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.stopped = new Promise((r) => (this.rec.onstop = () => r()))
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.ctx.createMediaStreamSource(stream).connect(this.analyser)
    this.buf = new Float32Array(this.analyser.fftSize)
    // Small slices so a partial transcript can be taken while still recording.
    this.rec.start(500)
  }

  static async start(): Promise<Recorder> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no microphone access here (it needs https or localhost).')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    } catch (err) {
      const name = (err as DOMException)?.name
      throw new Error(
        name === 'NotAllowedError'
          ? 'Microphone blocked. Allow it for this site in your browser, then try again.'
          : name === 'NotFoundError'
            ? 'No microphone found.'
            : 'Couldn’t start the microphone.',
      )
    }
    return new Recorder(stream)
  }

  /** 0–1 input level (RMS, scaled for speech). */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (const v of this.buf) sum += v * v
    const rms = Math.sqrt(sum / this.buf.length)
    if (rms > 0.02) this.heard = true
    return Math.min(1, rms * 9)
  }

  /** Everything recorded so far, as one playable file. */
  sofar(): Blob {
    return new Blob(this.chunks, { type: this.rec.mimeType })
  }

  async stop(): Promise<Blob> {
    if (this.rec.state !== 'inactive') this.rec.stop()
    await this.stopped
    this.release()
    return this.sofar()
  }

  cancel() {
    if (this.rec.state !== 'inactive') this.rec.stop()
    this.release()
  }

  private release() {
    for (const t of this.stream.getTracks()) t.stop()
    void this.ctx.close().catch(() => {})
  }
}

export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  const r = await fetch('/api/dictation', { method: 'POST', body: audio, headers: { 'content-type': audio.type || 'application/octet-stream' }, signal })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? 'Dictation failed')
  return String(body.text ?? '')
}
