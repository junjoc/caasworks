'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { INDUSTRY_OPTIONS } from '@/lib/utils'
import type { User } from '@/types/database'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'active', label: '활성' },
  { value: 'suspended', label: '일시중지' },
  { value: 'churned', label: '이탈' },
]

const COMPANY_TYPE_OPTIONS = [
  { value: '종합건설사', label: '종합건설사' },
  { value: '전문건설사', label: '전문건설사' },
  { value: '인테리어/리모델링', label: '인테리어/리모델링' },
  { value: '건축사사무소', label: '건축사사무소' },
  { value: '시행사', label: '시행사' },
  { value: '발주처(법인)', label: '발주처(법인)' },
  { value: '발주처(공공)', label: '발주처(공공)' },
  { value: '공공기관/공기업', label: '공공기관/공기업' },
  { value: '솔루션사', label: '솔루션사' },
  { value: '대기업(메이저)', label: '대기업(메이저)' },
  { value: '법인', label: '법인' },
  { value: '개인', label: '개인' },
  { value: '기타', label: '기타' },
]

const BILLING_TYPE_OPTIONS = [
  { value: '월과금', label: '월과금' },
  { value: '연과금', label: '연과금' },
  { value: '건별과금', label: '건별과금' },
  { value: '기타', label: '기타' },
]

export default function NewCustomerPage() {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<User[]>([])

  const [form, setForm] = useState({
    company_name: '',
    company_type: '',
    contact_person: '',
    contact_email: '',
    contact_phone: '',
    business_reg_no: '',
    status: 'active',
    assigned_to: '',
    notes: '',
    // 과금 정보
    billing_type: '',
    billing_start: '',
    billing_end: '',
    deposit_amount: '',
    tax_invoice_email: '',
    invoice_email: '',
    invoice_contact: '',
    invoice_phone: '',
    service_type: '',
    user_count: '',
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
      .from('customers')
      .insert({
        company_name: form.company_name,
        company_type: form.company_type || null,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        business_reg_no: form.business_reg_no || null,
        status: form.status,
        assigned_to: form.assigned_to || null,
        notes: form.notes || null,
        billing_type: form.billing_type || null,
        billing_start: form.billing_start || null,
        billing_end: form.billing_end || null,
        deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : null,
        tax_invoice_email: form.tax_invoice_email || null,
        invoice_email: form.invoice_email || null,
        invoice_contact: form.invoice_contact || null,
        invoice_phone: form.invoice_phone || null,
        service_type: form.service_type || null,
        user_count: form.user_count ? Number(form.user_count) : null,
      })
      .select()
      .single()

    if (error) {
      toast.error('고객 등록에 실패했습니다.')
      setSaving(false)
      return
    }

    toast.success('고객이 등록되었습니다.')
    router.push(`/customers/${data.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/customers" className="text-text-tertiary hover:text-text-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">새 고객 등록</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 max-w-2xl space-y-5">
        {/* 기본 정보 */}
        <div className="pb-4 border-b">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">기본 정보</h3>
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
              id="company_type"
              label="회사 타입"
              value={form.company_type}
              onChange={(e) => handleChange('company_type', e.target.value)}
              options={COMPANY_TYPE_OPTIONS}
              placeholder="타입 선택"
            />
            <Select
              id="status"
              label="상태"
              value={form.status}
              onChange={(e) => handleChange('status', e.target.value)}
              options={STATUS_OPTIONS}
            />
          </div>
          <Input
            id="business_reg_no"
            label="사업자등록번호"
            value={form.business_reg_no}
            onChange={(e) => handleChange('business_reg_no', e.target.value)}
            placeholder="000-00-00000"
            className="mt-4"
          />
        </div>

        {/* 담당자 정보 */}
        <div className="pb-4 border-b">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">담당자 정보</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="contact_person"
              label="담당자"
              value={form.contact_person}
              onChange={(e) => handleChange('contact_person', e.target.value)}
              placeholder="담당자 이름"
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
          <Select
            id="assigned_to"
            label="영업 담당자"
            value={form.assigned_to}
            onChange={(e) => handleChange('assigned_to', e.target.value)}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            placeholder="담당자 선택"
            className="mt-4"
          />
        </div>

        {/* 과금/계약 정보 */}
        <div className="pb-4 border-b">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">과금/계약 정보</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              id="billing_type"
              label="과금방식"
              value={form.billing_type}
              onChange={(e) => handleChange('billing_type', e.target.value)}
              options={BILLING_TYPE_OPTIONS}
              placeholder="과금방식 선택"
            />
            <Input
              id="service_type"
              label="이용 서비스"
              value={form.service_type}
              onChange={(e) => handleChange('service_type', e.target.value)}
              placeholder="서비스 종류"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Input
              id="billing_start"
              label="과금 시작일"
              type="date"
              value={form.billing_start}
              onChange={(e) => handleChange('billing_start', e.target.value)}
            />
            <Input
              id="billing_end"
              label="과금 종료일"
              type="date"
              value={form.billing_end}
              onChange={(e) => handleChange('billing_end', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Input
              id="user_count"
              label="이용유저 수"
              type="number"
              value={form.user_count}
              onChange={(e) => handleChange('user_count', e.target.value)}
              placeholder="0"
            />
            <Input
              id="deposit_amount"
              label="보증금"
              type="number"
              value={form.deposit_amount}
              onChange={(e) => handleChange('deposit_amount', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {/* 청구 정보 */}
        <div className="pb-4 border-b">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">청구 정보</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="tax_invoice_email"
              label="세금계산서 이메일"
              type="email"
              value={form.tax_invoice_email}
              onChange={(e) => handleChange('tax_invoice_email', e.target.value)}
              placeholder="tax@example.com"
            />
            <Input
              id="invoice_email"
              label="청구서 이메일"
              type="email"
              value={form.invoice_email}
              onChange={(e) => handleChange('invoice_email', e.target.value)}
              placeholder="invoice@example.com"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Input
              id="invoice_contact"
              label="청구 담당자"
              value={form.invoice_contact}
              onChange={(e) => handleChange('invoice_contact', e.target.value)}
              placeholder="청구 담당자 이름"
            />
            <Input
              id="invoice_phone"
              label="청구 연락처"
              value={form.invoice_phone}
              onChange={(e) => handleChange('invoice_phone', e.target.value)}
              placeholder="010-0000-0000"
            />
          </div>
        </div>

        {/* 메모 */}
        <Textarea
          id="notes"
          label="특이사항"
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="추가 메모"
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={saving}>
            등록
          </Button>
          <Link href="/customers">
            <Button type="button" variant="secondary">
              취소
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
