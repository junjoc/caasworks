'use client'

import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer'

// Register Korean font - using Pretendard OTF (supported by @react-pdf/renderer)
const PRETENDARD_BASE = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static'
Font.register({
  family: 'Pretendard',
  fonts: [
    { src: `${PRETENDARD_BASE}/Pretendard-Regular.otf`, fontWeight: 400 },
    { src: `${PRETENDARD_BASE}/Pretendard-Medium.otf`, fontWeight: 500 },
    { src: `${PRETENDARD_BASE}/Pretendard-SemiBold.otf`, fontWeight: 600 },
    { src: `${PRETENDARD_BASE}/Pretendard-Bold.otf`, fontWeight: 700 },
  ],
})

// Disable hyphenation for Korean text
Font.registerHyphenationCallback((word) => [word])

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Pretendard', fontSize: 8, color: '#222' },
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  logo: { height: 30 },
  logoRight: { height: 30 },
  // Title
  title: { fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 16, letterSpacing: 2 },
  // Info grid
  infoSection: { flexDirection: 'row', marginBottom: 14, gap: 20 },
  infoLeft: { flex: 1 },
  infoRight: { flex: 1 },
  infoRow: { flexDirection: 'row', borderBottom: '0.5pt solid #ddd', paddingVertical: 3.5 },
  infoLabel: { width: 65, fontWeight: 600, fontSize: 7.5, color: '#555', letterSpacing: 3 },
  infoValue: { flex: 1, fontSize: 8 },
  // Table
  table: { marginTop: 4 },
  tHead: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderTop: '1pt solid #333', borderBottom: '0.5pt solid #999' },
  tRow: { flexDirection: 'row', borderBottom: '0.5pt solid #ddd', minHeight: 28 },
  tRowEmpty: { flexDirection: 'row', borderBottom: '0.5pt solid #eee', minHeight: 20 },
  tCell: { paddingVertical: 4, paddingHorizontal: 3, justifyContent: 'center' },
  tHeadCell: { paddingVertical: 5, paddingHorizontal: 3, justifyContent: 'center' },
  tHeadText: { fontWeight: 600, fontSize: 7, textAlign: 'center', color: '#333' },
  // Column widths (Template A: No, 구분, 품명, 상세, 단가, 수량, 단위, 기간, 공급방식, 공급가, 비고)
  // Total must fit 539pt (A4 595 - 28*2 padding)
  colNo: { width: 20 },
  colCategory: { width: 56 },
  colName: { width: 64 },
  colDesc: { width: 95 },
  colPrice: { width: 46 },
  colQty: { width: 24 },
  colUnit: { width: 24 },
  colPeriod: { width: 30 },
  colMethod: { width: 36 },
  colAmount: { width: 52 },
  colNote: { width: 62 },
  // Total
  totalRow: { flexDirection: 'row', borderTop: '1.5pt solid #333', borderBottom: '1.5pt solid #333', paddingVertical: 8, marginTop: 0 },
  totalLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: 6 },
  totalValue: { width: 200, textAlign: 'right', fontSize: 14, fontWeight: 700 },
  totalVat: { fontSize: 8, fontWeight: 400, color: '#666', marginLeft: 6 },
  // Footer
  footerSection: { marginTop: 14 },
  footerTitle: { fontSize: 8.5, fontWeight: 700, marginBottom: 4, borderBottom: '0.5pt solid #333', paddingBottom: 2 },
  footerText: { fontSize: 7.5, color: '#555', lineHeight: 1.6 },
  // Page footer
  pageFooter: { position: 'absolute', bottom: 20, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', borderTop: '0.5pt solid #ddd', paddingTop: 6 },
  pageFooterText: { fontSize: 6.5, color: '#999' },
})

function formatNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return ''
  return n.toLocaleString('ko-KR')
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

interface QuotationItem {
  item_no: number
  category: string | null
  item_name: string
  description: string | null
  unit_price: number | null
  quantity: number | null
  unit: string | null
  period_months: number | null
  supply_method: string | null
  amount: number | null
  notes: string | null
}

interface QuotationData {
  quotation_date: string | null
  recipient_company: string | null
  contact_person: string | null
  project_name: string | null
  validity: string | null
  quotation_type: string | null
  title: string | null
  total_amount: number | null
  discount_amount: number | null
  vat_amount: number | null
  final_amount: number | null
  notes: string | null
  assigned_user?: { name: string; phone?: string; email?: string } | null
  items: QuotationItem[]
  // Template config
  logo_left_url?: string | null
  logo_right_url?: string | null
  stamp_url?: string | null
  company?: { name: string; bizNo: string; ceo: string; address: string; phone: string; bank: string }
  footer_left?: string | null
  footer_right?: string | null
}

const DEFAULT_COMPANY = {
  name: '(주) 아이콘',
  bizNo: '153-87-01774',
  ceo: '김종민',
  address: '서울특별시 강남구 도곡로7길 6, 한은빌딩 2층',
  phone: '1666-1967',
  bank: '우리은행 | 1005-803-893041 | (주)아이콘',
}

export function TemplateA({ data }: { data: QuotationData }) {
  const co = data.company || DEFAULT_COMPANY
  const typeLabel = data.quotation_type === '구매' || data.quotation_type === 'purchase' ? '구매' : data.quotation_type === '임대' || data.quotation_type === 'rental' ? '임대' : data.quotation_type === '혼합' || data.quotation_type === 'mixed' ? '구매+임대' : data.quotation_type === '구독' || data.quotation_type === 'subscription' ? '구독' : ''
  const titleText = data.title || `카스웍스 서비스 단가리스트 ${typeLabel ? `(${typeLabel})` : ''}`
  const assignee = data.assigned_user
  const assigneeText = assignee ? `${assignee.name}${assignee.phone ? ` / ${assignee.phone}` : ''}${assignee.email ? ` / ${assignee.email}` : ''}` : ''

  // Dynamic row count: min rows to fill 1 page, but don't add too many empties
  const items = [...data.items]
  const dataCount = items.length
  const minRows = Math.max(dataCount + 2, 10) // at least 2 empty rows, min 10 total
  const maxRows = Math.min(minRows, 20) // cap at 20 to fit 1 page
  while (items.length < maxRows) {
    items.push({ item_no: items.length + 1, category: null, item_name: '', description: null, unit_price: null, quantity: null, unit: null, period_months: null, supply_method: null, amount: null, notes: null })
  }

  // Group by category to show merged rows
  let lastCat = ''

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header logos */}
        <View style={s.headerRow}>
          {data.logo_left_url ? (
            <Image src={data.logo_left_url} style={s.logo} />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: 700, color: '#1890ff', letterSpacing: 1 }}>CaasWorks</Text>
          )}
          {data.logo_right_url ? (
            <Image src={data.logo_right_url} style={s.logoRight} />
          ) : (
            <Text style={{ fontSize: 11, fontWeight: 700, color: '#123c80', letterSpacing: 1 }}>AICON</Text>
          )}
        </View>

        {/* Title */}
        <Text style={s.title}>{titleText}</Text>

        {/* Info section */}
        <View style={s.infoSection}>
          <View style={s.infoLeft}>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>견 적 일</Text>
              <Text style={s.infoValue}>{formatDate(data.quotation_date)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>수 신 처</Text>
              <Text style={s.infoValue}>{data.recipient_company || ''}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>담 당 자</Text>
              <Text style={s.infoValue}>{data.contact_person || ''}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>공 사 명</Text>
              <Text style={s.infoValue}>{data.project_name || titleText}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>유효기간</Text>
              <Text style={s.infoValue}>{data.validity || '견적일로부터 1개월'}</Text>
            </View>
          </View>
          <View style={s.infoRight}>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>상 호</Text>
              <Text style={s.infoValue}>{co.name}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>사업자번호</Text>
              <Text style={s.infoValue}>{co.bizNo}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>대 표 자</Text>
              <Text style={s.infoValue}>{co.ceo}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>주 소</Text>
              <Text style={s.infoValue}>{co.address}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>견적담당자</Text>
              <Text style={s.infoValue}>{assigneeText}</Text>
            </View>
          </View>
        </View>

        {/* Table */}
        <View style={s.table}>
          {/* Header */}
          <View style={s.tHead}>
            <View style={[s.tHeadCell, s.colNo]}><Text style={s.tHeadText}>No.</Text></View>
            <View style={[s.tHeadCell, s.colCategory]}><Text style={s.tHeadText}>구분</Text></View>
            <View style={[s.tHeadCell, s.colName]}><Text style={s.tHeadText}>품명</Text></View>
            <View style={[s.tHeadCell, s.colDesc]}><Text style={s.tHeadText}>상세</Text></View>
            <View style={[s.tHeadCell, s.colPrice]}><Text style={s.tHeadText}>단가</Text></View>
            <View style={[s.tHeadCell, s.colQty]}><Text style={s.tHeadText}>수량</Text></View>
            <View style={[s.tHeadCell, s.colUnit]}><Text style={s.tHeadText}>단위</Text></View>
            <View style={[s.tHeadCell, s.colPeriod]}><Text style={s.tHeadText}>기간(월)</Text></View>
            <View style={[s.tHeadCell, s.colMethod]}><Text style={s.tHeadText}>공급방식</Text></View>
            <View style={[s.tHeadCell, s.colAmount]}><Text style={s.tHeadText}>공급가</Text></View>
            <View style={[s.tHeadCell, s.colNote]}><Text style={s.tHeadText}>비고</Text></View>
          </View>

          {/* Rows */}
          {items.map((item, idx) => {
            const isEmpty = !item.item_name
            const showCat = item.category && item.category !== lastCat
            if (item.category) lastCat = item.category
            return (
              <View key={idx} style={isEmpty ? s.tRowEmpty : s.tRow}>
                <View style={[s.tCell, s.colNo]}>
                  <Text style={{ textAlign: 'center', fontSize: 7 }}>{showCat ? item.item_no : (isEmpty ? item.item_no : '')}</Text>
                </View>
                <View style={[s.tCell, s.colCategory]}>
                  <Text style={{ fontSize: 7 }}>{showCat ? item.category : ''}</Text>
                </View>
                <View style={[s.tCell, s.colName]}>
                  <Text style={{ fontSize: 7, fontWeight: item.item_name ? 500 : 400 }}>{item.item_name}</Text>
                </View>
                <View style={[s.tCell, s.colDesc]}>
                  <Text style={{ fontSize: 6.5, color: '#555' }}>{item.description || ''}</Text>
                </View>
                <View style={[s.tCell, s.colPrice]}>
                  <Text style={{ textAlign: 'right', fontSize: 7 }}>{formatNumber(item.unit_price)}</Text>
                </View>
                <View style={[s.tCell, s.colQty]}>
                  <Text style={{ textAlign: 'center', fontSize: 7 }}>{item.quantity || ''}</Text>
                </View>
                <View style={[s.tCell, s.colUnit]}>
                  <Text style={{ textAlign: 'center', fontSize: 7 }}>{item.unit || ''}</Text>
                </View>
                <View style={[s.tCell, s.colPeriod]}>
                  <Text style={{ textAlign: 'center', fontSize: 7 }}>{item.period_months || (isEmpty ? '' : '-')}</Text>
                </View>
                <View style={[s.tCell, s.colMethod]}>
                  <Text style={{ textAlign: 'center', fontSize: 7 }}>{item.supply_method || ''}</Text>
                </View>
                <View style={[s.tCell, s.colAmount]}>
                  <Text style={{ textAlign: 'right', fontSize: 7, fontWeight: 500 }}>{formatNumber(item.amount)}</Text>
                </View>
                <View style={[s.tCell, s.colNote]}>
                  <Text style={{ fontSize: 6, color: '#555' }}>{item.notes || ''}</Text>
                </View>
              </View>
            )
          })}
        </View>

        {/* Total */}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>합 계</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', width: 200 }}>
            <Text style={s.totalValue}>{formatNumber(data.total_amount)}</Text>
            <Text style={s.totalVat}>(부가세별도)</Text>
          </View>
        </View>

        {/* Footer notes */}
        <View style={s.footerSection}>
          <Text style={s.footerTitle}>견적안내</Text>
          <Text style={s.footerText}>
            {data.notes || '※ 상기 구성은 현장 여건 및 발주처 요청사항에 따라 일부 변경될 수 있습니다.'}
          </Text>
        </View>

        <View style={[s.footerSection, { marginTop: 8 }]}>
          <Text style={s.footerTitle}>계좌안내</Text>
          <Text style={s.footerText}>{co.bank}</Text>
        </View>

        {/* Page footer */}
        <View style={s.pageFooter}>
          <Text style={s.pageFooterText}>{data.footer_left || '공정관리 / 안전관리 / 영상관리를\n카스웍스 하나로.'}</Text>
          <Text style={[s.pageFooterText, { textAlign: 'right' }]}>{data.footer_right || '스마트 건설 플랫폼, 카스웍스'}{'\n'}{co.phone}</Text>
        </View>
      </Page>
    </Document>
  )
}
