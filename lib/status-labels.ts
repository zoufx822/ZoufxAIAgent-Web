/** status → 中英双语标签，供 PresenceSticky 顶条与 Home nameplate 共用。 */
export const STATUS_LABELS: Record<string, { zh: string; en: string }> = {
  idle: { zh: '等待交互', en: 'IDLE' },
  thinking: { zh: '思考中', en: 'THINKING' },
  tooling: { zh: '使用工具', en: 'TOOLING' },
  writing: { zh: '回复中', en: 'WRITING' },
  error: { zh: '出错了', en: 'ERROR' },
  asleep: { zh: '打盹中', en: 'ASLEEP' },
  drifting: { zh: '走神中', en: 'DRIFTING' },
}

/** 这些状态下隐藏 mood——出错/睡眠/走神时情绪词无意义。 */
export const MOOD_HIDDEN_STATUSES = new Set<string>(['error', 'asleep', 'drifting'])
