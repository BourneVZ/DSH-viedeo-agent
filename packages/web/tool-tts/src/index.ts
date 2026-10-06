/**
 * Qwen text-to-speech tool. Calls the DashScope non-real-time multimodal
 * generation endpoint (qwen3-tts-flash), downloads the synthesized audio, and
 * commits it to the durable attachment store. The API key resolves through the
 * credential seam with a launch-environment fallback.
 * @module @deepseek-ai/dsh-tool-tts
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-attachment'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-tts'

/** The tools seam this plugin registers into. */
export const inject = ['tools']

const DEFAULT_API_KEY_ENV = 'DASHSCOPE_API_KEY'
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com'
const DEFAULT_MODEL = 'qwen3-tts-flash'
const DEFAULT_VOICE = 'Cherry'
const DEFAULT_LANGUAGE = 'Auto'
const TTS_PATH = '/api/v1/services/aigc/multimodal-generation/generation'

const USER_AGENT = 'deepseek-harness/0.1.5-alpha.1'

/** Plugin configuration. */
export interface Config {
  /** Credential reference for the DashScope API key; defaults to `DASHSCOPE_API_KEY`. */
  apiKeyEnv?: string
  /** DashScope API base URL; defaults to `https://dashscope.aliyuncs.com`. */
  baseURL?: string
  /** Model identifier; defaults to `qwen3-tts-flash`. */
  model?: string
  /** Voice used when a call omits one; defaults to `Cherry`. */
  defaultVoice?: string
}

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(DEFAULT_BASE_URL),
  model: z.string().default(DEFAULT_MODEL),
  defaultVoice: z.string().default(DEFAULT_VOICE),
})

interface TtsAudio {
  url?: string
  expires_at?: number
}

interface TtsResponse {
  code?: string
  message?: string
  output?: { audio?: TtsAudio }
}

/**
 * Resolve the DashScope API key through the credential seam, falling back to the
 * launch environment when the seam is unavailable.
 * @param ctx - plugin context.
 * @param apiKeyEnv - branded credential reference.
 * @returns the resolved key, or `undefined` when no source carries it.
 */
async function resolveApiKey(ctx: Context, apiKeyEnv: ReturnType<typeof credentialRef>): Promise<string | undefined> {
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
  const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
  return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
}

/**
 * Synthesize speech and return the provider audio URL.
 * @returns the signed audio URL and its expiry (unix seconds).
 */
async function synthesize(
  baseURL: string,
  model: string,
  text: string,
  voice: string,
  language: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<{ url: string; expiresAt: number }> {
  const response = await fetch(`${baseURL}${TTS_PATH}`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'accept': 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({ model, input: { text, voice, language_type: language } }),
    signal,
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Qwen TTS request failed (${response.status}): ${body}`)
  }
  const data = await response.json() as TtsResponse
  const url = data.output?.audio?.url
  if (url === undefined || url.length === 0) {
    throw new Error(`Qwen TTS returned no audio URL: ${data.message ?? data.code ?? 'unknown error'}`)
  }
  return { url, expiresAt: data.output?.audio?.expires_at ?? 0 }
}

/**
 * Download the synthesized audio bytes from the signed provider URL.
 * The download carries no harness credential, so redirects are followed.
 * @returns the exact audio bytes.
 */
async function downloadAudio(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'accept': '*/*', 'user-agent': USER_AGENT },
    signal,
  })
  if (!response.ok) {
    throw new Error(`Failed to download synthesized audio (${response.status}).`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

/** Register the `generate_speech` tool on `ctx.tools`. */
export function apply(ctx: Context, config: Config): void {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const baseURL = config.baseURL ?? DEFAULT_BASE_URL
  const model = config.model ?? DEFAULT_MODEL
  const defaultVoice = config.defaultVoice ?? DEFAULT_VOICE

  ctx.tools.register(defineTool({
    name: 'generate_speech',
    description:
      'Convert text to speech using the Qwen text-to-speech model. '
      + 'Returns a durable audio attachment (a WAV file) plus its temporary provider URL. '
      + 'Specify a voice to control the speaker timbre; common voices include Cherry, Serena, Ethan, and Chelsie.',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'The text to synthesize. Supports multilingual and mixed-language input.',
      },
      voice: {
        type: 'string',
        description: 'Speaker timbre. Defaults to the configured voice (Cherry) when omitted.',
      },
      language: {
        type: 'string',
        description: 'Language hint for synthesis. One of Auto, Chinese, English, German, Italian, Portuguese, Spanish, Japanese, Korean, French, Russian. Defaults to Auto.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attachmentId: { type: 'string', required: true },
          name: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          url: { type: 'string', required: true },
          voice: { type: 'string', required: true },
          expiresAt: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Generated speech (${value.voice}) as attachment "${value.name}" `
          + `(${value.bytes} bytes).\nTemporary URL (valid until ${value.expiresAt}): ${value.url}`,
      }],
    },
    async execute(args, exec) {
      const apiKey = await resolveApiKey(ctx, apiKeyEnv)
      if (apiKey === undefined) {
        throw new Error(
          `DashScope API key not found. Set ${config.apiKeyEnv ?? DEFAULT_API_KEY_ENV} in .env or credentials.`,
        )
      }
      const attachments = ctx.get('attachments')
      if (attachments === undefined) {
        throw new Error('Attachment storage is unavailable; cannot persist synthesized audio.')
      }
      const voice = args.voice ?? defaultVoice
      const language = args.language ?? DEFAULT_LANGUAGE
      const { url, expiresAt } = await synthesize(baseURL, model, args.text, voice, language, apiKey, exec.signal)
      const audio = await downloadAudio(url, exec.signal)
      const ref = await attachments.saveFile({ data: audio, name: `speech-${voice}.wav` })
      return {
        attachmentId: ref.attachmentId,
        name: ref.name,
        bytes: ref.bytes,
        url,
        voice,
        expiresAt,
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: 'Generate speech',
      kind: 'other',
      rawInput: { text: args.text, voice: args.voice ?? defaultVoice },
    }),
  }))
}
