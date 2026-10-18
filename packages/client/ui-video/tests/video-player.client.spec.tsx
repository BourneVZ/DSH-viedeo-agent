// @vitest-environment jsdom
/**
 * The player's visual surface: the rendered `.mp4` with its own clock, and the
 * unrendered shot player's active still and subtitle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { VideoPlayer, type VideoPlayerProps } from '../src/client/VideoPlayer.tsx'
import { buildSegments } from '../src/client/timeline.ts'
import { zh } from '../src/client/locales.ts'
import { mediaUrl, project, shot } from './fixtures.ts'

const t: VideoPlayerProps['t'] = makeTranslate(zh)
const origin = window.location.origin

afterEach(() => {
  cleanup()
})

/** Player props over one project at a playhead position. */
function props(over: Partial<VideoPlayerProps> & { project: VideoPlayerProps['project'] }): VideoPlayerProps {
  return {
    segments: buildSegments(over.project.shots),
    time: 0,
    origin,
    t,
    videoRef: createRef<HTMLVideoElement>(),
    onTime: vi.fn(),
    ...over,
  }
}

describe('VideoPlayer', () => {
  it('plays the newest render through the media route', () => {
    const onTime = vi.fn()
    const { container } = render(<VideoPlayer {...props({
      project: project({ hasRender: true, render: '/work/demo/out.mp4' }), onTime,
    })} />)
    const video = container.querySelector('video')
    if (video === null) throw new Error('no rendered video')
    expect(video.getAttribute('src')).toBe(mediaUrl('/work/demo/out.mp4'))
    expect(video.getAttribute('aria-label')).toBe(zh['preview.videoAria'])
    fireEvent.timeUpdate(video)
    expect(onTime).toHaveBeenCalledWith(0)
  })

  it('shows the active shot still and narration before a render', () => {
    render(<VideoPlayer {...props({
      project: project({ shots: [shot({ image: '/work/demo/i.png' })] }),
    })} />)
    expect(screen.getByAltText('A title card').getAttribute('src')).toBe(mediaUrl('/work/demo/i.png'))
    expect(screen.getByLabelText(zh['preview.subtitleAria']).textContent).toBe('Welcome.')
  })

  it('follows the playhead into a later shot', () => {
    render(<VideoPlayer {...props({
      project: project({
        shots: [shot({ duration: 2, image: '/a.png' }), shot({ id: 'shot-2', index: 1, duration: 2, description: 'Second', narration: 'Later.', image: '/b.png' })],
      }),
      time: 3,
    })} />)
    expect(screen.getByAltText('Second').getAttribute('src')).toBe(mediaUrl('/b.png'))
    expect(screen.getByLabelText(zh['preview.subtitleAria']).textContent).toBe('Later.')
  })

  it('says so when the active shot has no visual asset', () => {
    render(<VideoPlayer {...props({ project: project() })} />)
    expect(screen.getByText(zh['preview.thumbnailMissing'])).toBeTruthy()
  })

  it('shows an empty stage when the project has no shots', () => {
    render(<VideoPlayer {...props({ project: project({ shots: [] }) })} />)
    expect(screen.getByText(zh['preview.thumbnailMissing'])).toBeTruthy()
    expect(screen.getByLabelText(zh['preview.subtitleAria']).textContent).toBe('')
  })
})
