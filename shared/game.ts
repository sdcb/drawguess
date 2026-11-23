import { countNumbers, MAX_NUMBERS, MAX_OPS, reduceOps, type DrawOp, type StoredOp } from './draw.ts'
import { pickOptions, type Word } from './words.ts'

export const MAX_PLAYERS = 10
export const MIN_PLAYERS = 2
export const CHOOSE_MS = 15_000
export const REVEAL_MS = 6_000
export const SECONDS_OPTIONS = [60, 90, 120] as const
export const DEFAULT_SECONDS = 90
export const ROUNDS_MAX = 5
export const DEFAULT_ROUNDS = 3
export const CHAT_MAX = 40
export const WORD_MAX = 12
export const NAME_MAX = 12
export const DRAWER_BONUS = 25
export const MIN_GAIN = 20
export const OPTION_COUNT = 3
const KEEP_CHAT = 100
const SHOW_CHAT = 60

export type Phase = 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'over'

export interface Player {
  /** 公开 id，别人能看到；token 是本人的密钥，只存在服务器 */
  id: string
  token: string
  name: string
  score: number
  /** 本轮是否已猜中 */
  guessed: boolean
  /** 本轮得分 */
  gain: number
}

export interface ChatMsg {
  id: number
  turn: number
  kind: 'chat' | 'near' | 'correct' | 'system'
  from?: string
  name?: string
  text: string
  voiceId?: string
  /** 只给这个玩家看 */
  to?: string
  /** 画画时只给画的人和已猜中的人看（防止泄题），这一轮结束后所有人可见 */
  insiders?: boolean
}

export interface TurnResult {
  turn: number
  word: string | null
  drawerId: string
  drawerName: string
  gains: { id: string; name: string; gain: number }[]
}

export interface GameState {
  players: Player[]
  hostId: string | null
  rounds: number
  seconds: number
  phase: Phase
  round: number
  /** 第几次轮到有人画，每次 +1，客户端靠它区分画布 */
  turn: number
  drawerId: string | null
  /** 本轮（round）已经画过的人 */
  drawn: string[]
  options: Word[]
  word: Word | null
  turnStart: number
  deadline: number
  revealed: number[]
  used: string[]
  ops: StoredOp[]
  chat: ChatMsg[]
  seq: number
  last: TurnResult | null
}

export interface Ctx {
  now: number
  rand: () => number
  /** 在线玩家 id */
  online: Set<string>
}

export type Action =
  | { t: 'settings'; rounds: number; seconds: number }
  | { t: 'start' }
  | { t: 'choose'; index?: number; custom?: string }
  | { t: 'chat'; text: string; voiceId?: string }
  | { t: 'award'; id: string }
  | { t: 'skip' }
  | { t: 'again' }
  | { t: 'kick'; id: string }
  | { t: 'leave' }

export interface PublicPlayer {
  id: string
  name: string
  score: number
  guessed: boolean
  gain: number
  online: boolean
}

export interface PlayerView {
  meId: string
  hostId: string | null
  phase: Phase
  round: number
  rounds: number
  seconds: number
  turn: number
  drawerId: string | null
  players: PublicPlayer[]
  /** 只有画的人在选词时能看到 */
  options: Word[]
  /** 能看到答案时才有 */
  word: string | null
  /** 提示：每个字，没揭示的是空串 */
  hint: { cat: string; chars: string[] } | null
  turnStart: number
  deadline: number
  /** 服务器当前时间，客户端据此校准倒计时 */
  now: number
  chat: ChatMsg[]
  last: TurnResult | null
}

export function newGame(): GameState {
  return {
    players: [],
    hostId: null,
    rounds: DEFAULT_ROUNDS,
    seconds: DEFAULT_SECONDS,
    phase: 'lobby',
    round: 0,
    turn: 0,
    drawerId: null,
    drawn: [],
    options: [],
    word: null,
    turnStart: 0,
    deadline: 0,
    revealed: [],
    used: [],
    ops: [],
    chat: [],
    seq: 0,
    last: null,
  }
}

/** 统一大小写、全半角，去掉空格和标点，用来比较答案 */
export function normalize(s: string) {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

function editDistance(a: string, b: string) {
  const x = [...a]
  const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[y.length]
}

/** 猜词结果：对 / 很接近 / 不对 */
export function judge(guess: string, answer: string): 'right' | 'near' | 'wrong' {
  const g = normalize(guess)
  const a = normalize(answer)
  if (!g || !a) return 'wrong'
  if (g === a) return 'right'
  // “是苹果吗”这种带了几个字的也算对
  if (g.includes(a) && [...g].length <= [...a].length + 3) return 'right'
  if ([...a].length >= 2 && editDistance(g, a) === 1) return 'near'
  return 'wrong'
}

export const playerByToken = (s: GameState, token: string) => s.players.find((p) => p.token === token)
const playerById = (s: GameState, id: string | null) => s.players.find((p) => p.id === id)

function newId(s: GameState, rand: () => number) {
  for (;;) {
    const id = Math.floor(rand() * 36 ** 6)
      .toString(36)
      .padStart(6, '0')
    if (!playerById(s, id)) return id
  }
}

function say(s: GameState, msg: Omit<ChatMsg, 'id' | 'turn'>) {
  s.chat.push({ ...msg, id: ++s.seq, turn: s.turn })
  if (s.chat.length > KEEP_CHAT) s.chat.splice(0, s.chat.length - KEEP_CHAT)
}

/** 加入或回到房间；房间满了返回 null */
export function join(s: GameState, token: string, name: string, ctx: Ctx): Player | null {
  const n = name.trim().slice(0, NAME_MAX) || '玩家'
  const existing = playerByToken(s, token)
  if (existing) {
    existing.name = n
    return existing
  }
  if (s.players.length >= MAX_PLAYERS) return null
  const p: Player = { id: newId(s, ctx.rand), token, name: n, score: 0, guessed: false, gain: 0 }
  s.players.push(p)
  s.hostId ??= p.id
  say(s, { kind: 'system', text: `${n} 加入了` })
  return p
}

function resetTurnFlags(s: GameState) {
  for (const p of s.players) {
    p.guessed = false
    p.gain = 0
  }
}

function startChoosing(s: GameState, drawer: Player, ctx: Ctx) {
  s.turn++
  s.phase = 'choosing'
  s.drawerId = drawer.id
  s.drawn.push(drawer.id)
  s.options = pickOptions(OPTION_COUNT, s.used, ctx.rand)
  s.word = null
  s.deadline = ctx.now + CHOOSE_MS
  s.turnStart = 0
  s.revealed = []
  s.ops = []
  s.last = null
  resetTurnFlags(s)
}

function finish(s: GameState) {
  s.phase = 'over'
  s.drawerId = null
  s.word = null
  s.options = []
  s.deadline = 0
  const top = [...s.players].sort((a, b) => b.score - a.score)[0]
  say(s, { kind: 'system', text: top ? `游戏结束！${top.name} 得分最高` : '游戏结束' })
}

/** 找下一个画的人：本轮没画过、在线的玩家；本轮都画过就进入下一轮；全部轮数完了就结束 */
function nextTurn(s: GameState, ctx: Ctx) {
  for (let pass = 0; pass < 2; pass++) {
    const p = s.players.find((x) => !s.drawn.includes(x.id) && ctx.online.has(x.id))
    if (p) return startChoosing(s, p, ctx)
    if (s.round >= s.rounds) break
    s.round++
    s.drawn = []
  }
  finish(s)
}

function beginDrawing(s: GameState, word: Word, ctx: Ctx) {
  s.word = word
  s.used.push(word.text)
  s.options = []
  s.phase = 'drawing'
  s.turnStart = ctx.now
  s.deadline = ctx.now + s.seconds * 1000
  const drawer = playerById(s, s.drawerId)
  say(s, { kind: 'system', text: `${drawer?.name ?? '有人'} 开始画了` })
}

function endTurn(s: GameState, ctx: Ctx) {
  const drawer = playerById(s, s.drawerId)
  s.last = {
    turn: s.turn,
    word: s.word?.text ?? null,
    drawerId: s.drawerId ?? '',
    drawerName: drawer?.name ?? '',
    gains: s.players.map((p) => ({ id: p.id, name: p.name, gain: p.gain })),
  }
  if (s.word) say(s, { kind: 'system', text: `答案是「${s.word.text}」` })
  s.phase = 'reveal'
  s.deadline = ctx.now + REVEAL_MS
}

function guessers(s: GameState) {
  return s.players.filter((p) => p.id !== s.drawerId)
}

/** 在线的猜词人都猜中了 */
function allGuessed(s: GameState, ctx: Ctx) {
  const g = guessers(s).filter((p) => p.guessed || ctx.online.has(p.id))
  return g.length > 0 && g.every((p) => p.guessed)
}

function markCorrect(s: GameState, p: Player, ctx: Ctx, by: 'typed' | 'award') {
  const total = s.seconds * 1000
  const gain = Math.max(MIN_GAIN, Math.round((100 * Math.max(0, s.deadline - ctx.now)) / total))
  p.guessed = true
  p.gain += gain
  p.score += gain
  const drawer = playerById(s, s.drawerId)
  if (drawer) {
    drawer.gain += DRAWER_BONUS
    drawer.score += DRAWER_BONUS
  }
  say(s, { kind: 'correct', from: p.id, name: p.name, text: by === 'award' ? `${p.name} 猜对了！（画的人判定）` : `${p.name} 猜对了！` })
  if (allGuessed(s, ctx)) endTurn(s, ctx)
}

function removePlayer(s: GameState, id: string, ctx: Ctx) {
  const p = playerById(s, id)
  if (!p) return
  s.players = s.players.filter((x) => x.id !== id)
  say(s, { kind: 'system', text: `${p.name} 离开了` })
  if (s.hostId === id) s.hostId = s.players[0]?.id ?? null
  if (s.phase === 'lobby' || s.phase === 'over') return
  if (s.players.length < MIN_PLAYERS) return finish(s)
  if (s.drawerId === id && (s.phase === 'choosing' || s.phase === 'drawing')) return endTurn(s, ctx)
  if (s.phase === 'drawing' && allGuessed(s, ctx)) endTurn(s, ctx)
}

const hintTimes = (s: GameState) => {
  const len = s.word ? [...s.word.text].length : 0
  const total = s.seconds * 1000
  const t: number[] = []
  if (len >= 2) t.push(s.turnStart + total * 0.5)
  if (len >= 3) t.push(s.turnStart + total * 0.75)
  return t
}

function revealHint(s: GameState, rand: () => number) {
  const chars = [...(s.word?.text ?? '')]
  const hidden = chars.map((_, i) => i).filter((i) => !s.revealed.includes(i))
  if (hidden.length <= 1) return
  s.revealed.push(hidden[Math.floor(rand() * hidden.length)])
}

/** 处理到期的事件（选词超时、提示、回合结束、展示结束）。有变化返回 true。 */
export function tick(s: GameState, ctx: Ctx): boolean {
  let changed = false
  for (let guard = 0; guard < 10; guard++) {
    if (s.phase === 'choosing' && ctx.now >= s.deadline) {
      beginDrawing(s, s.options[0] ?? pickOptions(1, s.used, ctx.rand)[0], ctx)
    } else if (s.phase === 'drawing') {
      const due = hintTimes(s).filter((t) => t <= ctx.now).length
      if (s.revealed.length < due) {
        while (s.revealed.length < due) {
          const before = s.revealed.length
          revealHint(s, ctx.rand)
          if (s.revealed.length === before) break
        }
        if (s.revealed.length < due) s.revealed.length = due // 词太短没法再揭示了，记个数防止反复处理
        changed = true
        continue
      }
      if (ctx.now >= s.deadline) endTurn(s, ctx)
      else break
    } else if (s.phase === 'reveal' && ctx.now >= s.deadline) {
      nextTurn(s, ctx)
    } else break
    changed = true
  }
  return changed
}

/** 下一个需要 tick 的时间点，没有则 null */
export function nextEventAt(s: GameState): number | null {
  if (s.phase === 'choosing' || s.phase === 'reveal') return s.deadline
  if (s.phase === 'drawing') {
    const pending = hintTimes(s).slice(s.revealed.length)
    return Math.min(s.deadline, ...pending)
  }
  return null
}

/** 执行玩家操作；不合法时返回错误信息 */
export function apply(s: GameState, playerId: string, a: Action, ctx: Ctx): string | null {
  const me = playerById(s, playerId)
  if (!me || !a || typeof a !== 'object') return '你不在这个房间里'
  const isHost = s.hostId === me.id
  const isDrawer = s.drawerId === me.id

  switch (a.t) {
    case 'settings': {
      if (!isHost || s.phase !== 'lobby') return '只有房主能改设置'
      if (Number.isInteger(a.rounds)) s.rounds = Math.min(ROUNDS_MAX, Math.max(1, a.rounds))
      if ((SECONDS_OPTIONS as readonly number[]).includes(a.seconds)) s.seconds = a.seconds
      return null
    }
    case 'start': {
      if (!isHost || (s.phase !== 'lobby' && s.phase !== 'over')) return '只有房主能开始'
      if (s.players.length < MIN_PLAYERS) return `至少要 ${MIN_PLAYERS} 个人才能开始`
      for (const p of s.players) p.score = 0
      s.round = 1
      s.drawn = []
      s.used = s.used.slice(-60)
      say(s, { kind: 'system', text: `游戏开始！一共 ${s.rounds} 轮，每人每轮画一次` })
      nextTurn(s, ctx)
      return null
    }
    case 'choose': {
      if (!isDrawer || s.phase !== 'choosing') return '现在不能选词'
      if (typeof a.custom === 'string') {
        const text = a.custom.trim().slice(0, WORD_MAX)
        if (!normalize(text)) return '题目不能为空'
        beginDrawing(s, { text, cat: '自定义' }, ctx)
        return null
      }
      const w = Number.isInteger(a.index) ? s.options[a.index as number] : undefined
      if (!w) return '没有这个选项'
      beginDrawing(s, w, ctx)
      return null
    }
    case 'chat': {
      const text = typeof a.text === 'string' ? a.text.trim().slice(0, CHAT_MAX) : ''
      const voiceId = typeof a.voiceId === 'string' ? a.voiceId : undefined
      if (!text && !voiceId) return '说点什么吧'
      const base = { kind: 'chat' as const, from: me.id, name: me.name, text, voiceId }
      if (s.phase !== 'drawing' || !s.word) {
        say(s, base)
        return null
      }
      if (isDrawer) {
        if (text && judge(text, s.word.text) === 'right') return '不能说出答案哦'
        say(s, base)
        return null
      }
      if (me.guessed) {
        say(s, { ...base, insiders: true })
        return null
      }
      if (!text) {
        say(s, base)
        return null
      }
      const r = judge(text, s.word.text)
      if (r === 'right') markCorrect(s, me, ctx, 'typed')
      else if (r === 'near') say(s, { kind: 'near', to: me.id, text: `“${text}” 很接近了！` })
      else say(s, base)
      return null
    }
    case 'award': {
      if (!isDrawer || s.phase !== 'drawing') return '只有画的人能判定'
      const p = playerById(s, typeof a.id === 'string' ? a.id : null)
      if (!p || p.id === me.id) return '找不到这个玩家'
      if (p.guessed) return `${p.name} 已经猜对了`
      markCorrect(s, p, ctx, 'award')
      return null
    }
    case 'skip': {
      if ((s.phase === 'choosing' || s.phase === 'drawing') && (isHost || isDrawer)) {
        say(s, { kind: 'system', text: `${me.name} 跳过了这一题` })
        endTurn(s, ctx)
        return null
      }
      if (s.phase === 'reveal' && (isHost || isDrawer)) {
        nextTurn(s, ctx)
        return null
      }
      return '现在不能跳过'
    }
    case 'again': {
      if (!isHost || s.phase !== 'over') return '只有房主能重新开始'
      s.phase = 'lobby'
      s.round = 0
      s.drawerId = null
      s.last = null
      s.ops = []
      for (const p of s.players) p.score = 0
      resetTurnFlags(s)
      return null
    }
    case 'kick': {
      if (!isHost || a.id === me.id) return '只有房主能请人离开'
      if (!playerById(s, typeof a.id === 'string' ? a.id : null)) return '找不到这个玩家'
      removePlayer(s, a.id, ctx)
      return null
    }
    case 'leave':
      removePlayer(s, me.id, ctx)
      return null
    default:
      return '未知操作'
  }
}

/** 画的人画了一笔；返回错误信息或 null */
export function applyDraw(s: GameState, playerId: string, op: DrawOp): string | null {
  if (s.phase !== 'drawing' || s.drawerId !== playerId) return '现在不是你画'
  if ((op.k === 's' || op.k === 'f' || op.k === 'x') && s.ops.length >= MAX_OPS) return '画得太多了，清空一下吧'
  if ((op.k === 's' || op.k === 'a') && countNumbers(s.ops) + op.p.length > MAX_NUMBERS) return '画得太多了，清空一下吧'
  return reduceOps(s.ops, op) ? null : 'ignored'
}

export function viewFor(s: GameState, token: string, online: Set<string>, now: number): PlayerView | null {
  const me = playerByToken(s, token)
  if (!me) return null
  const isDrawer = s.drawerId === me.id
  const insider = isDrawer || me.guessed
  const open = s.phase === 'reveal' || s.phase === 'over'
  const showWord = !!s.word && (open || (s.phase === 'drawing' && insider))
  const drawingNow = s.phase === 'drawing'
  const chat = s.chat
    .filter((m) => (m.to ? m.to === me.id : m.insiders ? insider || !(drawingNow && m.turn === s.turn) : true))
    .slice(-SHOW_CHAT)
  return {
    meId: me.id,
    hostId: s.hostId,
    phase: s.phase,
    round: s.round,
    rounds: s.rounds,
    seconds: s.seconds,
    turn: s.turn,
    drawerId: s.drawerId,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      guessed: p.guessed,
      gain: p.gain,
      online: online.has(p.id),
    })),
    options: isDrawer && s.phase === 'choosing' ? s.options : [],
    word: showWord ? s.word!.text : null,
    hint: s.word
      ? { cat: s.word.cat, chars: [...s.word.text].map((c, i) => (showWord || s.revealed.includes(i) ? c : '')) }
      : null,
    turnStart: s.turnStart,
    deadline: s.deadline,
    now,
    chat,
    last: s.last,
  }
}
