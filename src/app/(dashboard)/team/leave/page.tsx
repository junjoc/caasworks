'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { Plus, X, Users, Settings } from 'lucide-react'

const SETTING_KEY = 'calendar_team_members'

export default function TeamSettingsPage() {
  const [members, setMembers] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    fetchMembers()
  }, [])

  async function fetchMembers() {
    const { data } = await supabase
      .from('company_settings')
      .select('value')
      .eq('key', SETTING_KEY)
      .single()

    if (data?.value) {
      setMembers(data.value as string[])
    }
    setLoading(false)
  }

  async function saveMembers(updatedMembers: string[]) {
    setSaving(true)
    const { error } = await supabase
      .from('company_settings')
      .upsert({
        key: SETTING_KEY,
        value: updatedMembers,
        updated_by: user?.id || null,
      }, { onConflict: 'key' })

    if (error) {
      toast.error('저장에 실패했습니다.')
    } else {
      toast.success('저장되었습니다.')
      setMembers(updatedMembers)
    }
    setSaving(false)
  }

  const addMember = () => {
    const name = newName.trim()
    if (!name) return
    if (members.includes(name)) {
      toast.error('이미 등록된 이름입니다.')
      return
    }
    const updated = [...members, name]
    saveMembers(updated)
    setNewName('')
  }

  const removeMember = (name: string) => {
    const updated = members.filter(m => m !== name)
    saveMembers(updated)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Settings className="w-6 h-6" /> 캘린더 팀원 관리
        </h1>
      </div>

      <div className="card p-6 max-w-lg">
        <p className="text-sm text-gray-500 mb-4">
          팀 캘린더에서 휴가/일정을 볼 팀원을 등록하세요.
          구글 캘린더 이벤트 제목의 <code className="bg-gray-100 px-1 rounded">[이름]</code> 패턴과 매칭됩니다.
        </p>

        {/* 새 팀원 추가 */}
        <div className="flex gap-2 mb-6">
          <Input
            placeholder="팀원 이름 입력 (예: 전성환)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMember()}
            className="flex-1"
          />
          <Button onClick={addMember} size="sm" loading={saving}>
            <Plus className="w-4 h-4 mr-1" /> 추가
          </Button>
        </div>

        {/* 팀원 목록 */}
        {loading ? (
          <p className="text-sm text-gray-400">로딩 중...</p>
        ) : members.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">등록된 팀원이 없습니다.</p>
            <p className="text-xs mt-1">팀원을 추가하면 캘린더에서 해당 팀원의 휴가/일정만 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-2">등록된 팀원 ({members.length}명)</p>
            {members.map((name) => (
              <div key={name} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium">
                    {name[0]}
                  </div>
                  <span className="text-sm font-medium text-gray-800">{name}</span>
                </div>
                <button
                  onClick={() => removeMember(name)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {members.length > 0 && (
          <p className="text-xs text-gray-400 mt-4">
            팀 캘린더에서 위 팀원의 휴가/원격근무/일정만 표시됩니다.
            팀원이 없으면 전체 일정이 표시됩니다.
          </p>
        )}
      </div>
    </div>
  )
}
