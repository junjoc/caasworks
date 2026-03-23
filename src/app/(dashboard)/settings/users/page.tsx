'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import type { User } from '@/types/database'
import { toast } from 'sonner'
import { Plus, Edit2 } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = { admin: '관리자', member: '일반', accountant: '회계' }
const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  member: 'bg-blue-100 text-blue-700',
  accountant: 'bg-green-100 text-green-700',
}

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState({ name: '', email: '', role: 'member', phone: '', slack_user_id: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    const { data } = await supabase.from('users').select('*').order('created_at')
    setUsers(data || [])
    setLoading(false)
  }

  const openAdd = () => {
    setEditUser(null)
    setForm({ name: '', email: '', role: 'member', phone: '', slack_user_id: '' })
    setModalOpen(true)
  }

  const openEdit = (u: User) => {
    setEditUser(u)
    setForm({ name: u.name, email: u.email, role: u.role, phone: u.phone || '', slack_user_id: u.slack_user_id || '' })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.email) {
      toast.error('이름과 이메일은 필수입니다.')
      return
    }
    setSaving(true)

    if (editUser) {
      const { error } = await supabase
        .from('users')
        .update({ name: form.name, role: form.role, phone: form.phone || null, slack_user_id: form.slack_user_id || null })
        .eq('id', editUser.id)

      if (error) toast.error('수정 실패')
      else toast.success('사용자가 수정되었습니다.')
    } else {
      const { error } = await supabase.from('users').insert({
        ...form,
        phone: form.phone || null,
        slack_user_id: form.slack_user_id || null,
      })

      if (error) toast.error('등록 실패: ' + error.message)
      else toast.success('사용자가 등록되었습니다.')
    }

    setSaving(false)
    setModalOpen(false)
    fetchUsers()
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">사용자 관리</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> 사용자 추가
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>역할</th>
                <th>연락처</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-gray-500">{u.email}</td>
                  <td><Badge className={ROLE_COLORS[u.role]}>{ROLE_LABELS[u.role]}</Badge></td>
                  <td className="text-gray-500">{u.phone || '-'}</td>
                  <td>
                    <Badge className={u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                      {u.is_active ? '활성' : '비활성'}
                    </Badge>
                  </td>
                  <td>
                    <button onClick={() => openEdit(u)} className="text-gray-400 hover:text-primary-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editUser ? '사용자 수정' : '새 사용자'}>
        <div className="space-y-4">
          <Input label="이름 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="이메일 *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editUser} />
          <Select
            label="역할"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            options={Object.entries(ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
          <Input label="연락처" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Slack User ID" value={form.slack_user_id} onChange={(e) => setForm({ ...form, slack_user_id: e.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>취소</Button>
            <Button onClick={handleSave} loading={saving}>{editUser ? '수정' : '등록'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
