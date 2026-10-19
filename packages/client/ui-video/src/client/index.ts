/**
 * Video-production plugin, browser half: one alternative shell mode plus the
 * two panes it owns.
 *
 * The mode is declared through `ctx.layout.registerShellMode`, so the shell
 * draws the top-bar switch and lays the panes out without knowing what a video
 * project is; its third pane is `{ kind: 'conversation', simple: true }`, which
 * re-mounts the frame's own conversation surface on the right in its chat-only
 * posture — the real transcript and one input, including the bubble Markdown
 * rendering and the collapsible intermediate steps, without the View tabs, the
 * model seat, or the composer tool row — rather than a restaging of them.
 *
 * The two panes this package registers share one roster controller, so a
 * selection made on the left is what the centre renders and one poll keeps
 * both current while an agent writes into the project directory. The same
 * controller carries the session that produced the selection to a card in the
 * conversation's composer dock, which offers the switch rather than making it.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the layout service merge (ctx.layout) and the mode contract.
import type { ShellModeSpec } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the input-dock slot declaration and its owner props.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the Session standard hooks the banner reads (useSessions, sessionId).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the sessions service merge (ctx.sessions) and its list rows.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { VideoPreviewPane, type VideoPreviewPaneInjected } from './VideoPreviewPane.tsx'
import { VideoProjectsPane, type VideoProjectsPaneInjected } from './VideoProjectsPane.tsx'
import { VideoSessionBanner, type VideoSessionBannerInjected } from './VideoSessionBanner.tsx'
import { VideoProjectsController } from './video-store.ts'
import { en, NS, zh, type VideoKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Video-production surface copy. */
    'video': VideoKey
  }
}

export type { VideoPreviewPaneInjected, VideoPreviewPaneProps } from './VideoPreviewPane.tsx'
export type { VideoProjectsPaneInjected, VideoProjectsPaneProps } from './VideoProjectsPane.tsx'
export type { VideoSessionBannerInjected, VideoSessionBannerProps } from './VideoSessionBanner.tsx'
export type { VideoProjectsState } from './video-store.ts'
export {
  browserJsonFetch, POLL_INTERVAL_MS, readProjectDetail, readProjectList, videoMediaUrl,
  VideoProjectsController, type VideoJsonFetch,
} from './video-store.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'layout', 'sessions']

/**
 * Register the video shell mode and its two panes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const projects = new VideoProjectsController()

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-video: dictionaries')

  ctx.effect(() => {
    // The roster column stays fixed and the conversation column stays usable,
    // so the preview takes whatever width is left.
    const spec: ShellModeSpec = {
      id: 'video',
      // A thunk, so the switch follows the active language without a re-registration.
      label: () => ctx.locale.bind(NS)('mode.label'),
      columns: '260px minmax(0, 1fr) 400px',
      panes: [
        { kind: 'pane', pane: 'projects' },
        { kind: 'pane', pane: 'preview' },
        { kind: 'conversation', simple: true },
      ],
    }
    return ctx.layout.registerShellMode(spec)
  }, 'ui-video: shell mode')

  const projectsInjected = (): VideoProjectsPaneInjected => ({
    hooks: { videoProjects: projects.store },
    start: () => projects.start(),
    select: (path: string) => { void projects.select(path) },
  })

  const previewInjected = (): VideoPreviewPaneInjected => ({
    hooks: { videoProjects: projects.store },
    setViewMode: (mode) => { projects.setViewMode(mode) },
    ensurePeaks: (key, url) => { void projects.ensurePeaks(key, url) },
  })

  // The pane slot is declared by the frame's root registration, which mounts
  // after this apply world runs, so both rows wait for the declaration.
  ctx.slots.inject('shell.mode.pane', () => [
    ctx.slots.register({
      name: 'shell.mode.pane',
      key: 'projects',
      locale: NS,
      inject: projectsInjected,
    }, VideoProjectsPane),
    ctx.slots.register({
      name: 'shell.mode.pane',
      key: 'preview',
      locale: NS,
      inject: previewInjected,
    }, VideoPreviewPane),
  ])

  const bannerInjected = (): VideoSessionBannerInjected => ({
    hooks: { videoProjects: projects.store },
    openSession: (id) => { ctx.sessions.open(id) },
  })

  // The dock is declared by the conversation's input zone, so this row waits for
  // that declaration and leaves with this plugin's fiber.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'video-session',
    order: 20,
    locale: NS,
    inject: bannerInjected,
  }, VideoSessionBanner))
}
