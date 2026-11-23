import type { PlayerView } from '../../shared/game.ts'
import type { ClientMsg } from '../../shared/protocol.ts'
import { saveArtwork, type Artwork } from '../lib/artwork.ts'
import { Avatar } from './Avatar.tsx'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  view: PlayerView
  gallery: Artwork[]
  send: (m: ClientMsg) => boolean
  onError: (m: string) => void
}

export function GameOver({ view, gallery, send, onError }: Props) {
  const ranked = [...view.players].sort((a, b) => b.score - a.score)
  const isHost = view.hostId === view.meId
  const save = (a: Artwork) => saveArtwork(a).catch(() => onError('保存失败'))

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-1">
      <div className="pop rounded-2xl bg-panel p-4 ring-1 ring-line">
        <h2 className="mb-3 text-center text-2xl font-bold">🏁 排行榜</h2>
        <ol className="space-y-2">
          {ranked.map((p, i) => (
            <li key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${i === 0 ? 'bg-accent/10' : ''}`}>
              <span className="w-8 text-center text-2xl">{MEDALS[i] ?? i + 1}</span>
              <Avatar id={p.id} name={p.name} />
              <span className="flex-1 font-semibold">{p.name}</span>
              <span className="text-lg font-bold">{p.score} 分</span>
            </li>
          ))}
        </ol>
        {isHost ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => send({ t: 'start' })} className="rounded-xl bg-accent py-3 font-bold text-white active:bg-accent-2">
              再来一局
            </button>
            <button onClick={() => send({ t: 'again' })} className="rounded-xl py-3 font-semibold ring-1 ring-line">
              回到准备页
            </button>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-muted">等房主开始下一局…</p>
        )}
      </div>

      {gallery.length > 0 && (
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <h3 className="mb-3 font-semibold">🖼️ 这一局的画（点保存可以存到相册）</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((a) => (
              <figure key={a.turn} className="overflow-hidden rounded-xl ring-1 ring-line">
                <img src={a.url} alt={a.word} className="aspect-[4/3] w-full bg-white object-contain" />
                <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5 text-sm">
                  <span className="min-w-0 truncate">
                    <b>{a.word}</b> · {a.drawer}
                  </span>
                  <button onClick={() => save(a)} className="shrink-0 rounded-lg px-2 py-0.5 text-accent ring-1 ring-accent/40">
                    保存
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
