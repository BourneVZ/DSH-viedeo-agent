/**
 * Tolerant `script.json` reading: alias coverage for the English and Chinese
 * spellings an agent emits, coercion of unusable declarations, and the parse
 * errors that keep a broken project visible in the list.
 */

import { describe, expect, it } from 'vitest'
import { parseScript } from '../src/script.ts'

describe('parseScript', () => {
  it('reads the English spelling', () => {
    const result = parseScript(JSON.stringify({
      title: 'Product tour',
      summary: 'Three shots',
      shots: [
        { id: 's1', description: 'Logo on white', narration: 'Welcome.', duration: 2.5, visualType: 'HTML animation', image: 'assets/logo.png', audio: 'audio/s1.wav' },
      ],
    }))
    expect(result).toEqual({
      ok: true,
      script: {
        title: 'Product tour',
        summary: 'Three shots',
        shots: [{
          id: 's1',
          description: 'Logo on white',
          narration: 'Welcome.',
          duration: 2.5,
          visualType: 'html',
          image: 'assets/logo.png',
          audio: 'audio/s1.wav',
        }],
      },
    })
  })

  it('reads the Chinese spelling and synthesizes a missing shot id', () => {
    const result = parseScript(JSON.stringify({
      视频标题: '产品巡礼',
      整体概述: '三个分镜',
      分镜: [
        { 画面描述: '白底标识', 旁白: '欢迎。', 预计时长: '3', 视觉类型: 'AI 生图', 缩略图: 'snap/1.png' },
      ],
    }))
    expect(result).toEqual({
      ok: true,
      script: {
        title: '产品巡礼',
        summary: '三个分镜',
        shots: [{
          id: 'shot-1',
          description: '白底标识',
          narration: '欢迎。',
          duration: 3,
          visualType: 'image',
          thumbnail: 'snap/1.png',
        }],
      },
    })
  })

  it('prefers the measured duration spellings a rendered project carries', () => {
    const result = parseScript(JSON.stringify({
      shots: [
        {
          id: 's1', actualDuration: 24.8, estimatedDuration: 20, startTime: 0, endTime: 99,
          imageSrc: 'i/1.png', audioPath: 'a/1.wav',
        },
        { id: 's2', audioDuration: '12.5' },
      ],
    }))
    expect(result).toEqual({
      ok: true,
      script: {
        shots: [
          {
            id: 's1', description: '', narration: '', duration: 24.8, visualType: 'unknown',
            image: 'i/1.png', audio: 'a/1.wav',
          },
          { id: 's2', description: '', narration: '', duration: 12.5, visualType: 'unknown' },
        ],
      },
    })
  })

  it('falls back to the span the start and end offsets enclose', () => {
    const result = parseScript(JSON.stringify({
      shots: [
        { id: 's1', startTime: 0, endTime: 24.8 },
        { id: 's2', startTime: '24.8', endTime: '40' },
        { id: 's3', startTime: 10, endTime: 10 },
        { id: 's4', startTime: -5, endTime: 9 },
        { id: 's5', startTime: 'x', endTime: 5 },
        { id: 's6', endTime: 5 },
        { id: 's7', startTime: 2 },
      ],
    }))
    expect(result).toEqual({
      ok: true,
      script: {
        shots: [
          { id: 's1', description: '', narration: '', duration: 24.8, visualType: 'unknown' },
          { id: 's2', description: '', narration: '', duration: 15.2, visualType: 'unknown' },
          { id: 's3', description: '', narration: '', duration: 0, visualType: 'unknown' },
          { id: 's4', description: '', narration: '', duration: 0, visualType: 'unknown' },
          { id: 's5', description: '', narration: '', duration: 0, visualType: 'unknown' },
          { id: 's6', description: '', narration: '', duration: 0, visualType: 'unknown' },
          { id: 's7', description: '', narration: '', duration: 0, visualType: 'unknown' },
        ],
      },
    })
  })

  it('maps an unrecognized visual kind to unknown and drops unusable declarations', () => {
    const result = parseScript(JSON.stringify({
      shots: [
        { id: 7, type: 'stop-motion', duration: -1, description: null, narration: { text: 'x' } },
        'not an object',
      ],
    }))
    expect(result).toEqual({
      ok: true,
      script: {
        shots: [{
          id: '7',
          description: '',
          narration: '',
          duration: 0,
          visualType: 'unknown',
        }],
      },
    })
  })

  it('reports invalid JSON', () => {
    const result = parseScript('{')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not valid JSON')
  })

  it('reports a non-object document', () => {
    expect(parseScript('[]')).toEqual({ ok: false, error: 'script.json must be a JSON object' })
  })

  it('reports a missing shots array', () => {
    expect(parseScript('{"title":"x"}')).toEqual({ ok: false, error: 'script.json has no shots array' })
  })
})
