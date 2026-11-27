import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { socket } from '../socket'
import { ROLE_INFO } from '../lib'
import type { RankEntry, Role } from '../types'

function subscribeConnection(onChange: () => void) {
  socket.on('connect', onChange)
  socket.on('disconnect', onChange)
  return () => {
    socket.off('connect', onChange)
    socket.off('disconnect', onChange)
  }
}

export function useConnected() {
  return useSyncExternalStore(subscribeConnection, () => socket.connected)
}

export function Layout({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  const connected = useConnected()
  return (
    <div className="wrap">
      <header className="top">
        <h1>
          {title} {badge && <span className="badge">{badge}</span>}
        </h1>
        <div className="conn">
          <span className={`dot ${connected ? '' : 'off'}`} />
          {connected ? '실시간 연결됨' : '연결 중…'}
        </div>
      </header>
      {children}
    </div>
  )
}

export function RoleTag({ role }: { role: Role | null }) {
  if (!role) return null
  return <span className={`role-tag role-${role}`}>{ROLE_INFO[role].name}</span>
}

export function Ranking({ entries, emptyText = '아직 투표가 없습니다.' }: { entries: RankEntry[]; emptyText?: string }) {
  const max = Math.max(1, ...entries.map((r) => r.votes))
  if (entries.every((r) => r.votes === 0)) return <p className="hint center">{emptyText}</p>
  return (
    <div>
      {entries.map((r) => (
        <div key={r.id} className={`result-row ${r.rank === 1 && r.votes > 0 ? 'top' : ''}`}>
          <div className="label">
            <span>
              <span className="rank">{r.votes > 0 ? `${r.rank}위` : '-'}</span>
              {r.rank === 1 && r.votes > 0 ? '👑 ' : ''}
              {r.name}
            </span>
            <span>{r.votes}표</span>
          </div>
          <div className="bar">
            <span style={{ width: `${(r.votes / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function useToast() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2200)
    return () => clearTimeout(t)
  }, [msg])
  const node = <div className={`toast ${msg ? 'show' : ''}`}>{msg}</div>
  return [node, setMsg] as const
}
