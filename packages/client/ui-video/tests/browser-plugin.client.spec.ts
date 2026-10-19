/**
 * ui-video plugin halves: the browser entry's dictionary, shell-mode, pane, and
 * composer-dock registrations against the real SlotRegistry (with fiber teardown
 * proving removal — HMR safety), and the inert node entry.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { ILayout, ShellModeSpec } from '@deepseek-ai/dsh-client-ui-layout/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** The modes the fake layout face collected, in registration order. */
interface Bench {
  /** The booted browser context. */
  ctx: Context
  /** The plugin fiber, disposed to prove teardown. */
  fiber: ReturnType<Context['plugin']>
  /** Modes currently contributed through ctx.layout. */
  modes: ShellModeSpec[]
  /** The fake sessions face the banner switches through. */
  sessions: { open: Mock }
}

/**
 * Boot the browser half over a real slot tree that already declares the pane
 * seat and the composer dock, so the plugin's rows register synchronously.
 * @returns the context, its fiber, the collected shell modes, and the sessions face.
 */
async function bench(): Promise<Bench> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'shell.mode.pane': { kind: 'keyed', scope: 'root' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  const modes: ShellModeSpec[] = []
  const layout: ILayout = {
    toggleSidebar: () => {},
    openRightbar: () => {},
    closeRightbar: () => {},
    registerShellMode: (spec: ShellModeSpec) => {
      modes.push(spec)
      return () => {
        modes.splice(modes.indexOf(spec), 1)
      }
    },
  }
  ctx.provide('layout', layout)
  const sessions = { open: vi.fn() }
  ctx.provide('sessions', sessions as never)
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  // These specs assert the shipped Chinese copy. There is no jsdom `window` in
  // this lane, so browser-language detection never runs and the locale comes
  // from FALLBACK_LOCALE (en): state the asserted locale explicitly.
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, modes, sessions }
}

/** Registered pane keys, in registration order. */
function paneKeys(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('shell.mode.pane').map(entry => entry.options.key)
}

/** Registered composer-dock entry ids, in registration order. */
function dockIds(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('conversation.input.dock').map(entry => entry.options.id)
}

/**
 * Build one registered entry's inject face.
 * @param ctx - the booted browser context.
 * @param name - the slot the entry was registered under.
 * @param id - the entry's dispatch key or list id.
 * @returns the face the renderer would hand that entry's component.
 */
function faceOf(ctx: Context, name: 'shell.mode.pane' | 'conversation.input.dock', id: string): Record<string, unknown> {
  const entry = ctx.slots.entries(name)
    .find(candidate => candidate.options.key === id || candidate.options.id === id)
  if (entry?.inject === undefined) throw new Error(`no inject face for ${id}`)
  // The two slots scope their inject differently, so the union's parameter
  // collapses; a root-scoped entry simply ignores the value.
  const inject = entry.inject as (scope: unknown) => unknown
  return inject('s1') as Record<string, unknown>
}

/**
 * The one mode this plugin contributes.
 * @param modes - the modes the fake layout face collected.
 * @returns the single contributed spec.
 */
function onlyMode(modes: readonly ShellModeSpec[]): ShellModeSpec {
  const [mode] = modes
  if (mode === undefined) throw new Error('ui-video contributed no shell mode')
  return mode
}

describe('ui-video browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout', 'sessions'])
  })

  it('contributes one shell mode, and fiber teardown withdraws it (HMR safety)', async () => {
    const { modes, fiber } = await bench()
    expect(modes).toHaveLength(1)
    const mode = onlyMode(modes)
    expect(mode.id).toBe('video')
    expect(mode.columns).toBe('260px minmax(0, 1fr) 400px')
    expect(mode.panes).toEqual([
      { kind: 'pane', pane: 'projects' },
      { kind: 'pane', pane: 'preview' },
      { kind: 'conversation', simple: true },
    ])
    await fiber.dispose()
    expect(modes).toHaveLength(0)
  })

  it('localizes the switch label through its own dictionary', async () => {
    const { ctx, modes } = await bench()
    const { label } = onlyMode(modes)
    expect(typeof label).toBe('function')
    const resolve = label as () => string
    expect(resolve()).toBe(zh['mode.label'])
    ctx.locale.setLocale('en')
    expect(resolve()).toBe(en['mode.label'])
  })

  it('registers both panes under their keys, and fiber teardown removes them', async () => {
    const { ctx, fiber } = await bench()
    expect(paneKeys(ctx)).toEqual(['projects', 'preview'])
    await fiber.dispose()
    expect(paneKeys(ctx)).toEqual([])
  })

  it('forwards both panes into the one controller they share', async () => {
    const { ctx } = await bench()
    const projects = faceOf(ctx, 'shell.mode.pane', 'projects')
    const preview = faceOf(ctx, 'shell.mode.pane', 'preview')

    // The preview face's view switch lands on the store the projects face reads,
    // which is the whole point of routing both through one controller.
    const store = projects.hooks as { videoProjects: { getSnapshot: () => { viewMode: string } } }
    ;(preview.setViewMode as (mode: string) => void)('preview')
    expect(store.videoProjects.getSnapshot().viewMode).toBe('preview')

    // The remaining actions forward to the controller; with no host route behind
    // them in this lane their reads fail closed rather than throw at the caller.
    const stop = (projects.start as () => () => void)()
    ;(projects.select as (path: string) => void)('/work/demo')
    ;(preview.ensurePeaks as (key: string, url: string) => void)('/work/demo/a.wav', 'video://a')
    stop()
  })

  it('registers the producing-session card in the composer dock, and fiber teardown removes it', async () => {
    const { ctx, fiber } = await bench()
    expect(dockIds(ctx)).toEqual(['video-session'])
    await fiber.dispose()
    expect(dockIds(ctx)).toEqual([])
  })

  it('gives the dock card the roster store and the session switch', async () => {
    const { ctx, sessions } = await bench()
    const banner = faceOf(ctx, 'conversation.input.dock', 'video-session')
    const projects = faceOf(ctx, 'shell.mode.pane', 'projects')

    // One controller behind both: the card offers the session the same selection
    // resolved, so they cannot disagree about which project is on screen.
    const bannerHooks = banner.hooks as { videoProjects: unknown }
    const paneHooks = projects.hooks as { videoProjects: unknown }
    expect(bannerHooks.videoProjects).toBe(paneHooks.videoProjects)

    ;(banner.openSession as (id: string) => void)('sess-1')
    expect(sessions.open).toHaveBeenCalledWith('sess-1')
  })

  it('registers the dictionary under its own namespace and releases it with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('projects.title')).toBe(zh['projects.title'])
    ctx.locale.setLocale('en')
    expect(translate('projects.title')).toBe(en['projects.title'])

    // A withdrawn dictionary leaves the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('projects.title')).not.toBe(en['projects.title'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-video node half', () => {
  it('contributes no host behavior', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(() => { applyNode() }).not.toThrow()
  })
})
