// @vitest-environment jsdom
/**
 * The video roster controller: reply validation at the wire boundary, the
 * same-origin transport, the media URL builder, and the poll that keeps the
 * two panes current.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { VideoProject, VideoProjectSummary } from '@deepseek-ai/dsh-host-video-project/types'
import {
  browserJsonFetch, POLL_INTERVAL_MS, readProjectDetail, readProjectList, videoMediaUrl,
  VideoProjectsController, type VideoJsonFetch,
} from '../src/client/video-store.ts'

/** One discovered project as the list route reports it. */
const SUMMARY: VideoProjectSummary = {
  path: '/work/demo',
  name: 'demo',
  title: 'Demo',
  updatedAt: 1_700_000_000_000,
  shotCount: 2,
  hasRender: false,
}

/** The same project with its resolved shot timeline. */
const DETAIL: VideoProject = {
  ...SUMMARY,
  summary: 'A demo video',
  duration: 4,
  shots: [],
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.useFakeTimers()
})

describe('videoMediaUrl', () => {
  it('encodes the host path into the media route query', () => {
    expect(videoMediaUrl('http://localhost:5173', '/work/a b.mp4'))
      .toBe('http://localhost:5173/api/video/media?path=%2Fwork%2Fa%20b.mp4')
  })
})

describe('reply validation', () => {
  it('reads the projects array', () => {
    expect(readProjectList({ projects: [SUMMARY] })).toEqual([SUMMARY])
  })

  it('rejects a reply that is not a JSON object', () => {
    expect(() => readProjectList('nope')).toThrow('video: reply is not a JSON object (wanted projects)')
  })

  it('rejects a reply carrying no projects array', () => {
    expect(() => readProjectList({ error: 'unknown video project' }))
      .toThrow('video: /api/video/projects answered without a projects array')
  })

  it('reads the project object', () => {
    expect(readProjectDetail({ project: DETAIL })).toEqual(DETAIL)
  })

  it('rejects a detail reply carrying no project object', () => {
    expect(() => readProjectDetail({ error: 'missing path' }))
      .toThrow('video: /api/video/project answered without a project object')
  })
})

describe('browserJsonFetch', () => {
  it('reads a same-origin JSON document', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ projects: [SUMMARY] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(browserJsonFetch('/api/video/projects', new AbortController().signal))
      .resolves.toEqual({ projects: [SUMMARY] })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${window.location.origin}/api/video/projects`)
    expect(init.credentials).toBe('same-origin')
    vi.unstubAllGlobals()
  })

  it('reports the status of a failed route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })))
    await expect(browserJsonFetch('/api/video/projects', new AbortController().signal))
      .rejects.toThrow('video: /api/video/projects answered 502')
    vi.unstubAllGlobals()
  })
})

describe('VideoProjectsController', () => {
  /** A transport answering both routes from fixed documents. */
  function reader(): Mock<VideoJsonFetch> {
    return vi.fn<VideoJsonFetch>(async (path: string) =>
      path === '/api/video/projects' ? { projects: [SUMMARY] } : { project: DETAIL })
  }

  /** A transport that always fails with one thrown value. */
  function failing(thrown: unknown): Mock<VideoJsonFetch> {
    return vi.fn<VideoJsonFetch>(async () => { throw thrown })
  }

  it('reads the list once at start and again per interval', async () => {
    const read = reader()
    const controller = new VideoProjectsController(read)
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot()).toMatchObject({
      listStatus: 'ready', projects: [SUMMARY], listError: null,
    })
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(read).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not stack a poll on one still in flight', async () => {
    let release: (body: unknown) => void = () => {}
    const gate = new Promise<unknown>((resolve) => { release = resolve })
    const read = vi.fn().mockReturnValueOnce(gate)
    const controller = new VideoProjectsController(read)
    const stop = controller.start()
    // The interval fires while the first read is still awaiting its reply.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(read).toHaveBeenCalledTimes(1)
    release({ projects: [] })
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot().listStatus).toBe('ready')
    stop()
  })

  it('reports a list failure on the snapshot', async () => {
    const controller = new VideoProjectsController(failing(new Error('offline')))
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot()).toMatchObject({
      listStatus: 'error', listError: 'offline', projects: [],
    })
    stop()
  })

  it('reports a thrown non-Error by its string form', async () => {
    const controller = new VideoProjectsController(failing('boom'))
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot().listError).toBe('boom')
    stop()
  })

  it('reads the selected project and keeps polling it', async () => {
    const read = reader()
    const controller = new VideoProjectsController(read)
    await controller.select('/work/demo')
    expect(controller.store.getSnapshot()).toMatchObject({
      selected: '/work/demo', detailStatus: 'ready', project: DETAIL, detailError: null,
    })
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(read).toHaveBeenLastCalledWith('/api/video/project?path=%2Fwork%2Fdemo', expect.any(AbortSignal))
    stop()
  })

  it('reports a detail failure on the snapshot', async () => {
    const controller = new VideoProjectsController(
      failing(new Error('unknown video project')))
    await controller.select('/gone')
    expect(controller.store.getSnapshot()).toMatchObject({
      detailStatus: 'error', detailError: 'unknown video project', project: null,
    })
  })

  it('clears the preview when the selection is dropped', async () => {
    const controller = new VideoProjectsController(reader())
    await controller.select('/work/demo')
    await controller.select(null)
    expect(controller.store.getSnapshot()).toMatchObject({
      selected: null, detailStatus: 'idle', project: null, detailError: null,
    })
  })

  it('ignores a repeat of the current selection', async () => {
    const read = reader()
    const controller = new VideoProjectsController(read)
    await controller.select('/work/demo')
    const calls = read.mock.calls.length
    await controller.select('/work/demo')
    expect(read).toHaveBeenCalledTimes(calls)
  })
})
