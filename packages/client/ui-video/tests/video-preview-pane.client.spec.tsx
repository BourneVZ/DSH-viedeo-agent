// @vitest-environment jsdom
/**
 * The video preview pane: its empty and failure states, the rendered project's
 * player, and the shot sequence an unrendered project shows in its place.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { VideoProject, VideoShot } from '@deepseek-ai/dsh-host-video-project/types'
import { VideoPreviewPane, type VideoPreviewPaneProps } from '../src/client/VideoPreviewPane.tsx'
import type { VideoProjectsState } from '../src/client/video-store.ts'
import { zh } from '../src/client/locales.ts'

const t: VideoPreviewPaneProps['t'] = makeTranslate(zh)

afterEach(() => {
  cleanup()
})

/** One resolved shot as the detail route reports it. */
function shot(over: Partial<VideoShot> = {}): VideoShot {
  return {
    id: 'shot-1',
    index: 0,
    description: 'A title card',
    narration: 'Welcome.',
    duration: 3.4,
    visualType: 'html',
    ...over,
  }
}

/** One project with its shot timeline. */
function project(over: Partial<VideoProject> = {}): VideoProject {
  return {
    path: '/work/demo',
    name: 'demo',
    title: 'Demo',
    updatedAt: 1_700_000_000_000,
    shotCount: 1,
    hasRender: false,
    summary: 'A demo video',
    duration: 3.4,
    shots: [shot()],
    ...over,
  }
}

/** Component props over a fixed snapshot. */
function props(state: Partial<VideoProjectsState>): VideoPreviewPaneProps {
  const snapshot: VideoProjectsState = {
    listStatus: 'ready',
    projects: [],
    listError: null,
    selected: null,
    detailStatus: 'idle',
    project: null,
    detailError: null,
    ...state,
  }
  function useVideoProjects<S>(select: (s: VideoProjectsState) => S): S {
    return select(snapshot)
  }
  return { useVideoProjects, t } as unknown as VideoPreviewPaneProps
}

/** The media URL the pane builds for one host path. */
function mediaUrl(path: string): string {
  return `${window.location.origin}/api/video/media?path=${encodeURIComponent(path)}`
}

/** The shot sequence, once rendered. */
function shots(): HTMLElement {
  return screen.getByRole('list', { name: zh['preview.shotsAria'] })
}

/** One shot cell's flattened text, which is how its parts read without jest-dom. */
function shotText(rows: readonly HTMLElement[], index: number): string {
  const row = rows[index]
  if (row === undefined) throw new Error(`no shot cell at ${index}`)
  return (row.textContent ?? '').replace(/\s+/g, ' ')
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

  it('plays the newest render through the media route', () => {
    const { container } = render(<VideoPreviewPane {...props({
      detailStatus: 'ready',
      project: project({ hasRender: true, render: '/work/demo/out.mp4' }),
    })} />)
    const player = container.querySelector('video')
    expect(player?.getAttribute('src')).toBe(mediaUrl('/work/demo/out.mp4'))
    expect(player?.getAttribute('aria-label')).toBe(zh['preview.videoAria'])
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('heads the pane with the declared title, summary, and total duration', () => {
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready',
      project: project({ duration: 10 }),
    })} />)
    expect(screen.getByRole('heading').textContent).toBe('Demo')
    expect(screen.getByText('A demo video', { exact: false })).toBeTruthy()
    expect(screen.getByText(zh['preview.duration'].replace('{seconds}', '10'))).toBeTruthy()
  })

  it('explains an unrendered project before its shot sequence', () => {
    render(<VideoPreviewPane {...props({ detailStatus: 'ready', project: project() })} />)
    expect(screen.getByText(zh['preview.unrendered'])).toBeTruthy()
  })

  it('shows each shot through its timeline thumbnail', () => {
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready',
      project: project({ shots: [shot({ thumbnail: '/work/demo/t.png', image: '/work/demo/i.png' })] }),
    })} />)
    expect(screen.getByAltText('A title card').getAttribute('src')).toBe(mediaUrl('/work/demo/t.png'))
  })

  it('falls back to the generated image when no thumbnail exists', () => {
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready',
      project: project({ shots: [shot({ image: '/work/demo/i.png' })] }),
    })} />)
    expect(screen.getByAltText('A title card').getAttribute('src')).toBe(mediaUrl('/work/demo/i.png'))
  })

  it('says so when a shot has no visual asset yet', () => {
    render(<VideoPreviewPane {...props({ detailStatus: 'ready', project: project() })} />)
    expect(screen.getByText(zh['preview.thumbnailMissing'])).toBeTruthy()
    expect(screen.queryByAltText('A title card')).toBeNull()
  })

  it('numbers each shot and labels its visual kind, duration, and narration', () => {
    render(<VideoPreviewPane {...props({
      detailStatus: 'ready',
      project: project({
        shots: [
          shot(),
          shot({ id: 'shot-2', index: 1, visualType: 'image', duration: 0 }),
          shot({ id: 'shot-3', index: 2, visualType: 'unknown' }),
        ],
      }),
    })} />)
    const rows = within(shots()).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    const first = shotText(rows, 0)
    expect(first).toContain(zh['preview.shotIndex'].replace('{index}', '1'))
    expect(first).toContain(zh['preview.visual.html'])
    expect(first).toContain(zh['preview.duration'].replace('{seconds}', '3'))
    expect(first).toContain(zh['preview.narration'])
    expect(first).toContain('Welcome.')
    const second = shotText(rows, 1)
    expect(second).toContain(zh['preview.visual.image'])
    expect(second).toContain(zh['preview.duration'].replace('{seconds}', '0'))
    expect(shotText(rows, 2)).toContain(zh['preview.visual.unknown'])
  })
})
