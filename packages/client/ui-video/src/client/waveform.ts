/**
 * Audio-waveform extraction for the timeline's audio track. One pure reduction
 * turns decoded PCM samples into per-bucket amplitude peaks; a thin browser
 * loader fetches a shot's narration audio and decodes it into those samples.
 */

/**
 * Reduce decoded PCM samples to amplitude peaks.
 * @param data - one channel's samples, each in `[-1, 1]`.
 * @param buckets - how many peaks to produce, one per drawn bar.
 * @returns the largest absolute sample in each bucket, `0` where a bucket holds
 * no sample; empty for a non-positive bucket count.
 */
export function peaksFromChannelData(data: ArrayLike<number>, buckets: number): number[] {
  if (buckets <= 0) return []
  const length = data.length
  if (length === 0) return new Array<number>(buckets).fill(0)
  const per = length / buckets
  const peaks: number[] = []
  for (let bucket = 0; bucket < buckets; bucket++) {
    const from = Math.floor(bucket * per)
    const to = Math.min(length, Math.max(from + 1, Math.floor((bucket + 1) * per)))
    let peak = 0
    for (let i = from; i < to; i++) {
      const magnitude = Math.abs(data[i] as number)
      if (magnitude > peak) peak = magnitude
    }
    peaks.push(peak)
  }
  return peaks
}

/**
 * Fetch and decode one audio file into amplitude peaks.
 * @param url - the media route URL serving the audio bytes.
 * @param buckets - how many peaks to produce.
 * @param signal - aborts the fetch when the requesting track unmounts.
 * @returns the decoded peaks.
 * @throws when the fetch answers anything but success.
 */
export async function decodePeaks(url: string, buckets: number, signal: AbortSignal): Promise<number[]> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`video: waveform fetch answered ${response.status}`)
  const bytes = await response.arrayBuffer()
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(bytes)
    return peaksFromChannelData(buffer.getChannelData(0), buckets)
  } finally {
    await context.close()
  }
}
