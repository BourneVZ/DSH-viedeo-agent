// @vitest-environment jsdom
/**
 * The video project roster pane: its four list states, the row's badges and
 * age label, and the poll lifetime bound to the pane's own mount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { VideoProjectSummary } from '@deepseek-ai/dsh-host-video-project/types'
import { VideoProjectsPane, type VideoProjectsPaneProps } from '../src/client/VideoProjectsPane.tsx'
import type { VideoProjectsState } from '../src/client/video-store.ts'
import { zh } from '../src/client/locales.ts'

/** Pinned clock: the rows' age labels are relative to it. */
const NOW = 1_700_000_000_000

const t: VideoProjectsPaneProps['t'] = makeTranslate(zh)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** One project row as the list route reports it. */
function summary(over: Partial<VideoProjectSummary> = {}): VideoProjectSummary {
  return {
    path: '/work/demo',
    name: 'demo',
    title: 'Demo',
    updatedAt: NOW - 5 * 60_000,
    shotCount: 3,
    hasRender: false,
    ...over,
  }
}

/** Component props over a fixed snapshot. */
function props(
  state: Partial<VideoProjectsState>,
  over: Partial<Pick<VideoProjectsPaneProps, 'start' | 'select'>> = {},
): VideoProjectsPaneProps {
  const snapshot: VideoProjectsState = {
    listStatus: 'ready',
    projects: [],
    listError: null,
    selected: null,
    detailStatus: 'idle',
    project: null,
    detailError: null,
    viewMode: 'script',
    peaks: {},
    sessionMatch: null,
    ...state,
  }
  function useVideoProjects<S>(select: (s: VideoProjectsState) => S): S {
    return select(snapshot)
  }
  return {
    useVideoProjects,
    start: () => () => {},
    select: () => {},
    t,
    ...over,
  } as unknown as VideoProjectsPaneProps
}

/** The roster list, once rendered. */
function list(): HTMLElement {
  return screen.getByRole('list', { name: zh['projects.listAria'] })
}

/** One row's flattened text, which is how its cells read without jest-dom. */
function rowText(rows: readonly HTMLElement[], index: number): string {
  const row = rows[index]
  if (row === undefined) throw new Error(`no roster row at ${index}`)
  return (row.textContent ?? '').replace(/\s+/g, ' ')
}

describe('VideoProjectsPane', () => {
  it('renders one selectable row per project', () => {
    render(<VideoProjectsPane {...props({
      projects: [summary(), summary({ path: '/work/other', title: 'Other' })],
    })} />)
    const rows = within(list()).getAllByRole('button')
    expect(rows).toHaveLength(2)
    expect(rowText(rows, 0)).toContain('Demo')
    expect(rowText(rows, 0)).toContain(zh['projects.shots'].replace('{count}', '3'))
    expect(rowText(rows, 0)).toContain(zh['projects.updated.minutes'].replace('{n}', '5'))
    expect(rowText(rows, 1)).toContain('Other')
  })

  it('marks the selected row and reports a click', () => {
    const select = vi.fn()
    render(<VideoProjectsPane {...props({ projects: [summary()], selected: '/work/demo' }, { select })} />)
    const row = within(list()).getByRole('button')
    expect(row.getAttribute('aria-current')).toBe('true')
    fireEvent.click(row)
    expect(select).toHaveBeenCalledWith('/work/demo')
  })

  it('leaves an unselected row unmarked', () => {
    render(<VideoProjectsPane {...props({ projects: [summary()] })} />)
    expect(within(list()).getByRole('button').getAttribute('aria-current')).toBeNull()
  })

  it('badges a rendered project and one whose script did not parse', () => {
    render(<VideoProjectsPane {...props({
      projects: [
        summary({ path: '/work/rendered', hasRender: true }),
        summary({ path: '/work/broken', error: 'unexpected token' }),
      ],
    })} />)
    const rows = within(list()).getAllByRole('button')
    expect(rowText(rows, 0)).toContain(zh['projects.rendered'])
    expect(rowText(rows, 1)).toContain(zh['projects.broken'])
  })

  it('labels a project directory with its own path', () => {
    render(<VideoProjectsPane {...props({ projects: [summary()] })} />)
    expect(within(list()).getByRole('button').getAttribute('title')).toBe('/work/demo')
  })

  it('buckets every age the shared relative-time helper produces', () => {
    const ages = [
      [NOW, zh['projects.updated.now']],
      [NOW - 2 * 60_000, zh['projects.updated.minutes'].replace('{n}', '2')],
      [NOW - 3 * 3_600_000, zh['projects.updated.hours'].replace('{n}', '3')],
      [NOW - 4 * 86_400_000, zh['projects.updated.days'].replace('{n}', '4')],
      [NOW - 5 * 30 * 86_400_000, zh['projects.updated.months'].replace('{n}', '5')],
      [NOW - 2 * 365 * 86_400_000, zh['projects.updated.years'].replace('{n}', '2')],
    ] as const
    render(<VideoProjectsPane {...props({
      projects: ages.map(([updatedAt], index) => summary({ path: `/work/${index}`, updatedAt })),
    })} />)
    const rows = within(list()).getAllByRole('button')
    ages.forEach(([, label], index) => {
      expect(rowText(rows, index)).toContain(label)
    })
  })

  it('explains an empty roster once the list answered', () => {
    render(<VideoProjectsPane {...props({})} />)
    expect(screen.getByText(zh['projects.empty'])).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('reports a list failure with the transport message', () => {
    render(<VideoProjectsPane {...props({ listStatus: 'error', listError: 'offline' })} />)
    expect(screen.getByRole('alert').textContent).toBe('offline')
  })

  it('falls back to its own failure copy when the transport gave none', () => {
    render(<VideoProjectsPane {...props({ listStatus: 'error' })} />)
    expect(screen.getByRole('alert').textContent).toBe(zh['projects.error'])
  })

  it('shows neither the roster nor the empty hint while the first read is in flight', () => {
    render(<VideoProjectsPane {...props({ listStatus: 'loading' })} />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText(zh['projects.empty'])).toBeNull()
  })

  it('polls for as long as it is mounted', () => {
    const stop = vi.fn()
    const start = vi.fn(() => stop)
    const view = render(<VideoProjectsPane {...props({}, { start })} />)
    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).not.toHaveBeenCalled()
    act(() => { view.unmount() })
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
