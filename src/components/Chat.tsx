import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CHAT_MAX, type ChatMsg, type PlayerView } from '../../shared/game.ts'
import type { VoiceUpload } from '../../shared/protocol.ts'
import { voiceUrl } from '../lib/artwork.ts'
import { onPlayback, playingUrl, toggleVoice, unlockAudio } from '../lib/audio.ts'
import { canRecord, useRecorder } from '../lib/voice.ts'

function VoiceChip({ url }: { url: string }) {
  const playing = useSyncExternalStore(onPlayback, () => playingUrl() === url)
  return (
    <button
      onClick={() => toggleVoice(url)}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        playing ? 'bg-accent text-white' : 'bg-accent/15 text-accent'
      }`}
    >
      {playing ? '■ 播放中' : '▶ 语音'}
    </button>
  )
}

function Line({ m, code, meId }: { m: ChatMsg; code: string; meId: string }) {
  if (m.kind === 'system') return <li className="py-0.5 text-center text-xs text-muted">{m.text}</li>
  if (m.kind === 'correct')
    return <li className="pop my-0.5 rounded-lg bg-good/15 px-2 py-1 text-sm font-semibold text-good">🎉 {m.text}</li>
  if (m.kind === 'near') return <li className="rounded-lg bg-accent/10 px-2 py-1 text-sm text-accent">💡 {m.text}</li>
  return (
    <li className={`py-0.5 text-sm ${m.insiders ? 'text-good' : ''}`}>
      <span className={`font-semibold ${m.from === meId ? 'text-accent' : ''}`}>{m.name}：</span>
      {m.voiceId ? <VoiceChip url={voiceUrl(code, m.voiceId)} /> : <span className="break-words">{m.text}</span>}
    </li>
  )
}

interface Props {
  view: PlayerView
  code: string
  onSend: (text: string, voice?: VoiceUpload) => boolean
  onError: (msg: string) => void
}

export function Chat({ view, code, onSend, onError }: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const rec = useRecorder(
    (v) => onSend('', v),
    (msg) => onError(msg),
  )
  const last = view.chat.at(-1)?.id

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [last])

  const me = view.players.find((p) => p.id === view.meId)
  const isDrawer = view.drawerId === view.meId
  const guessing = view.phase === 'drawing' && !isDrawer && !me?.guessed
  const placeholder = guessing ? '输入你的答案…' : isDrawer && view.phase === 'drawing' ? '说点什么（不能说答案）' : '聊点什么…'

  const submit = () => {
    const t = text.trim()
    if (!t) return
    if (onSend(t)) setText('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-panel ring-1 ring-line">
      <ul ref={listRef} className="min-h-16 flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {view.chat.map((m) => (
          <Line key={m.id} m={m} code={code} meId={view.meId} />
        ))}
      </ul>
      <form
        className="flex items-center gap-2 border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {rec.recording ? (
          <>
            <button
              type="button"
              onClick={rec.cancel}
              className="h-11 rounded-xl border border-line px-3 text-sm text-muted"
            >
              取消
            </button>
            <button
              type="button"
              onClick={rec.stop}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-danger font-semibold text-white"
            >
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              录音中 {rec.seconds}s · 点这里发送
            </button>
          </>
        ) : (
          <>
            <input
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 text-base outline-none focus:border-accent"
              value={text}
              maxLength={CHAT_MAX}
              placeholder={placeholder}
              enterKeyHint="send"
              onChange={(e) => setText(e.target.value)}
            />
            {text.trim() ? (
              <button className="h-11 rounded-xl bg-accent px-4 font-semibold text-white active:bg-accent-2">发送</button>
            ) : (
              canRecord() && (
                <button
                  type="button"
                  onClick={() => {
                    unlockAudio()
                    rec.start()
                  }}
                  className="h-11 rounded-xl bg-accent px-4 font-semibold text-white active:bg-accent-2"
                  aria-label="录语音"
                >
                  🎤 语音
                </button>
              )
            )}
          </>
        )}
      </form>
    </div>
  )
}
