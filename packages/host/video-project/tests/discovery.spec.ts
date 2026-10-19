/**
 * Discovery branches the real local backend cannot produce: unreadable
 * directories, vanished roots, host-invisible recency, and render selection
 * across several candidates with real modification times.
 */

import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FsTargetKey, type FileSystem, type FsDirEntry, type FsTarget } from '@deepseek-ai/dsh-fs'
import {
  discoverProjects, listSummaries, locateProject, readProject, readSummary, SCRIPT_FILE,
  type ProjectLocation,
} from '../src/discovery.ts'

/** One stub target whose display path doubles as its key. */
function target(displayPath: string): FsTarget {
  return { targetKey: FsTargetKey(displayPath), displayPath }
}

/** One stub directory child. */
function entry(name: string, type: 'file' | 'directory', path?: string): FsDirEntry {
  return { name, type, target: target(path ?? join('/w', name)) }
}

/** Cast a partial stub to the full capability; discovery only calls what the stub provides. */
function asFs(stub: Partial<FileSystem>): FileSystem {
  return stub as unknown as FileSystem
}

/** A location whose script reads as the given text through `readText`. */
function projectAt(path: string, script: string, listing: FsDirEntry[] = []): { fs: FileSystem; location: ProjectLocation } {
  const fs = asFs({
    resolve: async (p: string) => target(p),
    listDir: async (t: FsTarget) => (t.displayPath === path ? listing : Promise.reject(new Error('unreadable'))),
    readText: async () => script,
  })
  return { fs, location: { path, dir: target(path), script: target(join(path, SCRIPT_FILE)) } }
}

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('discoverProjects', () => {
  it('skips unreadable directories and non-directory entries while walking', async () => {
    const fs = asFs({
      resolve: async (p: string) => target(p),
      listDir: async (t: FsTarget) => {
        if (t.displayPath === '/w/bad') throw new Error('unreadable')
        if (t.displayPath === '/w') {
          return [entry('bad', 'directory', '/w/bad'), entry('notes.md', 'file'), entry('good', 'directory', '/w/good')]
        }
        return [{ name: SCRIPT_FILE, type: 'file' as const, target: target('/w/good/script.json') }]
      },
    })
    const found = await discoverProjects(fs, ['/w'], 1)
    expect(found.map(project => project.path)).toEqual(['/w/good'])
  })

  it('contributes nothing for a root that cannot be resolved', async () => {
    const fs = asFs({ resolve: async () => { throw new Error('vanished') } })
    expect(await discoverProjects(fs, ['/gone'], 1)).toEqual([])
  })
})

describe('readSummary', () => {
  it('sorts a host-invisible directory last and falls back to the path as its name', async () => {
    const { fs, location } = projectAt('', '{"shots":[{"id":"s1"}]}')
    const summary = await readSummary(fs, location)
    expect(summary).toEqual({ path: '', name: '', title: '', updatedAt: 0, shotCount: 1, hasRender: false })
  })

  it('reports an unreadable script as the summary error', async () => {
    const fs = asFs({
      resolve: async (p: string) => target(p),
      listDir: async () => { throw new Error('unreadable') },
      readText: async () => { throw new Error('EACCES') },
    })
    const summary = await readSummary(fs, { path: '/w/p', dir: target('/w/p'), script: target('/w/p/script.json') })
    expect(summary.error).toBe('script.json is unreadable: EACCES')
    expect(summary.shotCount).toBe(0)
  })
})

describe('listSummaries', () => {
  it('breaks a recency tie by path order', async () => {
    const fs = asFs({
      resolve: async (p: string) => target(p),
      listDir: async (t: FsTarget) => {
        if (t.displayPath === '/w') return [entry('zeta', 'directory', '/w/zeta'), entry('alpha', 'directory', '/w/alpha')]
        return [{ name: SCRIPT_FILE, type: 'file' as const, target: target(join(t.displayPath, SCRIPT_FILE)) }]
      },
      readText: async () => '{"shots":[]}',
    })
    const summaries = await listSummaries(fs, ['/w'], 1)
    expect(summaries.map(summary => summary.path)).toEqual(['/w/alpha', '/w/zeta'])
    expect(summaries.every(summary => summary.updatedAt === 0)).toBe(true)
  })
})

describe('readProject', () => {
  it('resolves an absolute asset declaration and drops one that fails to resolve', async () => {
    const script = JSON.stringify({
      shots: [{ id: 's1', image: '/w/p/img.png', thumbnail: 'thumb.png', audio: 'gone.wav' }],
    })
    const fs = asFs({
      resolve: async (p: string) => {
        if (p.endsWith('gone.wav')) throw new Error('absent')
        return target(p)
      },
      listDir: async () => { throw new Error('unreadable') },
      readText: async () => script,
      stat: async (t: FsTarget) =>
        t.displayPath.endsWith('.png')
          ? { version: undefined as never, type: 'file' as const }
          : undefined,
    })
    const project = await readProject(fs, { path: '/w/p', dir: target('/w/p'), script: target('/w/p/script.json') })
    expect(project.summary).toBe('')
    expect(project.render).toBeUndefined()
    expect(project.shots[0]).toMatchObject({
      image: '/w/p/img.png',
      thumbnail: join('/w/p', 'thumb.png'),
    })
    expect(project.shots[0]?.audio).toBeUndefined()
  })

  it('answers an unreadable script with an empty shot list', async () => {
    const fs = asFs({
      resolve: async (p: string) => target(p),
      listDir: async () => { throw new Error('unreadable') },
      readText: async () => { throw new Error('EACCES') },
    })
    const project = await readProject(fs, { path: '/w/p', dir: target('/w/p'), script: target('/w/p/script.json') })
    expect(project).toMatchObject({ summary: '', duration: 0, shots: [] })
    expect(project.error).toBe('script.json is unreadable: EACCES')
  })

  it('picks the newest render across the root and a conventional directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-video-render-'))
    tempDirs.push(dir)
    const older = join(dir, 'old.mp4')
    const oldest = join(dir, 'renders', 'oldest.mp4')
    const newest = join(dir, 'renders', 'NEW.MP4')
    await mkdir(join(dir, 'renders'), { recursive: true })
    await writeFile(older, 'old')
    await writeFile(oldest, 'oldest')
    await writeFile(newest, 'new')
    await utimes(older, new Date(1000), new Date(1000))
    await utimes(oldest, new Date(500), new Date(500))
    await utimes(newest, new Date(2000), new Date(2000))

    const fs = asFs({
      resolve: async (p: string) => target(p),
      listDir: async (t: FsTarget) => {
        if (t.displayPath === dir) return [{ name: 'old.mp4', type: 'file' as const, target: target(older) }]
        if (t.displayPath === join(dir, 'renders')) {
          return [
            { name: 'oldest.mp4', type: 'file' as const, target: target(oldest) },
            { name: 'NEW.MP4', type: 'file' as const, target: target(newest) },
          ]
        }
        throw new Error('unreadable')
      },
      readText: async () => '{"shots":[]}',
    })
    const project = await readProject(fs, { path: dir, dir: target(dir), script: target(join(dir, SCRIPT_FILE)) })
    expect(project.render).toBe(newest)
  })
})

describe('locateProject', () => {
  it('locates nothing for an unresolvable path', async () => {
    const fs = asFs({ resolve: async () => { throw new Error('unresolvable') } })
    expect(await locateProject(fs, [], '/x')).toBeUndefined()
  })

  it('locates nothing when a workspace root vanished', async () => {
    const fs = asFs({
      resolve: async (p: string) => {
        if (p === '/gone') throw new Error('vanished')
        return target(p)
      },
      contains: () => true,
    })
    expect(await locateProject(fs, ['/gone'], '/p')).toBeUndefined()
  })

  it('locates nothing in a readable directory without a script', async () => {
    const fs = asFs({
      resolve: async (p: string) => target(p),
      contains: () => true,
      listDir: async () => [entry('other.json', 'file')],
    })
    expect(await locateProject(fs, ['/w'], '/p')).toBeUndefined()
  })
})
