/**
 * The preview player's visual surface. A rendered project plays its newest
 * `.mp4` through the host's Range-aware media route with native transport; an
 * unrendered one shows the shot the virtual playhead is inside — its still as
 * the picture and its narration as the subtitle — which is the whole of the
 * shot-sequence player before a render exists.
 */
import type { Ref } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { VideoProject } from '@deepseek-ai/dsh-host-video-project/types'
import { videoMediaUrl } from './video-store.ts'
import { activeSegmentAt, stillOf, type ShotSegment } from './timeline.ts'
import { NS } from './locales.ts'
import css from './VideoPlayer.module.css'

/** Props of the preview player's visual surface. */
export interface VideoPlayerProps {
  /** The selected project. */
  project: VideoProject
  /** The project's shots placed on the timeline. */
  segments: readonly ShotSegment[]
  /** The playhead position in seconds. */
  time: number
  /** Deployment origin the media route is served from. */
  origin: string
  /** The `video` namespace translator. */
  t: TranslateNS<typeof NS>
  /** Ref the pane holds on the rendered `<video>`, to seek it from the timeline. */
  videoRef: Ref<HTMLVideoElement>
  /** Reports the rendered video's own clock, so the timeline follows it. */
  onTime: (seconds: number) => void
}

/**
 * Render the visual surface for the selected project.
 * @param props - the project, its timeline, the playhead, and the media origin.
 * @returns the rendered player, or the active shot's still and subtitle.
 */
export function VideoPlayer({ project, segments, time, origin, t, videoRef, onTime }: VideoPlayerProps) {
  if (project.render !== undefined) {
    return (
      <video
        ref={videoRef}
        className={css.video}
        src={videoMediaUrl(origin, project.render)}
        controls
        preload="metadata"
        aria-label={t('preview.videoAria')}
        onTimeUpdate={(event) => { onTime(event.currentTarget.currentTime) }}
      />
    )
  }
  const active = activeSegmentAt(segments, time)
  const still = active === undefined ? undefined : stillOf(active.shot)
  const narration = active?.shot.narration ?? ''
  const description = active?.shot.description ?? ''
  return (
    <div className={css.stage} role="group" aria-label={t('preview.playerAria')}>
      <div className={css.visual}>
        {still === undefined
          ? <span className={css.missing}>{t('preview.thumbnailMissing')}</span>
          : <img className={css.image} src={videoMediaUrl(origin, still)} alt={description} />}
      </div>
      <p className={css.subtitle} aria-label={t('preview.subtitleAria')}>{narration}</p>
    </div>
  )
}
