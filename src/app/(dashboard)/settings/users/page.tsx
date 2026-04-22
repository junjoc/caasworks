'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import type { User, Role } from '@/types/database'
import { POSITION_OPTIONS } from '@/lib/nav-menu'
import { uploadAvatar } from '@/lib/avatar-upload'
import { toast } from 'sonner'
import { Plus, Edit2, Camera, Trash2 } from 'lucide-react'

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', role: 'member', phone: '', slack_user_id: '',
    position: '', avatar_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    const [{ data: u }, rolesRes] = await Promise.all([
      supabase.from('users').select('*').order('created_at'),
      supabase.from('roles').select('*').order('is_system', { ascending: false }).order('name'),
    ])
    setUsers(u || [])
    // Fallback to hardcoded defaults if roles table doesn't exist yet
    if (rolesRes.error || !rolesRes.data) {
      setRoles([
        { name: 'admin', label: '관리자', allowed_paths: ['*'], is_system: true, created_at: '' },
        { name: 'member', label: '일반', allowed_paths: [], is_system: true, created_at: '' },
        { name: 'accountant', label: '회계', allowed_paths: [], is_system: true, created_at: '' },
      ])
    } else {
      setRoles(rolesRes.data)
    }
    setLoading(false)
  }

  const openAdd = () => {
    setEditUser(null)
    setForm({ name: '', email: '', role: 'member', phone: '', slack_user_id: '', position: '', avatar_url: '' })
    setModalOpen(true)
  }

  const openEdit = (u: User) => {
    setEditUser(u)
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone || '',
      slack_user_id: u.slack_user_id || '',
      position: u.position || '',
      avatar_url: u.avatar_url || '',
    })
    setModalOpen(true)
  }

  const handleAvatarPick = () => fileInputRef.current?.click()

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!editUser) {
      toast.error('사용자를 먼저 저장한 후 이미지를 업로드해 주세요.')
      return
    }
    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(supabase, editUser.id, file)
      setForm(prev => ({ ...prev, avatar_url: url }))
      // Persist immediately so the upload isn't lost if user cancels
      await supabase.from('users').update({ avatar_url: url }).eq('id', editUser.id)
      toast.success('이미지가 업로드되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (u: User) => {
    if (!confirm(`"${u.name}" (${u.email}) 사용자를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다. 해당 사용자가 배정된 리드/활동은 '담당자 없음' 상태가 됩니다.`)) return
    const { error } = await supabase.from('users').delete().eq('id', u.id)
    if (error) {
      toast.error('삭제 실패: ' + error.message + '\n(관련 데이터가 있으면 먼저 담당자를 변경하거나 비활성화를 사용해 주세요.)')
      return
    }
    toast.success('사용자가 삭제되었습니다.')
    fetchAll()
  }

  const toggleActive = async (u: User) => {
    const { error } = await supabase
      .from('users')
      .update({ is_active: !u.is_active })
      .eq('id', u.id)
    if (error) {
      toast.error('상태 변경 실패')
      return
    }
    toast.success(u.is_active ? '비활성화되었습니다.' : '활성화되었습니다.')
    fetchAll()
  }

  const handleSave = async () => {
    if (!form.name || !form.email) {
      toast.error('이름과 이메일은 필수입니다.')
      return
    }
    setSaving(true)

    // Save with optional fields; retry without them if columns don't exist yet
    // (graceful fallback when migration 004 hasn't been run)
    const savePayload = (includeOptional: boolean) => ({
      name: form.name,
      role: form.role,
      phone: form.phone || null,
      slack_user_id: form.slack_user_id || null,
      ...(includeOptional && {
        position: form.position || null,
        avatar_url: form.avatar_url || null,
      }),
    })
    const isMissingColumn = (msg?: string) =>
      !!msg && /column .* does not exist|column ".*" of relation/i.test(msg)

    if (editUser) {
      let { error } = await supabase
        .from('users')
        .update(savePayload(true))
        .eq('id', editUser.id)
      if (error && isMissingColumn(error.message)) {
        // Retry without position/avatar_url
        const retry = await supabase.from('users').update(savePayload(false)).eq('id', editUser.id)
        error = retry.error
        if (!error) toast.warning('직급/프로필이미지 컬럼이 아직 DB에 없어 저장 건너뛰었습니다. 관리자에게 문의하세요.')
      }
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('사용자가 수정되었습니다.')
    } else {
      const insertFull = { ...savePayload(true), email: form.email }
      let { error } = await supabase.from('users').insert(insertFull)
      if (error && isMissingColumn(error.message)) {
        const insertMin = { ...savePayload(false), email: form.email }
        const retry = await supabase.from('users').insert(insertMin)
        error = retry.error
        if (!error) toast.warning('직급/프로필이미지 컬럼 없이 등록되었습니다.')
      }
      if (error) toast.error('등록 실패: ' + error.message)
      else toast.success('사용자가 등록되었습니다.')
    }

    setSaving(false)
    setModalOpen(false)
    fetchAll()
  }

  const roleLabel = (name: string) => roles.find(r => r.name === name)?.label || name
  const roleColor = (name: string) => {
    if (name === 'admin') return 'bg-purple-100 text-purple-700'
    if (name === 'member') return 'bg-blue-100 text-blue-700'
    if (name === 'accountant') return 'bg-green-100 text-green-700'
    return 'bg-gray-100 text-gray-700'
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
                <th className="w-12"></th>
                <th>이름</th>
                <th>직급</th>
                <th>이메일</th>
                <th>역할</th>
                <th>연락처</th>
                <th>상태</th>
                <th className="text-center w-16">편집</th>
                <th className="text-center w-16 border-l border-gray-200">삭제</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                        {u.name?.charAt(0) || 'U'}
                      </div>
                    )}
                  </td>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-gray-500">{u.position || '-'}</td>
                  <td className="text-gray-500">{u.email}</td>
                  <td><Badge className={roleColor(u.role)}>{roleLabel(u.role)}</Badge></td>
                  <td className="text-gray-500">{u.phone || '-'}</td>
                  <td>
                    <button onClick={() => toggleActive(u)} title={u.is_active ? '클릭하여 비활성화' : '클릭하여 활성화'}>
                      <Badge className={`${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} cursor-pointer hover:opacity-80`}>
                        {u.is_active ? '활성' : '비활성'}
                      </Badge>
                    </button>
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => openEdit(u)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                      title="편집"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                  <td className="text-center border-l border-gray-100">
                    <button
                      onClick={() => handleDelete(u)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
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
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {form.avatar_url ? (
                <img src={form.avatar_url} alt="avatar" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-xl font-bold text-gray-500 border border-gray-200">
                  {form.name?.charAt(0) || 'U'}
                </div>
              )}
              <button
                type="button"
                onClick={handleAvatarPick}
                disabled={uploadingAvatar || !editUser}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center shadow disabled:opacity-40 disabled:cursor-not-allowed"
                title={editUser ? '이미지 변경' : '저장 후 이미지 업로드 가능'}
              >
                <Camera className="w-3 h-3" />
              </button>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <div className="text-xs text-gray-500">
              {editUser ? '프로필 이미지 (JPG/PNG/WEBP, 5MB 이하)' : '사용자 저장 후 이미지를 업로드할 수 있습니다.'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="이름 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select
              label="직급"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
              options={[{ value: '', label: '선택' }, ...POSITION_OPTIONS.map(p => ({ value: p, label: p }))]}
            />
          </div>

          <Input label="이메일 *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editUser} />

          <Select
            label="역할"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            options={roles.map(r => ({ value: r.name, label: r.label }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input label="연락처" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Slack User ID" value={form.slack_user_id} onChange={(e) => setForm({ ...form, slack_user_id: e.target.value })} />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>취소</Button>
            <Button onClick={handleSave} loading={saving}>{editUser ? '수정' : '등록'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
