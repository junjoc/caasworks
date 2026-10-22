// 현장별 전체 매출 → projects · monthly_revenues (scripts/sync/sync-revenue-2026-xlsx.mjs 와 같은 규칙)
// 데이터 행 = 9행부터 회사명 있는 행, 숨김 행 제외. 순번 = projects.sheet_no
// 프로젝트 매칭: (고객, "프로젝트명 - 서비스") → 같은 고객·같은 순번이면 이름 변경 → 없으면 새로 (source='excel_backfill')
// 매출: (프로젝트, 2026, 월) upsert, 시트에서 0 이 된 달은 지움. 시트에 없어진 프로젝트는 지우지 않고 보고만
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkBook } from 'xlsx'
import { grid, clean, money, excelDate, fetchAll, customerIndex, YEAR, type Step } from './common'

const SERVICE_MAP: Record<string, string> = { '플랫폼': '플랫폼', 'CCTV': 'AI CCTV', 'AI CCTV': 'AI CCTV', '운임비': '운임비', '근로자관리': '근로자관리', 'Wearable Cam': 'Wearable Cam', '기타': '기타', '안전관리': '안전관리', '실시간 안전관리': '실시간 안전관리', 'Story Book': 'Story Book', '편집studio': '편집studio', '풀타임 타임랩스': '풀타임 타임랩스', '기타 솔루션': '기타', 'Mobile APP': 'Mobile APP' }
type Proj = { id: string; sheet_no: number | null; sheet_year: number | null; customer_id: string; project_name: string; service_type: string | null; source: string | null }
type Rev = { id: string; project_id: string; month: number; amount: number }
const won = (n: number) => n.toLocaleString()

export async function syncRevenue(sb: SupabaseClient, wb: WorkBook, apply: boolean, force = false): Promise<Step> {
  const { ws, rows: g } = grid(wb, '현장별 전체 매출')
  const hidden = new Set(((ws['!rows'] || []) as ({ hidden?: boolean } | undefined)[]).map((r, i) => (r && r.hidden ? i : -1)).filter(i => i >= 0))
  const hdr = g.slice(0, 8).find(r => r && r.includes('1월'))
  if (!hdr) throw new Error('현장별 전체 매출: "1월" 머리 없음 — 시트 구조가 바뀜')
  const M0 = hdr.indexOf('1월')
  type Row = { sheet_no: number; company: string; project: string; site_category: string | null; site_category2: string | null; service: string | null; proj_start: string | null; proj_end: string | null; bill_start: string | null; bill_end: string | null; notes: string | null; monthly: { month: number; amount: number }[] }
  const rows: Row[] = []
  let seq = 0
  for (let i = 8; i < g.length; i++) {
    const row = g[i] || [], noRaw = row[1], company = row[4]
    if (!noRaw && !company) continue
    if (noRaw === '복사') continue
    if (!company || typeof company !== 'string' || !company.trim()) continue
    if (noRaw != null && noRaw !== '' && typeof noRaw !== 'number' && Number.isNaN(parseFloat(String(noRaw)))) continue
    if (hidden.has(i)) continue
    seq++
    const monthly: Row['monthly'] = []
    for (let m = 0; m < 12; m++) { const amt = money(row[M0 + m]); if (amt !== 0) monthly.push({ month: m + 1, amount: amt }) }
    rows.push({ sheet_no: seq, company: company.trim(), project: clean(row[5]) || company.trim(), site_category: clean(row[6]), site_category2: clean(row[7]), service: clean(row[8]),
      proj_start: excelDate(row[2]), proj_end: excelDate(row[3]), bill_start: excelDate(row[9]), bill_end: excelDate(row[10]), notes: clean(row[11]), monthly })
  }
  const sheetMonth = Array(12).fill(0); for (const r of rows) for (const m of r.monthly) sheetMonth[m.month - 1] += m.amount
  // 안전 1: 시트 7행 합계와 읽은 값이 다르면(열 밀림·행 숨김 등) 멈춤
  const totalRow = g[6] || []
  const badMonths = sheetMonth.map((v, m) => Math.abs(v - money(totalRow[M0 + m])) >= 1 ? m + 1 : 0).filter(Boolean)

  const customers = await fetchAll<{ id: string; company_name: string }>(sb, 'customers', 'id, company_name')
  const ci = customerIndex(customers)
  const missCustomers = Array.from(new Set(rows.filter(r => !ci.find(r.company)).map(r => r.company)))
  const projs = await fetchAll<Proj>(sb, 'projects', 'id, sheet_no, sheet_year, customer_id, project_name, service_type, source', q => q.eq('source', 'excel_backfill'))
  const projByKey = new Map<string, Proj[]>()
  for (const p of [...projs].sort((a, b) => (a.sheet_year === YEAR ? 0 : 1) - (b.sheet_year === YEAR ? 0 : 1) || (a.sheet_no || 0) - (b.sheet_no || 0))) {
    const k = `${p.customer_id}||${p.project_name}`; if (!projByKey.has(k)) projByKey.set(k, []); projByKey.get(k)!.push(p)
  }
  const takeProj = (k: string) => { const l = projByKey.get(k); return l && l.length ? l.shift()! : null }
  const dbRevs = await fetchAll<Rev>(sb, 'monthly_revenues', 'id, project_id, month, amount', q => q.eq('year', YEAR))
  const dbRevByKey = new Map(dbRevs.map(r => [`${r.project_id}|${r.month}`, r]))
  const dbMonth = Array(12).fill(0); for (const r of dbRevs) dbMonth[r.month - 1] += Number(r.amount)

  const upsert: { project_id: string; customer_id: string; year: number; month: number; amount: number; is_confirmed: boolean; _name: string; _old: number | null }[] = []
  const newProjects: { r: Row; custId?: string; projectName: string; dbSvc: string | null }[] = []
  const seqUpdate: { id: string; sheet_no: number }[] = []
  const deleteRevs: (Rev & { _name: string })[] = []
  const renamed: { id: string; from: string; to: string; service_type: string | null }[] = []
  let unchanged = 0
  const seen = new Set<string>()
  const bySeq = new Map(projs.filter(p => p.sheet_year === YEAR && p.sheet_no != null).map(p => [`${p.customer_id}|${p.sheet_no}`, p]))
  const first = rows.map(r => {
    const custId = ci.find(r.company)
    const dbSvc = r.service ? (SERVICE_MAP[r.service] || r.service) : null
    const projectName = dbSvc ? `${r.project} - ${dbSvc}` : r.project
    const p = custId ? takeProj(`${custId}||${projectName}`) : null
    if (p) seen.add(p.id)
    return { r, custId, dbSvc, projectName, p }
  })
  for (const x of first) if (!x.p && x.custId) {
    const cand = bySeq.get(`${x.custId}|${x.r.sheet_no}`)
    if (cand && !seen.has(cand.id)) { x.p = cand; seen.add(cand.id); renamed.push({ id: cand.id, from: cand.project_name, to: x.projectName, service_type: x.dbSvc }) }
  }
  for (const { r, custId, dbSvc, projectName, p } of first) {
    if (!p) { newProjects.push({ r, custId, projectName, dbSvc }); continue }
    if (p.sheet_no !== r.sheet_no || p.sheet_year !== YEAR) seqUpdate.push({ id: p.id, sheet_no: r.sheet_no })
    const months = new Set<number>()
    for (const m of r.monthly) {
      months.add(m.month)
      const ex = dbRevByKey.get(`${p.id}|${m.month}`)
      if (ex && Number(ex.amount) === m.amount) unchanged++
      else upsert.push({ project_id: p.id, customer_id: p.customer_id, year: YEAR, month: m.month, amount: m.amount, is_confirmed: true, _name: `${r.company} / ${projectName}`, _old: ex ? Number(ex.amount) : null })
    }
    for (let m = 1; m <= 12; m++) { const ex = dbRevByKey.get(`${p.id}|${m}`); if (ex && !months.has(m)) deleteRevs.push({ ...ex, _name: `${r.company} / ${projectName}` }) }
  }
  // 시트에 없는데 CRM 에 올해 매출이 있는 프로젝트 (손으로 만든 프로젝트 포함) — 지우지 않고 이름·금액만 알림
  const orphanSum = new Map<string, number>()
  for (const r of dbRevs) if (!seen.has(r.project_id)) orphanSum.set(r.project_id, (orphanSum.get(r.project_id) || 0) + Number(r.amount))
  const orphanIds = Array.from(orphanSum.keys()).filter(id => orphanSum.get(id))
  const orphanInfo = new Map<string, { project_name: string; customers: { company_name: string } | null }>()
  for (let i = 0; i < orphanIds.length; i += 200) {
    const { data } = await sb.from('projects').select('id, project_name, customers(company_name)').in('id', orphanIds.slice(i, i + 200))
    for (const d of (data || []) as unknown as { id: string; project_name: string; customers: { company_name: string } | null }[]) orphanInfo.set(d.id, d)
  }
  const orphans = orphanIds.map(id => ({ id, sum: orphanSum.get(id)!, name: `${orphanInfo.get(id)?.customers?.company_name || '?'} / ${orphanInfo.get(id)?.project_name || id}` })).sort((a, b) => b.sum - a.sum)
  const missingInSheet = orphans.length
  const sheetSum = sheetMonth.reduce((a, b) => a + b, 0), dbSum = dbMonth.reduce((a, b) => a + b, 0)
  const newRevCells = newProjects.reduce((a, n) => a + n.r.monthly.length, 0)

  const summary = { rows: rows.length, newCustomers: missCustomers.length, newProjects: newProjects.length, newRevCells, changed: upsert.length, deleted: deleteRevs.length, unchanged, renamed: renamed.length, missingInSheet, missingSum: orphans.reduce((a, o) => a + o.sum, 0), sheetSum, dbSum, diff: sheetSum - dbSum }
  const samples = [
    ...upsert.slice(0, 8).map(u => `${u.month}월 ${u._name}: ${u._old == null ? '없음' : won(u._old)} → ${won(u.amount)}`),
    ...deleteRevs.slice(0, 4).map(d => `${d.month}월 ${d._name}: ${won(Number(d.amount))} → 0`),
    ...newProjects.slice(0, 4).map(n => `+ ${n.r.company} / ${n.projectName}`),
    ...orphans.slice(0, 12).map(o => `시트에 없음 · ${o.name}: 올해 ${won(o.sum)}`),
  ]
  // 안전 2: 평소보다 크게 바뀌면 멈춤 (시트에서 행을 지우거나 열이 밀린 경우)
  const held = badMonths.length ? `시트 합계 행과 읽은 값이 다름 (${badMonths.join('·')}월) — 열·행 확인`
    : deleteRevs.length > 60 ? `지울 매출 ${deleteRevs.length}칸 — 시트 확인 필요`
    : dbSum > 0 && Math.abs(sheetSum - dbSum) / dbSum > 0.05 ? `올해 합계가 ${((sheetSum - dbSum) / dbSum * 100).toFixed(1)}% 바뀜 — 시트 확인 필요`
    : missCustomers.length > 20 ? `새 고객 ${missCustomers.length}곳 — 회사명 확인 필요` : undefined
  if (!apply || (held && !force)) return { name: '매출', ok: true, held, summary, samples }

  // ── 반영 ── (되돌리기용: 바뀌는 칸의 이전 값)
  const backup = { changed: upsert.filter(u => u._old != null).map(u => ({ project_id: u.project_id, month: u.month, amount: u._old })), deleted: deleteRevs.map(({ _name, ...d }) => d), renamed: renamed.map(r => ({ id: r.id, from: r.from })) }
  let fail = 0
  for (const name of missCustomers) {
    const { data, error } = await sb.from('customers').insert({ company_name: name, status: 'active', notes: '매출 시트에서 자동 생성' }).select('id').single()
    if (error) { fail++; continue }
    ci.add(name, data.id)
  }
  const revFromNew: typeof upsert = []
  let projCreated = 0
  for (const n of newProjects) {
    const custId = n.custId || ci.find(n.r.company); if (!custId) { fail++; continue }
    const { data, error } = await sb.from('projects').insert({
      customer_id: custId, project_name: n.projectName, service_type: n.dbSvc, site_category: n.r.site_category, site_category2: n.r.site_category2,
      project_start: n.r.proj_start, project_end: n.r.proj_end, billing_start: n.r.bill_start, billing_end: n.r.bill_end,
      notes: n.r.notes, status: 'active', source: 'excel_backfill', sheet_no: n.r.sheet_no, sheet_year: YEAR,
    }).select('id').single()
    if (error) { fail++; continue }
    projCreated++
    for (const m of n.r.monthly) revFromNew.push({ project_id: data.id, customer_id: custId, year: YEAR, month: m.month, amount: m.amount, is_confirmed: true, _name: '', _old: null })
  }
  const ups = [...upsert, ...revFromNew].map(({ _name, _old, ...u }) => u) // eslint-disable-line @typescript-eslint/no-unused-vars
  for (let i = 0; i < ups.length; i += 500) { const { error } = await sb.from('monthly_revenues').upsert(ups.slice(i, i + 500), { onConflict: 'project_id,year,month' }); if (error) throw new Error('매출 반영 실패: ' + error.message) }
  const ids = deleteRevs.map(d => d.id)
  for (let i = 0; i < ids.length; i += 200) { const { error } = await sb.from('monthly_revenues').delete().in('id', ids.slice(i, i + 200)); if (error) throw new Error('매출 삭제 실패: ' + error.message) }
  for (const x of renamed) { const { error } = await sb.from('projects').update({ project_name: x.to, service_type: x.service_type }).eq('id', x.id); if (error) fail++ }
  for (const s of seqUpdate) await sb.from('projects').update({ sheet_no: s.sheet_no, sheet_year: YEAR }).eq('id', s.id)
  // 검증: 반영 뒤 DB 월 합계 = 시트 (시트에 없어진 프로젝트 매출 몫은 차이로 남을 수 있음)
  const after = await fetchAll<{ month: number; amount: number }>(sb, 'monthly_revenues', 'month, amount', q => q.eq('year', YEAR))
  const am = Array(12).fill(0); for (const r of after) am[r.month - 1] += Number(r.amount)
  const off = am.map((v, m) => Math.abs(v - sheetMonth[m]) >= 1 ? m + 1 : 0).filter(Boolean)
  return { name: '매출', ok: fail === 0, summary: { ...summary, projCreated, fail, afterSum: am.reduce((a, b) => a + b, 0), offMonths: off }, samples, backup }
}

