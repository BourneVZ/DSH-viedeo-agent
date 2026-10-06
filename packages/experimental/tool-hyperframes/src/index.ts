/**
 * Model-facing Hyperframes tools for video project lint, snapshot, and render.
 * Delegates to the Hyperframes CLI for all operations.
 * @module @deepseek-ai/dsh-experimental-tool-hyperframes
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const name = 'tool-hyperframes'
export const inject = ['tools', 'systemPrompt']

/** Configuration for the Hyperframes tool plugin. */
export interface Config {
  /** Path to the Hyperframes CLI executable (default: 'hyperframes'). */
  hyperframesCliPath?: string
}

/** Runtime configuration schema for the Hyperframes tool plugin. */
export const Config: z<Config> = z.object({
  hyperframesCliPath: z.string().default('hyperframes'),
})

/** Maximum number of time points for snapshot grid composition. */
const MAX_GRID_TIME_POINTS = 9
/** Grid columns for snapshot composition. */
const GRID_COLUMNS = 3

/** Lint finding schema. */
const LINT_FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    severity: { type: 'string', required: true, enum: ['error', 'warning', 'info'] },
    message: { type: 'string', required: true },
    location: { type: 'string' },
  },
} as const

/** Lint result schema. */
const LINT_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', required: true },
    findings: { type: 'array', required: true, items: LINT_FINDING_SCHEMA },
    summary: { type: 'string', required: true },
  },
} as const

/** Snapshot result schema. */
const SNAPSHOT_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', required: true },
    snapshots: { type: 'array', required: true, items: { type: 'string' } },
    grid_path: { type: 'string' },
    summary: { type: 'string', required: true },
  },
} as const

/** Render result schema. */
const RENDER_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', required: true },
    output_path: { type: 'string', required: true },
    duration_seconds: { type: 'number' },
    file_size_bytes: { type: 'number' },
    summary: { type: 'string', required: true },
  },
} as const

/** Validate that the project path exists and is a directory. */
function validateProjectPath(projectPath: string): void {
  const resolved = resolve(projectPath)
  if (!existsSync(resolved)) {
    throw new Error(`project path does not exist: ${resolved}`)
  }
  if (!statSync(resolved).isDirectory()) {
    throw new Error(`project path is not a directory: ${resolved}`)
  }
}

/** Execute a command and capture its output. */
function executeCommand(
  command: string,
  args: string[],
  options: { cwd: string; signal?: AbortSignal },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: process.platform === 'win32',
      signal: options.signal,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

/** Present a Hyperframes tool call as a generic card. */
function presentHyperframesCall(title: string, projectPath: string): GenericCallView {
  return {
    card: 'generic',
    title,
    kind: 'execute',
    rawInput: projectPath,
  }
}

/** Present a Hyperframes tool result. */
function presentHyperframesResult(result: ToolResult): ToolResultView {
  const summaryBlock = result.content.find(block => block.type === 'text')
  const summary = summaryBlock?.type === 'text' ? summaryBlock.text : 'Operation completed'
  return {
    card: 'generic',
    content: [{ type: 'text', text: summary }],
  }
}

/** Parse lint output into structured findings. */
function parseLintOutput(stdout: string, _stderr: string, exitCode: number): {
  success: boolean
  findings: Array<{ severity: string; message: string; location?: string }>
  summary: string
} {
  const findings: Array<{ severity: string; message: string; location?: string }> = []
  const lines = stdout.split('\n').filter(line => line.trim())

  for (const line of lines) {
    const match = line.match(/^\[(error|warning|info)\]\s+(.+?)(?:\s+at\s+(.+))?$/)
    if (match?.[1] && match[2]) {
      findings.push({
        severity: match[1],
        message: match[2],
        ...match[3] ? { location: match[3] } : {},
      })
    }
  }

  const errorCount = findings.filter(f => f.severity === 'error').length
  const warningCount = findings.filter(f => f.severity === 'warning').length
  const success = exitCode === 0 && errorCount === 0

  return {
    success,
    findings,
    summary: success
      ? `Lint passed with ${warningCount} warning(s)`
      : `Lint failed: ${errorCount} error(s), ${warningCount} warning(s)`,
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  const cliPath = config.hyperframesCliPath ?? 'hyperframes'

  ctx.systemPrompt.section({
    name: 'tool:hyperframes',
    order: ctx.systemPrompt.getSectionOrder('TOOL_REPORT') + 50,
    text: 'Use video_lint to validate Hyperframes projects before rendering. Use video_snapshot for visual verification at specific time points. Use video_render to produce the final MP4 output.',
  })

  ctx.tools.register(defineTool({
    name: 'video_lint',
    description: 'Validate a Hyperframes video project for common mistakes such as missing assets, invalid timing, or structural errors. Returns a list of findings with severity levels.',
    parameters: {
      project_path: {
        type: 'string',
        required: true,
        description: 'Absolute path to the Hyperframes project directory',
      },
      verbose: {
        type: 'boolean',
        description: 'Show info-level findings (default: false)',
      },
    },
    output: {
      schema: LINT_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      validateProjectPath(args.project_path)

      const cliArgs = ['lint', args.project_path, '--json']
      if (args.verbose) cliArgs.push('--verbose')

      try {
        const result = await executeCommand(cliPath, cliArgs, {
          cwd: args.project_path,
          signal: exec.signal,
        })

        let lintResult
        if (result.stdout.trim().startsWith('[') || result.stdout.trim().startsWith('{')) {
          try {
            const json = JSON.parse(result.stdout)
            const findings = Array.isArray(json) ? json : json.findings ?? []
            lintResult = {
              success: result.exitCode === 0,
              findings: findings.map((f: { severity?: string; message?: string; location?: string }) => ({
                severity: f.severity ?? 'error',
                message: f.message ?? 'Unknown issue',
                ...f.location ? { location: f.location } : {},
              })),
              summary: result.exitCode === 0
                ? `Lint passed with ${findings.length} finding(s)`
                : `Lint failed with ${findings.length} finding(s)`,
            }
          } catch {
            lintResult = parseLintOutput(result.stdout, result.stderr, result.exitCode)
          }
        } else {
          lintResult = parseLintOutput(result.stdout, result.stderr, result.exitCode)
        }

        return lintResult
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        return {
          success: false,
          findings: [],
          summary: `Failed to execute lint: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
    presentCall: args => presentHyperframesCall('video_lint', args.project_path),
    presentResult: (_args, result) => presentHyperframesResult(result),
  }))

  ctx.tools.register(defineTool({
    name: 'video_snapshot',
    description: `Capture key frames from a Hyperframes composition as PNG screenshots. When multiple time points are provided (up to ${MAX_GRID_TIME_POINTS}), the tool composes them into a grid image (${GRID_COLUMNS} per row). Useful for visual verification at specific moments.`,
    parameters: {
      project_path: {
        type: 'string',
        required: true,
        description: 'Absolute path to the Hyperframes project directory',
      },
      time_points: {
        type: 'array',
        items: { type: 'number' },
        description: `Array of timestamps in seconds to capture (max ${MAX_GRID_TIME_POINTS}). If omitted, uses evenly-spaced frames`,
      },
      output_path: {
        type: 'string',
        description: 'Directory to write snapshots (default: <project>/snapshots)',
      },
    },
    output: {
      schema: SNAPSHOT_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      validateProjectPath(args.project_path)

      if (args.time_points !== undefined && args.time_points.length > MAX_GRID_TIME_POINTS) {
        throw new Error(`time_points exceeds maximum of ${MAX_GRID_TIME_POINTS}`)
      }

      const outputPath = args.output_path ?? join(args.project_path, 'snapshots')
      const cliArgs = ['snapshot', args.project_path, '-o', outputPath]

      if (args.time_points !== undefined && args.time_points.length > 0) {
        cliArgs.push('--at', args.time_points.join(','))
        cliArgs.push('--no-end')
      }

      try {
        const result = await executeCommand(cliPath, cliArgs, {
          cwd: args.project_path,
          signal: exec.signal,
        })

        const snapshots: string[] = []
        const snapshotPattern = /(?:wrote|saved|created)\s+(.+\.png)/gi
        let match
        while ((match = snapshotPattern.exec(result.stdout + result.stderr)) !== null) {
          if (match[1]) snapshots.push(match[1])
        }

        let gridPath: string | undefined
        if (args.time_points !== undefined && args.time_points.length > 1 && snapshots.length > 1) {
          gridPath = await composeGrid(snapshots, outputPath, exec.signal)
        }

        return {
          success: result.exitCode === 0,
          snapshots,
          ...gridPath ? { grid_path: gridPath } : {},
          summary: result.exitCode === 0
            ? `Captured ${snapshots.length} snapshot(s)${gridPath ? ` and composed grid at ${gridPath}` : ''}`
            : `Snapshot failed: ${result.stderr || result.stdout}`,
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        return {
          success: false,
          snapshots: [],
          summary: `Failed to execute snapshot: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
    presentCall: args => presentHyperframesCall('video_snapshot', args.project_path),
    presentResult: (_args, result) => presentHyperframesResult(result),
  }))

  ctx.tools.register(defineTool({
    name: 'video_render',
    description: 'Render a Hyperframes composition to MP4. Supports quality presets and custom frame rates.',
    parameters: {
      project_path: {
        type: 'string',
        required: true,
        description: 'Absolute path to the Hyperframes project directory',
      },
      output_path: {
        type: 'string',
        description: 'Output file path (default: <project>/renders/<name>.mp4)',
      },
      fps: {
        type: 'number',
        description: 'Frame rate (default: composition\'s data-fps or 30)',
      },
      quality: {
        type: 'string',
        enum: ['draft', 'looks', 'delivery'],
        description: 'Quality preset (default: looks)',
      },
    },
    output: {
      schema: RENDER_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      validateProjectPath(args.project_path)

      const defaultOutput = join(args.project_path, 'renders', 'output.mp4')
      const outputPath = args.output_path ?? defaultOutput

      const cliArgs = ['render', args.project_path, '-o', outputPath]
      if (args.fps !== undefined) cliArgs.push('--fps', String(args.fps))
      if (args.quality !== undefined) cliArgs.push('--quality', args.quality)

      try {
        const startTime = Date.now()
        const result = await executeCommand(cliPath, cliArgs, {
          cwd: args.project_path,
          signal: exec.signal,
        })
        const durationSeconds = (Date.now() - startTime) / 1000

        const success = result.exitCode === 0 && existsSync(outputPath)
        let fileSizeBytes: number | undefined
        if (success) {
          try {
            fileSizeBytes = statSync(outputPath).size
          } catch {
            // File size is optional
          }
        }

        return {
          success,
          output_path: outputPath,
          ...fileSizeBytes !== undefined ? { file_size_bytes: fileSizeBytes } : {},
          duration_seconds: durationSeconds,
          summary: success
            ? `Rendered to ${outputPath} (${fileSizeBytes ? `${Math.round(fileSizeBytes / 1024 / 1024)}MB, ` : ''}${durationSeconds.toFixed(1)}s)`
            : `Render failed: ${result.stderr || result.stdout}`,
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        return {
          success: false,
          output_path: outputPath,
          summary: `Failed to execute render: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
    presentCall: args => presentHyperframesCall('video_render', args.project_path),
    presentResult: (_args, result) => presentHyperframesResult(result),
  }))
}

/**
 * Compose multiple snapshot images into a grid.
 * Uses a simple approach: if ImageMagick is available, use it; otherwise skip grid composition.
 */
async function composeGrid(
  snapshots: string[],
  outputPath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const gridPath = join(outputPath, 'grid.png')
  const cols = GRID_COLUMNS
  const rows = Math.ceil(Math.min(snapshots.length, MAX_GRID_TIME_POINTS) / cols)

  try {
    const result = await executeCommand('magick', [
      'montage',
      ...snapshots.slice(0, MAX_GRID_TIME_POINTS),
      '-tile', `${cols}x${rows}`,
      '-geometry', '+4+4',
      '-background', '#000000',
      gridPath,
    ], { cwd: outputPath, ...signal ? { signal } : {} })

    if (result.exitCode === 0 && existsSync(gridPath)) {
      return gridPath
    }
  } catch {
    // ImageMagick not available or failed; grid composition is optional
  }

  return undefined
}
