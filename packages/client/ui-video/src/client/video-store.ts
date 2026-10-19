/**
 * Video-project roster controller: the project list, the selected project's
 * resolved shot timeline, the session that produced it, and the poll that keeps
 * all three current while an agent works.
 *
 * The data arrives over this package's own host half (`/api/video/*`), which
 * the connection layer has already authenticated for the browser, so a
 * same-origin `fetch` is the whole transport — no Remote namespace and no
 * forwarded event announces a changed `script.json`. That is why the pane
 * polls: an agent writing shots, narration audio, and a render into the
 * project directory changes what these routes answer without touching
 * anything the browser is told about.
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { VideoProject, VideoProjectSummary } from '@deepseek-ai/dsh-host-video-project/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { decodePeaks } from './waveform.ts'

/** Milliseconds between two roster polls while a video pane is mounted. */
export const POLL_INTERVAL_MS = 5_000

/** Amplitude peaks decoded per shot for the audio track's waveform. */
export const WAVEFORM_BUCKETS = 64

/** Which surface the preview pane shows: the formatted script or the player. */
export type VideoViewMode = 'script' | 'preview'

/** How far the selected project has progressed, driving the auto view switch. */
type VideoStage = 'empty' | 'script' | 'render'


/**
 * Read one JSON document from an authenticated same-origin route.
 * @param path - request path including its query, rooted at `/api/video`.
 * @param signal - aborts the request when the reading pane unmounts.
 * @returns the decoded body.
 */
export type VideoJsonFetch = (path: string, signal: AbortSignal) => Promise<unknown>

/** Roster, detail, and producing-session snapshot the video panes render. */
export interface VideoProjectsState {
  /** List-load phase; `idle` until the first poll answers. */
  listStatus: 'idle' | 'loading' | 'ready' | 'error'
  /** Discovered projects, most recently modified first. */
  projects: readonly VideoProjectSummary[]
  /** Why the list could not be read, absent when it could. */
  listError: string | null
  /** Absolute project path the preview pane shows, or null for none. */
  selected: string | null
  /** Detail-load phase of the selected project. */
  detailStatus: 'idle' | 'loading' | 'ready' | 'error'
  /** The selected project with its resolved shots, or null. */
  project: VideoProject | null
  /** Why the detail could not be read, absent when it could. */
  detailError: string | null
  /** Which surface the preview pane shows; the stage auto-switches it. */
  viewMode: VideoViewMode
  /** Decoded waveform peaks keyed by the audio's absolute host path. */
  peaks: Readonly<Record<string, readonly number[]>>
  /** Session whose log references the selected project, or null while unknown. */
  sessionMatch: SessionId | null
}

const INITIAL: VideoProjectsState = {
  listStatus: 'idle',
  projects: [],
  listError: null,
  selected: null,
  detailStatus: 'idle',
  project: null,
  detailError: null,
  viewMode: 'script',
  peaks: {},
  sessionMatch: null,
}

/**
 * Read one JSON document from this deployment's own host, same-origin and
 * already authenticated by the browser cookie the connection layer set.
 * @param path - request path including its query, rooted at `/api/video`.
 * @param signal - aborts the request when the reading pane unmounts.
 * @returns the decoded body.
 * @throws the HTTP status when the route answered anything but success.
 */
export async function browserJsonFetch(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${window.location.origin}${path}`, {
    credentials: 'same-origin',
    signal,
  })
  if (!response.ok) throw new Error(`video: ${path} answered ${response.status}`)
  return await response.json() as unknown
}

/**
 * Build one media request URL.
 * @param origin - the deployment origin the media route is served from.
 * @param path - absolute host path of the media file.
 * @returns the URL a `<video>` or `<img>` element can load directly.
 */
export function videoMediaUrl(origin: string, path: string): string {
  return `${origin}/api/video/media?path=${encodeURIComponent(path)}`
}

/**
 * Take one member out of a decoded reply.
 *
 * The routes are this package's own host half, so the reachable failure is not
 * a hostile body but a deployment answering `/api/video/*` with something else
 * — a reverse proxy's own error document, or this route's 404 body, which
 * carries `error` instead of the member asked for.
 * @param body - the decoded reply.
 * @param member - the member the caller asked the route for.
 * @returns the member's value, which may be undefined.
 * @throws when the reply is not a JSON object at all.
 */
function readMember(body: unknown, member: string): unknown {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`video: reply is not a JSON object (wanted ${member})`)
  }
  return (body as Record<string, unknown>)[member]
}

/**
 * Read the project list reply.
 * @param body - the decoded `/api/video/projects` reply.
 * @returns the discovered projects in the host's own order.
 * @throws when the reply carries no `projects` array.
 */
export function readProjectList(body: unknown): readonly VideoProjectSummary[] {
  const projects = readMember(body, 'projects')
  if (!Array.isArray(projects)) throw new Error('video: /api/video/projects answered without a projects array')
  return projects as readonly VideoProjectSummary[]
}

/**
 * Read the project detail reply.
 * @param body - the decoded `/api/video/project` reply.
 * @returns the project with its resolved shot timeline.
 * @throws when the reply carries no `project` object.
 */
export function readProjectDetail(body: unknown): VideoProject {
  const project = readMember(body, 'project')
  if (typeof project !== 'object' || project === null) {
    throw new Error('video: /api/video/project answered without a project object')
  }
  return project as VideoProject
}

/**
 * Read the producing-session reply. The route answers `null` for a project no
 * session references, so absence and a match share one member.
 * @param body - the decoded `/api/video/project-session` reply.
 * @returns the matched session's id, or null when no session references the project.
 * @throws when the reply carries no `sessionId` string or null.
 */
export function readProjectSession(body: unknown): SessionId | null {
  const sessionId = readMember(body, 'sessionId')
  if (sessionId === null) return null
  if (typeof sessionId !== 'string') {
    throw new Error('video: /api/video/project-session answered without a sessionId')
  }
  return brandString<SessionId>(sessionId)
}

/**
 * Reads the roster, one selected project, and the session that produced it,
 * and keeps all three current by polling for as long as a video pane is mounted.
 */
export class VideoProjectsController {
  /** Snapshot the two panes subscribe to. */
  readonly store: SnapshotStore<VideoProjectsState> = createSnapshotStore(INITIAL)

  /** Set while one poll is in flight, so a slower answer is not doubled up. */
  #polling = false

  /** The selected project's last-seen stage; a change re-drives the auto view. */
  #stage: VideoStage | null = null

  /** Audio paths whose decode is in flight, so a shot is not decoded twice. */
  #peaksInflight = new Set<string>()

  constructor(
    /** Transport the reads go through; the browser default is same-origin fetch. */
    private readonly read: VideoJsonFetch = browserJsonFetch,
  ) {}

  #set(patch: Partial<VideoProjectsState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /**
   * Read the project list once.
   * @param signal - aborts the read when the polling pane unmounts.
   * @returns once the snapshot reflects the answer or its failure.
   */
  async #loadList(signal: AbortSignal): Promise<void> {
    this.#set({ listStatus: 'loading' })
    try {
      const projects = readProjectList(await this.read('/api/video/projects', signal))
      this.#set({ listStatus: 'ready', projects, listError: null })
    } catch (error) {
      this.#set({ listStatus: 'error', listError: messageOf(error) })
    }
  }

  /**
   * Read one project's shot timeline once.
   * @param path - absolute project path.
   * @param signal - aborts the read when the polling pane unmounts.
   * @returns once the snapshot reflects the answer or its failure.
   */
  async #loadDetail(path: string, signal: AbortSignal): Promise<void> {
    this.#set({ detailStatus: 'loading' })
    try {
      const project = readProjectDetail(
        await this.read(`/api/video/project?path=${encodeURIComponent(path)}`, signal))
      this.#set({ detailStatus: 'ready', project, detailError: null, ...this.#autoView(project) })
    } catch (error) {
      this.#set({ detailStatus: 'error', detailError: messageOf(error) })
    }
  }

  /**
   * Ask the host which session produced one project and publish the answer.
   *
   * A probe that fails, and one whose project stopped being selected while it
   * was in flight, publishes nothing: no match and no answer are the same state
   * here, the banner stays hidden, and the next poll asks again.
   * @param path - absolute project path.
   * @param signal - aborts the read when the polling pane unmounts.
   * @returns once the answer is published or dropped.
   */
  async #loadSessionMatch(path: string, signal: AbortSignal): Promise<void> {
    try {
      const sessionId = readProjectSession(
        await this.read(`/api/video/project-session?path=${encodeURIComponent(path)}`, signal))
      if (this.store.getSnapshot().selected !== path) return
      this.#set({ sessionMatch: sessionId })
    } catch {
      /* Transport failure or a foreign reply body: no match to show. */
    }
  }

  /**
   * Resolve the view switch a freshly loaded project asks for. A project that
   * has moved to a new stage takes the mode that stage defaults to — a render
   * shows the player, anything short of one shows the script — while a project
   * still on the stage the user is looking at leaves a manual toggle alone.
   * @param project - the project just read.
   * @returns a view-mode patch, empty when the stage has not changed.
   */
  #autoView(project: VideoProject): Partial<VideoProjectsState> {
    const stage: VideoStage = project.render !== undefined
      ? 'render'
      : project.shots.length > 0 ? 'script' : 'empty'
    if (stage === this.#stage) return {}
    this.#stage = stage
    return { viewMode: stage === 'render' ? 'preview' : 'script' }
  }

  /**
   * Read the list and, when one is selected, its detail and producing session.
   * @param signal - aborts the reads when the polling pane unmounts.
   * @returns once the snapshot reflects the answers or their failures.
   */
  async #poll(signal: AbortSignal): Promise<void> {
    // A poll that outlives its interval would otherwise stack: each run reads
    // the same two routes, so a second concurrent one only doubles the traffic
    // and can land the older answer last.
    if (this.#polling) return
    this.#polling = true
    try {
      await this.#loadList(signal)
      const { selected, projects } = this.store.getSnapshot()
      // With nothing chosen yet, open the most recently modified project so a
      // freshly created one previews without a manual pick.
      const target = selected ?? projects[0]?.path ?? null
      if (target === null) return
      if (target !== selected) {
        this.#stage = null
        this.#set({ selected: target, detailStatus: 'idle', project: null, detailError: null, sessionMatch: null })
      }
      await this.#loadDetail(target, signal)
      // The session that built a project may still be writing the log the match
      // reads, so an unmatched project is asked again on every poll.
      if (this.store.getSnapshot().sessionMatch === null) await this.#loadSessionMatch(target, signal)
    } finally {
      this.#polling = false
    }
  }

  /**
   * Select one project for the preview pane, read it, and find its session.
   * @param path - absolute project path, or null to show nothing.
   * @returns once the snapshot reflects the answer or its failure.
   */
  async select(path: string | null): Promise<void> {
    if (this.store.getSnapshot().selected === path) return
    this.#stage = null
    this.#set({ selected: path, detailStatus: 'idle', project: null, detailError: null, sessionMatch: null })
    if (path === null) return
    const signal = new AbortController().signal
    await this.#loadDetail(path, signal)
    await this.#loadSessionMatch(path, signal)
  }

  /**
   * Switch the preview pane between the formatted script and the player. A
   * manual switch survives polling until the project moves to a new stage.
   * @param mode - the surface to show.
   */
  setViewMode(mode: VideoViewMode): void {
    this.#set({ viewMode: mode })
  }

  /**
   * Decode one shot's narration audio into waveform peaks, once. The result is
   * cached on the snapshot, so a track re-render or a poll never re-decodes; a
   * decode that fails caches an empty peak set, which draws the placeholder bar.
   * @param key - absolute host path of the audio, the cache key.
   * @param url - the media route URL serving that audio's bytes.
   * @returns once the peaks are cached or the decode is already covered.
   */
  async ensurePeaks(key: string, url: string): Promise<void> {
    if (this.store.getSnapshot().peaks[key] !== undefined || this.#peaksInflight.has(key)) return
    this.#peaksInflight.add(key)
    let decoded: readonly number[]
    try {
      decoded = await decodePeaks(url, WAVEFORM_BUCKETS, new AbortController().signal)
    } catch {
      // A shot whose audio is absent, still being written, or undecodable draws
      // the placeholder bar; the decode failure carries nothing to show.
      decoded = []
    }
    this.#peaksInflight.delete(key)
    this.#set({ peaks: { ...this.store.getSnapshot().peaks, [key]: decoded } })
  }

  /**
   * Start keeping the roster current: one read now, then one per interval,
   * until the returned stopper runs. Called from the projects pane's mount,
   * which is the pane's whole lifetime inside the video shell mode.
   * @returns the stopper clearing the interval and the session match.
   */
  start(): () => void {
    const controller = new AbortController()
    void this.#poll(controller.signal)
    const timer = setInterval(() => { void this.#poll(controller.signal) }, POLL_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      controller.abort()
      // The match belongs to this shell mode's selection: dropping it on the way
      // out keeps the banner off the conversation the user returns to.
      this.#set({ sessionMatch: null })
    }
  }
}

/**
 * The text a failed read reports.
 * @param error - whatever the transport or the reply check threw.
 * @returns its message, or its string form when it carries none.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
