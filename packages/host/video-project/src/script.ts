/**
 * Tolerant reader for the model-authored `script.json` a video agent writes.
 * The video preset's persona fixes the file's required content but not its key
 * spelling, so every field accepts the English and Chinese aliases an agent
 * plausibly emits. A file that is not a JSON object, or that carries no shot
 * list, is reported as a parse error rather than as an empty project: the
 * project still appears in the list so the user can see and fix it.
 * @module @deepseek-ai/dsh-host-video-project/script
 */

import type { ShotVisualType } from './types.ts'

/** One shot as written in `script.json`, before path resolution. */
export interface RawShot {
  /** Shot id from the file, or `shot-<index + 1>` when the entry omits one. */
  id: string
  /** Declared visual description. */
  description: string
  /** Declared narration text. */
  narration: string
  /** Declared duration in seconds; 0 when absent or not a finite positive number. */
  duration: number
  /** Declared visual kind, mapped from free text. */
  visualType: ShotVisualType
  /** Declared image path, relative to the project directory or absolute. */
  image?: string
  /** Declared thumbnail path, relative to the project directory or absolute. */
  thumbnail?: string
  /** Declared narration audio path, relative to the project directory or absolute. */
  audio?: string
}

/** The shot list plus the project-level fields a `script.json` declares. */
export interface ParsedScript {
  /** Declared video title; absent when the file omits one. */
  title?: string
  /** Declared overall summary; absent when the file omits one. */
  summary?: string
  /** Shots in file order. */
  shots: RawShot[]
}

/** Outcome of reading one `script.json`. */
export type ScriptParseResult =
  | { ok: true; script: ParsedScript }
  | { ok: false; error: string }

const TITLE_KEYS = ['title', 'name', 'videoTitle', '视频标题', '标题']
const SUMMARY_KEYS = ['summary', 'overview', 'description', 'synopsis', '整体概述', '概述', '简介']
const SHOTS_KEYS = ['shots', 'scenes', 'shotList', '分镜', '镜头']

const SHOT_ID_KEYS = ['id', 'shotId', 'name', '编号']
const SHOT_DESCRIPTION_KEYS = ['description', 'visual', 'visualDescription', 'scene', '画面描述', '画面', '画面内容', '描述']
const SHOT_NARRATION_KEYS = ['narration', 'voiceover', 'subtitle', 'text', 'line', '旁白', '字幕', '台词']
const SHOT_DURATION_KEYS = ['duration', 'durationSeconds', 'seconds', 'length', '预计时长', '时长']
const SHOT_VISUAL_TYPE_KEYS = ['visualType', 'type', 'kind', 'visual', '视觉类型', '类型']
const SHOT_IMAGE_KEYS = ['image', 'imagePath', 'imageUrl', 'src', '图片', '画面文件']
const SHOT_THUMBNAIL_KEYS = ['thumbnail', 'thumb', 'snapshot', 'poster', 'preview', '缩略图', '快照']
const SHOT_AUDIO_KEYS = ['audio', 'audioPath', 'narrationAudio', 'voice', 'speech', '音频', '旁白音频']

/** Directories never descended into: dependency and metadata trees hold no projects. */
export const SKIPPED_DIRECTORY_NAMES: ReadonlySet<string> = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'lib', 'out', 'build'])

/**
 * Read the first present key from an object, in alias priority order.
 * @param source - object to read, or a non-object when the file nests oddly.
 * @param keys - alias list, highest priority first.
 * @returns the first value whose key is present, or undefined.
 */
function pick(source: unknown, keys: readonly string[]): unknown {
  if (typeof source !== 'object' || source === null) return undefined
  const record = source as Record<string, unknown>
  for (const key of keys) {
    if (record[key] !== undefined) return record[key]
  }
  return undefined
}

/**
 * Coerce a declared value to display text.
 * @param value - raw JSON value.
 * @returns the trimmed string form, or the empty string for absent and non-textual values.
 */
function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/**
 * Coerce a declared duration to seconds.
 * @param value - raw JSON value; a string carries a number an agent quoted.
 * @returns the finite positive duration, or 0 when the declaration is unusable.
 */
function toDuration(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

/**
 * Map free-text visual-kind declarations onto the three kinds the timeline draws.
 * @param value - raw JSON value of the visual-type alias that was present.
 * @returns `html` for animation declarations, `image` for generated-image declarations, else `unknown`.
 */
function toVisualType(value: unknown): ShotVisualType {
  const text = toText(value).toLowerCase()
  if (text.length === 0) return 'unknown'
  if (text.includes('html') || text.includes('animation') || text.includes('动画')) return 'html'
  if (text.includes('image') || text.includes('img') || text.includes('picture')
    || text.includes('图') || text.includes('photo')) return 'image'
  return 'unknown'
}

/**
 * Normalize one entry of the `shots` array.
 * @param entry - raw array element.
 * @param index - zero-based position, used to synthesize a missing id.
 * @returns the shot, or undefined when the entry is not an object.
 */
function toShot(entry: unknown, index: number): RawShot | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined
  const id = toText(pick(entry, SHOT_ID_KEYS))
  const image = toText(pick(entry, SHOT_IMAGE_KEYS))
  const thumbnail = toText(pick(entry, SHOT_THUMBNAIL_KEYS))
  const audio = toText(pick(entry, SHOT_AUDIO_KEYS))
  return {
    id: id.length > 0 ? id : `shot-${index + 1}`,
    description: toText(pick(entry, SHOT_DESCRIPTION_KEYS)),
    narration: toText(pick(entry, SHOT_NARRATION_KEYS)),
    duration: toDuration(pick(entry, SHOT_DURATION_KEYS)),
    visualType: toVisualType(pick(entry, SHOT_VISUAL_TYPE_KEYS)),
    ...image.length > 0 ? { image } : {},
    ...thumbnail.length > 0 ? { thumbnail } : {},
    ...audio.length > 0 ? { audio } : {},
  }
}

/**
 * Parse one `script.json` body.
 * @param raw - the file's UTF-8 content.
 * @returns the normalized script, or the reason it is unusable as a shot list.
 */
export function parseScript(raw: string): ScriptParseResult {
  let document: unknown
  try {
    document = JSON.parse(raw)
  } catch (error) {
    return { ok: false, error: `script.json is not valid JSON: ${(error as Error).message}` }
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    return { ok: false, error: 'script.json must be a JSON object' }
  }
  const rawShots = pick(document, SHOTS_KEYS)
  if (!Array.isArray(rawShots)) {
    return { ok: false, error: 'script.json has no shots array' }
  }
  const shots = rawShots.flatMap((entry, index) => {
    const shot = toShot(entry, index)
    return shot === undefined ? [] : [shot]
  })
  const title = toText(pick(document, TITLE_KEYS))
  const summary = toText(pick(document, SUMMARY_KEYS))
  return {
    ok: true,
    script: {
      ...title.length > 0 ? { title } : {},
      ...summary.length > 0 ? { summary } : {},
      shots,
    },
  }
}
