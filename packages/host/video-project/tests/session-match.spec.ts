/**
 * Producing-session matching against a stubbed filesystem and session corpus:
 * which candidates are filtered out before a log is read, where the probe budget
 * stops, and what each kind of full-text answer means.
 */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FsTargetKey, type FileSystem, type FsTarget } from '@deepseek-ai/dsh-fs'
import { SessionQueryError, type SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { findProducingSession } from '../src/session-match.ts'
import type { ProjectLocation } from '../src/discovery.ts'

/** One stub target whose display path doubles as its key. */
function target(displayPath: string): FsTarget {
  return { targetKey: FsTargetKey(displayPath), displayPath }
}

/** Cast a partial stub to the full capability; matching only calls what the stub provides. */
function asFs(stub: Partial<FileSystem>): FileSystem {
  return stub as unknown as FileSystem
}

/** What a full-text probe of one session answers. */
type Answer = 'hit' | 'miss' | 'unreadable' | 'search-disabled'

/** One seeded session corpus row. */
interface Row {
  /** Session id. */
  id: string
  /** Workspace root the session recorded, absent when it recorded none. */
  cwd?: string
  /** The session's full-text answer; absent means no probe ever reaches it. */
  answer?: Answer
}

/** A filesystem resolving every path except the vanished ones, with prefix containment. */
const fs = asFs({
  resolve: async (path: string) => {
    if (path === '/gone') throw new Error('vanished')
    return target(path)
  },
  contains: (parent: FsTarget, child: FsTarget) =>
    child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`),
})

/**
 * Build the corpus face matching reads, recording every probe query it receives.
 * @param rows - the sessions the corpus lists, newest first.
 * @returns the face and the recorded queries.
 */
function corpus(rows: readonly Row[]): { query: SessionQueryEngine; probes: string[] } {
  const probes: string[] = []
  const query = {
    listSessions: async () => rows.map(row => ({ header: { id: row.id, cwd: row.cwd }, live: false, persisted: true })),
    searchEvents: async (request: { sessionId: SessionId; query: string }) => {
      probes.push(request.query)
      const row = rows.find(candidate => candidate.id === request.sessionId)
      if (row?.answer === 'unreadable') throw new Error('not indexed')
      if (row?.answer === 'search-disabled') {
        throw new SessionQueryError('full-text search is disabled', 'SESSION_QUERY_SEARCH_DISABLED')
      }
      return { items: row?.answer === 'hit' ? [{}] : [] }
    },
  } as unknown as SessionQueryEngine
  return { query, probes }
}

/** The project whose producing session each test looks for. */
function projectAt(path: string): ProjectLocation {
  return { path, dir: target(path), script: target(`${path}/script.json`) }
}

/**
 * Run one match against a seeded corpus.
 * @param rows - the sessions the corpus lists, newest first.
 * @param path - the project directory to match.
 * @returns the matched session id and the queries the probe sent.
 */
async function match(rows: readonly Row[], path = '/w/proj'): Promise<{ id: SessionId | null; probes: string[] }> {
  const { query, probes } = corpus(rows)
  return { id: await findProducingSession(fs, query, projectAt(path)), probes }
}

describe('findProducingSession', () => {
  it('returns the newest session whose log references the project', async () => {
    const { id, probes } = await match([
      { id: 'sess-new', cwd: '/w', answer: 'miss' },
      { id: 'sess-old', cwd: '/w', answer: 'hit' },
      { id: 'sess-older', cwd: '/w', answer: 'hit' },
    ])
    expect(id).toBe('sess-old')
    expect(probes).toEqual(['proj', 'proj'])
  })

  it('searches for the project relative to each candidate workspace', async () => {
    const { probes } = await match([
      { id: 'sess-a', cwd: '/w', answer: 'miss' },
      { id: 'sess-b', cwd: '/w/nested', answer: 'miss' },
    ], '/w/nested/deep/proj')
    expect(probes).toEqual([join('nested', 'deep', 'proj'), join('deep', 'proj')])
  })

  it('answers with the session the project sits in without reading a log', async () => {
    const { id, probes } = await match([{ id: 'sess-here', cwd: '/w/proj' }], '/w/proj')
    expect(id).toBe('sess-here')
    expect(probes).toEqual([])
  })

  it('skips a session that recorded no workspace root', async () => {
    const { id, probes } = await match([
      { id: 'sess-nowhere', answer: 'hit' },
      { id: 'sess-here', cwd: '/w', answer: 'hit' },
    ])
    expect(id).toBe('sess-here')
    expect(probes).toEqual(['proj'])
  })

  it('skips a session whose workspace root the host cannot resolve', async () => {
    const { id } = await match([
      { id: 'sess-gone', cwd: '/gone', answer: 'hit' },
      { id: 'sess-here', cwd: '/w', answer: 'hit' },
    ])
    expect(id).toBe('sess-here')
  })

  it('skips a session whose workspace does not hold the project', async () => {
    const { id, probes } = await match([
      { id: 'sess-elsewhere', cwd: '/elsewhere', answer: 'hit' },
      { id: 'sess-here', cwd: '/w', answer: 'hit' },
    ])
    expect(id).toBe('sess-here')
    expect(probes).toEqual(['proj'])
  })

  it('keeps searching past a session whose log is unreadable', async () => {
    const { id } = await match([
      { id: 'sess-broken', cwd: '/w', answer: 'unreadable' },
      { id: 'sess-here', cwd: '/w', answer: 'hit' },
    ])
    expect(id).toBe('sess-here')
  })

  it('reports a deployment that turned content search off rather than answering no match', async () => {
    const { query } = corpus([{ id: 'sess-1', cwd: '/w', answer: 'search-disabled' }])
    await expect(findProducingSession(fs, query, projectAt('/w/proj')))
      .rejects.toMatchObject({ code: 'SESSION_QUERY_SEARCH_DISABLED' })
  })

  it('stops at the probe ceiling rather than reading the whole corpus', async () => {
    const rows = Array.from({ length: 13 }, (_, index) => ({ id: `sess-${index}`, cwd: '/w', answer: 'miss' as const }))
    const { id, probes } = await match(rows)
    expect(id).toBeNull()
    expect(probes).toHaveLength(12)
  })

  it('reports no match when nothing in the corpus references the project', async () => {
    expect((await match([{ id: 'sess-1', cwd: '/w', answer: 'miss' }])).id).toBeNull()
    expect((await match([])).id).toBeNull()
  })
})
