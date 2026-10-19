/**
 * `Range` parsing edges and the media route's refusal and streaming branches,
 * driven through a stub filesystem the real local backend cannot produce:
 * failed resolution, missing size metadata, and an empty windowed read.
 */

import { describe, expect, it } from 'vitest'
import { FsTargetKey, FsVersion, type FileSystem, type FsTarget } from '@deepseek-ai/dsh-fs'
import { parseRange, serveMedia } from '../src/media.ts'

/** One stub target whose display path doubles as its key. */
function target(displayPath: string): FsTarget {
  return { targetKey: FsTargetKey(displayPath), displayPath }
}

/** File metadata of a regular file. */
function fileInfo(size?: number): { version: FsVersion; type: 'file'; size?: number } {
  return { version: FsVersion('v1'), type: 'file', ...size === undefined ? {} : { size } }
}

/** Cast a partial stub to the full capability; the route only calls what the stub provides. */
function asFs(stub: Partial<FileSystem>): FileSystem {
  return stub as unknown as FileSystem
}

describe('parseRange', () => {
  it('reads the single-range spellings and refuses the rest', () => {
    expect(parseRange(null, 10)).toBeNull()
    expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
    expect(parseRange('bytes=2-', 10)).toEqual({ start: 2, end: 9 })
    expect(parseRange('bytes=2-99', 10)).toEqual({ start: 2, end: 9 })
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=-99', 10)).toEqual({ start: 0, end: 9 })
  })

  it('answers null for a header that requests no window', () => {
    expect(parseRange('items=0-1', 10)).toBeNull()
    expect(parseRange('bytes=-', 10)).toBeNull()
    expect(parseRange('bytes= 2-5 ', 10)).toBeNull()
    expect(parseRange(' bytes=2-5 ', 10)).toEqual({ start: 2, end: 5 })
  })

  it('answers undefined for a window the size cannot satisfy', () => {
    expect(parseRange('bytes=-0', 10)).toBeUndefined()
    expect(parseRange('bytes=10-', 10)).toBeUndefined()
    expect(parseRange('bytes=5-2', 10)).toBeUndefined()
  })
})

describe('serveMedia refusals', () => {
  it('reports 404 when resolution fails', async () => {
    const fs = asFs({ resolve: async () => { throw new Error('unresolvable') } })
    const response = await serveMedia(new Request('http://x/api/video/media?path=%2Fx'), fs, [], 1024)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('not found')
  })

  it('reports 500 when the backend cannot size the file', async () => {
    const fs = asFs({
      resolve: async (path: string) => target(path),
      contains: () => true,
      stat: async () => fileInfo(),
    })
    const response = await serveMedia(new Request('http://x/api/video/media?path=%2Fw%2Fa.mp4'), fs, ['/w'], 1024)
    expect(response.status).toBe(500)
  })

  it('answers a failing HEAD with headers and no body', async () => {
    const fs = asFs({})
    const response = await serveMedia(new Request('http://x/api/video/media', { method: 'HEAD' }), fs, [], 1024)
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('')
  })
})

describe('serveMedia bodies', () => {
  /** A stub serving one regular file at `/w/a.bin` with the given size. */
  function fileFs(size: number, readByteRange: FileSystem['readByteRange']): FileSystem {
    return asFs({
      resolve: async (path: string) => target(path),
      contains: () => true,
      stat: async () => fileInfo(size),
      readByteRange,
    })
  }

  it('closes the stream when a windowed read comes back empty', async () => {
    const fs = fileFs(10, async () => new Uint8Array(0))
    const response = await serveMedia(new Request('http://x/api/video/media?path=%2Fw%2Fa.bin'), fs, ['/w'], 1024)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('falls back to a binary content type for an unknown extension', async () => {
    const fs = fileFs(2, async () => new Uint8Array([1, 2]))
    const response = await serveMedia(new Request('http://x/api/video/media?path=%2Fw%2Fa.unknownext'), fs, ['/w'], 1024)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2]))
  })

  it('serves an empty file as a bodyless 200', async () => {
    const fs = fileFs(0, async () => new Uint8Array(0))
    const response = await serveMedia(new Request('http://x/api/video/media?path=%2Fw%2Fa.bin'), fs, ['/w'], 1024)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('0')
    expect(await response.text()).toBe('')
  })

  it('answers a ranged HEAD with a bodyless 206', async () => {
    const fs = fileFs(10, async () => new Uint8Array(0))
    const response = await serveMedia(
      new Request('http://x/api/video/media?path=%2Fw%2Fa.bin', { method: 'HEAD', headers: { range: 'bytes=2-5' } }),
      fs, ['/w'], 1024,
    )
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await response.text()).toBe('')
  })
})
