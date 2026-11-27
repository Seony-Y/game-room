import type { ReactNode } from 'react'
import { useConnected, useRemainingSeconds } from '../hooks'
import { ROLE_INFO } from '../lib'
import type { RankEntry, Role, RoundHistory } from '../types'

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
          {connected ? '연결됨' : '연결 중…'}
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

export function Toast({ msg }: { msg: string }) {
  return <div className={`toast ${msg ? 'show' : ''}`}>{msg}</div>
}

export function VoteTimer({ endsAt, durationMs, serverNow, closed }: { endsAt: number; durationMs: number; serverNow: number; closed: boolean }) {
  const left = useRemainingSeconds(endsAt, serverNow)
  if (closed || left === 0) return <div className="vote-timer done">⏰ 투표 마감</div>
  return (
    <div className={`vote-timer ${left <= 10 ? 'urgent' : ''}`}>
      <span>⏱ 남은 시간 {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      <div className="bar">
        <span style={{ width: `${Math.min(100, (left * 1000 / durationMs) * 100)}%` }} />
      </div>
    </div>
  )
}

export function History({ history }: { history: RoundHistory[] }) {
  if (!history.length) return <p className="hint center">결과를 공개한 질문이 없어요.</p>
  return (
    <ol className="history">
      {history.map((h) => (
        <li key={h.round}>
          <span className="history-q">Q{h.round}. {h.question}</span>
          <span className="history-w">
            {h.winners.length ? `👑 ${h.winners.join(', ')} · ${h.votes}표` : '투표 없음'}
          </span>
        </li>
      ))}
    </ol>
  )
}
