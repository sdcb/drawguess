import { useState } from 'react'
import { MIN_PLAYERS, ROUNDS_MAX, SECONDS_OPTIONS, type PlayerView } from '../../shared/game.ts'
import type { ClientMsg } from '../../shared/protocol.ts'
import { Players } from './Players.tsx'

interface Props {
  view: PlayerView
  code: string
  send: (m: ClientMsg) => boolean
}

export function InviteBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${location.origin}/r/${code}`
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: '来一起玩你画我猜', text: `房号 ${code}`, url: link })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('复制这个链接发给大家', link)
    }
  }
  return (
    <div className="rounded-2xl bg-panel p-4 text-center ring-1 ring-line">
      <p className="text-sm text-muted">房号（其他设备打开网站输入它就能加入）</p>
      <p className="my-1 font-mono text-4xl font-bold tracking-[0.25em]">{code}</p>
      <button onClick={share} className="mt-1 rounded-xl px-4 py-2 text-sm font-semibold text-accent ring-1 ring-accent/50">
        {copied ? '已复制链接 ✔' : '分享 / 复制邀请链接'}
      </button>
    </div>
  )
}

export function GameLobby({ view, code, send }: Props) {
  const isHost = view.hostId === view.meId
  const host = view.players.find((p) => p.id === view.hostId)
  const enough = view.players.length >= MIN_PLAYERS
  const opt = (active: boolean) =>
    `h-11 min-w-11 rounded-xl px-3 font-semibold ring-1 ${active ? 'bg-accent text-white ring-accent' : 'bg-panel ring-line'} disabled:opacity-60`

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 overflow-y-auto p-1">
      <InviteBox code={code} />

      <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
        <p className="mb-2 text-sm font-semibold">玩家（{view.players.length}）</p>
        <Players view={view} onKick={isHost ? (id) => send({ t: 'kick', id }) : undefined} />
      </div>

      <div className="space-y-3 rounded-2xl bg-panel p-4 ring-1 ring-line">
        <div>
          <p className="mb-1.5 text-sm text-muted">轮数（每轮每人画一次）</p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: ROUNDS_MAX }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                disabled={!isHost}
                onClick={() => send({ t: 'settings', rounds: n, seconds: view.seconds })}
                className={opt(view.rounds === n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-muted">每题时间</p>
          <div className="flex flex-wrap gap-2">
            {SECONDS_OPTIONS.map((s) => (
              <button
                key={s}
                disabled={!isHost}
                onClick={() => send({ t: 'settings', rounds: view.rounds, seconds: s })}
                className={opt(view.seconds === s)}
              >
                {s} 秒
              </button>
            ))}
          </div>
        </div>
        {isHost ? (
          <button
            disabled={!enough}
            onClick={() => send({ t: 'start' })}
            className="w-full rounded-xl bg-accent py-3.5 text-lg font-bold text-white active:bg-accent-2 disabled:opacity-50"
          >
            {enough ? '开始游戏' : `等人加入…（至少 ${MIN_PLAYERS} 人）`}
          </button>
        ) : (
          <p className="py-2 text-center text-muted">等 {host?.name ?? '房主'} 开始游戏…</p>
        )}
      </div>
    </div>
  )
}
