'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import type { Customer } from '@/types/database'
import { Search, Users, Plus } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  active: '활성',
  suspended: '일시중지',
  churned: '이탈',
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  churned: 'bg-red-100 text-red-700',
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const supabase = createClient()

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

  const filtered = customers.filter((c) =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_person || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">고객 관리</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="회사명 또는 담당자 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="고객이 없습니다" description="파이프라인에서 계약 전환 시 자동으로 등록됩니다." />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>회사명</th>
                <th>타입</th>
                <th>담당자</th>
                <th>영업담당</th>
                <th>상태</th>
                <th>과금시작</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.id}`} className="font-medium text-primary-600 hover:underline">
                      {c.company_name}
                    </Link>
                  </td>
                  <td className="text-gray-500">{c.company_type || '-'}</td>
                  <td>{c.contact_person || '-'}</td>
                  <td>{c.assigned_user?.name || '-'}</td>
                  <td>
                    <Badge className={STATUS_COLORS[c.status]}>
                      {STATUS_LABELS[c.status]}
                    </Badge>
                  </td>
                  <td className="text-gray-500">
                    {c.billing_start ? formatDate(c.billing_start) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
