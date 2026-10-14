/**
 * The alternative-shell-mode contract. A feature plugin registers one spec
 * through `ctx.layout.registerShellMode`; the frame renders a top-bar switch
 * beside the default layout and, while the mode is selected, replaces the
 * three-column grid with the spec's own pane row. The frame knows no feature:
 * a spec names the panes it wants, and each feature pane is filled through the
 * `shell.mode.pane` keyed slot.
 */
import type { SlotLabel } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * One pane of an alternative shell mode's body.
 *
 * `conversation` reuses the shipped conversation surface — the session header,
 * transcript, and composer — at a position the mode chooses, which is how a
 * mode keeps the real chat instead of restaging it. `pane` renders the
 * `shell.mode.pane` keyed cell the registering feature supplies.
 */
export type ShellPaneSpec =
  | { kind: 'conversation' }
  | { kind: 'pane'; pane: string }

/** One alternative shell layout a feature plugin contributes. */
export interface ShellModeSpec {
  /** Stable mode id; the switch selects by it and a second registration replaces the first. */
  id: string
  /**
   * Switch label from the registering plugin's own dictionary. A thunk is
   * re-resolved per render, so the tab follows the active locale without
   * re-registration.
   */
  label: SlotLabel
  /** CSS `grid-template-columns` value sizing the mode's pane row. */
  columns: string
  /** Panes rendered left to right; one grid cell each. */
  panes: readonly ShellPaneSpec[]
}
