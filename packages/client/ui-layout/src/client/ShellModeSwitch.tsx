/**
 * The top-bar shell mode switch: the default layout plus every alternative
 * shell mode contributed through `ctx.layout`. Rendered only when at least one
 * alternative exists, so a deployment without a feature shell shows no chrome.
 * Mode labels are the contributor's own copy, resolved here so a thunk follows
 * the active locale; only the default entry's label is this package's own.
 */
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellModeSpec } from './shell-mode.ts'
import css from './AppFrame.module.css'

/** Switch props: the contributed modes, the selection, and the selection action. */
export interface ShellModeSwitchProps extends PropsLocale<'common'> {
  /** Contributed alternative modes, in registration order. */
  modes: readonly ShellModeSpec[]
  /** Selected alternative mode id, or null for the default layout. */
  selected: string | null
  /** @param id - the mode to select, or null for the default layout. */
  onSelect: (id: string | null) => void
}

/** The top-bar layout switch (see module doc). */
export function ShellModeSwitch({ modes, selected, onSelect, t }: ShellModeSwitchProps) {
  const entries: readonly { id: string | null; label: string }[] = [
    { id: null, label: t('shellMode.default') },
    ...modes.map((mode): { id: string | null; label: string } => ({ id: mode.id, label: resolveSlotLabel(mode.label) })),
  ]
  return (
    <div className={css.modeSwitch} role="tablist" aria-label={t('shellMode.switch')}>
      {entries.map(entry => (
        <button
          key={entry.id ?? '__default'}
          type="button"
          role="tab"
          className={css.modeTab}
          aria-selected={selected === entry.id}
          data-selected={selected === entry.id || undefined}
          onClick={() => { onSelect(entry.id) }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}
