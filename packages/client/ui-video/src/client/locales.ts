/** `video` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'video'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.label': '视频制作',
  'projects.title': '视频项目',
  'projects.listAria': '视频项目列表',
  'projects.empty': '还没有视频项目。在右侧对话里描述你要的视频，Agent 会创建工程目录并写入 script.json。',
  'projects.error': '项目列表读取失败',
  'projects.shots': '{count} 个分镜',
  'projects.rendered': '已渲染',
  'projects.broken': 'script.json 无法解析',
  'projects.updated.now': '刚刚',
  'projects.updated.minutes': '{n} 分钟前',
  'projects.updated.hours': '{n} 小时前',
  'projects.updated.days': '{n} 天前',
  'projects.updated.months': '{n} 个月前',
  'projects.updated.years': '{n} 年前',
  'preview.empty': '在左侧选择一个视频项目',
  'preview.error': '项目详情读取失败',
  'preview.videoAria': '视频预览播放器',
  'preview.unrendered': '尚未渲染成片，以下按分镜顺序展示工程当前素材',
  'preview.shotsAria': '分镜序列',
  'preview.shotIndex': '分镜 {index}',
  'preview.duration': '{seconds} 秒',
  'preview.narration': '旁白',
  'preview.thumbnailMissing': '暂无画面素材',
  'preview.visual.html': 'HTML 动画',
  'preview.visual.image': 'AI 生图',
  'preview.visual.unknown': '未指定画面类型',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<VideoKey, string> = {
  'mode.label': 'Video',
  'projects.title': 'Video projects',
  'projects.listAria': 'Video projects',
  'projects.empty': 'No video projects yet. Describe the video you want in the conversation on the right; the agent creates the project directory and writes script.json.',
  'projects.error': 'Could not read the project list',
  'projects.shots': '{count} shots',
  'projects.rendered': 'rendered',
  'projects.broken': 'script.json did not parse',
  'projects.updated.now': 'just now',
  'projects.updated.minutes': '{n} min ago',
  'projects.updated.hours': '{n} h ago',
  'projects.updated.days': '{n} d ago',
  'projects.updated.months': '{n} mo ago',
  'projects.updated.years': '{n} y ago',
  'preview.empty': 'Select a video project on the left',
  'preview.error': 'Could not read the project',
  'preview.videoAria': 'Video preview player',
  'preview.unrendered': 'No render yet — the shots below show the project assets in script order',
  'preview.shotsAria': 'Shots',
  'preview.shotIndex': 'Shot {index}',
  'preview.duration': '{seconds}s',
  'preview.narration': 'Narration',
  'preview.thumbnailMissing': 'No visual asset yet',
  'preview.visual.html': 'HTML animation',
  'preview.visual.image': 'Generated image',
  'preview.visual.unknown': 'Visual type unset',
}

/** Key domain of the `video` namespace (zh is the source of truth). */
export type VideoKey = keyof typeof zh
