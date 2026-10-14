/**
 * Project discovery over the registered workspaces. A video project is any
 * directory holding a `script.json`, which is the file the video preset's
 * persona requires the agent to write; discovery walks each workspace root to a
 * configured depth, stops descending at the first `script.json` it finds, and
 * resolves the shot assets that file names against the project directory.
 *
 * Directory modification times come from `node:fs/promises` rather than the
 * `FileSystem` capability: that seam reports no timestamps, and the list orders
 * by recency. A backend whose execution world is not the host yields 0 and
 * sorts last.
 * @module @deepseek-ai/dsh-host-video-project/discovery
 */

import { stat as hostStat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import { parseScript, SKIPPED_DIRECTORY_NAMES, type RawShot } from './script.ts'
import type { VideoProject, VideoProjectSummary, VideoShot } from './types.ts'

/** Name of the file whose presence makes a directory a video project. */
export const SCRIPT_FILE = 'script.json'

/** Directory names holding rendered output; searched for the newest `.mp4`. */
const RENDER_DIRECTORIES = ['renders', 'render', 'output']

/** Extension of a rendered video the preview panel can play. */
const RENDER_EXTENSION = '.mp4'

/**
 * Ceiling on directories walked by one discovery pass. A workspace root holding
 * a large tree stops the walk here rather than exhausting the request; the
 * projects found so far are returned.
 */
const MAX_VISITED_DIRECTORIES = 20_000

/** A discovered project directory and its `script.json`. */
export interface ProjectLocation {
  /** Absolute display path of the project directory; the client's opaque project id. */
  path: string
  /** Resolved project directory. */
  dir: FsTarget
  /** Resolved `script.json` inside it. */
  script: FsTarget
}

/** The three facts both routes need about one project. */
interface ProjectFacts {
  /** `script.json` modification-independent directory recency in epoch milliseconds. */
  updatedAt: number
  /** Absolute path of the newest rendered `.mp4`, absent when the project has none. */
  render?: string
  /** The shot list a `script.json` yielded, or the reason it yielded none. */
  script: ScriptRead
}

/** The shot list a `script.json` yielded, or the reason it yielded none. */
type ScriptRead =
  | { ok: true; title?: string; summary?: string; shots: RawShot[] }
  | { ok: false; error: string }

/**
 * Read a directory's modification time.
 * @param path - absolute host path.
 * @returns epoch milliseconds, or 0 when the host cannot stat it.
 */
async function modifiedAt(path: string): Promise<number> {
  try {
    return (await hostStat(path)).mtimeMs
  } catch {
    /* An absent or host-invisible path has no recency; it sorts last. */
    return 0
  }
}

/**
 * Basename of a project directory in either path spelling.
 * @param path - absolute project directory.
 * @returns the last non-empty segment, or the whole path when it has none.
 */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(part => part.length > 0).pop() ?? path
}

/**
 * Resolve one declared asset path against the project directory.
 * @param fs - filesystem capability supplying resolution and metadata.
 * @param projectPath - absolute project directory the declaration is relative to.
 * @param declared - path as written in `script.json`; absent means undeclared.
 * @returns the absolute path of an existing regular file, or undefined.
 */
async function resolveAsset(fs: FileSystem, projectPath: string, declared: string | undefined): Promise<string | undefined> {
  if (declared === undefined || declared.length === 0) return undefined
  const candidate = isAbsolute(declared) ? declared : join(projectPath, declared)
  try {
    const target = await fs.resolve(candidate)
    const info = await fs.stat(target)
    return info?.type === 'file' ? target.displayPath : undefined
  } catch {
    /* A declaration naming an absent path is an unfinished shot. */
    return undefined
  }
}

/**
 * Walk workspace roots and collect every project directory.
 * @param fs - filesystem capability supplying resolution and directory listings.
 * @param roots - absolute workspace directories to walk.
 * @param scanDepth - how many directory levels below each root are walked.
 * @returns the discovered projects, deduplicated by resolved path.
 */
export async function discoverProjects(fs: FileSystem, roots: readonly string[], scanDepth: number): Promise<ProjectLocation[]> {
  const queue: Array<{ target: FsTarget; depth: number }> = []
  for (const root of roots) {
    try {
      queue.push({ target: await fs.resolve(root), depth: 0 })
    } catch {
      /* A workspace whose directory vanished contributes no projects. */
    }
  }
  const found = new Map<string, ProjectLocation>()
  let visited = 0
  while (queue.length > 0 && visited < MAX_VISITED_DIRECTORIES) {
    const next = queue.shift()
    /* v8 ignore next -- the loop condition guarantees a queued entry. */
    if (next === undefined) break
    visited += 1
    let entries
    try {
      entries = await fs.listDir(next.target)
    } catch {
      /* An unreadable directory contributes no projects and no descendants. */
      continue
    }
    const script = entries.find(entry => entry.name === SCRIPT_FILE && entry.type === 'file')
    if (script !== undefined) {
      found.set(next.target.displayPath, { path: next.target.displayPath, dir: next.target, script: script.target })
      continue
    }
    if (next.depth >= scanDepth) continue
    for (const entry of entries) {
      if (entry.type !== 'directory') continue
      if (entry.name.startsWith('.') || SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue
      queue.push({ target: entry.target, depth: next.depth + 1 })
    }
  }
  return [...found.values()]
}

/**
 * Find the newest rendered `.mp4` a project holds, at its root or in one of the
 * conventional render directories.
 * @param fs - filesystem capability supplying directory listings.
 * @param location - project to search.
 * @returns the absolute path of the newest render, or undefined when there is none.
 */
async function findRender(fs: FileSystem, location: ProjectLocation): Promise<string | undefined> {
  const candidates: string[] = []
  const collect = async (target: FsTarget): Promise<void> => {
    let entries
    try {
      entries = await fs.listDir(target)
    } catch {
      /* An unreadable directory holds no render. */
      return
    }
    for (const entry of entries) {
      if (entry.type === 'file' && entry.name.toLowerCase().endsWith(RENDER_EXTENSION)) {
        candidates.push(entry.target.displayPath)
      }
    }
  }
  await collect(location.dir)
  for (const name of RENDER_DIRECTORIES) {
    try {
      await collect(await fs.resolve(join(location.path, name)))
    } catch {
      /* A conventional directory the project does not have holds no render. */
    }
  }
  if (candidates.length === 0) return undefined
  const timed = await Promise.all(candidates.map(async path => ({ path, at: await modifiedAt(path) })))
  timed.sort((left, right) => right.at - left.at)
  return timed.reduce((best, item) => (item.at > best.at ? item : best)).path
}

/**
 * Read and parse one project's `script.json`.
 * @param fs - filesystem capability supplying reads.
 * @param location - project to read.
 * @returns the parsed shot list, or the reason the file is unusable.
 */
async function readScript(fs: FileSystem, location: ProjectLocation): Promise<ScriptRead> {
  let raw: string
  try {
    raw = await fs.readText(location.script)
  } catch (error) {
    return { ok: false, error: `script.json is unreadable: ${(error as Error).message}` }
  }
  const parsed = parseScript(raw)
  return parsed.ok ? { ok: true, ...parsed.script } : { ok: false, error: parsed.error }
}

/**
 * Gather the three facts both routes need about one project: its recency, its
 * newest render, and its parsed script.
 * @param fs - filesystem capability supplying reads and directory listings.
 * @param location - project to read.
 * @returns the gathered facts.
 */
async function readFacts(fs: FileSystem, location: ProjectLocation): Promise<ProjectFacts> {
  const [updatedAt, render, script] = await Promise.all([
    modifiedAt(location.path),
    findRender(fs, location),
    readScript(fs, location),
  ])
  return { updatedAt, ...render === undefined ? {} : { render }, script }
}

/**
 * Build the list-route summary out of gathered project facts.
 * @param location - project the facts describe.
 * @param facts - gathered recency, render, and script.
 * @returns the project summary.
 */
function toSummary(location: ProjectLocation, facts: ProjectFacts): VideoProjectSummary {
  const name = baseName(location.path)
  const { script } = facts
  return {
    path: location.path,
    name,
    title: script.ok ? script.title ?? name : name,
    updatedAt: facts.updatedAt,
    shotCount: script.ok ? script.shots.length : 0,
    hasRender: facts.render !== undefined,
    ...script.ok ? {} : { error: script.error },
  }
}

/**
 * Read one discovered project into its list-route form. Shot assets stay
 * unresolved: the list needs recency, shot count, and render presence only.
 * @param fs - filesystem capability supplying reads and directory listings.
 * @param location - project to read.
 * @returns the project summary.
 */
export async function readSummary(fs: FileSystem, location: ProjectLocation): Promise<VideoProjectSummary> {
  return toSummary(location, await readFacts(fs, location))
}

/**
 * Read one discovered project into its detail-route form, resolving every asset
 * the script declares against the project directory.
 * @param fs - filesystem capability supplying reads, resolution, and listings.
 * @param location - project to read.
 * @returns the project with its resolved shot list.
 */
export async function readProject(fs: FileSystem, location: ProjectLocation): Promise<VideoProject> {
  const facts = await readFacts(fs, location)
  const summary = toSummary(location, facts)
  if (!facts.script.ok) {
    return { ...summary, summary: '', duration: 0, shots: [] }
  }
  const shots = await Promise.all(facts.script.shots.map(async (raw, index) => {
    const [image, thumbnail, audio] = await Promise.all([
      resolveAsset(fs, location.path, raw.image),
      resolveAsset(fs, location.path, raw.thumbnail),
      resolveAsset(fs, location.path, raw.audio),
    ])
    return {
      id: raw.id,
      index,
      description: raw.description,
      narration: raw.narration,
      duration: raw.duration,
      visualType: raw.visualType,
      ...image === undefined ? {} : { image },
      ...thumbnail === undefined ? {} : { thumbnail },
      ...audio === undefined ? {} : { audio },
    } satisfies VideoShot
  }))
  return {
    ...summary,
    summary: facts.script.summary ?? '',
    duration: shots.reduce((total, shot) => total + shot.duration, 0),
    shots,
    ...facts.render === undefined ? {} : { render: facts.render },
  }
}

/**
 * Summarize every project under the given roots, most recently modified first.
 * @param fs - filesystem capability supplying reads and directory listings.
 * @param roots - absolute workspace directories to walk.
 * @param scanDepth - how many directory levels below each root are walked.
 * @returns one summary per discovered project.
 */
export async function listSummaries(fs: FileSystem, roots: readonly string[], scanDepth: number): Promise<VideoProjectSummary[]> {
  const locations = await discoverProjects(fs, roots, scanDepth)
  const summaries = await Promise.all(locations.map(location => readSummary(fs, location)))
  summaries.sort((left, right) => right.updatedAt - left.updatedAt || left.path.localeCompare(right.path))
  return summaries
}

/**
 * Locate one project by the path the client received from the list route.
 * @param fs - filesystem capability supplying resolution.
 * @param roots - absolute workspace directories the project must live under.
 * @param path - absolute project directory to find.
 * @returns the located project, or undefined when it is absent or outside every root.
 */
export async function locateProject(fs: FileSystem, roots: readonly string[], path: string): Promise<ProjectLocation | undefined> {
  let target: FsTarget
  try {
    target = await fs.resolve(path)
  } catch {
    /* An unresolvable path names no project. */
    return undefined
  }
  const inside = await Promise.all(roots.map(async (root) => {
    try {
      return fs.contains(await fs.resolve(root), target)
    } catch {
      /* A workspace whose directory vanished contains nothing. */
      return false
    }
  }))
  if (!inside.some(Boolean)) return undefined
  let entries
  try {
    entries = await fs.listDir(target)
  } catch {
    /* A path that is not a readable directory is not a project. */
    return undefined
  }
  const script = entries.find(entry => entry.name === SCRIPT_FILE && entry.type === 'file')
  return script === undefined ? undefined : { path: target.displayPath, dir: target, script: script.target }
}
