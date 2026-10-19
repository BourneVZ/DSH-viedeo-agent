/**
 * The composer-dock card that offers the session which produced the selected
 * video project.
 *
 * The match is the roster controller's, so the card appears only while a video
 * pane is mounted: leaving the video shell mode clears it. Switching is one
 * explicit click — the card never replaces the conversation the user is in, and
 * it hides when that conversation already is the match.
 */
import { Button, IconNewChatOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { VideoProjectsState } from './video-store.ts'
import { NS } from './locales.ts'
import css from './VideoSessionBanner.module.css'

/** The card's injected business face. */
export interface VideoSessionBannerInjected {
  /** The roster controller's snapshot store, shared with the two video panes. */
  hooks: { videoProjects: SnapshotStore<VideoProjectsState> }
  /**
   * Make one session the conversation pane's subject.
   * @param id - the producing session.
   */
  openSession: (id: SessionId) => void
}

/** Full props for the producing-session card. */
export type VideoSessionBannerProps =
  PropsRuntime<'conversation.input.dock'> & PropsLocale<typeof NS> & InjectFace<VideoSessionBannerInjected>

/**
 * Render the producing-session card.
 * @param props - dock currency, the roster hooks, the switch verb, and the translator.
 * @returns the card, or nothing when there is no other session to offer.
 */
export function VideoSessionBanner({
  useVideoProjects, useSessions, sessionId, openSession, t,
}: VideoSessionBannerProps) {
  const match = useVideoProjects(state => state.sessionMatch)
  // A match absent from the session list still has an address to open, and a
  // session id is a wire value the card may show verbatim.
  const title = useSessions(state => (match === null ? '' : state.byId[match]?.displayTitle ?? match))
  if (match === null || match === sessionId) return null

  return (
    <div className={css.dock} data-video-session-banner>
      <div className={css.bar}>
        <span className={css.glyph}><IconNewChatOutline16 size={14} /></span>
        <span className={css.text}>{t('session.found', { title })}</span>
        <Button variant="primary" size="sm" onClick={() => { openSession(match) }}>
          {t('session.open')}
        </Button>
      </div>
    </div>
  )
}
