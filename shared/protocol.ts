import type { DrawOp, StoredOp } from './draw.ts'
import type { Action, PlayerView } from './game.ts'

export const MAX_VOICE_SECONDS = 15
/** base64 后的语音上限，约 15 秒 opus/aac 绰绰有余，远低于 WebSocket 1 MiB 限制 */
export const MAX_VOICE_BASE64 = 400_000

export interface VoiceUpload {
  mime: string
  data: string
}

export type ClientMsg =
  | Exclude<Action, { t: 'chat' }>
  | { t: 'chat'; text: string; voice?: VoiceUpload }
  | { t: 'draw'; op: DrawOp }
  | { t: 'ping' }

export type ServerMsg =
  | { t: 'state'; view: PlayerView }
  /** 当前这一题的全部画画操作，连上时发一次 */
  | { t: 'ops'; turn: number; ops: StoredOp[] }
  /** 画的人新画的一步 */
  | { t: 'op'; turn: number; op: DrawOp }
  | { t: 'error'; message: string }
  | { t: 'pong' }

/** WebSocket 关闭码 */
export const CLOSE_NO_ROOM = 4404
export const CLOSE_FULL = 4403
export const CLOSE_KICKED = 4401

/** 房号字符集：去掉 0/O/1/I/L 等易混字符 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CODE_LENGTH = 6
export const isRoomCode = (c: string) => c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch))
