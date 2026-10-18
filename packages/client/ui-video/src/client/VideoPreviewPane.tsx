/**
 * The video shell mode's centre pane. It owns the preview's local playback
 * state — the playhead, the transport, and the zoom — and switches between the
 * formatted script and the player. A rendered project plays its `.mp4` and
 * drives the playhead from the video's own clock; an unrendered one runs a
 * virtual clock over the shot segments, so a project previews as soon as its
 * script and narration audio exist, before any render.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { VideoPlayer } from './VideoPlayer.tsx'
import { VideoScriptView } from './VideoScriptView.tsx'
import { VideoTimeline } from './VideoTimeline.tsx'
import { buildSegments, totalDuration } from './timeline.ts'
import { type VideoProjectsState, type VideoViewMode } from './video-store.ts'
import { NS } from './locales.ts'
import css from './VideoPreviewPane.module.css'

/** Virtual-clock step for the unrendered shot player, in milliseconds. */
const PLAY_TICK_MS = 100
/** One zoom click's scale factor on the tracks' pixels-per-second. */
const ZOOM_FACTOR = 1.5
/** Zoom floor: the sparsest the tracks may be. */
const MIN_PX_PER_SECOND = 4
/** Zoom ceiling: the densest the tracks may be. */
const MAX_PX_PER_SECOND = 400
/** Zoom the timeline opens at. */
const DEFAULT_PX_PER_SECOND = 40

/** The pane's injected business face: the roster snapshot and its two actions. */
export interface VideoPreviewPaneInjected {
  /** The roster controller's snapshot store, shared with the projects pane. */
  hooks: { videoProjects: SnapshotStore<VideoProjectsState> }
  /** Switches the pane between the formatted script and the player. */
  setViewMode: (mode: VideoViewMode) => void
  /** Decodes and caches one shot's waveform, keyed by its audio path. */
  ensurePeaks: (key: string, url: string) => void
}

/** Full props for the video preview pane. */
export type VideoPreviewPaneProps =
  PropsRuntime<'shell.mode.pane'> & PropsLocale<typeof NS> & InjectFace<VideoPreviewPaneInjected>

/**
 * Render the selected project's script or player.
 * @param props - runtime slot currency, the roster hooks and actions, and the translator.
 * @returns the toggled surface, or the pane's empty and failure states.
 */
export function VideoPreviewPane({ useVideoProjects, setViewMode, ensurePeaks, t }: VideoPreviewPaneProps) {
  const { detailStatus, project, detailError, viewMode, peaks } = useVideoProjects(state => state)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const segments = useMemo(() => project === null ? [] : buildSegments(project.shots), [project])
  const total = totalDuration(segments)
  const rendered = project?.render !== undefined
  const projectPath = project?.path

  // A different project starts its playback over.
  useEffect(() => {
    setTime(0)
    setPlaying(false)
  }, [projectPath])

  // The unrendered shot player's clock; a rendered video is its own clock and
  // reports through onTime instead, so this stays idle while one is loaded.
  useEffect(() => {
    if (!playing || rendered) return
    const timer = setInterval(() => {
      setTime(current => (current + PLAY_TICK_MS / 1000 >= total ? 0 : current + PLAY_TICK_MS / 1000))
    }, PLAY_TICK_MS)
    return () => { clearInterval(timer) }
  }, [playing, rendered, total])

  // Narration audio for the unrendered shot player: load the active shot's
  // audio and follow the playhead into it. The whole effect is media-element
  // work jsdom does not implement, and it stays inert for a project whose shots
  // carry no audio, which is every case a spec drives.
  useEffect(() => {
    /* v8 ignore start -- jsdom implements no media playback; these audio-element calls cannot run under test. */
    const audio = audioRef.current
    if (audio === null) return
    if (!segments.some(segment => segment.shot.audio !== undefined)) return
    const active = segments.find(segment => time >= segment.start && time < segment.end)
    const path = active?.shot.audio
    if (path === undefined) {
      audio.pause()
      return
    }
    const url = `${window.location.origin}/api/video/media?path=${encodeURIComponent(path)}`
    if (audio.getAttribute('src') !== url) {
      audio.src = url
      audio.currentTime = Math.max(0, time - (active?.start ?? 0))
    }
    if (playing) void audio.play().catch(() => {})
    else audio.pause()
    /* v8 ignore stop */
  }, [segments, time, playing])

  if (detailStatus === 'error') {
    return <p className={css.error} role="alert">{detailError ?? t('preview.error')}</p>
  }
  if (project === null) return <p className={css.empty}>{t('preview.empty')}</p>

  const origin = window.location.origin
  const onScrub = (seconds: number): void => {
    setTime(seconds)
    /* v8 ignore next -- jsdom implements no media playback; no spec scrubs a rendered video. */
    if (videoRef.current !== null) videoRef.current.currentTime = seconds
  }
  const onZoom = (direction: 'in' | 'out'): void => {
    setPxPerSecond((current) => {
      const next = direction === 'in' ? current * ZOOM_FACTOR : current / ZOOM_FACTOR
      return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, next))
    })
  }

  return (
    <div className={css.root} data-view={viewMode}>
      <header className={css.header}>
        <div className={css.heading}>
          <h2 className={css.title}>{project.title}</h2>
          <p className={css.summary}>
            {project.summary}
            <span className={css.total}>{t('preview.duration', { seconds: Math.round(total) })}</span>
          </p>
        </div>
        <div className={css.toggle} role="group" aria-label={t('preview.toggleAria')}>
          <button
            type="button"
            className={clsx(css.toggleOption, viewMode === 'script' && css.toggleActive)}
            aria-pressed={viewMode === 'script'}
            onClick={() => { setViewMode('script') }}
          >
            {t('preview.toggle.script')}
          </button>
          <button
            type="button"
            className={clsx(css.toggleOption, viewMode === 'preview' && css.toggleActive)}
            aria-pressed={viewMode === 'preview'}
            onClick={() => { setViewMode('preview') }}
          >
            {t('preview.toggle.preview')}
          </button>
        </div>
      </header>

      {viewMode === 'script'
        ? <VideoScriptView project={project} origin={origin} t={t} />
        : (
          <div className={css.preview}>
            <div className={css.player}>
              <VideoPlayer
                project={project}
                segments={segments}
                time={time}
                origin={origin}
                t={t}
                videoRef={videoRef}
                onTime={setTime}
              />
            </div>
            <VideoTimeline
              segments={segments}
              total={total}
              time={time}
              pxPerSecond={pxPerSecond}
              playing={playing}
              showTransport={!rendered}
              peaks={peaks}
              origin={origin}
              t={t}
              onScrub={onScrub}
              onTogglePlay={() => { setPlaying(current => !current) }}
              onZoom={onZoom}
              onRequestPeaks={ensurePeaks}
            />
            <audio ref={audioRef} className={css.hiddenAudio} />
          </div>
        )}
    </div>
  )
}
