/**
 * @deepseek-ai/dsh-host-video-project — the Web GUI's video-production data
 * plane. It discovers the `script.json` video projects under every registered
 * workspace and serves authenticated routes below `/api/video`: the project
 * list, one project's resolved shot timeline, the media bytes a timeline cell or
 * the preview player references, and the session that produced one project. It
 * contributes no Cordis service and no model-facing tool; the browser half is
 * its only consumer.
 * @module @deepseek-ai/dsh-host-video-project
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-workspace'
import { listSummaries, locateProject, readProject, type ProjectLocation } from './discovery.ts'
import { serveMedia } from './media.ts'
import { findProducingSession } from './session-match.ts'
import type { VideoProjectListResponse, VideoProjectResponse, VideoProjectSessionResponse } from './types.ts'

export type * from './types.ts'
export { SCRIPT_FILE } from './discovery.ts'

/** Stable Cordis plugin name. */
export const name = 'video-project'

/** Services the routes read: the transport carrier, the filesystem, the workspace roots, and the session corpus. */
export const inject = ['connection', 'fs', 'workspaceRegistry', 'sessionQuery']

/** Default directory levels walked below each workspace root. */
const DEFAULT_SCAN_DEPTH = 3

/** Default ceiling on one served media file. */
const DEFAULT_MAX_MEDIA_BYTES = 512 * 1024 * 1024

/** Plugin configuration. */
export interface Config {
  /** Directory levels walked below each workspace root while looking for `script.json`. */
  scanDepth: number
  /** Inclusive byte ceiling on one `/api/video/media` response. */
  maxMediaBytes: number
}

export const Config: z<Config> = z.object({
  scanDepth: z.number().step(1).min(0).default(DEFAULT_SCAN_DEPTH),
  maxMediaBytes: z.number().step(1).min(1).default(DEFAULT_MAX_MEDIA_BYTES),
})

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/**
 * Encode one JSON body.
 * @param body - value to encode.
 * @param status - response status.
 * @returns the encoded response.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * Claim the `/api/video` routes for as long as this plugin is mounted.
 * @param ctx - plugin context carrying the connection, filesystem, workspace, and session-query services.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const { scanDepth, maxMediaBytes } = config
  const roots = (): string[] => ctx.workspaceRegistry.list().map(workspace => workspace.path)

  /**
   * Resolve one project-path query parameter against the registered workspaces.
   * @param request - the incoming request.
   * @returns the located project, or the response refusing the request.
   */
  const locateOrRefuse = async (request: Request): Promise<ProjectLocation | Response> => {
    const path = new URL(request.url).searchParams.get('path')
    if (path === null || path.length === 0) return json({ error: 'missing path' }, 400)
    return await locateProject(ctx.fs, roots(), path) ?? json({ error: 'unknown video project' }, 404)
  }

  ctx.effect(() => {
    const disposers = [
      ctx.connection.fetch.register({
        path: '/api/video/projects',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (): Promise<Response> => {
          const projects = await listSummaries(ctx.fs, roots(), scanDepth)
          const body: VideoProjectListResponse = { projects }
          return json(body)
        },
      }),
      ctx.connection.fetch.register({
        path: '/api/video/project',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request): Promise<Response> => {
          const located = await locateOrRefuse(request)
          if (located instanceof Response) return located
          const body: VideoProjectResponse = { project: await readProject(ctx.fs, located) }
          return json(body)
        },
      }),
      ctx.connection.fetch.register({
        path: '/api/video/media',
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: request => serveMedia(request, ctx.fs, roots(), maxMediaBytes),
      }),
      ctx.connection.fetch.register({
        path: '/api/video/project-session',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request): Promise<Response> => {
          const located = await locateOrRefuse(request)
          if (located instanceof Response) return located
          const sessionId = await findProducingSession(ctx.fs, ctx.sessionQuery, located)
          const body: VideoProjectSessionResponse = { sessionId }
          return json(body)
        },
      }),
    ]
    return () => {
      // register()'s disposers settle asynchronously; teardown is synchronous fire-and-forget.
      for (const dispose of disposers) void dispose()
    }
  }, 'video-project: /api/video routes')
}
