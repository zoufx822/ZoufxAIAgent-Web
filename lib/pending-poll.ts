import { useStore } from './store'
import { api, type BackendMessage } from './api'

/**
 * consumeStream 在建轮轮询：生成脱离连接后（watchdog 超时 / 打开有在建轮的对话），
 * 每 2s 拉 loadMessages 等服务端落库的完整回复，拿到 → 整体替换「生成中」占位；
 * 窗口耗尽或该轮已从注册表消失（GET pending 变空）且未落库 → 该轮告吹。
 *
 * <p>识别「已落库」不靠 loadMessages 自检（write-back 期间看不到该轮），而是：先看回复是否出现在
 * loadMessages，再用 GET pending 区分「仍在生成」与「已终止未落库（停止/失败）」。turnId 不随消息返回，
 * 故按「最后一条 content===prompt 的 user 之后紧跟非空 assistant」对齐（同锚串行，无歧义）。
 *
 * <p>模块级单例（一个 timer + 代际令牌）：同一时刻只跟踪一轮在建（与 store 的单个 pendingTurn 对齐）。
 * 新一轮 poll 会取代旧的——符合「单活跃轮」心智；跨锚并发在建非设计场景（与原型单 pendingTurn 一致）。
 */

const POLL_INTERVAL = 2000
const POLL_CAP = 90000

let pollTimer: ReturnType<typeof setTimeout> | null = null
// 代际令牌：clearPendingPoll / 新一轮 poll 递增它，令仍在 await 中的旧 tick 失效——
// 否则 tick 是 async，clear 时若某 tick 正卡在 await，它醒来后仍会重排/写入陈旧结果。
let pollToken = 0

export function clearPendingPoll() {
  pollToken++
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

/** 从后端消息列表里找该 prompt 对应的已落库 assistant 回复；未落库返回 null。 */
function findLandedReply(msgs: BackendMessage[], prompt: string): string | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role === 'user' && (m.content ?? '') === prompt) {
      const next = msgs[i + 1]
      if (next && next.role !== 'user' && (next.content ?? '').length > 0) return next.content
      return null
    }
  }
  return null
}

export interface PollOptions {
  anchorId: string
  userMsgId: string
  assistantId: string
  prompt: string
  /** true=原发送端（超时轮询）：告吹时移除本轮 + 回填输入框；false=其他端/刷新端：只落错误态、不回填。 */
  refillOnFail: boolean
}

export function pollPendingTurn(opts: PollOptions) {
  clearPendingPoll()
  const myToken = pollToken
  const started = Date.now()
  const s = () => useStore.getState()

  const finish = (reply: string) => {
    clearPendingPoll()
    s().updateAssistantMessageById(opts.anchorId, opts.assistantId, {
      content: reply,
      isStreaming: false,
      isPending: false,
      isError: false,
    })
    s().setPendingTurn(null)
    s().setStatus('idle')
    s().setLoading(false)
    s().bumpHotMemoryVersion()
    s().bumpFocusInput()
  }

  const fail = () => {
    clearPendingPoll()
    s().setPendingTurn(null)
    s().setLoading(false)
    if (opts.refillOnFail) {
      s().removeMessages(opts.anchorId, [opts.userMsgId, opts.assistantId])
      s().setPrefill({ text: opts.prompt, key: Date.now() })
      s().setTopToast({ text: '发送失败，消息已放回输入框，可修改后重发', key: Date.now() })
      s().setStatus('error')
      // 摇头 1.6s 后函数式守卫复位：用户已在此间重发（status 已变）则不打回
      setTimeout(() => {
        if (useStore.getState().currentStatus === 'error') s().setStatus('idle')
      }, 1600)
    } else {
      s().updateAssistantMessageById(opts.anchorId, opts.assistantId, {
        isPending: false,
        isStreaming: false,
        isError: true,
      })
    }
  }

  const tick = async () => {
    try {
      const msgs = await api.getMessages(opts.anchorId)
      if (myToken !== pollToken) return // await 期间被 clear/取代 → 丢弃这次结果
      const reply = findLandedReply(msgs, opts.prompt)
      if (reply != null) {
        finish(reply)
        return
      }
      const pending = await api.getPending(opts.anchorId)
      if (myToken !== pollToken) return
      if (!pending.turnId) {
        // 该轮已从注册表消失且未落库 → 停止/失败告吹
        fail()
        return
      }
    } catch {
      // 瞬时网络错误：不判失败，继续轮询
    }
    if (myToken !== pollToken) return // 被 clear/取代则不重排（否则旧 tick 会复活轮询）
    if (Date.now() - started > POLL_CAP) {
      fail()
      return
    }
    pollTimer = setTimeout(tick, POLL_INTERVAL)
  }

  // 首轮延后一个间隔，给服务端落库时间
  pollTimer = setTimeout(tick, POLL_INTERVAL)
}
