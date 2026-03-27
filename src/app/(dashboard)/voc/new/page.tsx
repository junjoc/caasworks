'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchSelect } from '@/components/ui/search-select'
import { Textarea } from '@/components/ui/textarea'
import { VOC_CATEGORY_LABELS, VOC_PRIORITY_LABELS } from '@/lib/utils'
import type { Customer, User } from '@/types/database'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

export default function NewVocPage() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [users, setUsers] = useState<User[]>([])

  const [form, setForm] = useState({
    customer_id: '',
    category: 'inquiry',
    channel: 'phone',
    priority: 'normal',
    title: '',
    description: '',
    assigned_to: '',
    reported_by: '',
  })

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('id, company_name').order('company_name'),
      supabase.from('users').select('*').eq('is_active', true),
    ]).then(([c, u]) => {
      setCustomers(c.data || [])
      setUsers(u.data || [])
    })
  }, [])

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customer_id || !form.title) {
      toast.error('고객사와 제목은 필수입니다.')
      return
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('voc_tickets')
      .insert({
        ...form,
        assigned_to: form.assigned_to || null,
        created_by: user?.id,
      })
      .select()
      .single()

    if (error) {
      toast.error('티켓 등록에 실패했습니다.')
      setSaving(false)
      return
    }

    toast.success('VoC 티켓이 등록되었습니다.')
    router.push(`/voc/${data.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/voc" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">새 VoC 티켓</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 max-w-2xl space-y-5">
        <SearchSelect
          label="고객사 *"
          value={form.customer_id}
          onChange={(val) => handleChange('customer_id', val)}
          options={customers.map((c) => ({ value: c.id, label: c.company_name }))}
          placeholder="고객사 검색..."
        />

        <Input
          id="title"
          label="제목 *"
          value={form.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="VoC 제목"
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            id="category"
            label="분류"
            value={form.category}
            onChange={(e) => handleChange('category', e.target.value)}
            options={Object.entries(VOC_CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
          <Select
            id="channel"
            label="채널"
            value={form.channel}
            onChange={(e) => handleChange('channel', e.target.value)}
            options={[
              { value: 'phone', label: '유선' },
              { value: 'message', label: '메세지' },
              { value: 'email', label: 'E-mail' },
              { value: 'meeting', label: '미팅' },
              { value: 'other', label: '기타' },
            ]}
          />
          <Select
            id="priority"
            label="우선순위"
            value={form.priority}
            onChange={(e) => handleChange('priority', e.target.value)}
            options={Object.entries(VOC_PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>

        <Textarea
          id="description"
          label="상세 내용"
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="VoC 상세 내용을 입력하세요"
          rows={6}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="assigned_to"
            label="담당자"
            value={form.assigned_to}
            onChange={(e) => handleChange('assigned_to', e.target.value)}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            placeholder="담당자 선택"
          />
          <Input
            id="reported_by"
            label="문의자"
            value={form.reported_by}
            onChange={(e) => handleChange('reported_by', e.target.value)}
            placeholder="문의자 이름"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={saving}>등록</Button>
          <Link href="/voc">
            <Button type="button" variant="secondary">취소</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
