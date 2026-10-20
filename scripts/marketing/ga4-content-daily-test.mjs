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
const r = await ga.properties.runReport({ property, requestBody: { dateRanges: [{ startDate: '2026-01-01', endDate: '2026-10-20' }],
  dimensions: [{ name: 'date' }, { name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'activeUsers' }],
  dimensionFilter: { andGroup: { expressions: [f('hostName', 'EXACT', 'www.caas.works'), f('pagePath', 'BEGINS_WITH', '/blog/')] } }, limit: '100000' } })
const rows = r.data.rows || []
console.log('rows', rows.length, 'rowCount', r.data.rowCount)
const paths = new Set(rows.map(x => x.dimensionValues[1].value)); console.log('paths', paths.size)
const oct = rows.filter(x => x.dimensionValues[0].value >= '20261001' && x.dimensionValues[0].value <= '20261019')
const byP = {}; for (const x of oct) { const p = x.dimensionValues[1].value; byP[p] = (byP[p] || 0) + +x.metricValues[0].value }
console.log('10/1~19 글 수', Object.keys(byP).length, '조회 합', Object.values(byP).reduce((a, b) => a + b, 0))
