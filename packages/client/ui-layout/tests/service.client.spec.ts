import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '../src/client/service.ts'
import type { PanelActions } from '../src/client/service.ts'
import type { ShellModeSpec } from '../src/client/shell-mode.ts'

function fakePanels(): PanelActions {
  return {
    setSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
    setViewportWidth: vi.fn(),
    setRightbar: vi.fn(),
    openRightbar: vi.fn(),
    closeRightbar: vi.fn(),
    replaceShellModes: vi.fn(),
    setShellMode: vi.fn(),
  }
}

const videoMode: ShellModeSpec = { id: 'video', label: '视频制作', columns: '240px minmax(0, 1fr)', panes: [{ kind: 'conversation' }] }
const otherMode: ShellModeSpec = { id: 'other', label: 'Other', columns: 'minmax(0, 1fr)', panes: [{ kind: 'conversation' }] }

describe('LayoutController', () => {
  it('forwards the right column transitions to the attached set', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)

    service.openRightbar(true, false)
    service.openRightbar(true, true)
    service.openRightbar(false, true)
    service.closeRightbar()

    expect(panels.openRightbar).toHaveBeenNthCalledWith(1, true, false)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(2, true, true)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(3, false, true)
    expect(panels.closeRightbar).toHaveBeenCalledTimes(1)
    // The drag width stays the frame's own business, never the caller's.
    expect(panels.setRightbar).not.toHaveBeenCalled()
  })

  it('forwards the three panel actions to the attached set', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)

    service.toggleSidebar()

    expect(panels.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(panels.setSidebar).not.toHaveBeenCalled()
  })

  it('fails loud before the root entry wired its actions', () => {
    const service = new LayoutController()
    expect(() => { service.toggleSidebar() }).toThrow(/panel actions not wired/)
  })

  it('re-attach overwrites the stale action set (entry re-register)', () => {
    const service = new LayoutController()
    const stale = fakePanels()
    const fresh = fakePanels()
    service.attachPanels(stale)
    service.attachPanels(fresh)

    service.toggleSidebar()

    expect(stale.toggleSidebar).not.toHaveBeenCalled()
    expect(fresh.toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('publishes shell modes contributed before the entry mounted', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    // A contributor's apply world runs before AppFrame's first render.
    service.registerShellMode(videoMode)
    expect(panels.replaceShellModes).not.toHaveBeenCalled()
    service.attachPanels(panels)
    expect(panels.replaceShellModes).toHaveBeenCalledWith([videoMode])
  })

  it('publishes each registration and withdrawal to the attached set', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)

    const disposeVideo = service.registerShellMode(videoMode)
    service.registerShellMode(otherMode)
    expect(panels.replaceShellModes).toHaveBeenLastCalledWith([videoMode, otherMode])

    disposeVideo()
    expect(panels.replaceShellModes).toHaveBeenLastCalledWith([otherMode])
  })

  it('resolves a repeated mode id to the later spec', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)

    service.registerShellMode(videoMode)
    const revised = { ...videoMode, label: 'Revised' }
    service.registerShellMode(revised)

    expect(panels.replaceShellModes).toHaveBeenLastCalledWith([revised])
  })

  it('publishes nothing on attach while no mode was contributed', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)
    expect(panels.replaceShellModes).not.toHaveBeenCalled()
  })
})
