// @vitest-environment jsdom
/**
 * The video roster controller: reply validation at the wire boundary, the
 * same-origin transport, the media URL builder, and the poll that keeps the
 * panes and the producing-session match current.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { VideoProject, VideoProjectSummary, VideoShot } from '@deepseek-ai/dsh-host-video-project/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  browserJsonFetch, POLL_INTERVAL_MS, readProjectDetail, readProjectList, readProjectSession,
  videoMediaUrl, VideoProjectsController, WAVEFORM_BUCKETS, type VideoJsonFetch,
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

/** One resolved shot. */
const SHOT: VideoShot = {
  id: 'shot-1', index: 0, description: 'A title card', narration: 'Welcome.',
  duration: 4, visualType: 'html', audio: '/work/demo/a.wav',
}

/** The same project with one shot and no render: the script stage. */
const DETAIL: VideoProject = {
  ...SUMMARY,
  summary: 'A demo video',
  duration: 4,
  shots: [SHOT],
}

/** The same project once a render exists: the render stage. */
const RENDERED: VideoProject = { ...DETAIL, hasRender: true, render: '/work/demo/out.mp4' }

/** The same project with no shots yet: the empty stage. */
const EMPTY: VideoProject = { ...DETAIL, shots: [] }

/** The session the match route reports as the producer of {@link SUMMARY}. */
const SESSION = 'sess-1' as SessionId

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
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

  it('reads the matched session id', () => {
    expect(readProjectSession({ sessionId: SESSION })).toBe(SESSION)
  })

  it('reads a project no session references as no match', () => {
    expect(readProjectSession({ sessionId: null })).toBeNull()
  })

  it('rejects a match reply carrying no sessionId', () => {
    expect(() => readProjectSession({ error: 'unknown video project' }))
      .toThrow('video: /api/video/project-session answered without a sessionId')
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
  /** A transport answering the list, detail, and match routes from fixed documents. */
  function reader(detail: VideoProject = DETAIL, sessionId: string | null = SESSION): Mock<VideoJsonFetch> {
    return vi.fn<VideoJsonFetch>(async (path: string) => {
      if (path === '/api/video/projects') return { projects: [SUMMARY] }
      if (path.startsWith('/api/video/project-session')) return { sessionId }
      return { project: detail }
    })
  }

  /** A transport answering an empty roster, so no project auto-selects. */
  function emptyList(): Mock<VideoJsonFetch> {
    return vi.fn<VideoJsonFetch>(async () => ({ projects: [] }))
  }

  /** A transport that always fails with one thrown value. */
  function failing(thrown: unknown): Mock<VideoJsonFetch> {
    return vi.fn<VideoJsonFetch>(async () => { throw thrown })
  }

  it('reads the list once at start and again per interval', async () => {
    const read = emptyList()
    const controller = new VideoProjectsController(read)
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot()).toMatchObject({
      listStatus: 'ready', projects: [], listError: null,
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

  it('auto-selects the newest project when none is chosen', async () => {
    const controller = new VideoProjectsController(reader())
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot()).toMatchObject({
      selected: '/work/demo', detailStatus: 'ready', project: DETAIL,
    })
    stop()
  })

  it('leaves an existing selection alone while polling', async () => {
    const controller = new VideoProjectsController(reader())
    await controller.select('/work/other')
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot().selected).toBe('/work/other')
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
      selected: null, detailStatus: 'idle', project: null, detailError: null, sessionMatch: null,
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

  it('shows the script for a project short of a render', async () => {
    const controller = new VideoProjectsController(reader())
    await controller.select('/work/demo')
    expect(controller.store.getSnapshot().viewMode).toBe('script')
  })

  it('shows the script for a project with no shots yet', async () => {
    const controller = new VideoProjectsController(reader(EMPTY))
    await controller.select('/work/demo')
    expect(controller.store.getSnapshot().viewMode).toBe('script')
  })

  it('switches to the player when a render appears', async () => {
    let rendered = false
    const read = vi.fn<VideoJsonFetch>(async (path: string) =>
      path === '/api/video/projects'
        ? { projects: [SUMMARY] }
        : { project: rendered ? RENDERED : DETAIL })
    const controller = new VideoProjectsController(read)
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot().viewMode).toBe('script')
    rendered = true
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(controller.store.getSnapshot().viewMode).toBe('preview')
    stop()
  })

  it('keeps a manual toggle until the stage changes', async () => {
    const controller = new VideoProjectsController(reader())
    await controller.select('/work/demo')
    controller.setViewMode('preview')
    const stop = controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.store.getSnapshot().viewMode).toBe('preview')
    stop()
  })

  describe('producing session', () => {
    /** The match-route calls one transport made. */
    function probes(read: Mock<VideoJsonFetch>) {
      return read.mock.calls.filter(([path]) => path.startsWith('/api/video/project-session'))
    }

    it('publishes the session the host matched for the selection', async () => {
      const read = reader()
      const controller = new VideoProjectsController(read)
      await controller.select('/work/demo')
      expect(read).toHaveBeenCalledWith(
        '/api/video/project-session?path=%2Fwork%2Fdemo', expect.any(AbortSignal))
      expect(controller.store.getSnapshot().sessionMatch).toBe(SESSION)
    })

    it('publishes the match for the project the first poll auto-selects', async () => {
      const controller = new VideoProjectsController(reader())
      const stop = controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.store.getSnapshot().sessionMatch).toBe(SESSION)
      stop()
    })

    it('asks again while no session matched, and stops once one answers', async () => {
      let matched: string | null = null
      const read = vi.fn<VideoJsonFetch>(async (path: string) => {
        if (path === '/api/video/projects') return { projects: [SUMMARY] }
        if (path.startsWith('/api/video/project-session')) {
          const answer = matched
          matched = SESSION
          return { sessionId: answer }
        }
        return { project: DETAIL }
      })
      const controller = new VideoProjectsController(read)
      const stop = controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.store.getSnapshot().sessionMatch).toBeNull()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
      expect(controller.store.getSnapshot().sessionMatch).toBe(SESSION)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
      expect(probes(read)).toHaveLength(2)
      stop()
    })

    it('drops an answer whose project stopped being selected', async () => {
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => { release = resolve })
      const read = vi.fn<VideoJsonFetch>(async (path: string) => {
        if (path === '/api/video/projects') return { projects: [] }
        if (path.startsWith('/api/video/project-session')) {
          await gate
          return { sessionId: path.endsWith('%2Fa') ? 'sess-a' : 'sess-b' }
        }
        return { project: DETAIL }
      })
      const controller = new VideoProjectsController(read)
      const first = controller.select('/a')
      const second = controller.select('/b')
      release()
      await Promise.all([first, second])
      expect(controller.store.getSnapshot().sessionMatch).toBe('sess-b')
    })

    it('leaves the match unknown when the probe fails', async () => {
      const controller = new VideoProjectsController(failing(new Error('offline')))
      await controller.select('/work/demo')
      expect(controller.store.getSnapshot()).toMatchObject({
        sessionMatch: null, detailStatus: 'error', detailError: 'offline',
      })
    })

    it('clears the match when the video pane unmounts', async () => {
      const controller = new VideoProjectsController(reader())
      await controller.select('/work/demo')
      expect(controller.store.getSnapshot().sessionMatch).toBe(SESSION)
      const stop = controller.start()
      stop()
      expect(controller.store.getSnapshot().sessionMatch).toBeNull()
    })
  })

  describe('waveform peaks', () => {
    /** An AudioContext stub decoding to one fixed channel. */
    function stubDecode(channel: ArrayLike<number>): void {
      class FakeAudioContext {
        decodeAudioData = async () => ({ getChannelData: () => channel }) as unknown as AudioBuffer
        close = async () => {}
      }
      vi.stubGlobal('AudioContext', FakeAudioContext)
    }

    /** A fetch stub answering one decodable body. */
    function stubFetchOk(): Mock {
      const fetchMock = vi.fn(async () =>
        ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) }))
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    it('decodes and caches one shot waveform', async () => {
      stubDecode([0.2, -0.8])
      const fetchMock = stubFetchOk()
      const controller = new VideoProjectsController(reader())
      await controller.ensurePeaks('/work/demo/a.wav', '/api/video/media?path=a.wav')
      const peaks = controller.store.getSnapshot().peaks['/work/demo/a.wav']
      expect(peaks).toHaveLength(WAVEFORM_BUCKETS)
      expect(peaks).toContain(0.8)
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('does not re-decode a cached waveform', async () => {
      stubDecode([0.5])
      const fetchMock = stubFetchOk()
      const controller = new VideoProjectsController(reader())
      await controller.ensurePeaks('/k', '/u')
      await controller.ensurePeaks('/k', '/u')
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('does not stack a decode already in flight', async () => {
      stubDecode([0.5])
      let release: () => void = () => {}
      const gate = new Promise<unknown>((resolve) => {
        release = () => { resolve({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) }) }
      })
      const fetchMock = vi.fn(() => gate)
      vi.stubGlobal('fetch', fetchMock)
      const controller = new VideoProjectsController(reader())
      const both = Promise.all([controller.ensurePeaks('/k', '/u'), controller.ensurePeaks('/k', '/u')])
      release()
      await both
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('caches an empty peak set when the decode fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })))
      const controller = new VideoProjectsController(reader())
      await controller.ensurePeaks('/k', '/u')
      expect(controller.store.getSnapshot().peaks['/k']).toEqual([])
    })
  })
})
