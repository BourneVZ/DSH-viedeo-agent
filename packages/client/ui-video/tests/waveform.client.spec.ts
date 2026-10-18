// @vitest-environment jsdom
/**
 * The waveform extractor: the pure PCM-to-peaks reduction and the browser
 * loader that fetches and decodes one narration audio file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodePeaks, peaksFromChannelData } from '../src/client/waveform.ts'

/** A decoded buffer over one channel of samples. */
function fakeBuffer(channel: ArrayLike<number>): AudioBuffer {
  return { getChannelData: () => channel } as unknown as AudioBuffer
}

/** An AudioContext stub decoding to one fixed buffer and recording its close. */
function stubAudioContext(channel: ArrayLike<number>): { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn(async () => {})
  class FakeAudioContext {
    decodeAudioData = vi.fn(async () => fakeBuffer(channel))
    close = close
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  return { close }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('peaksFromChannelData', () => {
  it('produces nothing for a non-positive bucket count', () => {
    expect(peaksFromChannelData([0.5, -0.5], 0)).toEqual([])
  })

  it('fills zeros when the channel holds no sample', () => {
    expect(peaksFromChannelData([], 3)).toEqual([0, 0, 0])
  })

  it('takes the largest absolute sample in each bucket', () => {
    const data = [0.1, -0.9, 0.4, 0.2]
    expect(peaksFromChannelData(data, 2)).toEqual([0.9, 0.4])
  })

  it('spreads a lone sample across every bucket when there are more buckets than samples', () => {
    expect(peaksFromChannelData([0.7], 3)).toEqual([0.7, 0.7, 0.7])
  })
})

describe('decodePeaks', () => {
  it('decodes the fetched bytes into peaks and closes the context', async () => {
    const { close } = stubAudioContext([0.2, -0.8, 0.5, 0.5])
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(8))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, arrayBuffer })))
    await expect(decodePeaks('/api/video/media?path=a.wav', 2, new AbortController().signal))
      .resolves.toEqual([0.8, 0.5])
    expect(close).toHaveBeenCalledOnce()
  })

  it('reports a failed fetch by its status and still closes the context', async () => {
    const { close } = stubAudioContext([])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })))
    await expect(decodePeaks('/x', 4, new AbortController().signal))
      .rejects.toThrow('video: waveform fetch answered 502')
    expect(close).not.toHaveBeenCalled()
  })
})
