/**
 * Route coverage against a real local filesystem: project discovery over the
 * registered workspace roots, shot-asset resolution, and the media route's
 * byte-window and fence behavior.
 */

import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import * as VideoProject from '../src/index.ts'
import type { VideoProjectListResponse, VideoProjectResponse } from '../src/types.ts'

type Handler = (request: Request) => Promise<Response>

let root: string
const contexts: Context[] = []
const routeSets: Map<string, Handler>[] = []

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-video-project-')))
})

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  routeSets.splice(0)
  await rm(root, { recursive: true, force: true })
})

/**
 * Mount the plugin over the real local filesystem with a fake transport carrier
 * and a workspace registry naming the fixture root.
 * @param config - plugin config overrides.
 * @returns route callers and the disposer observation point.
 */
async function mount(config: Record<string, unknown> = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const routes = new Map<string, Handler>()
  routeSets.push(routes)
  ctx.provide('connection', {
    fetch: {
      register: (route: { path: string; fetch: Handler }) => {
        routes.set(route.path, route.fetch)
        return async () => { routes.delete(route.path) }
      },
    },
  } as never)
  ctx.provide('workspaceRegistry', { list: () => [{ path: root }] } as never)
  await ctx.plugin(LocalFileSystem, { cwd: root }).await()
  await ctx.plugin(VideoProject, config).await()
  const call = (path: string, query: string, init?: RequestInit): Promise<Response> => {
    const handler = routes.get(path)
    if (handler === undefined) throw new Error(`route ${path} not registered`)
    return handler(new Request(`http://127.0.0.1${path}${query}`, init))
  }
  return {
    routes,
    list: async (): Promise<VideoProjectListResponse> =>
      await (await call('/api/video/projects', '')).json() as VideoProjectListResponse,
    project: async (path: string): Promise<Response> =>
      await call('/api/video/project', `?path=${encodeURIComponent(path)}`),
    media: (path: string, init?: RequestInit): Promise<Response> =>
      call('/api/video/media', `?path=${encodeURIComponent(path)}`, init),
  }
}

/** Write one project fixture; recency is pinned afterwards so later assets do not overwrite it. */
async function writeProject(dir: string, script: string): Promise<string> {
  const path = join(root, dir)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'script.json'), script)
  return path
}

/** Pin a directory's recency once every fixture inside it exists. */
async function touch(path: string, mtime: Date): Promise<void> {
  await utimes(path, mtime, mtime)
}

/** Lay down the shared fixture tree. */
async function seed(): Promise<{ a: string; b: string; broken: string }> {
  const a = await writeProject('proj-a', JSON.stringify({
    title: 'Tour',
    summary: 'Two shots',
    shots: [
      { id: 's1', description: 'Logo', narration: 'Welcome.', duration: 2, image: 'assets/a.png', audio: 'audio/a.wav', thumbnail: 'missing.png' },
      { id: 's2', narration: 'Bye.', duration: 3 },
    ],
  }))
  await mkdir(join(a, 'assets'), { recursive: true })
  await writeFile(join(a, 'assets', 'a.png'), 'PNG')
  await mkdir(join(a, 'audio'), { recursive: true })
  await writeFile(join(a, 'audio', 'a.wav'), 'WAV')
  await mkdir(join(a, 'renders'), { recursive: true })
  await writeFile(join(a, 'renders', 'output.mp4'), '0123456789')

  const b = await writeProject(join('nested', 'deep', 'proj-b'), JSON.stringify({ shots: [{ narration: 'x', duration: 1 }] }))

  const broken = await writeProject('broken', '{')

  await writeProject(join('too', 'deep', 'a', 'b', 'proj-c'), '{"shots":[]}')
  await writeProject(join('node_modules', 'proj-d'), '{"shots":[]}')
  await writeProject(join('.hidden', 'proj-e'), '{"shots":[]}')

  await touch(broken, new Date(1000))
  await touch(a, new Date(2000))
  await touch(b, new Date(3000))
  return { a, b, broken }
}

describe('/api/video/projects', () => {
  it('lists projects inside the scan depth and skips dependency and hidden trees', async () => {
    const { a, b, broken } = await seed()
    const route = await mount()
    const { projects } = await route.list()
    expect(projects.map(project => project.path)).toEqual([b, a, broken])
    expect(projects[0]).toMatchObject({ name: 'proj-b', title: 'proj-b', shotCount: 1, hasRender: false })
    expect(projects[1]).toMatchObject({ name: 'proj-a', title: 'Tour', shotCount: 2, hasRender: true })
    expect(projects[2]?.error).toContain('not valid JSON')
  })

  it('reports an unreadable script as an error rather than an empty project', async () => {
    const { broken } = await seed()
    const route = await mount()
    const { projects } = await route.list()
    expect(projects.find(project => project.path === broken)).toMatchObject({ shotCount: 0, hasRender: false })
  })

  it('honors a smaller scan depth', async () => {
    const { a } = await seed()
    const route = await mount({ scanDepth: 1 })
    const { projects } = await route.list()
    expect(projects.map(project => project.path).sort()).toEqual([a, join(root, 'broken')].sort())
  })
})

describe('/api/video/project', () => {
  it('resolves the declared assets that exist and drops the ones that do not', async () => {
    const { a } = await seed()
    const route = await mount()
    const response = await route.project(a)
    expect(response.status).toBe(200)
    const { project } = await response.json() as VideoProjectResponse
    expect(project.title).toBe('Tour')
    expect(project.summary).toBe('Two shots')
    expect(project.duration).toBe(5)
    expect(project.render).toBe(join(a, 'renders', 'output.mp4'))
    expect(project.shots[0]).toMatchObject({
      id: 's1',
      index: 0,
      image: join(a, 'assets', 'a.png'),
      audio: join(a, 'audio', 'a.wav'),
    })
    expect(project.shots[0]?.thumbnail).toBeUndefined()
    expect(project.shots[1]).toMatchObject({ id: 's2', index: 1, narration: 'Bye.', visualType: 'unknown' })
  })

  it('rejects a missing path, an unknown project, and a path outside every workspace', async () => {
    await seed()
    const route = await mount()
    expect((await route.project('')).status).toBe(400)
    expect((await route.project(join(root, 'absent'))).status).toBe(404)
    expect((await route.project(tmpdir())).status).toBe(404)
  })
})

describe('/api/video/media', () => {
  it('serves a whole file with its media type and range advertisement', async () => {
    const { a } = await seed()
    const route = await mount()
    const response = await route.media(join(a, 'renders', 'output.mp4'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-length')).toBe('10')
    expect(await response.text()).toBe('0123456789')
  })

  it('serves a closed range, an open-ended range, and a suffix range as 206', async () => {
    const { a } = await seed()
    const route = await mount()
    const file = join(a, 'renders', 'output.mp4')

    const closed = await route.media(file, { method: 'GET', headers: { range: 'bytes=2-5' } })
    expect(closed.status).toBe(206)
    expect(closed.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await closed.text()).toBe('2345')

    const open = await route.media(file, { headers: { range: 'bytes=8-' } })
    expect(open.status).toBe(206)
    expect(await open.text()).toBe('89')

    const suffix = await route.media(file, { headers: { range: 'bytes=-3' } })
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('content-range')).toBe('bytes 7-9/10')
    expect(await suffix.text()).toBe('789')
  })

  it('answers HEAD with headers only and refuses an unsatisfiable range', async () => {
    const { a } = await seed()
    const route = await mount()
    const file = join(a, 'renders', 'output.mp4')

    const head = await route.media(file, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe('10')
    expect(await head.text()).toBe('')

    const bad = await route.media(file, { headers: { range: 'bytes=99-' } })
    expect(bad.status).toBe(416)
    expect(bad.headers.get('content-range')).toBe('bytes */10')
  })

  it('fences the route to the workspace and to regular files within the byte cap', async () => {
    const { a } = await seed()
    const outside = join(await realpath(await mkdtemp(join(tmpdir(), 'dsh-video-outside-'))), 'x.mp4')
    await writeFile(outside, 'SECRET')
    const route = await mount({ maxMediaBytes: 4 })

    expect((await route.media(outside)).status).toBe(403)
    expect((await route.media(a)).status).toBe(403)
    expect((await route.media(join(a, 'absent.mp4'))).status).toBe(404)
    expect((await route.media(join(a, 'renders', 'output.mp4'))).status).toBe(413)
    expect((await route.media('')).status).toBe(400)
    await rm(outside, { recursive: true, force: true })
  })

  it('streams a body larger than one chunk', { timeout: 30_000 }, async () => {
    const path = await writeProject('big', '{"shots":[]}')
    const payload = Buffer.alloc(1024 * 1024 + 16, 7)
    await writeFile(join(path, 'clip.mp4'), payload)
    const route = await mount()
    const response = await route.media(join(path, 'clip.mp4'))
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(payload))
  })
})

describe('route lifetime', () => {
  it('removes every route when the plugin fiber is disposed', async () => {
    await seed()
    const route = await mount()
    expect(route.routes.size).toBe(3)
    const ctx = contexts[contexts.length - 1]
    if (ctx === undefined) throw new Error('context not mounted')
    await ctx.fiber.dispose()
    await Promise.resolve()
    expect(route.routes.size).toBe(0)
  })
})
