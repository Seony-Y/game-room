import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Layout, Ranking, RoleTag, useToast } from '../components/common'
import { emit, socket } from '../socket'
import { OUTCOME_TEXT, PLAYER_KEY, ROLE_INFO, storageGet, storageSet, TEAM_NAME } from '../lib'
import type { PlayerState } from '../types'

interface Session {
  code: string
  playerId: string
  name: string
}

type JoinAck = { ok: true; playerId: string; code: string; name: string } | { ok: false; error: string }

export default function Join() {
  const { code: urlCode = '' } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(() => {
    const saved = storageGet<Session>(PLAYER_KEY)
    return saved && (!urlCode || saved.code === urlCode.toUpperCase()) ? saved : null
  })
  const [state, setState] = useState<PlayerState | null>(null)
  const [notice, setNotice] = useState('')
  const [toastNode, toast] = useToast()
  const sessionRef = useRef(session)
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const leaveSession = (msg: string) => {
    storageSet(PLAYER_KEY, null)
    setSession(null)
    setState(null)
    setNotice(msg)
  }

  useEffect(() => {
    // 연결(재연결 포함)될 때마다 저장된 세션으로 재입장
    const rejoin = async () => {
      const s = sessionRef.current
      if (!s) return
      const res = await emit<JoinAck>('player:join', s)
      if (!res.ok) leaveSession(res.error)
    }
    const onState = (s: PlayerState) => setState(s)
    const onKicked = () => leaveSession('관리자가 방에서 내보냈습니다.')
    const onClosed = () => leaveSession('방이 닫혔습니다.')
    socket.on('connect', rejoin)
    socket.on('player:state', onState)
    socket.on('player:kicked', onKicked)
    socket.on('player:closed', onClosed)
    if (socket.connected) rejoin()
    return () => {
      socket.off('connect', rejoin)
      socket.off('player:state', onState)
      socket.off('player:kicked', onKicked)
      socket.off('player:closed', onClosed)
    }
  }, [])

  const join = async (code: string, name: string) => {
    const res = await emit<JoinAck>('player:join', { code, name })
    if (!res.ok) return res.error
    const s = { code: res.code, playerId: res.playerId, name: res.name }
    storageSet(PLAYER_KEY, s)
    setSession(s)
    setNotice('')
    navigate(`/join/${res.code}`, { replace: true })
    return null
  }

  const leave = () => {
    socket.emit('player:leave')
    leaveSession('')
  }

  if (!session) {
    return (
      <Layout title="🎲 게임방 입장">
        {notice && <div className="card notice">{notice}</div>}
        <JoinForm initialCode={urlCode} onJoin={join} />
      </Layout>
    )
  }

  if (!state) {
    return (
      <Layout title="🎲 게임방">
        <p className="hint center">입장 중…</p>
      </Layout>
    )
  }

  return (
    <Layout title={`🎲 ${state.code}`} badge={state.me.name}>
      {state.status === 'lobby' && <Waiting state={state} onLeave={leave} />}
      {state.status === 'playing' && state.gameType === 'mafia' && <MafiaView state={state} />}
      {state.status === 'playing' && state.gameType === 'image' && <ImageView state={state} toast={toast} />}
      {toastNode}
    </Layout>
  )
}

function JoinForm({ initialCode, onJoin }: { initialCode: string; onJoin: (code: string, name: string) => Promise<string | null> }) {
  const [code, setCode] = useState(initialCode.toUpperCase())
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError((await onJoin(code.trim(), name.trim())) ?? '')
    setBusy(false)
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>방 입장</h2>
      <label htmlFor="code">방 코드</label>
      <input
        id="code"
        className="code-input"
        placeholder="ABCDE"
        maxLength={5}
        autoCapitalize="characters"
        autoComplete="off"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <label htmlFor="name">닉네임</label>
      <input id="name" placeholder="이름을 입력하세요" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
      <p className="error">{error}</p>
      <button className="primary big" type="submit" disabled={busy || code.trim().length < 5 || !name.trim()}>
        입장하기
      </button>
    </form>
  )
}

function Waiting({ state, onLeave }: { state: PlayerState; onLeave: () => void }) {
  return (
    <section className="card">
      <div className="center waiting">
        <div className="pulse" />
        <h2>관리자가 게임을 시작하기를 기다리는 중…</h2>
        <p className="hint">{state.gameType === 'mafia' ? '🕵️ 마피아 게임' : '🖼️ 이미지 게임'}</p>
      </div>
      <label>참가자 ({state.players.length} / {state.capacity})</label>
      <ul className="players">
        {state.players.map((p) => (
          <li key={p.id}>
            <span className={`dot ${p.connected ? '' : 'off'}`} />
            <span className="grow">{p.name}{p.id === state.me.id && <span className="me"> (나)</span>}</span>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="ghost small" onClick={onLeave}>나가기</button>
      </div>
    </section>
  )
}

function MafiaView({ state }: { state: PlayerState }) {
  const [shown, setShown] = useState(false)
  const role = state.role!
  const info = ROLE_INFO[role]

  if (state.result) {
    const { type, winner, reveals } = state.result
    const myTeam = role === 'mafia' ? 'mafia' : 'citizen'
    return (
      <>
        <section className={`card result-hero team-${winner}`}>
          <div className="hint">게임 결과</div>
          <div className="result-title">{winner === 'mafia' ? '🔪' : '🧑‍🤝‍🧑'} {TEAM_NAME[winner]} 승리!</div>
          <div className="result-msg">{OUTCOME_TEXT[type]}</div>
          <div className="result-sub">{myTeam === winner ? '🎉 우리 팀이 이겼어요' : '아쉽게도 우리 팀이 졌어요'} · 나는 {info.name}</div>
        </section>
        <section className="card">
          <h2>정체 공개</h2>
          {(['mafia', 'police', 'doctor'] as const).map((r) =>
            reveals
              .filter((x) => x.role === r)
              .map((x) => (
                <div key={x.name} className="reveal-row">
                  <RoleTag role={r} />
                  <span className="grow">
                    {x.name}
                    {!x.alive && <span className="me"> · 사망</span>}
                    {x.mission && <span className="sub">미션: {x.mission}</span>}
                  </span>
                  {r === 'mafia' && (
                    <span className={`mission-badge ${x.missionSuccess ? 'ok' : 'fail'}`}>
                      {x.missionSuccess ? '미션 성공' : '미션 실패'}
                    </span>
                  )}
                </div>
              )),
          )}
        </section>
      </>
    )
  }

  const missionCard = role === 'mafia' && (
    <section className="card">
      <h2>🤫 나의 미션</h2>
      <div className="mission">{state.mission}</div>
      <p className={`mission-status ${state.missionSuccess ? 'ok' : ''}`}>
        {state.missionSuccess ? '✅ 미션 성공!' : '⏳ 미션 진행 중'}
      </p>
      <p className="hint">미션은 나만 알고 있습니다. 다른 마피아도 모릅니다.</p>
      {state.mafiaTeam && state.mafiaTeam.length > 0 && (
        <>
          <label>함께하는 마피아</label>
          <p className="team">{state.mafiaTeam.join(', ')}</p>
        </>
      )}
    </section>
  )

  if (!state.alive) {
    return (
      <>
        <section className="card dead-card">
          <div className="role-emoji">💀</div>
          <div className="dead-identity">
            당신의 정체는 <RoleTag role={role} /> 입니다
          </div>
          <div className="dead-title">당신은 사망하셨습니다.</div>
          <p className="hint">게임이 끝날 때까지 조용히 지켜봐 주세요.</p>
        </section>
        {missionCard}
      </>
    )
  }

  return (
    <>
      <section className="card">
        <div
          className={`role-card ${shown ? `role-${role}` : 'hidden-role'}`}
          onClick={() => setShown((s) => !s)}
          role="button"
          tabIndex={0}
        >
          {shown ? (
            <>
              <div className="role-emoji">{info.emoji}</div>
              <div className="role-name">{info.name}</div>
              <div className="role-desc">{info.desc}</div>
              <div className="role-desc tap">탭해서 숨기기</div>
            </>
          ) : (
            <>
              <div className="role-emoji">🂠</div>
              <div className="role-name">내 역할 확인</div>
              <div className="role-desc">주변 사람이 보지 않게 탭하세요</div>
            </>
          )}
        </div>
      </section>

      {shown && missionCard}

      <section className="card">
        <label style={{ marginTop: 0 }}>생존자 ({state.players.filter((p) => p.alive).length} / {state.players.length})</label>
        <ul className="players compact">
          {state.players.map((p) => (
            <li key={p.id} className={p.alive ? '' : 'dead'}>
              <span className="grow">
                <span className="pname">{p.name}</span>
                {p.id === state.me.id && <span className="me"> (나)</span>}
              </span>
              {!p.alive && <span className="me">사망</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function ImageView({ state, toast }: { state: PlayerState; toast: (msg: string) => void }) {
  const img = state.image!

  const vote = async (targetId: string) => {
    const res = await emit('player:vote', { targetId })
    if (!res.ok) toast(res.error)
  }

  if (img.revealed && img.ranking) {
    const first = img.ranking.filter((r) => r.rank === 1)
    return (
      <>
        <section className="card result-hero team-image">
          <div className="hint">Q{img.round}. {img.question}</div>
          <div className="result-title">👑 {first.length ? first.map((r) => r.name).join(', ') : '-'}</div>
          {first.length > 0 && <div className="result-sub">{first[0].votes}표로 가장 많이 선택됐어요</div>}
        </section>
        <section className="card">
          <h2>TOP 3</h2>
          <Ranking entries={img.ranking} emptyText="투표한 사람이 없습니다." />
          <p className="hint center">관리자가 다음 질문을 시작하면 자동으로 넘어갑니다.</p>
        </section>
      </>
    )
  }

  return (
    <section className="card">
      <div className="hint center">질문 {img.round}</div>
      <div className="question">{img.question}</div>
      <p className="hint center">해당하는 사람을 한 명 골라주세요. 결과 공개 전까지 바꿀 수 있어요.</p>
      <div className="pick-grid">
        {state.players.map((p) => (
          <button key={p.id} className={img.myVote === p.id ? 'selected' : ''} onClick={() => vote(p.id)}>
            {p.name}{p.id === state.me.id ? ' (나)' : ''}
          </button>
        ))}
      </div>
      <p className="progress-text">
        {img.myVote ? '✅ 투표 완료 · ' : ''}{img.votedCount} / {state.players.length}명 투표
      </p>
    </section>
  )
}
