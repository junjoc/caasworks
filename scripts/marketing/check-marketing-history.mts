// 연간 현황표 파서 검증: 월 요약 합계 vs 상세 합계 (2026-10-20)
// usage: npx tsx --tsconfig tsconfig.json scripts/marketing/check-marketing-history.mts backups/marketing-history/2025.xlsx ...
import { readFileSync } from 'fs'
import { parseMarketingYearFile } from '../../src/lib/marketing-history'
for (const f of process.argv.slice(2)) {
  const p = parseMarketingYearFile(readFileSync(f))
  const S = (k: keyof typeof p.summary[0]) => p.summary.reduce((a, s) => a + (Number(s[k]) || 0), 0)
  const D = (k: keyof typeof p.details[0]) => p.details.reduce((a, d) => a + (Number(d[k]) || 0), 0)
  console.log(`=== ${p.year}  요약 ${p.summary.length}개월 (${p.summary.map(s => s.month).join(',')})  상세 ${p.details.length}행  경고 ${p.warnings.length}`)
  console.log(`  요약: 광고비 ${S('cost_total').toLocaleString()} (구글 ${S('cost_google').toLocaleString()} 메타 ${S('cost_meta').toLocaleString()} 네이버 ${S('cost_naver').toLocaleString()} 기타 ${S('cost_other').toLocaleString()}) 가입 ${S('signups')} 문의 ${S('inquiries')} (유료 ${S('inquiries_paid')} 바이럴 ${S('inquiries_viral')}) 도입 ${S('adoptions')} 미팅 ${S('meetings')} 매출 ${S('revenue').toLocaleString()} 예산 ${S('budget_total').toLocaleString()}`)
  console.log(`  상세: 비용 ${D('cost').toLocaleString()} 노출 ${D('impressions').toLocaleString()} 클릭 ${D('clicks').toLocaleString()} 가입 ${D('signups')} 문의 ${D('inquiries')} 도입 ${D('adoptions')} 미팅 ${D('meetings')}`)
  const byType = new Map<string, number>(); for (const d of p.details) byType.set(`${d.ad_type}/${d.channel}`, (byType.get(`${d.ad_type}/${d.channel}`) || 0) + d.cost)
  console.log('  유형/채널 비용:', Array.from(byType).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' | '))
  for (const w of p.warnings) console.log('  ⚠', w)
  console.log('  샘플:', JSON.stringify(p.summary[0]), '\n        ', JSON.stringify(p.details[0]))
}
