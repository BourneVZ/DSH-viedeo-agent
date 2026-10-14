/**
 * The video shell mode's left pane: every discovered project, most recently
 * modified first, as one selectable row. Selecting a row is the only thing
 * this pane does — the centre pane renders whatever the roster controller
 * resolved for it.
 */
import { useEffect } from 'react'
import { relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { VideoProjectSummary } from '@deepseek-ai/dsh-host-video-project/types'
import type { VideoProjectsState } from './video-store.ts'
import { NS } from './locales.ts'
import css from './VideoProjectsPane.module.css'

/** The pane's injected business face. */
export interface VideoProjectsPaneInjected {
  /** The roster controller's snapshot store, shared with the preview pane. */
  hooks: { videoProjects: SnapshotStore<VideoProjectsState> }
  /** Start the roster poll; the returned stopper runs on unmount. */
  start: () => () => void
  /**
   * Make one project the preview pane's subject.
   * @param path - absolute project path.
   */
  select: (path: string) => void
}

/** Full props for the video project roster pane. */
export type VideoProjectsPaneProps =
  PropsRuntime<'shell.mode.pane'> & PropsLocale<typeof NS> & InjectFace<VideoProjectsPaneInjected>

/**
 * One row's trailing age. Sampled per render rather than on a timer: the pane
 * re-renders on every poll, so the bucket is at most one poll stale and no
 * clock outlives the pane.
 * @param at - the project's `script.json` modification time in epoch ms.
 * @param now - current epoch ms.
 * @param t - the namespace translator.
 * @returns the localized age label.
 */
function updatedLabel(at: number, now: number, t: TranslateNS<typeof NS>): string {
  const { unit, n } = relativeTime(at, now)
  return t(`projects.updated.${unit}`, { n })
}

/**
 * Render the project roster.
 * @param props - runtime slot currency, the roster hooks, and the translator.
 * @returns the pane's header and its rows.
 */
export function VideoProjectsPane({ useVideoProjects, start, select, t }: VideoProjectsPaneProps) {
  const { listStatus, projects, listError, selected } = useVideoProjects(state => state)
  useEffect(() => start(), [start])
  const now = Date.now()

  return (
    <div className={css.root}>
      <h2 className={css.title}>{t('projects.title')}</h2>
      {listStatus === 'error'
        ? <p className={css.error} role="alert">{listError ?? t('projects.error')}</p>
        : null}
      {projects.length > 0
        ? (
          <ul className={css.list} aria-label={t('projects.listAria')}>
            {projects.map((project: VideoProjectSummary) => (
              <li key={project.path} className={css.item}>
                <button
                  type="button"
                  className={css.row}
                  title={project.path}
                  aria-current={project.path === selected ? 'true' : undefined}
                  onClick={() => { select(project.path) }}
                >
                  <span className={css.name}>{project.title}</span>
                  <span className={css.meta}>
                    <span>{t('projects.shots', { count: project.shotCount })}</span>
                    {project.hasRender
                      ? <span className={css.badge}>{t('projects.rendered')}</span>
                      : null}
                    {project.error !== undefined
                      ? <span className={css.badgeWarn}>{t('projects.broken')}</span>
                      : null}
                    <span className={css.time}>{updatedLabel(project.updatedAt, now, t)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
        : null}
      {/* The hint waits for an answer: an in-flight first read is not yet an
          empty roster, and saying so would flash a claim the poll retracts. */}
      {projects.length === 0 && listStatus === 'ready'
        ? <p className={css.empty}>{t('projects.empty')}</p>
        : null}
    </div>
  )
}
