'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Customer } from '@/types/database'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

export default function NewMeetingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])

  const [form, setForm] = useState({
    customer_id: '',
    meeting_date: new Date().toISOString().split('T')[0],
    company_name: '',
    industry: '',
    source: '',
    pain_points: '',
    positives: '',
    difficulties: '',
    meeting_result: '',
    external_attendees: '',
  })

  useEffect(() => {
    supabase.from('customers').select('id, company_name').order('company_name')
      .then(({ data }) => setCustomers(data || []))
  }, [])

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const { data, error } = await supabase
      .from('meetings')
      .insert({
        ...form,
        customer_id: form.customer_id || null,
        created_by: user?.id,
      })
      .select()
      .single()

    if (error) {
      toast.error('미팅 등록에 실패했습니다.')
      setSaving(false)
      return
    }

    toast.success('미팅이 등록되었습니다.')
    router.push(`/meetings/${data.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/meetings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">새 미팅 등록</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 max-w-2xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="customer_id"
            label="고객사"
            value={form.customer_id}
            onChange={(e) => handleChange('customer_id', e.target.value)}
            options={customers.map((c) => ({ value: c.id, label: c.company_name }))}
            placeholder="기존 고객 선택 (선택)"
          />
          <Input
            id="meeting_date"
            label="미팅일 *"
            type="date"
            value={form.meeting_date}
            onChange={(e) => handleChange('meeting_date', e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="company_name"
            label="업체명"
            value={form.company_name}
            onChange={(e) => handleChange('company_name', e.target.value)}
            placeholder="고객 미연결 시 직접 입력"
          />
          <Input
            id="industry"
            label="업종"
            value={form.industry}
            onChange={(e) => handleChange('industry', e.target.value)}
            placeholder="종합건설, 인테리어 등"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="source"
            label="유입 경로"
            value={form.source}
            onChange={(e) => handleChange('source', e.target.value)}
            placeholder="인스타, 네이버, 소개 등"
          />
          <Input
            id="external_attendees"
            label="외부 참여자"
            value={form.external_attendees}
            onChange={(e) => handleChange('external_attendees', e.target.value)}
          />
        </div>

        <Textarea
          id="pain_points"
          label="페인 포인트"
          value={form.pain_points}
          onChange={(e) => handleChange('pain_points', e.target.value)}
          placeholder="고객이 겪는 문제/니즈"
        />

        <Textarea
          id="positives"
          label="좋은 점"
          value={form.positives}
          onChange={(e) => handleChange('positives', e.target.value)}
          placeholder="고객이 만족하는 부분"
        />

        <Textarea
          id="difficulties"
          label="어려운 점 / 요청사항"
          value={form.difficulties}
          onChange={(e) => handleChange('difficulties', e.target.value)}
          placeholder="개선 요구"
        />

        <Textarea
          id="meeting_result"
          label="미팅 결과"
          value={form.meeting_result}
          onChange={(e) => handleChange('meeting_result', e.target.value)}
          placeholder="후속 액션, 계약 가능성 등"
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={saving}>등록</Button>
          <Link href="/meetings">
            <Button type="button" variant="secondary">취소</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
