import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { COLORS, type DrawOp } from '../../shared/draw.ts'
import type { Phase, PlayerView } from '../../shared/game.ts'
import type { VoiceUpload } from '../../shared/protocol.ts'
import { enqueueVoice, unlockAudio } from '../lib/audio.ts'
import { Board } from '../lib/board.ts'
import { useRoom, type DrawSink } from '../lib/socket.ts'
import { saveArtwork, voiceUrl, type Artwork } from '../lib/artwork.ts'
import { Chat } from './Chat.tsx'
import { DrawSurface } from './DrawSurface.tsx'
import { GameLobby } from './GameLobby.tsx'
import { GameOver } from './GameOver.tsx'
import { Players } from './Players.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'
import { Toolbar, type ToolState } from './Toolbar.tsx'
import { WordPicker } from './WordPicker.tsx'

interface Props {
  code: string
  name: string
  onLeave: () => void
}

const STATUS_TEXT = {
  noroom: '房间不存在或已经过期了',
  full: '房间已经满了',
  replaced: '你在另一个页面打开了这个房间',
  kicked: '你已经离开了这个房间',
} as const

function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function Room({ code, name, onLeave }: Props) {
  const boardRef = useRef<Board | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [tool, setTool] = useState<ToolState>({ tool: 'pen', color: COLORS[0], size: 1 })
  const [gallery, setGallery] = useState<Artwork[]>([])

  const sink = useMemo<DrawSink>(
    () => ({
      load(turn, ops) {
        boardRef.current?.load(turn, ops)
        bump()
      },
      apply(turn, op) {
        const b = boardRef.current
        if (!b) return
        b.reset(turn)
        b.apply(op)
        bump()
      },
    }),
    [],
  )
  const { view, status, error, setError, send, offset } = useRoom(code, name, sink)
  const now = useNow()

  const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
    if (el && boardRef.current?.canvas !== el) {
      boardRef.current = new Board(el)
      setBoard(boardRef.current)
    }
  }, [])

  // 换题时清空画布
  const turn = view?.turn
  useEffect(() => {
    if (turn !== undefined) {
      boardRef.current?.reset(turn)
      bump()
    }
  }, [turn])

  // 第一次触屏时解锁音频，之后语音才能自动播放
  useEffect(() => {
    const unlock = () => unlockAudio()
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  // 新语音自动播放（自己发的不播；刚进房间时已有的不播）
  const seenVoice = useRef<Set<number> | null>(null)
  useEffect(() => {
    if (!view) return
    const voices = view.chat.filter((m) => m.voiceId)
    if (!seenVoice.current) {
      seenVoice.current = new Set(voices.map((m) => m.id))
      return
    }
    for (const m of voices) {
      if (seenVoice.current.has(m.id)) continue
      seenVoice.current.add(m.id)
      if (m.from !== view.meId) enqueueVoice(voiceUrl(code, m.voiceId!))
    }
  }, [view, code])

  // 每题结束时把画存进本局画廊
  const prevPhase = useRef<Phase | null>(null)
  useEffect(() => {
    if (!view) return
    const prev = prevPhase.current
    prevPhase.current = view.phase
    if ((prev === 'lobby' || prev === 'over') && view.phase === 'choosing') setGallery([])
    const b = boardRef.current
    const last = view.last
    if (view.phase === 'reveal' && last?.word && b && b.turn === last.turn && b.ops.length) {
      const art: Artwork = { turn: last.turn, word: last.word, drawer: last.drawerName, url: b.canvas.toDataURL('image/png') }
      setGallery((g) => (g.some((a) => a.turn === art.turn) ? g : [...g, art]))
    }
  }, [view])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3000)
    return () => clearTimeout(t)
  }, [error, setError])

  const sendChat = useCallback(
    (text: string, voice?: VoiceUpload) => send({ t: 'chat', text, voice }),
    [send],
  )
  const sendOp = useCallback((op: DrawOp) => send({ t: 'draw', op }), [send])
  const localOp = (op: DrawOp) => {
    if (boardRef.current?.apply(op)) {
      send({ t: 'draw', op })
      bump()
    }
  }

  const leave = () => {
    if (!confirm('确定离开房间吗？你的分数会清掉。')) return
    send({ t: 'leave' })
    onLeave()
  }

  if (status in STATUS_TEXT) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg">{STATUS_TEXT[status as keyof typeof STATUS_TEXT]}</p>
        <button onClick={onLeave} className="rounded-xl bg-accent px-6 py-3 font-semibold text-white">
          回到首页
        </button>
      </main>
    )
  }

  const remaining = view ? Math.max(0, Math.ceil((view.deadline - (now + offset)) / 1000)) : 0
  const isDrawer = !!view && view.drawerId === view.meId
  const canDraw = isDrawer && view?.phase === 'drawing'
  const showCanvas = !!view && (view.phase === 'choosing' || view.phase === 'drawing' || view.phase === 'reveal')

  return (
    <div className="flex h-dvh flex-col overflow-hidden" style={{ ['--chrome' as string]: canDraw ? '240px' : '150px' }}>
      <header className="flex shrink-0 items-center gap-2 px-3 py-2">
        <h1 className="font-bold">🎨 你画我猜</h1>
        <span className="rounded-lg bg-panel px-2 py-0.5 font-mono text-sm tracking-widest ring-1 ring-line">{code}</span>
        {view && view.phase !== 'lobby' && view.phase !== 'over' && (
          <span className="text-sm text-muted">
            第 {view.round}/{view.rounds} 轮
          </span>
        )}
        <span className="flex-1" />
        {status !== 'open' && <span className="text-xs text-danger">{status === 'connecting' ? '连接中…' : '重连中…'}</span>}
        <ThemeToggle />
        <button onClick={leave} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-line/60">
          离开
        </button>
      </header>

      {error && (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-4">
          <p className="pop rounded-xl bg-ink px-4 py-2 text-sm text-paper shadow-lg">{error}</p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 wide:flex-row wide:gap-3 wide:px-3 wide:pb-3">
        <section
          className={`flex min-h-0 flex-col items-center gap-2 ${showCanvas ? 'shrink-0' : 'flex-1 overflow-y-auto'} wide:flex-1 wide:shrink`}
        >
          {view && showCanvas && <HintBar view={view} remaining={remaining} isDrawer={isDrawer} />}

          <div
            className={`canvas-box relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line ${showCanvas ? '' : 'hidden'}`}
          >
            <canvas ref={canvasRef} />
            <DrawSurface board={board} enabled={canDraw} tool={tool} onOp={sendOp} onLocal={bump} />
            {view?.phase === 'choosing' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-3">
                {isDrawer ? (
                  <WordPicker
                    view={view}
                    remaining={remaining}
                    onPick={(index) => send({ t: 'choose', index })}
                    onCustom={(custom) => send({ t: 'choose', custom })}
                  />
                ) : (
                  <p className="pop rounded-2xl bg-panel px-5 py-3 text-lg font-semibold shadow-lg">
                    {view.players.find((p) => p.id === view.drawerId)?.name} 正在选词…
                  </p>
                )}
              </div>
            )}
            {view?.phase === 'reveal' && (
              <Reveal
                view={view}
                remaining={remaining}
                canNext={isDrawer || view.hostId === view.meId}
                art={gallery.find((a) => a.turn === view.last?.turn)}
                onNext={() => send({ t: 'skip' })}
                onError={setError}
              />
            )}
          </div>

          {canDraw && (
            <div className="w-full">
              <Toolbar
                value={tool}
                onChange={setTool}
                canUndo={!!board?.ops.length}
                onUndo={() => localOp({ k: 'u' })}
                onClear={() => localOp({ k: 'x' })}
              />
            </div>
          )}

          {view?.phase === 'lobby' && <GameLobby view={view} code={code} send={send} />}
          {view?.phase === 'over' && <GameOver view={view} gallery={gallery} send={send} onError={setError} />}
          {!view && <p className="mt-10 text-muted">正在进入房间…</p>}
        </section>

        {view && (
          <aside className="flex min-h-0 flex-1 flex-col gap-2 wide:w-80 wide:flex-none">
            {view.phase !== 'lobby' && (
              <div className="shrink-0 wide:max-h-[40%] wide:overflow-y-auto">
                <Players
                  view={view}
                  onAward={canDraw ? (id) => send({ t: 'award', id }) : undefined}
                />
                {canDraw && <p className="mt-1 text-xs text-muted">有人说出了答案？点他的名字判对</p>}
              </div>
            )}
            <Chat view={view} code={code} onSend={sendChat} onError={setError} />
          </aside>
        )}
      </div>
    </div>
  )
}

function HintBar({ view, remaining, isDrawer }: { view: PlayerView; remaining: number; isDrawer: boolean }) {
  const drawer = view.players.find((p) => p.id === view.drawerId)
  let content: React.ReactNode = null
  if (view.phase === 'choosing') content = <span className="text-muted">{isDrawer ? '选一个词吧' : `${drawer?.name} 正在选词`}</span>
  else if (view.phase === 'reveal') content = <span>答案：<b>{view.last?.word ?? '（跳过）'}</b></span>
  else if (view.word && isDrawer) content = <span>你要画：<b className="text-accent">{view.word}</b></span>
  else if (view.word) content = <span>✔ 你猜对了：<b className="text-good">{view.word}</b></span>
  else if (view.hint)
    content = (
      <span className="flex items-center gap-2">
        <span className="rounded-md bg-line px-1.5 py-0.5 text-xs">{view.hint.cat}</span>
        <span className="flex gap-1">
          {view.hint.chars.map((c, i) => (
            <span key={i} className="inline-flex w-7 justify-center border-b-2 border-ink text-lg font-bold">
              {c || ' '}
            </span>
          ))}
        </span>
        <span className="text-xs text-muted">{view.hint.chars.length} 个字</span>
      </span>
    )
  const urgent = view.phase === 'drawing' && remaining <= 10
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-panel px-3 py-2 ring-1 ring-line">
      <div className="min-w-0 flex-1 truncate">{content}</div>
      {view.phase !== 'reveal' && (
        <span className={`w-12 text-right font-mono text-lg font-bold ${urgent ? 'animate-pulse text-danger' : ''}`}>{remaining}s</span>
      )}
    </div>
  )
}

interface RevealProps {
  view: PlayerView
  remaining: number
  canNext: boolean
  art?: Artwork
  onNext: () => void
  onError: (m: string) => void
}

function Reveal({ view, remaining, canNext, art, onNext, onError }: RevealProps) {
  const last = view.last
  const gains = (last?.gains ?? []).filter((g) => g.gain > 0).sort((a, b) => b.gain - a.gain)
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-2">
      <div className="pop w-full max-w-md rounded-2xl bg-panel/95 p-3 shadow-xl ring-1 ring-line backdrop-blur">
        <p className="text-center text-lg">
          {last?.word ? (
            <>
              答案是 <b className="text-accent">「{last.word}」</b>
            </>
          ) : (
            '这一题跳过了'
          )}
        </p>
        <p className="mt-1 text-center text-sm text-muted">
          {gains.length ? gains.map((g) => `${g.name} +${g.gain}`).join('  ·  ') : '这次没人猜中'}
        </p>
        <div className="mt-2 flex gap-2">
          {art && (
            <button
              onClick={() => saveArtwork(art).catch(() => onError('保存失败'))}
              className="flex-1 rounded-xl py-2 text-sm font-semibold ring-1 ring-line"
            >
              💾 保存这幅画
            </button>
          )}
          {canNext && (
            <button onClick={onNext} className="flex-1 rounded-xl bg-accent py-2 text-sm font-semibold text-white">
              下一题（{remaining}s）
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
