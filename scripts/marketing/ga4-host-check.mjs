// GA4: 호스트·랜딩 경로별 세션 분포 (앱/마케팅 분리 기준 검증용)
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
let credentials; try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] })
const ga = google.analyticsdata({ version: 'v1beta', auth })
const property = 'properties/' + (process.env.GA4_PROPERTY_ID || '455467446')
const range = [{ startDate: '2026-09-01', endDate: '2026-10-11' }]
const r = await ga.properties.runReport({ property, requestBody: {
  dateRanges: range, dimensions: [{ name: 'hostName' }, { name: 'landingPage' }, { name: 'sessionDefaultChannelGroup' }],
  metrics: [{ name: 'sessions' }], limit: 10000 } })
const MKT = p => p === '/' || /^\/(blog|pages|products|en)\//.test(p) || p === '/contact' || p === '/en'
const host = {}, seg = { 마케팅: 0, 'www 기타경로': 0, 앱: 0, 기타호스트: 0 }, wwwOther = {}, direct = { 마케팅: 0, 'www 기타경로': 0, 앱: 0, 기타호스트: 0 }
for (const row of r.data.rows || []) {
  const [h, lp, ch] = row.dimensionValues.map(d => d.value); const s = Number(row.metricValues[0].value)
  host[h] = (host[h] || 0) + s
  const k = h === 'www.caas.works' ? (MKT(lp) ? '마케팅' : 'www 기타경로') : h === 'app.caas.works' ? '앱' : '기타호스트'
  seg[k] += s; if (ch === 'Direct') direct[k] += s
  if (k === 'www 기타경로') { const top = lp.split('/').slice(0, 2).join('/') || '/'; wwwOther[top] = (wwwOther[top] || 0) + s }
}
console.log('기간 2026-09-01~10-11 세션')
console.log('호스트별:', Object.entries(host).sort((a, b) => b[1] - a[1]).slice(0, 10))
console.log('구분별:', seg)
console.log('직접 유입(Direct) 구분별:', direct)
console.log('www 의 목록 밖 경로 (상위):', Object.entries(wwwOther).sort((a, b) => b[1] - a[1]).slice(0, 20))
