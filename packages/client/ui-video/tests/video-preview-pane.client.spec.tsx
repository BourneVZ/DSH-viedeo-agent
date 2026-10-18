// @vitest-environment jsdom
/**
 * The preview pane: its empty and failure states, the script/preview toggle,
 * the formatted script and the player it switches between, the virtual clock
 * that advances the unrendered shot player, the zoom, and the wiring of the
 * roster actions into the timeline.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { VideoPreviewPane, type VideoPreviewPaneProps } from '../src/client/VideoPreviewPane.tsx'
import type { VideoProjectsState } from '../src/client/video-store.ts'
import { zh } from '../src/client/locales.ts'
import { mediaUrl, project, shot } from './fixtures.ts'

const t: VideoPreviewPaneProps['t'] = makeTranslate(zh)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Pane props over a fixed roster snapshot. */
function props(state: Partial<VideoProjectsState>, over: Partial<VideoPreviewPaneProps> = {}): VideoPreviewPaneProps {
  const snapshot: VideoProjectsState = {
    listStatus: 'ready', projects: [], listError: null, selected: null,
    detailStatus: 'idle', project: null, detailError: null, viewMode: 'script', peaks: {},
    ...state,
  }
  function useVideoProjects<S>(select: (s: VideoProjectsState) => S): S {
    return select(snapshot)
  }
  return { useVideoProjects, setViewMode: vi.fn(), ensurePeaks: vi.fn(), t, ...over } as unknown as VideoPreviewPaneProps
}

/** The scrub surface, by its accessible name. */
function scrub(container: HTMLElement): Element {
  const found = container.querySelector(`[aria-label="${zh['timeline.scrubAria']}"]`)
  if (found === null) throw new Error('no scrub surface')
  return found
}

describe('VideoPreviewPane', () => {
  it('invites a selection while nothing is chosen', () => {
    render(<VideoPreviewPane {...props({})} />)
    expect(screen.getByText(zh['preview.empty'])).toBeTruthy()
  })

  it('reports a detail failure with the transport message', () => {
    render(<VideoPreviewPane {...props({ detailStatus: 'error', detailError: 'gone' })} />)
    expect(screen.getByRole('alert').textContent).toBe('gone')
  })

  it('falls back to its own failure copy when the transport gave none', () => {
    render(<VideoPreviewPane {...props({ detailStatus: 'error' })} />)
    expect(screen.getByRole('alert').textContent).toBe(zh['preview.error'])
  })

  it('switches view through the toggle', () => {
    const setViewMode = vi.fn()
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready', project: project(),
    }, { setViewMode })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['preview.toggle.preview'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['preview.toggle.script'] }))
    expect(setViewMode).toHaveBeenCalledWith('preview')
    expect(setViewMode).toHaveBeenCalledWith('script')
  })

  it('marks the active view on the toggle', () => {
    render(<VideoPreviewPane {...props({ detailStatus: 'ready', project: project(), viewMode: 'preview' })} />)
    expect(screen.getByRole('button', { name: zh['preview.toggle.preview'] }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: zh['preview.toggle.script'] }).getAttribute('aria-pressed')).toBe('false')
  })

  it('renders the formatted script in script mode', () => {
    render(<VideoPreviewPane {...props({ detailStatus: 'ready', project: project(), viewMode: 'script' })} />)
    expect(screen.getByRole('list', { name: zh['preview.scriptShots'] })).toBeTruthy()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('renders the shot player and timeline in preview mode', () => {
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready', project: project({ shots: [shot({ duration: 4 })] }), viewMode: 'preview',
    })} />)
    expect(screen.getByRole('timer')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['preview.play'] })).toBeTruthy()
    expect(screen.getByText(zh['timeline.audioTrack'])).toBeTruthy()
  })

  it('plays the rendered video and hides the shot transport', () => {
    const { container } = render(<VideoPreviewPane {...props({
      detailStatus: 'ready',
      project: project({ hasRender: true, render: '/work/demo/out.mp4' }),
      viewMode: 'preview',
    })} />)
    expect(container.querySelector('video')?.getAttribute('src')).toBe(mediaUrl('/work/demo/out.mp4'))
    expect(screen.queryByRole('button', { name: zh['preview.play'] })).toBeNull()
  })

  it('advances the virtual clock while the shot player plays', async () => {
    vi.useFakeTimers()
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready', project: project({ shots: [shot({ duration: 4 })] }), viewMode: 'preview',
    })} />)
    expect(screen.getByRole('timer').textContent).toBe('00:00')
    fireEvent.click(screen.getByRole('button', { name: zh['preview.play'] }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(screen.getByRole('timer').textContent).toBe('00:01')
  })

  it('wraps the virtual clock back to zero at the end of the shots', async () => {
    vi.useFakeTimers()
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready', project: project({ shots: [shot({ duration: 2 })] }), viewMode: 'preview',
    })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['preview.play'] }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(screen.getByRole('timer').textContent).toBe('00:01')
    await vi.advanceTimersByTimeAsync(600)
    expect(screen.getByRole('timer').textContent).toBe('00:00')
  })

  it('scales the tracks through the zoom control', () => {
    const { container } = render(<VideoPreviewPane {...props({
      detailStatus: 'ready', project: project({ shots: [shot({ duration: 4 })] }), viewMode: 'preview',
    })} />)
    const surface = scrub(container) as HTMLElement
    expect(surface.style.width).toBe(`${72 + 4 * 40}px`)
    fireEvent.click(screen.getByRole('button', { name: zh['timeline.zoomIn'] }))
    expect(surface.style.width).toBe(`${72 + 4 * 60}px`)
  })

  it('shrinks the tracks through the zoom-out control', () => {
    const { container } = render(<VideoPreviewPane {...props({
      detailStatus: 'ready', project: project({ shots: [shot({ duration: 4 })] }), viewMode: 'preview',
    })} />)
    const surface = scrub(container) as HTMLElement
    fireEvent.click(screen.getByRole('button', { name: zh['timeline.zoomOut'] }))
    expect(surface.style.width).toBe(`${72 + 4 * (40 / 1.5)}px`)
  })

  it('moves the playhead when the timeline is scrubbed', () => {
    const { container } = render(<VideoPreviewPane {...props({
      detailStatus: 'ready', project: project({ shots: [shot({ duration: 4 })] }), viewMode: 'preview',
    })} />)
    // jsdom reports a zero origin, so 72px of gutter plus two seconds at 40px/s
    // lands the drag at the two-second mark.
    fireEvent.pointerDown(scrub(container), { clientX: 72 + 2 * 40 })
    expect(screen.getByRole('timer').textContent).toBe('00:02')
  })

  it('forwards a shot audio to the roster waveform cache', () => {
    const ensurePeaks = vi.fn()
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready',
      project: project({ shots: [shot({ duration: 4, audio: '/work/demo/a.wav' })] }),
      viewMode: 'preview',
    }, { ensurePeaks })} />)
    expect(ensurePeaks).toHaveBeenCalledWith('/work/demo/a.wav', mediaUrl('/work/demo/a.wav'))
  })
})
