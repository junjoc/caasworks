'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import type { Customer } from '@/types/database'
import { Search, Users, Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_LABELS: Record<string, string> = {
  active: '활성',
  suspended: '일시중지',
  churned: '이탈',
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-status-green-bg text-status-green',
  suspended: 'bg-status-yellow-bg text-status-yellow',
  churned: 'bg-status-red-bg text-status-red',
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    fetchCustomers()
  }, [])

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('*, assigned_user:users!customers_assigned_to_fkey(id, name)')
      .order('created_at', { ascending: false })

    setCustomers(data || [])
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id)
    if (error) {
      toast.error('삭제에 실패했습니다. 연결된 데이터가 있을 수 있습니다.')
    } else {
      toast.success('고객이 삭제되었습니다.')
      fetchCustomers()
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase().replace(/-/g, '')
    return c.company_name.toLowerCase().includes(q) ||
      (c.contact_person || '').toLowerCase().includes(q) ||
      (c.contact_phone || '').replace(/-/g, '').includes(q) ||
      (c.contact_email || '').toLowerCase().includes(q) ||
      (c.customer_code || '').toLowerCase().includes(q) ||
      (c.business_reg_no || '').replace(/-/g, '').includes(q) ||
      (c.notes || '').toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">고객 관리</h1>
        <Link href="/customers/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            고객 등록
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-placeholder" />
          <Input
            placeholder="회사명, 담당자, 전화번호, 이메일 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="고객이 없습니다" description="'고객 등록' 버튼을 눌러 새 고객을 추가하세요." />
      ) : (
        <div className="table-container">
          <table className="data-table" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '28%' }}>회사명</th>
                <th style={{ width: '12%' }}>타입</th>
                <th style={{ width: '14%' }}>담당자</th>
                <th style={{ width: '12%' }}>영업담당</th>
                <th style={{ width: '10%' }}>상태</th>
                <th style={{ width: '12%' }}>과금시작</th>
                <th style={{ width: '12%' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.id}`} className="font-medium text-primary-400 hover:text-primary-500 hover:underline block truncate">
                      {c.company_name}
                    </Link>
                  </td>
                  <td className="text-text-secondary truncate">{c.company_type || '-'}</td>
                  <td className="text-text-primary truncate">{c.contact_person || '-'}</td>
                  <td className="text-text-secondary truncate">{c.assigned_user?.name || '-'}</td>
                  <td>
                    <Badge className={STATUS_COLORS[c.status]}>
                      {STATUS_LABELS[c.status]}
                    </Badge>
                  </td>
                  <td className="text-text-tertiary text-sm">
                    {c.billing_start ? formatDate(c.billing_start) : '-'}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => router.push(`/customers/${c.id}`)}
                        className="p-1.5 text-text-tertiary hover:text-primary-500 hover:bg-primary-50 rounded transition-colors"
                        title="수정"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 text-text-tertiary hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="고객 삭제">
        <p className="text-sm text-text-secondary mb-4">
          <strong>{deleteTarget?.company_name}</strong>을(를) 정말 삭제하시겠습니까?
          <br />
          <span className="text-status-red">연결된 프로젝트, 매출 데이터가 있으면 삭제가 실패할 수 있습니다.</span>
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>취소</Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>삭제</Button>
        </div>
      </Modal>
    </div>
  )
}
