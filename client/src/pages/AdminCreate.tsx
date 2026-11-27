import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/common'
import SettingsForm, { DEFAULT_SETTINGS, type SettingsValues } from '../components/SettingsForm'
import { emit } from '../socket'
import { adminKey, storageSet } from '../lib'

export default function AdminCreate() {
  const navigate = useNavigate()

  const create = async (v: SettingsValues) => {
    const res = await emit<{ ok: true; code: string; adminToken: string } | { ok: false; error: string }>('admin:create', v)
    if (!res.ok) return res.error
    storageSet(adminKey(res.code), { adminToken: res.adminToken })
    navigate(`/admin/${res.code}`)
    return null
  }

  return (
    <Layout title="🎲 게임방 관리자" badge="ADMIN">
      <section className="card">
        <h2>방 만들기</h2>
        <SettingsForm initial={DEFAULT_SETTINGS} submitLabel="방 생성" onSubmit={create} />
      </section>
    </Layout>
  )
}
