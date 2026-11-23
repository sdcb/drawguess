import { useState } from 'react'
import { NAME_MAX } from '../../shared/game.ts'
import { CODE_LENGTH, isRoomCode } from '../../shared/protocol.ts'
import { saveName } from '../lib/identity.ts'
import { navigate } from '../lib/nav.ts'
import { ThemeToggle } from './ThemeToggle.tsx'

interface Props {
  /** 从邀请链接进来时的房号 */
  joinCode: string | null
  name: string
  onName: (n: string) => void
}

export function Lobby({ joinCode, name, onName }: Props) {
  const [draft, setDraft] = useState(name)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commitName = () => {
    const n = draft.trim().slice(0, NAME_MAX)
    if (!n) {
      setError('先起个名字吧')
      return null
    }
    saveName(n)
    onName(n)
    return n
  }

  const create = async () => {
    if (!commitName()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/rooms', { method: 'POST' })
      const body = (await res.json()) as { code?: string; error?: string }
      if (!res.ok || !body.code) throw new Error(body.error ?? '创建房间失败')
      navigate(`/r/${body.code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建房间失败')
    } finally {
      setBusy(false)
    }
  }

  const join = () => {
    const c = (joinCode ?? code).trim().toUpperCase()
    if (!isRoomCode(c)) return setError(`房号是 ${CODE_LENGTH} 位字母数字`)
    if (!commitName()) return
    navigate(`/r/${c}`)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div className="mt-4 text-center text-6xl">🎨</div>
      <h1 className="mt-3 text-center text-3xl font-bold tracking-wide">你画我猜</h1>
      <p className="mt-2 text-center text-sm text-muted">一家人一起玩，每人一台手机或平板</p>

      <form
        className="mt-8 space-y-4 rounded-2xl bg-panel p-5 shadow-sm ring-1 ring-line"
        onSubmit={(e) => {
          e.preventDefault()
          if (joinCode) join()
          else create()
        }}
      >
        <label className="block">
          <span className="text-sm text-muted">你的名字</span>
          <input
            className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2.5 text-base outline-none focus:border-accent"
            value={draft}
            maxLength={NAME_MAX}
            placeholder="比如：小明"
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>

        {joinCode ? (
          <button className="w-full rounded-xl bg-accent py-3 font-semibold text-white active:bg-accent-2">
            加入房间 {joinCode}
          </button>
        ) : (
          <>
            <button
              disabled={busy}
              className="w-full rounded-xl bg-accent py-3 font-semibold text-white active:bg-accent-2 disabled:opacity-60"
            >
              {busy ? '创建中…' : '创建房间'}
            </button>
            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-line" />
              或者输入房号加入
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 py-2.5 font-mono text-base tracking-[0.3em] uppercase outline-none focus:border-accent"
                value={code}
                maxLength={CODE_LENGTH}
                placeholder="ABC234"
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button
                type="button"
                onClick={join}
                className="rounded-xl border border-accent px-5 font-semibold text-accent active:bg-accent/10"
              >
                加入
              </button>
            </div>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      <section className="mt-8 space-y-2 text-sm leading-relaxed text-muted">
        <h2 className="font-semibold text-ink">怎么玩</h2>
        <p>1. 一个人创建房间，其他人输入房号或打开邀请链接加入，2 到 10 人都行。</p>
        <p>2. 大家轮流画画。轮到你时从三个词里选一个，也可以自己出题。</p>
        <p>3. 其他人打字猜，猜得越快分越高；也可以直接说出来或者发语音，画的人点他的名字判对。</p>
        <p>4. 时间过半会揭示一个字。全部轮数结束后看排行榜，还能把画保存下来。</p>
      </section>
    </main>
  )
}
