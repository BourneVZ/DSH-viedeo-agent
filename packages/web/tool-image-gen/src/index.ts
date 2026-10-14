/**
 * EvoLink Z-Image Turbo image generation tool. Two-phase async flow: create a
 * generation task, then poll every 5 s until the task completes or fails. The
 * API key resolves through the credential seam with a launch-environment fallback.
 * @module @deepseek-ai/dsh-tool-image-gen
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef, credentialRefSchema, resolveCredentialValue } from '@deepseek-ai/dsh-credentials'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-image-gen'

/** The tools seam this plugin registers into. */
export const inject = ['tools']

const DEFAULT_API_KEY_ENV = 'EVOLINK_API_KEY'
const DEFAULT_BASE_URL = 'https://api.evolink.ai'
const DEFAULT_MODEL = 'z-image-turbo'
const POLL_INTERVAL_MS = 5_000

const SUPPORTED_SIZES = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '1:2', '2:1'] as const

const USER_AGENT = 'deepseek-harness/0.1.5-alpha.1'

/** Plugin configuration. */
export interface Config {
  /** Credential reference for the EvoLink API key; defaults to `EVOLINK_API_KEY`. */
  apiKeyEnv?: string
  /** EvoLink API base URL; defaults to `https://api.evolink.ai`. */
  baseURL?: string
  /** Model identifier; defaults to `z-image-turbo`. */
  model?: string
}

export const Config: z<Config> = z.object({
  apiKeyEnv: credentialRefSchema(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(DEFAULT_BASE_URL),
  model: z.string().default(DEFAULT_MODEL),
})

interface CreateTaskResponse {
  id: string
  status: string
}

interface TaskDetailResponse {
  status: string
  results?: string[]
  error?: { message?: string }
}

/**
 * Create an image generation task via the EvoLink API.
 * @returns the task id on success.
 */
async function createImageTask(
  baseURL: string,
  model: string,
  prompt: string,
  size: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(`${baseURL}/v1/images/generations`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'accept': 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({ model, prompt, size }),
    signal,
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`EvoLink create task failed (${response.status}): ${body}`)
  }
  const data = await response.json() as CreateTaskResponse
  return data.id
}

/**
 * Poll a task until it reaches a terminal state.
 * @returns the image URLs on completion.
 */
async function pollTaskResult(
  baseURL: string,
  taskId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<string[]> {
  while (true) {
    signal.throwIfAborted()
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    signal.throwIfAborted()

    const response = await fetch(`${baseURL}/v1/tasks/${taskId}`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'accept': 'application/json',
        'user-agent': USER_AGENT,
      },
      signal,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`EvoLink task query failed (${response.status}): ${body}`)
    }
    const data = await response.json() as TaskDetailResponse

    if (data.status === 'completed') {
      return data.results ?? []
    }
    if (data.status === 'failed') {
      throw new Error(`Image generation failed: ${data.error?.message ?? 'unknown error'}`)
    }
  }
}

/** Register the `generate_image` tool on `ctx.tools`. */
export function apply(ctx: Context, config: Config): void {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const baseURL = config.baseURL ?? DEFAULT_BASE_URL
  const model = config.model ?? DEFAULT_MODEL

  ctx.tools.register(defineTool({
    name: 'generate_image',
    description:
      'Generate an image from a text prompt using the EvoLink Z-Image Turbo model. '
      + 'The tool creates an asynchronous generation task and polls until the image is ready. '
      + 'Returns one or more image URLs on success.',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'A detailed text description of the image to generate.',
      },
      size: {
        type: 'string',
        enum: [...SUPPORTED_SIZES],
        description: 'Aspect ratio of the generated image. Defaults to 1:1 (square).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          urls: {
            type: 'array',
            required: true,
            items: { type: 'string' },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.urls.length > 0
          ? `Generated ${value.urls.length} image(s):\n${value.urls.join('\n')}`
          : 'Image generation completed but returned no URLs.',
      }],
    },
    async execute(args, exec) {
      const apiKey = await resolveCredentialValue(ctx, apiKeyEnv)
      if (apiKey === undefined) {
        throw new Error(
          `EvoLink API key not found. Set ${config.apiKeyEnv ?? DEFAULT_API_KEY_ENV} in .env or credentials.`,
        )
      }
      const size = args.size ?? '1:1'
      const taskId = await createImageTask(baseURL, model, args.prompt, size, apiKey, exec.signal)
      const urls = await pollTaskResult(baseURL, taskId, apiKey, exec.signal)
      return { urls }
    },
    presentCall: args => ({
      card: 'generic',
      title: 'Generate image',
      kind: 'other',
      rawInput: { prompt: args.prompt, size: args.size ?? '1:1' },
    }),
  }))
}
