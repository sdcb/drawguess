import { DurableObject } from 'cloudflare:workers'
import { cleanOp, validOp, type StoredOp } from '../shared/draw.ts'
import {
  apply,
  applyDraw,
  join,
  newGame,
  nextEventAt,
  playerByToken,
  tick,
  viewFor,
  type Action,
  type Ctx,
  type GameState,
} from '../shared/game.ts'
import {
  CLOSE_FULL,
  CLOSE_KICKED,
  CLOSE_NO_ROOM,
  MAX_VOICE_BASE64,
  type ClientMsg,
  type ServerMsg,
  type VoiceUpload,
} from '../shared/protocol.ts'

// 多人房闲置 24 小时清理，只有一个人的房间 2 小时清理
const IDLE_MS = 24 * 60 * 60 * 1000
const IDLE_SINGLE_MS = 2 * 60 * 60 * 1000
// 普通消息：每个连接 10 秒最多 30 条；画画消息另算，10 秒最多 400 条；语音至少间隔 3 秒
const MSG_WINDOW_MS = 10_000
const MSG_PER_WINDOW = 30
const DRAW_PER_WINDOW = 400
const VOICE_GAP_MS = 3_000
const KEEP_VOICES = 40
// 画画数据最多攒 2 秒再写存储，省写入次数
const OPS_FLUSH_MS = 2_000

interface Attachment {
  token: string
  id: string
}

interface StoredVoice {
  mime: string
  data: string
}

interface Rate {
  start: number
  count: number
  draws: number
  lastVoice: number
}

export class DrawRoom extends DurableObject<Env> {
  private state: GameState | null = null
  private lastActive = 0
  private opsDirty = false
  private opsSavedAt = 0
  private opsTurn = -1
  /** 限流计数只放内存：DO 休眠后清零，可以接受 */
  private rate = new WeakMap<WebSocket, Rate>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // 心跳由运行时直接回应，不唤醒休眠中的 DO
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'))
    ctx.blockConcurrencyWhile(async () => {
      const got = await ctx.storage.get<unknown>(['state', 'ops', 'lastActive'])
      const state = got.get('state') as GameState | undefined
      if (state) {
        state.ops = (got.get('ops') as StoredOp[] | undefined) ?? []
        this.state = state
        this.opsTurn = state.turn
      }
      this.lastActive = (got.get('lastActive') as number | undefined) ?? 0
    })
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname

    if (path.endsWith('/init') && req.method === 'POST') {
      if (this.state) return new Response('exists', { status: 409 })
      this.state = newGame()
      await this.saveState(true)
      return new Response('ok', { status: 201 })
    }

    const voice = path.match(/\/voice\/([\w-]{1,64})$/)
    if (voice) {
      const v = await this.ctx.storage.get<StoredVoice>(`voice:${voice[1]}`)
      if (!v) return new Response('语音已过期', { status: 404 })
      const bytes = Uint8Array.from(atob(v.data), (c) => c.charCodeAt(0))
      return new Response(bytes, {
        headers: { 'Content-Type': v.mime, 'Cache-Control': 'private, max-age=86400' },
      })
    }

    if (path.endsWith('/ws')) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket', { status: 426 })
      const token = url.searchParams.get('token') ?? ''
      const name = url.searchParams.get('name') ?? ''
      const [client, server] = Object.values(new WebSocketPair())
      const reject = (code: number, reason: string) => {
        server.accept()
        server.close(code, reason)
        return new Response(null, { status: 101, webSocket: client })
      }

      if (!this.state || !/^[\w-]{8,64}$/.test(token)) return reject(CLOSE_NO_ROOM, 'room not found')
      const player = join(this.state, token, name, this.gameCtx())
      if (!player) return reject(CLOSE_FULL, 'room full')

      // 同一玩家在别的标签页打开过：关掉旧连接
      for (const ws of this.ctx.getWebSockets(token)) ws.close(1000, 'replaced')
      this.ctx.acceptWebSocket(server, [token])
      server.serializeAttachment({ token, id: player.id } satisfies Attachment)
      await this.saveState(true)
      this.broadcast()
      send(server, { t: 'ops', turn: this.state.turn, ops: this.state.ops })
      return new Response(null, { status: 101, webSocket: client })
    }

    return new Response('not found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.state || typeof raw !== 'string') return
    const { id } = ws.deserializeAttachment() as Attachment
    let msg: ClientMsg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'ping') return send(ws, { t: 'pong' })

    const now = Date.now()
    const r = this.rate.get(ws) ?? { start: now, count: 0, draws: 0, lastVoice: 0 }
    this.rate.set(ws, r)
    if (now - r.start > MSG_WINDOW_MS) Object.assign(r, { start: now, count: 0, draws: 0 })

    const ctx = this.gameCtx(now)
    const ticked = tick(this.state, ctx)

    if (msg.t === 'draw') {
      if (++r.draws > DRAW_PER_WINDOW) return
      if (!validOp(msg.op)) return
      const op = cleanOp(msg.op)
      const err = applyDraw(this.state, id, op)
      if (err) {
        if (err !== 'ignored') send(ws, { t: 'error', message: err })
      } else {
        this.opsDirty = true
        this.lastActive = now
        const turn = this.state.turn
        for (const other of this.ctx.getWebSockets()) if (other !== ws) send(other, { t: 'op', turn, op })
      }
      if (ticked) {
        await this.saveState(true)
        this.broadcast()
      } else if (now - this.opsSavedAt >= OPS_FLUSH_MS) await this.flushOps()
      else await this.schedule()
      return
    }

    if (++r.count > MSG_PER_WINDOW) return send(ws, { t: 'error', message: '操作太快了，歇一下' })

    let action: Action
    let voice: (StoredVoice & { id: string }) | undefined
    if (msg.t === 'chat') {
      if (msg.voice) {
        const err = checkVoice(msg.voice)
        if (err) return send(ws, { t: 'error', message: err })
        if (now - r.lastVoice < VOICE_GAP_MS) return send(ws, { t: 'error', message: '语音发得太快了' })
        r.lastVoice = now
        voice = { id: crypto.randomUUID(), mime: msg.voice.mime, data: msg.voice.data }
      }
      action = { t: 'chat', text: typeof msg.text === 'string' ? msg.text : '', voiceId: voice?.id }
    } else {
      action = msg
    }

    const err = apply(this.state, id, action, ctx)
    if (err) {
      send(ws, { t: 'error', message: err })
      if (!ticked) return
    }
    if (voice && !err) await this.storeVoice(voice)
    await this.saveState(true)
    this.closeRemoved()
    this.broadcast()
  }

  async webSocketClose(ws: WebSocket) {
    this.broadcast(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast(ws)
  }

  async alarm() {
    if (!this.state) return
    const now = Date.now()
    if (now - this.lastActive >= this.idleMs()) {
      for (const ws of this.ctx.getWebSockets()) ws.close(CLOSE_NO_ROOM, 'room expired')
      this.state = null
      await this.ctx.storage.deleteAll()
      return
    }
    if (tick(this.state, this.gameCtx(now))) {
      await this.saveState(false)
      this.broadcast()
    } else if (this.opsDirty) await this.flushOps()
    else await this.schedule()
  }

  private idleMs() {
    return (this.state?.players.length ?? 0) > 1 ? IDLE_MS : IDLE_SINGLE_MS
  }

  private onlineIds(closing?: WebSocket) {
    const ids = new Set<string>()
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing) continue
      ids.add((ws.deserializeAttachment() as Attachment).id)
    }
    return ids
  }

  private gameCtx(now = Date.now()): Ctx {
    return { now, rand: Math.random, online: this.onlineIds() }
  }

  /** 保存游戏状态；画画数据只在有变化或换题时才一起写 */
  private async saveState(active: boolean) {
    if (!this.state) return
    const now = Date.now()
    if (active) this.lastActive = now
    const { ops, ...rest } = this.state
    const entries: Record<string, unknown> = { state: rest, lastActive: this.lastActive }
    if (this.opsDirty || this.opsTurn !== this.state.turn) {
      entries.ops = ops
      this.opsDirty = false
      this.opsSavedAt = now
      this.opsTurn = this.state.turn
    }
    await this.ctx.storage.put(entries)
    await this.schedule()
  }

  private async flushOps() {
    if (!this.state) return
    this.opsDirty = false
    this.opsSavedAt = Date.now()
    this.opsTurn = this.state.turn
    await this.ctx.storage.put({ ops: this.state.ops, lastActive: this.lastActive })
    await this.schedule()
  }

  /** 闹钟定在最近的一件事上：游戏计时、画画数据落盘、闲置清理 */
  private async schedule() {
    if (!this.state) return
    let next = this.lastActive + this.idleMs()
    const ev = nextEventAt(this.state)
    if (ev !== null) next = Math.min(next, ev)
    if (this.opsDirty) next = Math.min(next, this.opsSavedAt + OPS_FLUSH_MS)
    const current = await this.ctx.storage.getAlarm()
    if (current !== next) await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 50))
  }

  private async storeVoice(v: StoredVoice & { id: string }) {
    const ids = (await this.ctx.storage.get<string[]>('voices')) ?? []
    ids.push(v.id)
    const drop = ids.splice(0, Math.max(0, ids.length - KEEP_VOICES))
    await this.ctx.storage.put({ [`voice:${v.id}`]: { mime: v.mime, data: v.data }, voices: ids })
    if (drop.length) await this.ctx.storage.delete(drop.map((id) => `voice:${id}`))
  }

  /** 被请出或自己离开的玩家：关掉连接，客户端不再重连 */
  private closeRemoved() {
    if (!this.state) return
    for (const ws of this.ctx.getWebSockets()) {
      const { token } = ws.deserializeAttachment() as Attachment
      if (!playerByToken(this.state, token)) ws.close(CLOSE_KICKED, 'removed')
    }
  }

  /** 给每个连接推送它自己的视图。closing 是正在断开、不算在线的连接。 */
  private broadcast(closing?: WebSocket) {
    if (!this.state) return
    const online = this.onlineIds(closing)
    const now = Date.now()
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing) continue
      const { token } = ws.deserializeAttachment() as Attachment
      const view = viewFor(this.state, token, online, now)
      if (view) send(ws, { t: 'state', view })
    }
  }
}

function send(ws: WebSocket, msg: ServerMsg) {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // 连接已断开，忽略
  }
}

function checkVoice(v: VoiceUpload): string | null {
  if (!v || typeof v !== 'object') return '语音数据无效'
  if (typeof v.mime !== 'string' || !/^audio\/[\w.+-]+(;[\w=.,\s-]*)?$/.test(v.mime)) return '语音格式不支持'
  if (typeof v.data !== 'string' || v.data.length > MAX_VOICE_BASE64) return '语音太长了'
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v.data)) return '语音数据无效'
  return null
}
