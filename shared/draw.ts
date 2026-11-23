/** 逻辑画布尺寸（4:3）。所有坐标都是这个尺寸下的整数，各设备按比例缩放显示。 */
export const W = 1200
export const H = 900

export const BG = '#ffffff'
export const COLORS = [
  '#1f1f1f',
  '#e53935',
  '#fb8c00',
  '#fdd835',
  '#43a047',
  '#00acc1',
  '#1e88e5',
  '#8e24aa',
  '#f06292',
  '#8d6e63',
  '#9e9e9e',
] as const
export const SIZES = [6, 14, 30] as const
export const MAX_WIDTH = 80

/**
 * 画画操作：
 * s 开始一笔（带第一批点） / a 往某一笔追加点 / f 颜料桶 / u 撤销上一步 / x 清空
 * 点列为扁平数组 [x0, y0, x1, y1, …]
 */
export type DrawOp =
  | { k: 's'; id: number; c: string; w: number; p: number[] }
  | { k: 'a'; id: number; p: number[] }
  | { k: 'f'; x: number; y: number; c: string }
  | { k: 'u' }
  | { k: 'x' }

/** 存下来的操作：撤销和追加都会合并进去 */
export type StoredOp = Extract<DrawOp, { k: 's' | 'f' | 'x' }>

export const MAX_POINTS_PER_MSG = 400
export const MAX_OPS = 2000
export const MAX_NUMBERS = 80_000

const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c)
const isInt = (n: unknown, lo: number, hi: number): n is number => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi

function validPoints(p: unknown): p is number[] {
  if (!Array.isArray(p) || p.length < 2 || p.length > MAX_POINTS_PER_MSG || p.length % 2) return false
  for (let i = 0; i < p.length; i += 2) if (!isInt(p[i], 0, W) || !isInt(p[i + 1], 0, H)) return false
  return true
}

export function validOp(op: unknown): op is DrawOp {
  if (!op || typeof op !== 'object') return false
  const o = op as Record<string, unknown>
  switch (o.k) {
    case 's':
      return isInt(o.id, 0, 1e9) && isColor(o.c) && isInt(o.w, 1, MAX_WIDTH) && validPoints(o.p)
    case 'a':
      return isInt(o.id, 0, 1e9) && validPoints(o.p)
    case 'f':
      return isInt(o.x, 0, W - 1) && isInt(o.y, 0, H - 1) && isColor(o.c)
    case 'u':
    case 'x':
      return true
    default:
      return false
  }
}

/** 只保留需要的字段，防止客户端塞别的东西进来 */
export function cleanOp(op: DrawOp): DrawOp {
  switch (op.k) {
    case 's':
      return { k: 's', id: op.id, c: op.c, w: op.w, p: op.p }
    case 'a':
      return { k: 'a', id: op.id, p: op.p }
    case 'f':
      return { k: 'f', x: op.x, y: op.y, c: op.c }
    default:
      return { k: op.k }
  }
}

export function countNumbers(ops: StoredOp[]) {
  let n = 0
  for (const o of ops) n += o.k === 's' ? o.p.length : 2
  return n
}

/** 把一个操作并进操作列表（前后端共用同一套规则）。返回 false 表示这个操作无效、被忽略。 */
export function reduceOps(ops: StoredOp[], op: DrawOp): boolean {
  switch (op.k) {
    case 's':
      ops.push({ k: 's', id: op.id, c: op.c, w: op.w, p: [...op.p] })
      return true
    case 'a': {
      const last = ops.at(-1)
      if (!last || last.k !== 's' || last.id !== op.id) return false
      last.p.push(...op.p)
      return true
    }
    case 'f':
      ops.push({ ...op })
      return true
    case 'x':
      ops.push({ k: 'x' })
      return true
    case 'u':
      return ops.pop() !== undefined
  }
}
