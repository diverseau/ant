import { describe, expect, it } from 'vitest'
import { cleanTranscript } from '../../src/dictation/transcribe.ts'

describe('cleanTranscript', () => {
  it('drops voxtype progress lines and Whisper silence markers', () => {
    const out = 'Loading audio file: "in.wav"\nAudio format: 16000 Hz, 1 channel(s), Int\nProcessing 176000 samples (11.00s)...\n\n Ask not what your country can do for you. [BLANK_AUDIO]\n'
    expect(cleanTranscript(out)).toBe('Ask not what your country can do for you.')
    expect(cleanTranscript('Processing 32000 samples (2.00s)...\n\n[BLANK_AUDIO]\n')).toBe('')
    expect(cleanTranscript('(silence)')).toBe('')
  })
})
