/**
 * The bundle's substance is its patch file, and that patch only means something
 * over the layers beneath it: composing the real shipped layers pins that the
 * video rows land on a tree that carries the webapp's `agent-presets` row for
 * the default-preset override to retarget.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

const root = fileURLToPath(new URL('..', import.meta.url))

interface Row {
  id?: string
  name?: string
  config?: Record<string, unknown>
}

/** Parse one shipped patch file into its patch list. */
function loadPatch(relative: string): PatchOptions[] {
  const parsed = yaml.load(readFileSync(resolve(root, relative), 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new TypeError(`${relative} must parse to a patch list`)
  return parsed as PatchOptions[]
}

/** Compose the shipped profile layers over an empty root, collecting warnings. */
function composeShipped(): { rows: EntryOptions[]; warnings: string[] } {
  const warnings: string[] = []
  const patches = [
    ...loadPatch('../base/cordis.patch.yml'),
    ...loadPatch('../web-app/cordis.patch.yml'),
    ...loadPatch('cordis.patch.yml'),
  ]
  return { rows: applyEntryPatches([], patches, (message) => { warnings.push(message) }), warnings }
}

function rowOf(rows: readonly Row[], id: string): Row | undefined {
  return rows.find(row => row.id === id)
}

describe('dsh-video-app bundle', () => {
  it('declares a parseable patch list through the dsh.bundle.patch manifest field', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(Array.isArray(loadPatch(manifest.dsh!.bundle!.patch!))).toBe(true)
    // Per-layer resolution anchors on this manifest, so every inserted row's
    // package has to be a dependency of the bundle that inserts it.
    expect(manifest.dependencies).toMatchObject({
      '@deepseek-ai/dsh-host-video-project': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-video': 'workspace:^',
    })
  })

  it('inserts the video project service and its shell-mode UI', () => {
    const rows = loadPatch('cordis.patch.yml').flatMap(patch => patch.insert ?? []) as Row[]
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['video-project', '@deepseek-ai/dsh-host-video-project'],
      ['ui-video', '@deepseek-ai/dsh-client-ui-video'],
    ])
  })

  it('overrides the webapp preset default and leaves the rest of that row alone', () => {
    const { rows, warnings } = composeShipped()
    expect(warnings).toEqual([])
    expect(rowOf(rows as Row[], 'video-project')?.name).toBe('@deepseek-ai/dsh-host-video-project')
    expect(rowOf(rows as Row[], 'ui-video')?.name).toBe('@deepseek-ai/dsh-client-ui-video')
    const presets = rowOf(rows, 'agent-presets')
    expect(presets?.name).toBe('@deepseek-ai/dsh-agent-presets')
    expect(presets?.config).toEqual({ default: 'video' })
  })
})
