/**
 * Shared fixtures for the ui-video component specs: one shot, one project, and
 * the media URL the panes build. Kept in one module so the four component
 * suites do not each re-declare the same builders.
 */
import type { VideoProject, VideoShot } from '@deepseek-ai/dsh-host-video-project/types'

/** One resolved shot; override any field a case needs. */
export function shot(over: Partial<VideoShot> = {}): VideoShot {
  return {
    id: 'shot-1', index: 0, description: 'A title card', narration: 'Welcome.',
    duration: 3, visualType: 'html', ...over,
  }
}

/** One project with a single shot; override any field a case needs. */
export function project(over: Partial<VideoProject> = {}): VideoProject {
  return {
    path: '/work/demo', name: 'demo', title: 'Demo', updatedAt: 1_700_000_000_000,
    shotCount: 1, hasRender: false, summary: 'A demo video', duration: 3, shots: [shot()], ...over,
  }
}

/** The media route URL a pane builds for one absolute host path. */
export function mediaUrl(path: string): string {
  return `${window.location.origin}/api/video/media?path=${encodeURIComponent(path)}`
}
