// @vitest-environment jsdom
/**
 * The producing-session card: what it offers, when it stays hidden, and the one
 * click that switches the conversation pane.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { VideoSessionBanner, type VideoSessionBannerProps } from '../src/client/VideoSessionBanner.tsx'
import type { VideoProjectsState } from '../src/client/video-store.ts'
import { zh } from '../src/client/locales.ts'

/** The session the roster controller matched. */
const MATCH = 'sess-1' as SessionId

/** The session the conversation pane currently shows. */
const CURRENT = 'sess-current' as SessionId

const t: VideoSessionBannerProps['t'] = makeTranslate(zh)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * Card props over a fixed roster snapshot and session list.
 * @param state - roster state overrides; the match defaults to {@link MATCH}.
 * @param over - prop overrides, the current session id among them.
 * @returns props the renderer would hand the card.
 */
function props(
  state: Partial<VideoProjectsState> = {},
  over: Partial<Pick<VideoSessionBannerProps, 'sessionId' | 'openSession'>> = {},
): VideoSessionBannerProps {
  const snapshot = { sessionMatch: MATCH, ...state } as VideoProjectsState
  function useVideoProjects<S>(select: (s: VideoProjectsState) => S): S {
    return select(snapshot)
  }
  const sessions = { byId: { [MATCH]: { displayTitle: 'Transformer 是怎么工作的' } } }
  function useSessions<S>(select: (s: typeof sessions) => S): S {
    return select(sessions)
  }
  return {
    useVideoProjects,
    useSessions,
    sessionId: CURRENT,
    openSession: vi.fn(),
    t,
    ...over,
  } as unknown as VideoSessionBannerProps
}

/** The card's one action, by its visible label. */
function action(): HTMLElement {
  return screen.getByRole('button', { name: zh['session.open'] })
}

describe('VideoSessionBanner', () => {
  it('offers the matched session by its title', () => {
    render(<VideoSessionBanner {...props()} />)
    const text = zh['session.found'].replace('{title}', 'Transformer 是怎么工作的')
    expect(screen.getByText(text)).toBeTruthy()
    expect(action()).toBeTruthy()
  })

  it('switches to the matched session on one click', () => {
    const openSession = vi.fn()
    render(<VideoSessionBanner {...props({}, { openSession })} />)
    fireEvent.click(action())
    expect(openSession).toHaveBeenCalledWith(MATCH)
  })

  it('stays hidden while no session matched', () => {
    const { container } = render(<VideoSessionBanner {...props({ sessionMatch: null })} />)
    expect(container.firstChild).toBeNull()
  })

  it('stays hidden when the conversation already is the match', () => {
    const { container } = render(<VideoSessionBanner {...props({}, { sessionId: MATCH })} />)
    expect(container.firstChild).toBeNull()
  })

  it('offers a match the session list does not carry by its id', () => {
    render(<VideoSessionBanner {...props({ sessionMatch: 'unlisted' as SessionId })} />)
    expect(screen.getByText(zh['session.found'].replace('{title}', 'unlisted'))).toBeTruthy()
  })
})
