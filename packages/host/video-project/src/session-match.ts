/**
 * Locating the session that produced one video project. A session records the
 * workspace root it was created in (`SessionHeader.cwd`), never the project
 * subfolder the agent later made inside it, so every project under one workspace
 * matches the same candidate sessions and the directory alone cannot choose
 * between them. The distinction comes from the session log: whoever built a
 * project wrote paths inside it, and the full-text index answers whether one did.
 *
 * The query is the project directory relative to the candidate's own cwd, which
 * the index matches as one phrase. Its tokenizer treats `\` and `/` alike and
 * drops both, so one relative query matches the absolute and the relative
 * spelling of the same path without reading any log.
 * @module @deepseek-ai/dsh-host-video-project/session-match
 */

import { relative } from 'node:path'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { SessionQueryError, type SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ProjectLocation } from './discovery.ts'

/**
 * Ceiling on sessions probed for one project. A workspace holding a long session
 * history stops here rather than querying every one; the newest candidates are
 * probed first, so the budget spends itself on the likeliest answers.
 */
const MAX_SESSION_CANDIDATES = 12

/**
 * Find the newest session whose log references one project directory.
 * @param fs - filesystem capability supplying path resolution and containment.
 * @param sessionQuery - session corpus and full-text index.
 * @param location - project whose producing session is wanted.
 * @returns the producing session's id, or null when no candidate references it.
 * @throws the session-query failure when the deployment turned content search off,
 * which matches no project at all rather than this one.
 */
export async function findProducingSession(
  fs: FileSystem,
  sessionQuery: SessionQueryEngine,
  location: ProjectLocation,
): Promise<SessionId | null> {
  const sessions = await sessionQuery.listSessions()
  let probed = 0
  for (const session of sessions) {
    const cwd = session.header.cwd
    if (cwd === undefined) continue
    let inside: boolean
    try {
      inside = fs.contains(await fs.resolve(cwd), location.dir)
    } catch {
      /* A cwd the host cannot resolve contains no project. */
      continue
    }
    if (!inside) continue
    if (probed >= MAX_SESSION_CANDIDATES) return null
    probed += 1
    const query = relative(cwd, location.path)
    // A project sitting at its session's own cwd leaves no path below it to
    // search for, so the newest such session is the only answer available.
    if (query === '') return session.header.id
    try {
      const page = await sessionQuery.searchEvents({ sessionId: session.header.id, query, limit: 1 })
      if (page.items.length > 0) return session.header.id
    } catch (error) {
      // Content search turned off at the provider matches no project at all, so
      // it is a deployment fault rather than one session's missing evidence.
      if (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_SEARCH_DISABLED') throw error
      /* An unreadable or unindexed session offers no evidence either way. */
    }
  }
  return null
}
