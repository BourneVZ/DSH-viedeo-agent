// @vitest-environment jsdom
/**
 * The timeline: the ruler and its zoom controls, the three aligned tracks, the
 * waveform and thumbnail cells, the playhead, the transport, and the drag that
 * scrubs the playhead to any position.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { VideoTimeline, type VideoTimelineProps } from '../src/client/VideoTimeline.tsx'
import { buildSegments, secondsToPx } from '../src/client/timeline.ts'
import { zh } from '../src/client/locales.ts'
import { mediaUrl, shot } from './fixtures.ts'

const t: VideoTimelineProps['t'] = makeTranslate(zh)
const origin = window.location.origin
const GUTTER = 72

afterEach(() => {
  cleanup()
})

/** Timeline props over one four-second shot that carries narration audio. */
function props(over: Partial<VideoTimelineProps> = {}): VideoTimelineProps {
  const segments = buildSegments([shot({ duration: 4, audio: '/work/demo/a.wav', image: '/work/demo/i.png' })])
  return {
    segments, total: 4, time: 0, pxPerSecond: 40, playing: false, showTransport: true,
    peaks: {}, origin, t,
    onScrub: vi.fn(), onTogglePlay: vi.fn(), onZoom: vi.fn(), onRequestPeaks: vi.fn(),
    ...over,
  }
}

/** The scrub surface, by its accessible name. */
function inner(container: HTMLElement): Element {
  const found = container.querySelector(`[aria-label="${zh['timeline.scrubAria']}"]`)
  if (found === null) throw new Error('no scrub surface')
  return found
}

describe('VideoTimeline', () => {
  it('labels the ruler and the three tracks', () => {
    render(<VideoTimeline {...props()} />)
    expect(screen.getByText(zh['timeline.subtitleTrack'])).toBeTruthy()
    expect(screen.getByText(zh['timeline.visualTrack'])).toBeTruthy()
    expect(screen.getByText(zh['timeline.audioTrack'])).toBeTruthy()
    expect(screen.getByRole('timer').textContent).toBe('00:00')
  })

  it('labels the ruler major tick with its clock position', () => {
    const { container } = render(<VideoTimeline {...props({ pxPerSecond: 40 })} />)
    // A 4s timeline at 40px/s steps every 2s, so only the zero tick is major.
    const ruler = container.querySelector<HTMLElement>(`[aria-label="${zh['timeline.rulerAria']}"]`)
    if (ruler === null) throw new Error('no ruler')
    expect(within(ruler).getByText('00:00')).toBeTruthy()
  })

  it('shows the shot still on the visual track', () => {
    render(<VideoTimeline {...props()} />)
    expect(screen.getByAltText('A title card').getAttribute('src')).toBe(mediaUrl('/work/demo/i.png'))
  })

  it('says so when a shot has no visual asset', () => {
    render(<VideoTimeline {...props({
      segments: buildSegments([shot({ duration: 4 })]),
    })} />)
    expect(screen.getByText(zh['preview.thumbnailMissing'])).toBeTruthy()
  })

  it('shows the narration on the subtitle track', () => {
    render(<VideoTimeline {...props()} />)
    expect(screen.getByText('Welcome.')).toBeTruthy()
  })

  it('draws the decoded waveform once peaks are cached', () => {
    render(<VideoTimeline {...props({ peaks: { '/work/demo/a.wav': [0.5, 1] } })} />)
    expect(screen.queryByText(zh['timeline.audioMissing'])).toBeNull()
  })

  it('shows the audio placeholder for an empty peak set', () => {
    render(<VideoTimeline {...props({ peaks: { '/work/demo/a.wav': [] } })} />)
    expect(screen.getByText(zh['timeline.audioMissing'])).toBeTruthy()
  })

  it('shows the audio placeholder and asks for nothing when a shot has no audio', () => {
    const onRequestPeaks = vi.fn()
    render(<VideoTimeline {...props({
      segments: buildSegments([shot({ duration: 4 })]), onRequestPeaks,
    })} />)
    expect(screen.getByText(zh['timeline.audioMissing'])).toBeTruthy()
    expect(onRequestPeaks).not.toHaveBeenCalled()
  })

  it('asks the pane to decode an audio shot it has not cached', () => {
    const onRequestPeaks = vi.fn()
    render(<VideoTimeline {...props({ onRequestPeaks })} />)
    expect(onRequestPeaks).toHaveBeenCalledWith('/work/demo/a.wav', mediaUrl('/work/demo/a.wav'))
  })

  it('does not re-request a shot whose peaks are cached', () => {
    const onRequestPeaks = vi.fn()
    render(<VideoTimeline {...props({ peaks: { '/work/demo/a.wav': [0.5] }, onRequestPeaks })} />)
    expect(onRequestPeaks).not.toHaveBeenCalled()
  })

  it('scales the tracks through the zoom controls', () => {
    const onZoom = vi.fn()
    render(<VideoTimeline {...props({ onZoom })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['timeline.zoomIn'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['timeline.zoomOut'] }))
    expect(onZoom).toHaveBeenCalledWith('in')
    expect(onZoom).toHaveBeenCalledWith('out')
  })

  it('toggles transport and reflects the playing state', () => {
    const onTogglePlay = vi.fn()
    render(<VideoTimeline {...props({ playing: true, onTogglePlay })} />)
    const play = screen.getByRole('button', { name: zh['preview.pause'] })
    expect(play.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(play)
    expect(onTogglePlay).toHaveBeenCalledOnce()
  })

  it('hides the transport for a rendered video with its own controls', () => {
    render(<VideoTimeline {...props({ showTransport: false })} />)
    expect(screen.queryByRole('button', { name: zh['preview.play'] })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['preview.pause'] })).toBeNull()
  })

  it('places the playhead at the playhead position', () => {
    const { container } = render(<VideoTimeline {...props({ time: 2, pxPerSecond: 40 })} />)
    const playhead = container.querySelector(`[aria-label="${zh['timeline.playheadAria']}"]`)
    expect(playhead?.getAttribute('style')).toContain(`left: ${GUTTER + secondsToPx(2, 40)}px`)
  })

  it('scrubs on a drag and stops when the pointer is released', () => {
    const onScrub = vi.fn()
    const { container } = render(<VideoTimeline {...props({ onScrub, pxPerSecond: 10, total: 4 })} />)
    const surface = inner(container)
    fireEvent.pointerMove(surface, { clientX: 92 })
    expect(onScrub).not.toHaveBeenCalled()
    fireEvent.pointerDown(surface, { clientX: 84 })
    expect(onScrub).toHaveBeenLastCalledWith(1.2)
    fireEvent.pointerMove(surface, { clientX: 94 })
    expect(onScrub).toHaveBeenLastCalledWith(2.2)
    fireEvent.pointerUp(surface)
    fireEvent.pointerMove(surface, { clientX: 104 })
    expect(onScrub).toHaveBeenCalledTimes(2)
    fireEvent.pointerDown(surface, { clientX: 84 })
    fireEvent.pointerCancel(surface)
    fireEvent.pointerLeave(surface)
    expect(onScrub).toHaveBeenCalledTimes(3)
  })

  it('clamps a scrub past the end of the timeline', () => {
    const onScrub = vi.fn()
    const { container } = render(<VideoTimeline {...props({ onScrub, pxPerSecond: 10, total: 4 })} />)
    fireEvent.pointerDown(inner(container), { clientX: 1000 })
    expect(onScrub).toHaveBeenCalledWith(4)
  })
})
