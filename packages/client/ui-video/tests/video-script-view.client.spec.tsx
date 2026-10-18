// @vitest-environment jsdom
/**
 * The formatted script surface: the project's title and summary, every shot's
 * index, visual kind, duration, description, still, and full narration, and the
 * empty-script notice.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { VideoScriptView, type VideoScriptViewProps } from '../src/client/VideoScriptView.tsx'
import { zh } from '../src/client/locales.ts'
import { mediaUrl, project, shot } from './fixtures.ts'

const t: VideoScriptViewProps['t'] = makeTranslate(zh)
const origin = window.location.origin

afterEach(() => {
  cleanup()
})

/** The shot list, once rendered. */
function shots(): HTMLElement {
  return screen.getByRole('list', { name: zh['preview.scriptShots'] })
}

describe('VideoScriptView', () => {
  it('heads the script with the title and summary', () => {
    render(<VideoScriptView project={project()} origin={origin} t={t} />)
    expect(screen.getByRole('heading').textContent).toBe('Demo')
    expect(screen.getByText('A demo video', { exact: false })).toBeTruthy()
  })

  it('omits the summary block when the project declares none', () => {
    render(<VideoScriptView project={project({ summary: '' })} origin={origin} t={t} />)
    expect(screen.queryByText(zh['preview.scriptSummary'])).toBeNull()
  })

  it('explains an empty script instead of listing shots', () => {
    render(<VideoScriptView project={project({ shots: [] })} origin={origin} t={t} />)
    expect(screen.getByText(zh['preview.scriptEmpty'])).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('lays out each shot with its index, kind, duration, description, and narration', () => {
    render(<VideoScriptView project={project({
      shots: [shot(), shot({ id: 'shot-2', index: 1, visualType: 'image', narration: 'Second.' })],
    })} origin={origin} t={t} />)
    const rows = within(shots()).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const first = (rows[0]!.textContent ?? '').replace(/\s+/g, ' ')
    expect(first).toContain(zh['preview.shotIndex'].replace('{index}', '1'))
    expect(first).toContain(zh['preview.visual.html'])
    expect(first).toContain(zh['preview.duration'].replace('{seconds}', '3'))
    expect(first).toContain('A title card')
    expect(first).toContain('Welcome.')
    expect(rows[1]!.textContent).toContain(zh['preview.visual.image'])
  })

  it('shows a shot still through the media route', () => {
    render(<VideoScriptView project={project({
      shots: [shot({ thumbnail: '/work/demo/t.png' })],
    })} origin={origin} t={t} />)
    expect(screen.getByAltText('A title card').getAttribute('src')).toBe(mediaUrl('/work/demo/t.png'))
  })

  it('omits the still when a shot has no visual asset', () => {
    render(<VideoScriptView project={project()} origin={origin} t={t} />)
    expect(screen.queryByAltText('A title card')).toBeNull()
  })
})
