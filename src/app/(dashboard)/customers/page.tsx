'use client'

// 고객관리 › 고객 목록 v2 (2026-10-21, 디자인 정의 › 고객 목록 v2 · 화면 문법 v2 "목록")
// 툴바(탭 전체·활성·이탈·미납 / 검색·업종·영업 담당·ⓘ·고객 등록) → 숫자줄 → 9열 표(합계 맨 위, 50행 서버 페이지) → 행 클릭 = 480 드로어
// 예전 표의 코드 바로 수정·삭제는 드로어로.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Toolbar, Tabs, KpiRow, DsButton, DsSelect, StatusChip, Skeleton, Empty, dsInput } from '@/components/ds'
import { CustomerDrawer, CUST_STATUS } from '@/components/customers/customer-drawer'
import { fetchJson, getCached, prefetchJson } from '@/lib/swr-cache'
import { useActiveUsers } from '@/hooks/useActiveUsers'
import { toast } from 'sonner'
import { Plus, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Info } from 'lucide-react'

type Tab = '전체' | '활성' | '이탈' | '미납'
type SortKey = 'ry' | 'rm' | 'unp' | 'code' | 'start'
type Row = { id: string; code: string | null; name: string; type: string | null; status: string; start: string | null; owner: string | null; ownerName: string | null; rm: number; ry: number; unp: number }
type Res = { rows: Row[]; total: number; page: number; pageSize: number; counts: Record<Tab, number>; kpi: { total: number; active: number; churned: number; billed: number; rmSum: number; unpN: number; unpSum: number; newMonth: number; month: number }; sums: { rm: number; ry: number; unp: number }; types: string[] }

const won = (n: number) => n.toLocaleString()
const man = (n: number) => (Math.abs(n) >= 1e8 ? `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}억` : `${Math.round(n / 1e4).toLocaleString()}만`)
const Money = ({ v, due }: { v: number; due?: boolean }) => v ? <span className={due ? 'text-ds-due font-medium' : ''}>{won(v)}</span> : <span className="text-ds-fg3">—</span>

export default function CustomersPage() {
  const users = useActiveUsers()
  const [tab, setTab] = useState<Tab>('전체')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState('전체')
  const [owner, setOwner] = useState('전체')
  const [sort, setSort] = useState<SortKey>('ry')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<Res | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(0) }, [tab, q, type, owner, sort, asc])

  const reqId = useRef(0)
  const fetchList = useCallback(async () => {
    const id = ++reqId.current
    const body = JSON.stringify({ tab, q, type, owner, sort, asc, page })
    const cached = getCached<Res>(`cust-list:${body}`)
    if (cached) setData(cached)
    setLoading(true)
    try {
      const j = await fetchJson<Res>(`cust-list:${body}`, '/api/customers/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      if (id === reqId.current) setData(j)
    } catch (e) { if (id === reqId.current) toast.error(`고객을 불러오지 못했습니다. ${(e as Error).message}`) }
    if (id === reqId.current) setLoading(false)
  }, [tab, q, type, owner, sort, asc, page])
  useEffect(() => { fetchList() }, [fetchList])

  const toggleSort = (k: SortKey) => { if (sort === k) setAsc(!asc); else { setSort(k); setAsc(k === 'code' ? false : false) } }
  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn('cursor-pointer select-none', className)} onClick={() => toggleSort(k)}>{children}{sort === k && (asc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />)}</th>
  )
  const rows = data?.rows || []
  const k = data?.kpi
  const from = data ? data.page * data.pageSize : 0
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div>
      <Toolbar right={<>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ds-fg3" />
          <input className={cn(dsInput, 'pl-8 w-[220px]')} placeholder="회사명·코드·담당자·연락처 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <DsSelect value={type} onChange={e => setType(e.target.value)}><option value="전체">업종 전체</option>{(data?.types || []).map(t => <option key={t}>{t}</option>)}</DsSelect>
        <DsSelect value={owner} onChange={e => setOwner(e.target.value)}><option value="전체">영업 담당 전체</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}<option value="미배정">미배정</option></DsSelect>
        <div className="relative">
          <DsButton variant="ghost" size="sm" icon={<Info className="w-3.5 h-3.5" />} onClick={() => setShowHelp(v => !v)} title="기준" />
          {showHelp && (
            <div className="absolute right-0 top-8 z-30 w-[300px] bg-ds-bg border border-ds-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.08)] p-3 text-[12px] text-ds-fg2 leading-relaxed" onClick={() => setShowHelp(false)}>
              <p><b className="text-ds-fg">매출</b> = 매출 현황(monthly_revenues) 공급가, 올해 1월부터</p>
              <p><b className="text-ds-fg">미납</b> = 세금계산서 발행 후 수납 안 된 청구 합계</p>
              <p>숫자줄은 필터와 상관없이 전체 · 합계 줄은 지금 조건 전체(페이지 아님)</p>
            </div>
          )}
        </div>
        <Link href="/customers/new"><DsButton variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>고객 등록</DsButton></Link>
      </>}>
        <Tabs value={tab} onChange={setTab} options={(['전체', '활성', '이탈', '미납'] as Tab[]).map(t => ({ value: t, label: t, count: data?.counts[t] }))} />
      </Toolbar>

      {k && <KpiRow items={[
        { label: '전체 고객', value: k.total.toLocaleString(), sub: `활성 ${k.active} · 이탈 ${k.churned}` },
        { label: `${k.month}월 과금`, value: `${k.billed}곳`, sub: '매출이 잡힌 고객' },
        { label: `${k.month}월 매출`, value: man(k.rmSum), sub: '공급가' },
        { label: '미납', value: `${k.unpN}곳`, sub: man(k.unpSum), tone: k.unpN ? 'bad' : undefined },
        { label: '이번 달 신규', value: `${k.newMonth}곳`, sub: '등록일 기준' },
      ]} />}

      <div className="ds-wrap">
        <table className="ds-table is-fixed is-clickable">
          <colgroup>
            <col style={{ width: '10%' }} /><col style={{ width: '22%' }} /><col style={{ width: '12%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <Th k="code">코드</Th><th>회사명</th><th>업종</th><th>상태</th><th>영업 담당</th>
              <Th k="start">과금 시작</Th><Th k="rm" className="g">{k?.month ?? ''}월 매출</Th><Th k="ry">올해 매출</Th><Th k="unp">미납</Th>
            </tr>
          </thead>
          <tbody className={cn(loading && data && 'opacity-60 transition-opacity')}>
            {data && data.total > 0 && (
              <tr className="ds-sum top">
                <td className="c">합계</td><td className="text-ds-fg3 font-normal">{data.total.toLocaleString()}곳</td><td /><td /><td /><td />
                <td className="num g">{won(data.sums.rm)}</td><td className="num">{won(data.sums.ry)}</td><td className="num"><Money v={data.sums.unp} due /></td>
              </tr>
            )}
            {rows.map(r => {
              const st = CUST_STATUS[r.status] || CUST_STATUS.active
              return (
                <tr key={r.id} className={cn('ds-row', openId === r.id && 'is-active')} onMouseEnter={() => prefetchJson(`cust:${r.id}`, `/api/customers/${r.id}/brief`)} onClick={() => setOpenId(r.id)}>
                  <td className="c tabular-nums text-ds-fg2">{r.code || <span className="text-ds-fg3">—</span>}</td>
                  <td className="truncate font-medium" title={r.name}>{r.name}</td>
                  <td className="truncate">{r.type || <span className="text-ds-fg3">—</span>}</td>
                  <td className="c"><StatusChip tone={st.tone}>{st.label}</StatusChip></td>
                  <td className="c truncate">{r.ownerName || <span className="text-ds-fg3">—</span>}</td>
                  <td className="c tabular-nums">{r.start ? r.start.slice(0, 7).replace('-', '.') : <span className="text-ds-fg3">—</span>}</td>
                  <td className="num g"><Money v={r.rm} /></td>
                  <td className="num"><Money v={r.ry} /></td>
                  <td className="num"><Money v={r.unp} due /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!data && loading && <div className="px-4"><Skeleton rows={10} /></div>}
        {data && rows.length === 0 && <Empty text="조건에 맞는 고객이 없습니다." />}
        {data && data.total > 0 && (
          <div className="flex items-center justify-end gap-2 px-3 h-10 border-t border-ds-line text-[12.5px] text-ds-fg2">
            <span className="tabular-nums">{(from + 1).toLocaleString()}–{Math.min(from + data.pageSize, data.total).toLocaleString()} / {data.total.toLocaleString()}</span>
            <DsButton variant="ghost" size="sm" disabled={data.page === 0} onClick={() => setPage(data.page - 1)} icon={<ChevronLeft className="w-3.5 h-3.5" />} title="이전" />
            <span className="tabular-nums">{data.page + 1} / {pages}</span>
            <DsButton variant="ghost" size="sm" disabled={data.page + 1 >= pages} onClick={() => setPage(data.page + 1)} icon={<ChevronRight className="w-3.5 h-3.5" />} title="다음" />
          </div>
        )}
      </div>

      <CustomerDrawer id={openId} users={users} types={data?.types || []} onClose={() => setOpenId(null)} onChanged={fetchList} />
    </div>
  )
}
