/**
 * The pure timeline math: shot placement, ruler ticks across zoom levels, the
 * pixel↔second mapping, and the playhead↔shot lookup.
 */
import { describe, expect, it } from 'vitest'
import type { VideoShot } from '@deepseek-ai/dsh-host-video-project/types'
import {
  activeSegmentAt, buildSegments, clampTime, clockParts, pxToSeconds, rulerTicks, secondsToPx,
  stillOf, tickStep, totalDuration,
} from '../src/client/timeline.ts'

/** One shot with only the fields the timeline reads. */
function shot(index: number, duration: number): VideoShot {
  return {
    id: `shot-${index + 1}`, index, description: '', narration: '', duration, visualType: 'unknown',
  }
}

describe('stillOf', () => {
  it('prefers the thumbnail over the generated image', () => {
    expect(stillOf({ ...shot(0, 1), thumbnail: '/t.png', image: '/i.png' })).toBe('/t.png')
  })

  it('falls back to the generated image, then to nothing', () => {
    expect(stillOf({ ...shot(0, 1), image: '/i.png' })).toBe('/i.png')
    expect(stillOf(shot(0, 1))).toBeUndefined()
  })
})

describe('buildSegments', () => {
  it('places an empty shot list as an empty timeline', () => {
    expect(buildSegments([])).toEqual([])
  })

  it('accumulates each shot from the previous end', () => {
    const segments = buildSegments([shot(0, 3), shot(1, 2)])
    expect(segments).toEqual([
      { shot: segments[0]!.shot, start: 0, end: 3, duration: 3 },
      { shot: segments[1]!.shot, start: 3, end: 5, duration: 2 },
    ])
  })

  it('holds a negative duration at zero', () => {
    const segments = buildSegments([shot(0, -4)])
    expect(segments[0]).toMatchObject({ start: 0, end: 0, duration: 0 })
  })
})

describe('totalDuration', () => {
  it('is zero for an empty timeline', () => {
    expect(totalDuration([])).toBe(0)
  })

  it('is the last segment end', () => {
    expect(totalDuration(buildSegments([shot(0, 3), shot(1, 2)]))).toBe(5)
  })
})

describe('activeSegmentAt', () => {
  const segments = buildSegments([shot(0, 3), shot(1, 0), shot(2, 2)])

  it('finds the segment covering the position', () => {
    expect(activeSegmentAt(segments, 1)).toBe(segments[0])
    expect(activeSegmentAt(segments, 4)).toBe(segments[2])
  })

  it('skips a zero-length segment', () => {
    expect(activeSegmentAt(segments, 3)).toBe(segments[2])
  })

  it('snaps to the last segment at or past the end', () => {
    expect(activeSegmentAt(segments, 5)).toBe(segments[2])
  })

  it('is undefined for an empty timeline', () => {
    expect(activeSegmentAt([], 1)).toBeUndefined()
  })
})

describe('tickStep', () => {
  it('picks the densest step whose ticks stay readable', () => {
    expect(tickStep(100)).toBe(1)
  })

  it('falls back to the sparsest step when even it is dense', () => {
    expect(tickStep(0.01)).toBe(3600)
  })
})

describe('rulerTicks', () => {
  it('draws nothing at a non-positive zoom', () => {
    expect(rulerTicks(10, 0)).toEqual([])
  })

  it('draws nothing for a non-positive timeline', () => {
    expect(rulerTicks(0, 100)).toEqual([])
  })

  it('marks every fifth tick major from zero to the end inclusive', () => {
    const ticks = rulerTicks(10, 100)
    expect(ticks).toHaveLength(11)
    expect(ticks[0]).toEqual({ seconds: 0, major: true })
    expect(ticks[1]).toEqual({ seconds: 1, major: false })
    expect(ticks[5]).toEqual({ seconds: 5, major: true })
    expect(ticks[10]).toEqual({ seconds: 10, major: true })
  })
})

describe('pixel mapping', () => {
  it('converts seconds to pixels', () => {
    expect(secondsToPx(2.5, 40)).toBe(100)
  })

  it('converts pixels to seconds', () => {
    expect(pxToSeconds(100, 40)).toBe(2.5)
  })
})

describe('clampTime', () => {
  it('holds a position inside the timeline', () => {
    expect(clampTime(-3, 10)).toBe(0)
    expect(clampTime(12, 10)).toBe(10)
    expect(clampTime(4, 10)).toBe(4)
  })

  it('holds a negative timeline length at zero', () => {
    expect(clampTime(4, -1)).toBe(0)
  })
})

describe('clockParts', () => {
  it('zero-pads minutes and seconds', () => {
    expect(clockParts(65)).toEqual({ mm: '01', ss: '05' })
  })

  it('floors a fractional position', () => {
    expect(clockParts(0.9)).toEqual({ mm: '00', ss: '00' })
  })

  it('holds a negative position at zero', () => {
    expect(clockParts(-4)).toEqual({ mm: '00', ss: '00' })
  })
})
