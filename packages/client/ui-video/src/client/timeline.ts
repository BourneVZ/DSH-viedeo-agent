/**
 * Pure timeline math for the video preview player: the shot segments a project
 * resolves to, the ruler ticks a zoom level draws, and the pixel↔second and
 * playhead↔shot lookups the tracks and the virtual player share.
 *
 * Nothing here touches the DOM or a clock, so the playhead, the ruler, and the
 * three tracks are all derived from the same numbers and stay aligned.
 */
import type { VideoShot } from '@deepseek-ai/dsh-host-video-project/types'

/** One shot placed on the timeline by its cumulative offset. */
export interface ShotSegment {
  /** The shot this segment renders. */
  shot: VideoShot
  /** Segment start in seconds from the project's zero point. */
  start: number
  /** Segment end in seconds, exclusive; equal to `start` for a zero-length shot. */
  end: number
  /** Non-negative duration in seconds. */
  duration: number
}

/** One ruler mark. */
export interface RulerTick {
  /** The mark's position in seconds from the project's zero point. */
  seconds: number
  /** True on the sparser labeled marks, false on the minor ticks between them. */
  major: boolean
}

/** Seconds a minor tick must span on screen before the ladder steps up. */
const MIN_TICK_PX = 64
/** Minor ticks between two labeled marks. */
const LABEL_EVERY = 5
/** Candidate tick steps in seconds, dense to sparse. */
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]

/**
 * The still a shot shows on screen: its timeline thumbnail when the project has
 * one, else the shot's own generated image.
 * @param shot - the shot to find a still for.
 * @returns the absolute host path of a still, or undefined when there is none.
 */
export function stillOf(shot: VideoShot): string | undefined {
  return shot.thumbnail ?? shot.image
}

/**
 * Place a shot list on the timeline by cumulative duration.
 * @param shots - the project's shots in script order.
 * @returns one segment per shot, each carrying its start and end offset.
 */
export function buildSegments(shots: readonly VideoShot[]): ShotSegment[] {
  const segments: ShotSegment[] = []
  let cursor = 0
  for (const shot of shots) {
    const duration = Math.max(0, shot.duration)
    segments.push({ shot, start: cursor, end: cursor + duration, duration })
    cursor += duration
  }
  return segments
}

/**
 * The whole timeline's length.
 * @param segments - the placed shots.
 * @returns the last segment's end in seconds, or 0 for an empty timeline.
 */
export function totalDuration(segments: readonly ShotSegment[]): number {
  const last = segments.at(-1)
  return last === undefined ? 0 : last.end
}

/**
 * The segment the playhead sits in.
 * @param segments - the placed shots.
 * @param seconds - the playhead position, already clamped into the timeline.
 * @returns the segment covering that position, or the last one once the
 * playhead reaches or passes the end, or undefined for an empty timeline.
 */
export function activeSegmentAt(
  segments: readonly ShotSegment[], seconds: number,
): ShotSegment | undefined {
  for (const segment of segments) {
    if (seconds >= segment.start && seconds < segment.end) return segment
  }
  return segments.at(-1)
}

/**
 * The ruler tick step a zoom level draws at.
 * @param pxPerSecond - the current zoom: rendered pixels one second spans.
 * @returns the smallest candidate step whose ticks stay at least
 * {@link MIN_TICK_PX} apart, or the sparsest candidate when even it is denser.
 */
export function tickStep(pxPerSecond: number): number {
  for (const step of TICK_STEPS) {
    if (step * pxPerSecond >= MIN_TICK_PX) return step
  }
  return TICK_STEPS[TICK_STEPS.length - 1] as number
}

/**
 * The ruler marks for a timeline at one zoom.
 * @param totalSeconds - the timeline length.
 * @param pxPerSecond - the current zoom: rendered pixels one second spans.
 * @returns the ticks from zero to the end inclusive, or none when the zoom or
 * the timeline is not positive.
 */
export function rulerTicks(totalSeconds: number, pxPerSecond: number): RulerTick[] {
  if (pxPerSecond <= 0) return []
  if (totalSeconds <= 0) return []
  const step = tickStep(pxPerSecond)
  const count = Math.floor(totalSeconds / step)
  const ticks: RulerTick[] = []
  for (let i = 0; i <= count; i++) {
    ticks.push({ seconds: i * step, major: i % LABEL_EVERY === 0 })
  }
  return ticks
}

/**
 * Map a timeline position to a rendered offset.
 * @param seconds - the position in seconds.
 * @param pxPerSecond - the current zoom.
 * @returns the offset in pixels from the timeline's left edge.
 */
export function secondsToPx(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond
}

/**
 * Map a rendered offset to a timeline position.
 * @param px - the offset in pixels from the timeline's left edge.
 * @param pxPerSecond - the current zoom, positive.
 * @returns the position in seconds.
 */
export function pxToSeconds(px: number, pxPerSecond: number): number {
  return px / pxPerSecond
}

/**
 * Clamp a playhead position into a timeline.
 * @param seconds - the requested position.
 * @param totalSeconds - the timeline length.
 * @returns the position held within `[0, max(totalSeconds, 0)]`.
 */
export function clampTime(seconds: number, totalSeconds: number): number {
  return Math.min(Math.max(seconds, 0), Math.max(totalSeconds, 0))
}

/**
 * One ruler label's zero-padded clock parts. A type alias, not an interface, so
 * it carries an implicit index signature and spreads straight into the
 * translator's `Record<string, unknown>` params.
 */
export type ClockParts = {
  /** Whole minutes, two digits. */
  mm: string
  /** Remaining whole seconds, two digits. */
  ss: string
}

/**
 * Split a timeline position into zero-padded `mm:ss` parts for a ruler label.
 * @param seconds - the position, held at zero when negative.
 * @returns the minute and second parts, each two digits.
 */
export function clockParts(seconds: number): ClockParts {
  const whole = Math.max(0, Math.floor(seconds))
  return {
    mm: String(Math.floor(whole / 60)).padStart(2, '0'),
    ss: String(whole % 60).padStart(2, '0'),
  }
}
