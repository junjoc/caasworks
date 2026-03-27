'use client'

import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer'

Font.register({
  family: 'NotoSansKR',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-400-normal.ttf', fontWeight: 400 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-500-normal.ttf', fontWeight: 500 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-700-normal.ttf', fontWeight: 700 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-600-normal.ttf', fontWeight: 600 },
  ],
})

const BLUE = '#0a54bf'
const BLUE_LIGHT = '#e8f0fe'
const DARK = '#1a1a2e'

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: 'NotoSansKR', fontSize: 8, color: '#222' },
  // Top blue line
  topLine: { height: 3, backgroundColor: BLUE, marginBottom: 12 },
  // Logo
  logoRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  logo: { height: 28 },
  // Title
  title: { fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 16, letterSpacing: 4 },
  // Info grid
  infoSection: { flexDirection: 'row', marginBottom: 10, gap: 0 },
  infoLeft: { flex: 1 },
  infoRight: { flex: 1 },
  infoRow: { flexDirection: 'row', borderBottom: '0.5pt solid #e0e0e0', minHeight: 22 },
  infoLabel: {
    width: 70, fontWeight: 600, fontSize: 7.5, color: '#fff', backgroundColor: BLUE,
    paddingVertical: 5, paddingHorizontal: 8, justifyContent: 'center', textAlign: 'center',
    letterSpacing: 3,
  },
  infoValue: { flex: 1, fontSize: 8, paddingVertical: 5, paddingHorizontal: 8, borderRight: '0.5pt solid #e0e0e0' },
  // Warning
  warningText: { fontSize: 7.5, color: '#d32f2f', marginBottom: 12, lineHeight: 1.5 },
  // Intro
  introText: { fontSize: 8.5, marginBottom: 6, fontWeight: 500 },
  // Table
  table: { marginTop: 0 },
  tHead: { flexDirection: 'row', backgroundColor: BLUE },
  tHeadCell: { paddingVertical: 6, paddingHorizontal: 4, justifyContent: 'center' },
  tHeadText: { fontWeight: 600, fontSize: 7.5, textAlign: 'center', color: '#fff' },
  tRow: { flexDirection: 'row', borderBottom: '0.5pt solid #e0e0e0', minHeight: 24 },
  tCell: { paddingVertical: 4, paddingHorizontal: 4, justifyContent: 'center', borderRight: '0.5pt solid #eee' },
  // Column widths
  colNo: { width: 24 },
  colSite: { width: 140 },
  colService: { width: 80 },
  colPeriod: { width: 40 },
  colQty: { width: 30 },
  colPrice: { width: 55 },
  colAmount: { width: 60 },
  colNote: { width: 80 },
  // Total section
  totalSection: { marginTop: 0 },
  totalRow: { flexDirection: 'row', borderBottom: '0.5pt solid #e0e0e0', minHeight: 28 },
  totalLabel: { flex: 1, fontWeight: 700, fontSize: 10, textAlign: 'center', paddingVertical: 6 },
  totalValue: { width: 160, textAlign: 'right', fontSize: 10, fontWeight: 700, paddingVertical: 6, paddingRight: 8 },
  totalRowFinal: {
    flexDirection: 'row', backgroundColor: DARK, minHeight: 34,
  },
  totalLabelFinal: { flex: 1, fontWeight: 700, fontSize: 12, textAlign: 'center', paddingVertical: 8, color: '#fff', letterSpacing: 4 },
  totalValueFinal: { width: 160, textAlign: 'right', fontSize: 14, fontWeight: 700, paddingVertical: 8, paddingRight: 8, color: '#fff' },
  // Footer
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingTop: 8 },
  footerLeft: { fontSize: 7.5, color: '#666', lineHeight: 1.5 },
  footerRight: { fontSize: 7.5, color: '#666', textAlign: 'right', lineHeight: 1.5 },
})

function fmt(n: number) {
  return n.toLocaleString('ko-KR')
}

interface InvoicePDFData {
  invoice_number: string
  year: number
  month: number
  created_at: string
  customer_name: string
  receiver_contact: string
  due_date: string
  bank_info: string
  sender_company: string
  sender_biz_no: string
  sender_ceo: string
  sender_address: string
  sender_contact_name: string
  sender_contact_info: string
  subtotal: number
  vat: number
  total: number
  items: {
    project_name: string
    service_type: string
    period: string
    quantity: number
    unit_price: number
    amount: number
    notes: string
  }[]
  logo_url?: string
}

export function InvoicePDFDocument({ data }: { data: InvoicePDFData }) {
  // Group items by project_name for merged cells
  const groupedItems: { siteName: string; services: typeof data.items; rowSpan: number }[] = []
  let lastSite = ''
  for (const item of data.items) {
    if (item.project_name !== lastSite) {
      groupedItems.push({ siteName: item.project_name, services: [item], rowSpan: 1 })
      lastSite = item.project_name
    } else {
      const last = groupedItems[groupedItems.length - 1]
      last.services.push(item)
      last.rowSpan++
    }
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Top blue line */}
        <View style={s.topLine} />

        {/* Logo */}
        {data.logo_url ? (
          <View style={s.logoRow}>
            <Image src={data.logo_url} style={s.logo} />
          </View>
        ) : (
          <View style={s.logoRow}>
            <Text style={{ fontSize: 14, fontWeight: 700, color: BLUE, letterSpacing: 2 }}>CaasWorks</Text>
          </View>
        )}

        {/* Title */}
        <Text style={s.title}>카스웍스 이용료 청구서</Text>

        {/* Info section */}
        <View style={s.infoSection}>
          <View style={s.infoLeft}>
            {[
              ['청 구 월', `${data.year}년 ${data.month}월 청구분`],
              ['청 구 일', data.created_at],
              ['수 신 처', data.customer_name],
              ['수 신 자', data.receiver_contact || '담당자'],
              ['납 부 기 한', data.due_date ? `${data.due_date} 까지` : '-'],
              ['납 부 계 좌', data.bank_info || '-'],
            ].map(([label, value], i) => (
              <View key={i} style={s.infoRow}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={s.infoRight}>
            {[
              ['상 호', data.sender_company || '(주)아이콘'],
              ['사업자등록번호', data.sender_biz_no || '153-87-01774'],
              ['대 표 자', data.sender_ceo || '김종민'],
              ['주 소', data.sender_address || '서울특별시 강남구 도곡로7길 6 한은빌딩 2층'],
              ['청 구 담 당 자', data.sender_contact_name || ''],
              ['연 락 처', data.sender_contact_info || ''],
            ].map(([label, value], i) => (
              <View key={i} style={s.infoRow}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Warning */}
        <Text style={s.warningText}>
          정해진 기한 내 입금이 이루어지지 않을 경우, 서비스 이용 권한이 자동으로 중지됩니다.
        </Text>

        {/* Intro */}
        <Text style={s.introText}>아래와 같이 청구합니다.</Text>

        {/* Table */}
        <View style={s.table}>
          <View style={s.tHead}>
            {[
              { label: 'No', style: s.colNo },
              { label: '현장명', style: s.colSite },
              { label: '서비스', style: s.colService },
              { label: '기간', style: s.colPeriod },
              { label: '수량', style: s.colQty },
              { label: '단가', style: s.colPrice },
              { label: '합계', style: s.colAmount },
              { label: '비고', style: s.colNote },
            ].map((col, i) => (
              <View key={i} style={[s.tHeadCell, col.style]}>
                <Text style={s.tHeadText}>{col.label}</Text>
              </View>
            ))}
          </View>

          {groupedItems.map((group, gi) => (
            group.services.map((item, si) => (
              <View key={`${gi}-${si}`} style={s.tRow}>
                {si === 0 && (
                  <>
                    <View style={[s.tCell, s.colNo]}>
                      <Text style={{ textAlign: 'center', fontSize: 7.5 }}>{gi + 1}</Text>
                    </View>
                    <View style={[s.tCell, s.colSite]}>
                      <Text style={{ fontSize: 7.5 }}>{group.siteName}</Text>
                    </View>
                  </>
                )}
                {si > 0 && (
                  <>
                    <View style={[s.tCell, s.colNo]} />
                    <View style={[s.tCell, s.colSite]} />
                  </>
                )}
                <View style={[s.tCell, s.colService]}>
                  <Text style={{ textAlign: 'center', fontSize: 7.5 }}>{item.service_type}</Text>
                </View>
                <View style={[s.tCell, s.colPeriod]}>
                  <Text style={{ textAlign: 'center', fontSize: 7 }}>{item.period || '1'}</Text>
                </View>
                <View style={[s.tCell, s.colQty]}>
                  <Text style={{ textAlign: 'center', fontSize: 7.5 }}>{item.quantity}</Text>
                </View>
                <View style={[s.tCell, s.colPrice]}>
                  <Text style={{ textAlign: 'right', fontSize: 7.5 }}>{fmt(item.unit_price)}</Text>
                </View>
                <View style={[s.tCell, s.colAmount]}>
                  <Text style={{ textAlign: 'right', fontSize: 7.5 }}>{fmt(item.amount)}</Text>
                </View>
                <View style={[s.tCell, s.colNote]}>
                  <Text style={{ fontSize: 6.5, color: '#666' }}>{item.notes}</Text>
                </View>
              </View>
            ))
          ))}
        </View>

        {/* Totals */}
        <View style={s.totalSection}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>공급가</Text>
            <Text style={s.totalValue}>{fmt(data.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>VAT</Text>
            <Text style={s.totalValue}>{fmt(data.vat)}</Text>
          </View>
          <View style={s.totalRowFinal}>
            <Text style={s.totalLabelFinal}>총 합계</Text>
            <Text style={s.totalValueFinal}>{fmt(data.total)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View>
            <Text style={s.footerLeft}>공정관리 / 안전관리 / 영상관리는</Text>
            <Text style={s.footerLeft}>카스웍스 하나로.</Text>
          </View>
          <View>
            <Text style={s.footerRight}>스마트 건설 솔루션, 카스웍스</Text>
            <Text style={s.footerRight}>1666-1967</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
