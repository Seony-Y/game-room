import { useState } from 'react'
import type { GameType } from '../types'

export interface SettingsValues {
  gameType: GameType
  capacity: number
  mafia: number
  doctor: number
  police: number
  missions: string[]
  question: string
}

export const DEFAULT_SETTINGS: SettingsValues = {
  gameType: 'mafia',
  capacity: 8,
  mafia: 2,
  doctor: 1,
  police: 1,
  missions: ['', ''],
  question: '',
}

interface Props {
  initial: SettingsValues
  lockGameType?: boolean
  submitLabel: string
  onSubmit: (values: SettingsValues) => Promise<string | null>
}

const num = (v: string) => (v === '' ? 0 : Math.max(0, Number.parseInt(v, 10) || 0))

export default function SettingsForm({ initial, lockGameType, submitLabel, onSubmit }: Props) {
  const [v, setV] = useState<SettingsValues>(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => setV((prev) => ({ ...prev, [key]: value }))

  // 마피아 수가 바뀌면 미션 입력칸 개수 맞추기
  const setMafia = (n: number) =>
    setV((prev) => ({
      ...prev,
      mafia: n,
      missions: Array.from({ length: Math.min(n, 20) }, (_, i) => prev.missions[i] ?? ''),
    }))

  // 입력 초기화: 게임 종류는 유지하고 나머지를 기본값으로
  const reset = () => {
    setV((prev) => ({ ...DEFAULT_SETTINGS, missions: [...DEFAULT_SETTINGS.missions], gameType: prev.gameType }))
    setError('')
  }

  const citizens = v.capacity - v.mafia - v.doctor - v.police

  const submit = async () => {
    setBusy(true)
    setError('')
    const err = await onSubmit(v)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div>
      <label>게임 종류</label>
      <div className="seg">
        {(['mafia', 'image'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={v.gameType === t ? 'active' : ''}
            disabled={lockGameType && v.gameType !== t}
            onClick={() => set('gameType', t)}
          >
            {t === 'mafia' ? '🕵️ 마피아 게임' : '🖼️ 이미지 게임'}
          </button>
        ))}
      </div>

      <label htmlFor="capacity">참가 인원수</label>
      <input
        id="capacity"
        type="number"
        min={2}
        max={50}
        inputMode="numeric"
        value={v.capacity || ''}
        onChange={(e) => set('capacity', num(e.target.value))}
      />

      {v.gameType === 'mafia' ? (
        <>
          <div className="grid3">
            <div>
              <label htmlFor="mafia">마피아</label>
              <input id="mafia" type="number" min={1} inputMode="numeric" value={v.mafia || ''} onChange={(e) => setMafia(num(e.target.value))} />
            </div>
            <div>
              <label htmlFor="doctor">의사</label>
              <input id="doctor" type="number" min={0} inputMode="numeric" value={v.doctor} onChange={(e) => set('doctor', num(e.target.value))} />
            </div>
            <div>
              <label htmlFor="police">경찰</label>
              <input id="police" type="number" min={0} inputMode="numeric" value={v.police} onChange={(e) => set('police', num(e.target.value))} />
            </div>
          </div>
          <p className={`hint ${citizens < 0 ? 'warn' : ''}`}>
            {citizens >= 0 ? `시민 ${citizens}명` : '역할 수가 참가 인원보다 많습니다.'}
          </p>

          <label>마피아 미션 ({v.missions.length}개 · 마피아 1명당 1개 랜덤 배정)</label>
          {v.missions.map((m, i) => (
            <input
              key={i}
              className="mission-input"
              placeholder={`미션 ${i + 1}  예) 대화 중 "진짜?"를 3번 말하기`}
              value={m}
              maxLength={200}
              onChange={(e) => set('missions', v.missions.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
        </>
      ) : (
        <>
          <label htmlFor="question">질문</label>
          <textarea
            id="question"
            placeholder="예) 무인도에 같이 가고 싶은 사람은?"
            maxLength={200}
            value={v.question}
            onChange={(e) => set('question', e.target.value)}
          />
        </>
      )}

      <p className="error">{error}</p>
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={reset}>
          입력 초기화
        </button>
        <button className="primary" disabled={busy} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
