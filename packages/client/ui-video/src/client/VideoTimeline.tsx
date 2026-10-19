/**
 * The timeline under the player: a ruler with zoom controls and three aligned
 * tracks — subtitle, visual, audio — plus the playhead. Every row shares one
 * horizontal geometry (`GUTTER` + `total × pxPerSecond`), so the ruler and the
 * tracks stay aligned at any zoom, and one pointer surface scrubs the playhead
 * to any position. The audio track draws each shot's decoded waveform, asking
 * the pane to decode a shot it has not cached yet.
 */
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { videoMediaUrl } from './video-store.ts'
import {
  clampTime, clockParts, pxToSeconds, rulerTicks, secondsToPx, stillOf, type ShotSegment,
} from './timeline.ts'
import { NS } from './locales.ts'
import css from './VideoTimeline.module.css'

/** Fixed label gutter every row shares, keeping ruler and tracks aligned. */
const GUTTER = 84

/** Props of the timeline: geometry, the playhead, and the pane's callbacks. */
export interface VideoTimelineProps {
  /** The project's shots placed on the timeline. */
  segments: readonly ShotSegment[]
  /** The whole timeline length in seconds. */
  total: number
  /** The playhead position in seconds. */
  time: number
  /** The current zoom: rendered pixels one second spans. */
  pxPerSecond: number
  /** Whether the shot player is advancing (unrendered transport only). */
  playing: boolean
  /** Whether to draw the play/pause transport; a rendered video has its own. */
  showTransport: boolean
  /** Decoded waveform peaks keyed by the audio's absolute host path. */
  peaks: Readonly<Record<string, readonly number[]>>
  /** Deployment origin the media route is served from. */
  origin: string
  /** The `video` namespace translator. */
  t: TranslateNS<typeof NS>
  /** Seeks the playhead to a timeline position. */
  onScrub: (seconds: number) => void
  /** Toggles the shot player between playing and paused. */
  onTogglePlay: () => void
  /** Scales the tracks' time units one step. */
  onZoom: (direction: 'in' | 'out') => void
  /** Asks the pane to decode and cache one shot's waveform. */
  onRequestPeaks: (key: string, url: string) => void
}

/** One labelled track row: a sticky gutter beside a positioned content strip. */
function TrackRow(props: { label: string; width: number; children: ReactNode }) {
  return (
    <div className={clsx(css.row, css.track)}>
      <div className={css.gutter}>{props.label}</div>
      <div className={css.content} style={{ width: `${props.width}px` }}>{props.children}</div>
    </div>
  )
}

/**
 * Render the ruler, the three tracks, and the playhead.
 * @param props - the timeline geometry, the playhead, and the pane's callbacks.
 * @returns the timeline block.
 */
export function VideoTimeline({
  segments, total, time, pxPerSecond, playing, showTransport, peaks, origin, t,
  onScrub, onTogglePlay, onZoom, onRequestPeaks,
}: VideoTimelineProps) {
  const contentWidth = secondsToPx(total, pxPerSecond)
  const ticks = rulerTicks(total, pxPerSecond)
  const dragging = useRef(false)

  // Ask the pane to decode every shot audio it has not cached; the cache guard
  // keeps a poll or a re-render from requesting the same shot twice.
  useEffect(() => {
    for (const segment of segments) {
      const audio = segment.shot.audio
      if (audio !== undefined && peaks[audio] === undefined) {
        onRequestPeaks(audio, videoMediaUrl(origin, audio))
      }
    }
  }, [segments, peaks, origin, onRequestPeaks])

  const seekFrom = (el: HTMLElement, clientX: number): void => {
    const rect = el.getBoundingClientRect()
    onScrub(clampTime(pxToSeconds(clientX - rect.left - GUTTER, pxPerSecond), total))
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    dragging.current = true
    seekFrom(event.currentTarget, event.clientX)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragging.current) seekFrom(event.currentTarget, event.clientX)
  }
  const stopDrag = (): void => { dragging.current = false }

  return (
    <div className={css.root}>
      <div className={css.controls}>
        {showTransport
          ? (
            <button type="button" className={css.transport} aria-pressed={playing} onClick={onTogglePlay}>
              {playing ? t('preview.pause') : t('preview.play')}
            </button>
          )
          : null}
        <span className={css.clock} role="timer">{t('timeline.clock', clockParts(time))}</span>
        <span className={css.spacer} />
        <button type="button" className={css.zoom} aria-label={t('timeline.zoomOut')} onClick={() => { onZoom('out') }}>
          {t('timeline.zoomOut')}
        </button>
        <button type="button" className={css.zoom} aria-label={t('timeline.zoomIn')} onClick={() => { onZoom('in') }}>
          {t('timeline.zoomIn')}
        </button>
      </div>
      <div className={css.scroll}>
        <div
          className={css.inner}
          style={{ width: `${GUTTER + contentWidth}px` }}
          role="group"
          aria-label={t('timeline.scrubAria')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerLeave={stopDrag}
          onPointerCancel={stopDrag}
        >
          <div className={css.row} aria-label={t('timeline.rulerAria')}>
            <div className={css.gutter} />
            <div className={css.ruler} style={{ width: `${contentWidth}px` }}>
              {ticks.map(tick => (
                <div
                  key={tick.seconds}
                  className={clsx(css.tick, tick.major && css.tickMajor)}
                  style={{ left: `${secondsToPx(tick.seconds, pxPerSecond)}px` }}
                >
                  {tick.major
                    ? <span className={css.tickLabel}>{t('timeline.clock', clockParts(tick.seconds))}</span>
                    : null}
                </div>
              ))}
            </div>
          </div>

          <TrackRow label={t('timeline.subtitleTrack')} width={contentWidth}>
            {segments.map(segment => (
              <div
                key={segment.shot.id}
                className={clsx(css.cell, css.cellSubtitle)}
                style={{ left: `${secondsToPx(segment.start, pxPerSecond)}px`, width: `${secondsToPx(segment.duration, pxPerSecond)}px` }}
              >
                <span className={css.subtitleText}>{segment.shot.narration}</span>
              </div>
            ))}
          </TrackRow>

          <TrackRow label={t('timeline.visualTrack')} width={contentWidth}>
            {segments.map((segment) => {
              const still = stillOf(segment.shot)
              return (
                <div
                  key={segment.shot.id}
                  className={clsx(css.cell, css.cellVisual)}
                  style={{ left: `${secondsToPx(segment.start, pxPerSecond)}px`, width: `${secondsToPx(segment.duration, pxPerSecond)}px` }}
                >
                  {still === undefined
                    ? <span className={css.cellMissing}>{t('preview.thumbnailMissing')}</span>
                    : <img className={css.thumb} src={videoMediaUrl(origin, still)} alt={segment.shot.description} />}
                </div>
              )
            })}
          </TrackRow>

          <TrackRow label={t('timeline.audioTrack')} width={contentWidth}>
            {segments.map((segment) => {
              const audio = segment.shot.audio
              const bars = audio === undefined ? undefined : peaks[audio]
              return (
                <div
                  key={segment.shot.id}
                  className={clsx(css.cell, css.cellAudio)}
                  style={{ left: `${secondsToPx(segment.start, pxPerSecond)}px`, width: `${secondsToPx(segment.duration, pxPerSecond)}px` }}
                >
                  {bars === undefined || bars.length === 0
                    ? <span className={css.cellMissing}>{t('timeline.audioMissing')}</span>
                    : (
                      <div className={css.wave}>
                        {bars.map((peak, index) => (
                          <span key={index} className={css.bar} style={{ height: `${Math.round(peak * 100)}%` }} />
                        ))}
                      </div>
                    )}
                </div>
              )
            })}
          </TrackRow>

          <div
            className={css.playhead}
            style={{ left: `${GUTTER + secondsToPx(time, pxPerSecond)}px` }}
            aria-label={t('timeline.playheadAria')}
          />
        </div>
      </div>
    </div>
  )
}
