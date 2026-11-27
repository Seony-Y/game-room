import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { History, Layout, Ranking, RoleTag, Toast, VoteTimer } from '../components/common'
import SettingsForm from '../components/SettingsForm'
import { useToast } from '../hooks'
import type { SettingsValues } from '../settings'
import { emit, socket } from '../socket'
import { adminKey, OUTCOME_LINES, storageGet, storageSet } from '../lib'
import type { AdminState, ImageSettings, MafiaSettings } from '../types'

export default function AdminRoom() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<AdminState | null>(null)
  const [saved] = useState(() => storageGet<{ adminToken: string }>(adminKey(code)))
  const [error, setFatal] = useState('')
  const fatal = saved ? error : '이 브라우저엔 관리 권한이 없어요.'
  const [toastMsg, toast] = useToast()
  const endedRef = useRef(false)

  useEffect(() => {
    if (!saved) return
    // 연결(재연결 포함)될 때마다 관리자 채널 재입장
    const join = async () => {
      if (endedRef.current) return
      const res = await emit('admin:join', { code, adminToken: saved.adminToken })
      if (!res.ok) setFatal(res.error)
    }
    const onState = (s: AdminState) => {
      setState(s)
      // 게임 종료 = 방 삭제
      if (s.status === 'ended') {
        endedRef.current = true
        storageSet(adminKey(code), null)
      }
    }
    const onClosed = () => {
      storageSet(adminKey(code), null)
      setFatal('방이 닫혔어요.')
    }
    socket.on('connect', join)
    socket.on('admin:state', onState)
    socket.on('admin:closed', onClosed)
    if (socket.connected) join()
    return () => {
      socket.off('connect', join)
      socket.off('admin:state', onState)
      socket.off('admin:closed', onClosed)
    }
  }, [code, saved])

  const act = async (event: string, payload?: unknown, okMsg?: string) => {
    const res = await emit(event, payload)
    if (!res.ok) toast(res.error)
    else if (okMsg) toast(okMsg)
    return res.ok
  }

  if (fatal) {
    return (
      <Layout title="🎲 게임방 관리자" badge="ADMIN">
        <section className="card center">
          <p>{fatal}</p>
          <Link to="/admin">
            <button className="primary">새 방 만들기</button>
          </Link>
        </section>
      </Layout>
    )
  }

  if (!state) {
    return (
      <Layout title="🎲 게임방 관리자" badge="ADMIN">
        <p className="hint center">방 정보를 불러오는 중…</p>
      </Layout>
    )
  }

  const joinUrl = `${window.location.origin}/join/${state.code}`

  return (
    <Layout title="🎲 게임방 관리자" badge="ADMIN">
      <section className="card">
        <div className="code-box">
          <div>
            <div className="hint" style={{ margin: 0 }}>방 코드</div>
            <div className="room-code">{state.code}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="badge">{state.gameType === 'mafia' ? '🕵️ 마피아' : '🖼️ 이미지'}</span>{' '}
            <span className={`badge ${state.status === 'playing' ? 'badge-live' : ''}`}>
              {state.status === 'lobby' ? '대기 중' : state.status === 'ended' ? '종료' : '진행 중'}
            </span>
          </div>
        </div>
        {state.status !== 'ended' && (
          <>
            <label>사용자 입장 URL</label>
            <div className="link-line">
              <input readOnly value={joinUrl} onFocus={(e) => e.target.select()} />
              <button
                className="small"
                onClick={() => navigator.clipboard?.writeText(joinUrl).then(() => toast('복사했어요'), () => toast('복사에 실패했어요'))}
              >
                복사
              </button>
            </div>
          </>
        )}
      </section>

      {state.status === 'lobby' && <Lobby state={state} act={act} />}
      {state.status === 'playing' && state.gameType === 'mafia' && <MafiaPlay state={state} act={act} />}
      {state.status === 'playing' && state.gameType === 'image' && <ImagePlay state={state} act={act} />}
      {state.status === 'ended' && (
        <section className="card">
          <h2>🏁 게임 종료 <span className="hint">(방이 종료됐어요)</span></h2>
          <History history={state.history} />
        </section>
      )}

      <section className="card">
        <div className="actions" style={{ marginTop: 0 }}>
          {state.status === 'ended' ? (
            <button className="primary" onClick={() => navigate('/admin')}>새 방 만들기</button>
          ) : (
            <>
              {state.status === 'playing' && (
                <button onClick={() => act('admin:reset', undefined, '대기실로 돌아갔어요')}>대기실로 돌아가기 (다시 하기)</button>
              )}
              <button className="ghost" onClick={() => navigate('/admin')}>새 방 만들기</button>
              <ConfirmButton label="방 닫기" confirmLabel="정말 닫을까요?" onConfirm={() => act('admin:close')} />
            </>
          )}
        </div>
      </section>
      <Toast msg={toastMsg} />
    </Layout>
  )
}

type Act = (event: string, payload?: unknown, okMsg?: string) => Promise<boolean>

function Lobby({ state, act }: { state: AdminState; act: Act }) {
  const [editing, setEditing] = useState(false)
  const count = state.players.length
  const canStart = state.gameType === 'mafia' ? count === state.capacity : count >= 2
  const startHint =
    state.gameType === 'mafia'
      ? canStart ? '' : `${state.capacity}명이 모두 입장해야 시작돼요.`
      : canStart ? '' : '2명 이상 입장해야 시작돼요.'

  const settingsValues: SettingsValues =
    state.gameType === 'mafia'
      ? { gameType: 'mafia', capacity: state.capacity, question: '', ...(state.settings as MafiaSettings) }
      : { gameType: 'image', capacity: state.capacity, mafia: 1, doctor: 0, police: 0, missions: [''], ...(state.settings as ImageSettings) }

  const save = async (v: SettingsValues) => {
    const res = await emit('admin:update', v)
    if (!res.ok) return res.error
    setEditing(false)
    return null
  }

  return (
    <>
      <section className="card">
        <h2>
          참가자 <span className="badge">{count} / {state.capacity}</span>
        </h2>
        {count === 0 ? (
          <p className="hint">입장 URL을 공유해주세요.</p>
        ) : (
          <ul className="players">
            {state.players.map((p) => (
              <li key={p.id}>
                <span className={`dot ${p.connected ? '' : 'off'}`} />
                <span className="grow">{p.name}</span>
                <button className="small ghost" onClick={() => act('admin:kick', { playerId: p.id })}>내보내기</button>
              </li>
            ))}
          </ul>
        )}
        {startHint && <p className="hint">{startHint}</p>}
        <button className="primary big" disabled={!canStart} onClick={() => act('admin:start')}>START</button>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 style={{ margin: 0 }}>게임 설정</h2>
          <button className="small" onClick={() => setEditing((e) => !e)}>{editing ? '취소' : '수정'}</button>
        </div>
        {editing ? (
          <SettingsForm initial={settingsValues} lockGameType submitLabel="설정 저장" onSubmit={save} />
        ) : (
          <SettingsSummary state={state} />
        )}
      </section>
    </>
  )
}

function SettingsSummary({ state }: { state: AdminState }) {
  if (state.gameType === 'image') {
    return <p className="summary">질문: <b>{(state.settings as ImageSettings).question}</b></p>
  }
  const s = state.settings as MafiaSettings
  const citizens = state.capacity - s.mafia - s.doctor - s.police
  return (
    <div className="summary">
      <p>
        마피아 <b>{s.mafia}</b> · 의사 <b>{s.doctor}</b> · 경찰 <b>{s.police}</b> · 시민 <b>{citizens}</b>
      </p>
      <ol className="mission-list">
        {s.missions.map((m, i) => <li key={i}>{m}</li>)}
      </ol>
    </div>
  )
}

const ROLE_ORDER = { mafia: 0, police: 1, doctor: 2, citizen: 3 } as const

function MafiaPlay({ state, act }: { state: AdminState; act: Act }) {
  const players = [...state.players].sort((a, b) => ROLE_ORDER[a.role ?? 'citizen'] - ROLE_ORDER[b.role ?? 'citizen'])
  const { outcome, resultShared } = state.mafia!

  return (
    <>
      <section className="card">
        <h2>진행 관리 <span className="hint">(관리자만 보임)</span></h2>
        <ul className="players">
          {players.map((p) => (
            <li key={p.id} className={`play-row ${p.mission ? 'has-mission' : ''} ${p.alive ? '' : 'dead'}`}>
              <span className={`dot ${p.connected ? '' : 'off'}`} />
              <span className="grow">
                <span className="pname">{p.name}</span> <RoleTag role={p.role} />
                {p.mission && <span className="sub">미션: {p.mission}</span>}
              </span>
              <span className="row-actions">
                {p.role === 'mafia' && (
                  <button
                    className={`small ${p.missionSuccess ? 'success' : ''}`}
                    onClick={() => act('admin:toggle-mission', { playerId: p.id })}
                  >
                    {p.missionSuccess ? '✅ 미션 성공' : '미션 성공'}
                  </button>
                )}
                <button
                  className={`small ${p.alive ? '' : 'danger'}`}
                  onClick={() => act('admin:toggle-dead', { playerId: p.id })}
                >
                  {p.alive ? '탈락' : '탈락 취소'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>결과 보기</h2>
        <div className="stat-row">
          <div><span>생존 마피아</span><b>{outcome.aliveMafia}</b></div>
          <div><span>생존 시민팀</span><b>{outcome.aliveOthers}</b></div>
          <div><span>미션 성공</span><b>{outcome.missionsDone} / {outcome.missionsTotal}</b></div>
        </div>
        <p className={`judge ${outcome.type ? 'decided' : ''}`}>
          {outcome.type
            ? OUTCOME_LINES[outcome.type].map((l) => <span key={l} className="line">{l}</span>)
            : '아직 승패가 나지 않았어요.'}
        </p>
        <button
          className="primary big"
          disabled={!outcome.type}
          onClick={() => act('admin:mafia-result', undefined, '결과를 공유했어요')}
        >
          {resultShared ? '✅ 결과 공유됨' : '결과 공유'}
        </button>
        {resultShared && <p className="hint center">바꾸면 사용자 결과도 바로 바뀌어요.</p>}
      </section>
    </>
  )
}

function ImagePlay({ state, act }: { state: AdminState; act: Act }) {
  const [next, setNext] = useState('')
  const [showVotes, setShowVotes] = useState(false)
  const img = state.image!
  const nameOf = (id: string | null) => state.players.find((p) => p.id === id)?.name ?? '-'

  const startNext = async () => {
    if (await act('admin:next-question', { question: next })) setNext('')
  }

  return (
    <section className="card">
      <h2>이미지 게임 <span className="badge">질문 {img.round}</span></h2>
      <div className="question">{img.question}</div>
      <VoteTimer key={img.round} endsAt={img.endsAt} durationMs={img.durationMs} serverNow={state.serverNow} closed={img.closed} />
      <p className="progress-text">{img.votedCount} / {state.players.length}명 투표 완료</p>

      <p className="hint">실시간 집계 (관리자만 보임)</p>
      <Ranking entries={img.results} />

      <button className="small ghost" onClick={() => setShowVotes((s) => !s)}>
        {showVotes ? '투표 내역 숨기기' : '누가 누구를 골랐는지 보기'}
      </button>
      {showVotes && (
        <ul className="players compact">
          {state.players.map((p) => (
            <li key={p.id}>
              <span className="grow">{p.name}</span>
              <span className="hint" style={{ margin: 0 }}>→ {p.votedFor ? nameOf(p.votedFor) : '미투표'}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        className="primary big"
        disabled={img.revealed}
        onClick={() => act('admin:reveal', undefined, '결과를 공유했어요')}
      >
        {img.revealed ? '✅ 결과 공유됨' : '결과 공유 (TOP 3 공개)'}
      </button>

      <label htmlFor="next">다음 질문</label>
      <textarea id="next" placeholder="다음 질문 입력" maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} />
      <div className="actions">
        <button disabled={!next.trim()} onClick={startNext}>다음 질문 시작</button>
        <ConfirmButton label="🏁 게임 종료" confirmLabel="정말 종료할까요?" onConfirm={() => act('admin:end-game', undefined, '게임을 종료했어요')} />
      </div>
    </section>
  )
}

function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button className={armed ? 'danger' : 'ghost'} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  )
}
