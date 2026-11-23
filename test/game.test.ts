import { describe, expect, it } from 'vitest'
import { validOp } from '../shared/draw.ts'
import {
  apply,
  applyDraw,
  DRAWER_BONUS,
  join,
  judge,
  MIN_GAIN,
  newGame,
  nextEventAt,
  tick,
  viewFor,
  type Ctx,
  type GameState,
} from '../shared/game.ts'

function seq(seed = 1) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function setup(n = 3) {
  const s = newGame()
  const rand = seq()
  const online = new Set<string>()
  const ctx = (now = 0): Ctx => ({ now, rand, online })
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const p = join(s, `token-${i}-xxxxxx`, `P${i}`, ctx())!
    online.add(p.id)
    ids.push(p.id)
  }
  return { s, ctx, ids, online }
}

function startDrawing(s: GameState, ctx: (n?: number) => Ctx, ids: string[], word = '苹果', now = 0) {
  expect(apply(s, ids[0], { t: 'start' }, ctx(now))).toBeNull()
  expect(s.phase).toBe('choosing')
  expect(apply(s, s.drawerId!, { t: 'choose', custom: word }, ctx(now))).toBeNull()
  expect(s.phase).toBe('drawing')
}

describe('judge', () => {
  it('matches exact, ignoring spaces, punctuation and width', () => {
    expect(judge(' 苹果！', '苹果')).toBe('right')
    expect(judge('ＡＢＣ', 'abc')).toBe('right')
    expect(judge('是苹果吗', '苹果')).toBe('right')
  })
  it('reports near and wrong', () => {
    expect(judge('芒果', '苹果')).toBe('near')
    expect(judge('香蕉', '苹果')).toBe('wrong')
    expect(judge('我觉得这个应该是苹果吧', '苹果')).toBe('wrong')
  })
})

describe('game flow', () => {
  it('host is first player; needs 2 players to start', () => {
    const { s, ctx, ids } = setup(1)
    expect(s.hostId).toBe(ids[0])
    expect(apply(s, ids[0], { t: 'start' }, ctx())).toMatch(/至少/)
  })

  it('rejoining with the same token keeps the seat', () => {
    const { s, ctx, ids } = setup(2)
    const again = join(s, 'token-1-xxxxxx', '新名字', ctx())!
    expect(again.id).toBe(ids[1])
    expect(s.players).toHaveLength(2)
    expect(again.name).toBe('新名字')
  })

  it('scores a typed correct guess and ends turn when everyone guessed', () => {
    const { s, ctx, ids } = setup(3)
    startDrawing(s, ctx, ids)
    const drawer = s.drawerId!
    const [g1, g2] = ids.filter((id) => id !== drawer)
    // 一半时间猜中
    apply(s, g1, { t: 'chat', text: '苹果' }, ctx(45_000))
    const p1 = s.players.find((p) => p.id === g1)!
    expect(p1.guessed).toBe(true)
    expect(p1.score).toBe(50)
    expect(s.players.find((p) => p.id === drawer)!.score).toBe(DRAWER_BONUS)
    // 猜中内容不广播
    expect(s.chat.some((m) => m.text === '苹果')).toBe(false)
    expect(s.phase).toBe('drawing')
    // 画的人手动判对第二个人
    expect(apply(s, drawer, { t: 'award', id: g2 }, ctx(89_000))).toBeNull()
    expect(s.players.find((p) => p.id === g2)!.score).toBe(MIN_GAIN)
    expect(s.phase).toBe('reveal')
    expect(s.last?.word).toBe('苹果')
  })

  it('drawer cannot say the answer; near guesses are private', () => {
    const { s, ctx, ids } = setup(2)
    startDrawing(s, ctx, ids)
    const drawer = s.drawerId!
    const guesser = ids.find((id) => id !== drawer)!
    expect(apply(s, drawer, { t: 'chat', text: '是苹果' }, ctx(1000))).toMatch(/答案/)
    apply(s, guesser, { t: 'chat', text: '芒果' }, ctx(1000))
    const near = s.chat.at(-1)!
    expect(near.kind).toBe('near')
    expect(near.to).toBe(guesser)
    const drawerView = viewFor(s, s.players.find((p) => p.id === drawer)!.token, new Set(ids), 1000)!
    expect(drawerView.chat.some((m) => m.kind === 'near')).toBe(false)
  })

  it('hides the word from guessers and reveals hints over time', () => {
    const { s, ctx, ids, online } = setup(2)
    startDrawing(s, ctx, ids, '长颈鹿')
    const guesser = s.players.find((p) => p.id !== s.drawerId)!
    let v = viewFor(s, guesser.token, online, 0)!
    expect(v.word).toBeNull()
    expect(v.hint?.chars).toEqual(['', '', ''])
    expect(nextEventAt(s)).toBe(45_000)
    expect(tick(s, ctx(45_000))).toBe(true)
    v = viewFor(s, guesser.token, online, 45_000)!
    expect(v.hint!.chars.filter(Boolean)).toHaveLength(1)
    tick(s, ctx(67_500))
    v = viewFor(s, guesser.token, online, 67_500)!
    expect(v.hint!.chars.filter(Boolean)).toHaveLength(2)
    expect(nextEventAt(s)).toBe(90_000)
    const drawerView = viewFor(s, s.players.find((p) => p.id === s.drawerId)!.token, online, 0)!
    expect(drawerView.word).toBe('长颈鹿')
  })

  it('choosing times out to the first option; game ends after all rounds', () => {
    const { s, ctx, ids } = setup(2)
    apply(s, ids[0], { t: 'settings', rounds: 1, seconds: 60 }, ctx())
    apply(s, ids[0], { t: 'start' }, ctx(0))
    const first = s.options[0].text
    tick(s, ctx(15_000))
    expect(s.phase).toBe('drawing')
    expect(s.word?.text).toBe(first)
    tick(s, ctx(15_000 + 60_000))
    expect(s.phase).toBe('reveal')
    tick(s, ctx(200_000))
    expect(s.phase).toBe('choosing')
    expect(s.drawerId).toBe(ids[1])
    // 第二个人选词超时、画完、展示完 → 只有 1 轮，结束
    tick(s, ctx(300_000))
    expect(s.phase).toBe('drawing')
    tick(s, ctx(400_000))
    expect(s.phase).toBe('reveal')
    tick(s, ctx(500_000))
    expect(s.phase).toBe('over')
  })

  it('skips offline players when picking the next drawer', () => {
    const { s, ctx, ids, online } = setup(3)
    online.delete(ids[1])
    apply(s, ids[0], { t: 'start' }, ctx())
    expect(s.drawerId).toBe(ids[0])
    apply(s, ids[0], { t: 'skip' }, ctx(1000))
    apply(s, ids[0], { t: 'skip' }, ctx(2000))
    expect(s.drawerId).toBe(ids[2])
  })

  it('drawer leaving ends the turn; host passes on', () => {
    const { s, ctx, ids } = setup(3)
    startDrawing(s, ctx, ids)
    apply(s, ids[0], { t: 'leave' }, ctx(1000))
    expect(s.hostId).toBe(ids[1])
    expect(s.phase).toBe('reveal')
  })

  it('only the drawer can draw, and undo works', () => {
    const { s, ctx, ids } = setup(2)
    startDrawing(s, ctx, ids)
    const drawer = s.drawerId!
    const other = ids.find((id) => id !== drawer)!
    const stroke = { k: 's' as const, id: 1, c: '#e53935', w: 6, p: [10, 10] }
    expect(applyDraw(s, other, stroke)).not.toBeNull()
    expect(applyDraw(s, drawer, stroke)).toBeNull()
    expect(applyDraw(s, drawer, { k: 'a', id: 1, p: [20, 20, 30, 30] })).toBeNull()
    expect(s.ops[0]).toMatchObject({ k: 's', p: [10, 10, 20, 20, 30, 30] })
    expect(applyDraw(s, drawer, { k: 'u' })).toBeNull()
    expect(s.ops).toHaveLength(0)
  })
})

describe('validOp', () => {
  it('rejects bad input', () => {
    expect(validOp({ k: 's', id: 1, c: 'red', w: 6, p: [1, 1] })).toBe(false)
    expect(validOp({ k: 's', id: 1, c: '#ffffff', w: 6, p: [1] })).toBe(false)
    expect(validOp({ k: 's', id: 1, c: '#ffffff', w: 6, p: [1, 99999] })).toBe(false)
    expect(validOp({ k: 'f', x: 5, y: 5, c: '#000000' })).toBe(true)
    expect(validOp({ k: 'z' })).toBe(false)
  })
})
