/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry itself lives in the root entry's layout store (stores.ts);
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (sidebar toggle from ui-sidebar,
 * right-panel show/hide from ui-sidebar-right) — writes stay inside the
 * store's declared action set, delivered as the registration's bound actions.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellModeSpec } from './shell-mode.ts'
import type { createLayoutStore } from './stores.ts'

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/**
 * The outward layout face (`ctx.layout`): the panel transitions other
 * plugins may trigger — and exactly what a test fake must supply. The
 * attachPanels wiring hook stays on the concrete class (root-entry assembly
 * only).
 */
export interface ILayout {
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /**
   * Report the right panel's presentation without changing its expanded state.
   * @param track - whether the normal panel width reserves a grid track,
   *   including beneath a fullscreen overlay.
   * @param fullscreen - whether the panel covers the frame and hides its outer
   *   resize handle; independent of the underlying grid track.
   */
  openRightbar(track: boolean, fullscreen: boolean): void
  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void
  /**
   * Contribute an alternative shell layout selectable from the top bar. The
   * shell renders the spec's panes in order; a `{ kind: 'conversation' }` pane
   * re-mounts the frame's own conversation surface at that position, and a
   * `{ kind: 'pane', pane }` pane mounts whoever registered the `pane` key into
   * the frame's `shell.mode.pane` slot. A mode id contributed twice resolves to
   * the later spec.
   * @param spec - the mode definition; its label arrives already localized.
   * @returns the disposer withdrawing this mode; withdrawing the selected mode
   *   returns the frame to the default layout.
   */
  registerShellMode(spec: ShellModeSpec): () => void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  #panels: PanelActions | undefined
  #modes: ShellModeSpec[] = []

  /**
   * Adopt the root entry's bound store actions. Called from the root
   * registration's inject hook (a sanctioned assembly side effect), so the
   * face is live from the entry's first render; on entry re-register the
   * fresh actions overwrite the stale set.
   * @param actions - bound actions of the entry's layout store instance.
   */
  attachPanels(actions: PanelActions): void {
    this.#panels = actions
    // A plugin's apply world runs before the entry's first render, so modes
    // collected while unwired are published once the store exists.
    if (this.#modes.length > 0) actions.replaceShellModes(this.#modes)
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.#require().toggleSidebar()
  }

  /** Report the right panel's track and fullscreen presentation. */
  openRightbar(track: boolean, fullscreen: boolean): void {
    this.#require().openRightbar(track, fullscreen)
  }

  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void {
    this.#require().closeRightbar()
  }

  /** Contribute an alternative shell layout selectable from the top bar. */
  registerShellMode(spec: ShellModeSpec): () => void {
    this.#modes = [...this.#modes.filter(mode => mode.id !== spec.id), spec]
    this.#publish()
    return () => {
      this.#modes = this.#modes.filter(mode => mode.id !== spec.id)
      this.#publish()
    }
  }

  #publish(): void {
    this.#panels?.replaceShellModes(this.#modes)
  }

  #require(): PanelActions {
    // Callers are UI gestures, which cannot fire before the root entry
    // rendered (the inject hook runs in its first render) — reaching this
    // unwired is a boot-order bug, not a race to tolerate.
    if (this.#panels === undefined) throw new Error('layout: panel actions not wired (root entry not mounted)')
    return this.#panels
  }
}
