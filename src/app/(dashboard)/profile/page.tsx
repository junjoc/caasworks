'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loading } from '@/components/ui/loading'
import { uploadAvatar } from '@/lib/avatar-upload'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const [form, setForm] = useState({ phone: '', avatar_url: '' })
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      setForm({
        phone: user.phone || '',
        avatar_url: user.avatar_url || '',
      })
    }
  }, [user])

  const handleAvatarPick = () => fileInputRef.current?.click()

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(supabase, user.id, file)
      setForm(prev => ({ ...prev, avatar_url: url }))
      await supabase.from('users').update({ avatar_url: url }).eq('id', user.id)
      toast.success('이미지가 변경되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('users')
      .update({
        phone: form.phone || null,
      })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      toast.error('저장 실패')
      return
    }
    toast.success('프로필이 저장되었습니다.')
  }

  if (authLoading || !user) return <Loading />

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">내 프로필</h1>
      </div>

      <div className="card p-6 max-w-xl space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt={user.name} className="w-20 h-20 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-500 border border-gray-200">
                {user.name?.charAt(0) || 'U'}
              </div>
            )}
            <button
              type="button"
              onClick={handleAvatarPick}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary-500 text-white flex items-center justify-center shadow disabled:opacity-40"
              title="이미지 변경"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
          <div>
            <div className="font-semibold text-text-primary">{user.name}</div>
            <div className="text-xs text-gray-500">{user.email}</div>
            {user.position && <div className="text-xs text-gray-500 mt-0.5">{user.position}</div>}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 space-y-4">
          <Input label="이름" value={user.name} disabled />
          <Input label="이메일" value={user.email} disabled />
          <Input
            label="연락처"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="010-0000-0000"
          />
          <p className="text-xs text-gray-400">
            이름, 이메일, 직급, 역할은 관리자에게 요청해 주세요.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving}>저장</Button>
        </div>
      </div>
    </div>
  )
}
