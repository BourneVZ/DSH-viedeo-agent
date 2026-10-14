/**
 * Wire types of the `/api/video` routes. Every field is JSON-encoded verbatim
 * to the browser half; paths are absolute in the host filesystem's spelling and
 * double as the opaque project and media identifiers the client echoes back.
 * @module @deepseek-ai/dsh-host-video-project/types
 */

/** The visual kind a shot declares for itself in `script.json`. */
export type ShotVisualType = 'html' | 'image' | 'unknown'

/** One shot of a video project, normalized from the model-authored `script.json`. */
export interface VideoShot {
  /** Shot id from `script.json`, or `shot-<index + 1>` when the entry omits one. */
  id: string
  /** Zero-based position in the `shots` array. */
  index: number
  /** Declared visual description of the shot. */
  description: string
  /** Narration text; the subtitle track renders it verbatim. */
  narration: string
  /** Declared or measured duration in seconds; 0 when the script omits it. */
  duration: number
  /** Declared visual kind, mapped from free text. */
  visualType: ShotVisualType
  /** Absolute path of the shot's generated image, when the script names one that exists. */
  image?: string
  /** Absolute path of a still frame used as the timeline thumbnail. */
  thumbnail?: string
  /** Absolute path of the narration audio file, when it exists. */
  audio?: string
}

/** The project summary carried by the list route; shot detail stays on the project route. */
export interface VideoProjectSummary {
  /** Absolute path of the project directory; the client's opaque project id. */
  path: string
  /** Directory basename. */
  name: string
  /** Title declared in `script.json`, or the directory name when absent. */
  title: string
  /** `script.json` modification time in epoch milliseconds, 0 when unavailable. */
  updatedAt: number
  /** Number of entries in the `shots` array. */
  shotCount: number
  /** Whether the project directory holds at least one rendered `.mp4`. */
  hasRender: boolean
  /** Why `script.json` could not be read as a shot list; absent when it parsed. */
  error?: string
}

/** One discovered video project with its resolved shot list. */
export interface VideoProject extends VideoProjectSummary {
  /** Overall summary declared in `script.json`. */
  summary: string
  /** Sum of the declared shot durations in seconds. */
  duration: number
  /** Shots in script order. */
  shots: VideoShot[]
  /** Absolute path of the newest rendered `.mp4` in the project, when one exists. */
  render?: string
}

/** Response body of `GET /api/video/projects`. */
export interface VideoProjectListResponse {
  /** Every discovered project, most recently modified first. */
  projects: VideoProjectSummary[]
}

/** Response body of `GET /api/video/project`. */
export interface VideoProjectResponse {
  /** The requested project with its resolved shot list. */
  project: VideoProject
}
