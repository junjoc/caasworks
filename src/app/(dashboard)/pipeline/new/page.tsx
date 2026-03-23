'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { INDUSTRY_OPTIONS, CHANNEL_OPTIONS } from '@/lib/utils'
import type { User } from '@/types/database'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const PRIORITY_OPTIONS = [
  { value: '긴급', label: '긴급' },
  { value: '높음', label: '높음' },
  { value: '중간', label: '중간' },
  { value: '낮음', label: '낮음' },
]

export default function NewLeadPage() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<User[]>([])

  const [form, setForm] = useState({
    company_name: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    contact_position: '',
    industry: '',
    core_need: '',
    inquiry_channel: '',
    inquiry_source: '',
    inquiry_content: '',
    inquiry_date: new Date().toISOString().split('T')[0],
    priority: '중간',
    next_action: '',
    next_action_date: '',
    assigned_to: '',
    notes: '',
  })

  useEffect(() => {
    supabase.from('users').select('*').eq('is_active', true).then(({ data }) => {
      setUsers(data || [])
    })
  }, [])

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.company_name.trim()) {
      toast.error('회사명은 필수입니다.')
      return
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('pipeline_leads')
      .insert({
        ...form,
        assigned_to: form.assigned_to || null,
        next_action_date: form.next_action_date || null,
        inquiry_date: form.inquiry_date || null,
      })
      .select()
      .single()

    if (error) {
      toast.error('리드 등록에 실패했습니다.')
      setSaving(false)
      return
    }

    toast.success('리드가 등록되었습니다.')
    router.push(`/pipeline/${data.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/pipeline/list" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">새 리드 등록</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 max-w-2xl space-y-5">
        {/* 관리 섹션 */}
        <div className="pb-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">관리</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              id="priority"
              label="우선순위"
              value={form.priority}
              onChange={(e) => handleChange('priority', e.target.value)}
              options={PRIORITY_OPTIONS}
            />
            <Input
              id="next_action"
              label="다음 액션"
              value={form.next_action}
              onChange={(e) => handleChange('next_action', e.target.value)}
              placeholder="예: 견적서 발송"
            />
            <Input
              id="next_action_date"
              label="액션 예정일"
              type="date"
              value={form.next_action_date}
              onChange={(e) => handleChange('next_action_date', e.target.value)}
            />
          </div>
        </div>

        {/* 유입 정보 */}
        <div className="pb-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">유입 정보</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              id="inquiry_date"
              label="유입일"
              type="date"
              value={form.inquiry_date}
              onChange={(e) => handleChange('inquiry_date', e.target.value)}
            />
            <Select
              id="inquiry_channel"
              label="유입채널"
              value={form.inquiry_channel}
              onChange={(e) => handleChange('inquiry_channel', e.target.value)}
              options={CHANNEL_OPTIONS.map(c => ({ value: c, label: c }))}
              placeholder="채널 선택"
            />
            <Input
              id="inquiry_source"
              label="유입경로"
              value={form.inquiry_source}
              onChange={(e) => handleChange('inquiry_source', e.target.value)}
              placeholder="상세 경로"
            />
          </div>
        </div>

        {/* 고객 정보 */}
        <div className="pb-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">고객 정보</h3>
          <Input
            id="company_name"
            label="회사명 *"
            value={form.company_name}
            onChange={(e) => handleChange('company_name', e.target.value)}
            placeholder="회사명을 입력하세요"
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Select
              id="industry"
              label="사업분류"
              value={form.industry}
              onChange={(e) => handleChange('industry', e.target.value)}
              options={INDUSTRY_OPTIONS.map(i => ({ value: i, label: i }))}
              placeholder="업종 선택"
            />
            <Input
              id="core_need"
              label="핵심니즈"
              value={form.core_need}
              onChange={(e) => handleChange('core_need', e.target.value)}
              placeholder="고객의 핵심 니즈"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <Input
              id="contact_person"
              label="문의자"
              value={form.contact_person}
              onChange={(e) => handleChange('contact_person', e.target.value)}
              placeholder="담당자 이름"
            />
            <Input
              id="contact_position"
              label="직급"
              value={form.contact_position}
              onChange={(e) => handleChange('contact_position', e.target.value)}
              placeholder="팀장, 과장 등"
            />
            <Input
              id="contact_phone"
              label="연락처"
              value={form.contact_phone}
              onChange={(e) => handleChange('contact_phone', e.target.value)}
              placeholder="010-0000-0000"
            />
          </div>
          <Input
            id="contact_email"
            label="이메일"
            type="email"
            value={form.contact_email}
            onChange={(e) => handleChange('contact_email', e.target.value)}
            placeholder="email@example.com"
            className="mt-4"
          />
        </div>

        {/* 추가 정보 */}
        <Textarea
          id="inquiry_content"
          label="문의내용"
          value={form.inquiry_content}
          onChange={(e) => handleChange('inquiry_content', e.target.value)}
          placeholder="문의 내용을 입력하세요"
        />

        <Select
          id="assigned_to"
          label="담당자"
          value={form.assigned_to}
          onChange={(e) => handleChange('assigned_to', e.target.value)}
          options={users.map((u) => ({ value: u.id, label: u.name }))}
          placeholder="담당자 선택"
        />

        <Textarea
          id="notes"
          label="메모"
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="추가 메모"
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={saving}>
            등록
          </Button>
          <Link href="/pipeline/list">
            <Button type="button" variant="secondary">
              취소
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
