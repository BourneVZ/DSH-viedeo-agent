/**
 * Authenticated byte serving for video-project media. Unlike `/api/file`, whose
 * ceiling is the attachment image limit, a rendered video exceeds any image
 * bound, so this route streams the requested byte window in fixed chunks through
 * `FileSystem.readByteRange` and honors a single HTTP `Range` request — the
 * minimum a browser `<video>` element needs to seek. Access is fenced to the
 * registered workspace directories; the Connection service authenticates the
 * request before this handler runs.
 * @module @deepseek-ai/dsh-host-video-project/media
 */

import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import mime from 'mime-types'

/** Bytes transferred per `readByteRange` call while streaming a response body. */
const CHUNK_BYTES = 1 << 20

const BASE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Accept-Ranges': 'bytes',
  // A media path may name an HTML or SVG file the agent generated; served on the
  // authenticated API origin it must not run script.
  'Content-Security-Policy': "sandbox; default-src 'none'",
}

/** The byte window one response carries. */
interface ByteWindow {
  /** Inclusive first byte. */
  start: number
  /** Inclusive last byte. */
  end: number
}

/**
 * Parse a single-range `Range` header against a known total size.
 * @param header - the raw header value, or null when the request carried none.
 * @param size - total byte length of the target.
 * @returns the requested window, `null` when the request wants the whole body,
 *   or `undefined` when the header is present but unsatisfiable.
 */
export function parseRange(header: string | null, size: number): ByteWindow | null | undefined {
  if (header === null) return null
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim())
  if (match === null) return null
  const rawStart = match[1] ?? ''
  const rawEnd = match[2] ?? ''
  if (rawStart === '' && rawEnd === '') return null
  if (rawStart === '') {
    const suffix = Number.parseInt(rawEnd, 10)
    if (suffix <= 0) return undefined
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number.parseInt(rawStart, 10)
  if (start >= size) return undefined
  const end = rawEnd === '' ? size - 1 : Math.min(Number.parseInt(rawEnd, 10), size - 1)
  if (end < start) return undefined
  return { start, end }
}

/**
 * Build the streaming body of one byte window.
 * @param fs - filesystem capability supplying windowed reads.
 * @param target - resolved regular file to read.
 * @param window - inclusive byte window to transfer.
 * @param signal - aborts the transfer, including between chunks.
 * @returns the response body stream.
 */
function windowStream(fs: FileSystem, target: FsTarget, window: ByteWindow, signal: AbortSignal): ReadableStream<Uint8Array> {
  let offset = window.start
  const limit = window.end + 1
  return new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      if (offset >= limit) {
        controller.close()
        return
      }
      const bytes = await fs.readByteRange(target, { offset, length: Math.min(CHUNK_BYTES, limit - offset) }, signal)
      if (bytes.byteLength === 0) {
        controller.close()
        return
      }
      offset += bytes.byteLength
      controller.enqueue(bytes)
    },
  })
}

/**
 * Serve one GET/HEAD media request.
 * @param request - the incoming request; its `path` query names the target.
 * @param fs - filesystem capability supplying resolution, metadata, and reads.
 * @param roots - absolute workspace directories the target must live under.
 * @param maxMediaBytes - inclusive ceiling on one served file.
 * @returns the response: the byte window, or the reason it was refused.
 */
export async function serveMedia(
  request: Request,
  fs: FileSystem,
  roots: readonly string[],
  maxMediaBytes: number,
): Promise<Response> {
  const head = request.method === 'HEAD'
  const fail = (status: number, text: string, headers: Record<string, string> = {}): Response =>
    new Response(head ? null : text, { status, headers: { ...BASE_HEADERS, ...headers } })

  const path = new URL(request.url).searchParams.get('path')
  if (path === null || path.length === 0) return fail(400, 'missing path')

  let target: FsTarget
  let size: number
  try {
    target = await fs.resolve(path, { signal: request.signal })
    const inside = await Promise.all(roots.map(async root => fs.contains(await fs.resolve(root), target)))
    if (!inside.some(Boolean)) return fail(403, 'path is outside every workspace')
    const info = await fs.stat(target, request.signal)
    if (info === undefined) return fail(404, 'not found')
    if (info.type !== 'file') return fail(403, 'not a regular file')
    if (info.size === undefined) return fail(500, 'size unknown')
    if (info.size > maxMediaBytes) return fail(413, 'file exceeds byte limit')
    size = info.size
  } catch {
    /* Resolution and metadata failures name a path this route cannot serve. */
    return fail(404, 'not found')
  }

  const window = parseRange(request.headers.get('range'), size)
  if (window === undefined) {
    return fail(416, 'range not satisfiable', { 'Content-Range': `bytes */${size}` })
  }
  const selected: ByteWindow = window ?? { start: 0, end: size - 1 }
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    'Content-Type': mime.lookup(target.displayPath) || 'application/octet-stream',
    'Content-Length': String(selected.end - selected.start + 1),
    ...window === null ? {} : { 'Content-Range': `bytes ${window.start}-${window.end}/${size}` },
  }
  if (head || size === 0) return new Response(null, { status: window === null ? 200 : 206, headers })
  return new Response(windowStream(fs, target, selected, request.signal), {
    status: window === null ? 200 : 206,
    headers,
  })
}
