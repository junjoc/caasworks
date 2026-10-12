import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
let credentials; try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
const ga = google.analyticsdata({ version: 'v1beta', auth: new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] }) })
const property = 'properties/' + (process.env.GA4_PROPERTY_ID || '455467446')
const f = (field, matchType, value) => ({ filter: { fieldName: field, stringFilter: { matchType, value } } })
const mkt = { andGroup: { expressions: [f('hostName', 'EXACT', 'www.caas.works'), { orGroup: { expressions: [
  f('landingPage', 'EXACT', '/'), f('landingPage', 'EXACT', '/contact'), f('landingPage', 'EXACT', '/en'), f('landingPage', 'EXACT', '/blog'),
  f('landingPage', 'BEGINS_WITH', '/blog/'), f('landingPage', 'BEGINS_WITH', '/pages/'), f('landingPage', 'BEGINS_WITH', '/products/'), f('landingPage', 'BEGINS_WITH', '/en/'),
] } }] } }
// 블로그 유입 세션을 pageReferrer 로 자사(caasworks)/외주 구분할 수 있는지 확인 (2026-10-12)
const base = { dateRanges: [{ startDate: '2026-07-01', endDate: '2026-10-11' }], metrics: [{ name: 'sessions' }] }
const srcF = { andGroup: { expressions: [mkt, f('sessionSource', 'CONTAINS', 'blog.naver')] } }
const a = await ga.properties.runReport({ property, requestBody: { ...base, dimensions: [{ name: 'sessionSource' }], dimensionFilter: srcF } })
console.log('세션 소스 기준:', a.data.rows?.map(r => `${r.dimensionValues[0].value} ${r.metricValues[0].value}`))
const b = await ga.properties.runReport({ property, requestBody: { ...base, dimensions: [{ name: 'pageReferrer' }], dimensionFilter: srcF, limit: '1000' } })
const agg = {}
for (const r of b.data.rows || []) {
  const ref = r.dimensionValues[0].value; const n = +r.metricValues[0].value
  const k = /blog\.naver\.com\/(PostView\.naver\?blogId=)?caasworks/i.test(ref) ? '자사' : /blog\.naver\.com/.test(ref) ? '외주(' + (ref.match(/blog\.naver\.com\/(?:PostView\.naver\?blogId=)?([^/?&]+)/)?.[1]) + ')' : ref.includes('caas.works') ? '내부' : ref || '(빈값)'
  agg[k] = (agg[k] || 0) + n
}
console.log(Object.entries(agg).sort((x, y) => y[1] - x[1]).slice(0, 30))
