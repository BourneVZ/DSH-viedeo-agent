/**
 * The formatted script surface: the selected project's `script.json` laid out
 * for reading — its title, summary, and every shot's visual kind, duration,
 * description, still, and full narration — rather than shown as raw JSON. This
 * is what the preview pane renders in script mode.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { VideoProject } from '@deepseek-ai/dsh-host-video-project/types'
import { videoMediaUrl } from './video-store.ts'
import { stillOf } from './timeline.ts'
import { NS } from './locales.ts'
import css from './VideoScriptView.module.css'

/** Props of the formatted script surface. */
export interface VideoScriptViewProps {
  /** The project whose script to lay out. */
  project: VideoProject
  /** Deployment origin the still images are served from. */
  origin: string
  /** The `video` namespace translator. */
  t: TranslateNS<typeof NS>
}

/**
 * Lay out one project's script for reading.
 * @param props - the project, the media origin, and the translator.
 * @returns the title, summary, and shot list, or the empty-script notice.
 */
export function VideoScriptView({ project, origin, t }: VideoScriptViewProps) {
  return (
    <div className={css.root}>
      <header className={css.head}>
        <h2 className={css.title}>{project.title}</h2>
        {project.summary === '' ? null : (
          <p className={css.summary}>
            <span className={css.label}>{t('preview.scriptSummary')}</span>
            {project.summary}
          </p>
        )}
      </header>
      {project.shots.length === 0
        ? <p className={css.empty}>{t('preview.scriptEmpty')}</p>
        : (
          <ol className={css.shots} aria-label={t('preview.scriptShots')}>
            {project.shots.map((shot) => {
              const still = stillOf(shot)
              return (
                <li key={shot.id} className={css.shot}>
                  <div className={css.shotHead}>
                    <span className={css.index}>{t('preview.shotIndex', { index: shot.index + 1 })}</span>
                    <span className={css.badge}>{t(`preview.visual.${shot.visualType}`)}</span>
                    <span className={css.time}>{t('preview.duration', { seconds: Math.round(shot.duration) })}</span>
                  </div>
                  {still === undefined ? null : (
                    <img className={css.still} src={videoMediaUrl(origin, still)} alt={shot.description} />
                  )}
                  <p className={css.description}>{shot.description}</p>
                  <p className={css.narration}>
                    <span className={css.label}>{t('preview.narration')}</span>
                    {shot.narration}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
    </div>
  )
}
