/**
 * The video shell mode's centre pane: the selected project's preview. A
 * rendered project plays its newest `.mp4` through the host's Range-aware
 * media route; an unrendered one shows the shot sequence in script order,
 * which is what the project actually holds before a render exists.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { VideoProject, VideoShot } from '@deepseek-ai/dsh-host-video-project/types'
import type { VideoProjectsState } from './video-store.ts'
import { videoMediaUrl } from './video-store.ts'
import { NS } from './locales.ts'
import css from './VideoPreviewPane.module.css'

/** The pane's injected business face: the roster snapshot and nothing else. */
export interface VideoPreviewPaneInjected {
  /** The roster controller's snapshot store, shared with the projects pane. */
  hooks: { videoProjects: SnapshotStore<VideoProjectsState> }
}

/** Full props for the video preview pane. */
export type VideoPreviewPaneProps =
  PropsRuntime<'shell.mode.pane'> & PropsLocale<typeof NS> & InjectFace<VideoPreviewPaneInjected>

/**
 * The still a shot's cell shows: the timeline thumbnail when the project has
 * one, else the shot's own generated image.
 * @param shot - the shot to find a still for.
 * @returns the absolute host path of a still, or undefined when there is none.
 */
function stillOf(shot: VideoShot): string | undefined {
  return shot.thumbnail ?? shot.image
}

/**
 * Render the selected project's preview.
 * @param props - runtime slot currency, the roster hooks, and the translator.
 * @returns the player or the shot sequence, or the pane's empty and failure states.
 */
export function VideoPreviewPane({ useVideoProjects, t }: VideoPreviewPaneProps) {
  const { detailStatus, project, detailError } = useVideoProjects(state => state)
  if (detailStatus === 'error') {
    return <p className={css.error} role="alert">{detailError ?? t('preview.error')}</p>
  }
  if (project === null) return <p className={css.empty}>{t('preview.empty')}</p>

  const origin = window.location.origin
  return (
    <div className={css.root}>
      <header className={css.header}>
        <h2 className={css.title}>{project.title}</h2>
        <p className={css.summary}>
          {project.summary}
          <span className={css.total}>{t('preview.duration', { seconds: Math.round(project.duration) })}</span>
        </p>
      </header>
      {project.render !== undefined
        ? (
          <video
            className={css.player}
            src={videoMediaUrl(origin, project.render)}
            controls
            preload="metadata"
            aria-label={t('preview.videoAria')}
          />
        )
        : (
          <>
            <p className={css.notice}>{t('preview.unrendered')}</p>
            <ol className={css.shots} aria-label={t('preview.shotsAria')}>
              {project.shots.map((shot: VideoProject['shots'][number]) => {
                const still = stillOf(shot)
                return (
                  <li key={shot.id} className={css.shot}>
                    <div className={css.thumb}>
                      {still === undefined
                        ? <span className={css.thumbMissing}>{t('preview.thumbnailMissing')}</span>
                        : (
                          <img
                            className={css.thumbImage}
                            src={videoMediaUrl(origin, still)}
                            alt={shot.description}
                          />
                        )}
                    </div>
                    <div className={css.body}>
                      <span className={css.shotHead}>
                        <span className={css.shotIndex}>{t('preview.shotIndex', { index: shot.index + 1 })}</span>
                        <span className={css.badge}>{t(`preview.visual.${shot.visualType}`)}</span>
                        <span className={css.time}>{t('preview.duration', { seconds: Math.round(shot.duration) })}</span>
                      </span>
                      <p className={css.description}>{shot.description}</p>
                      <p className={css.narration}>
                        <span className={css.narrationLabel}>{t('preview.narration')}</span>
                        {shot.narration}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </>
        )}
    </div>
  )
}
