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
try {
  const r = await ga.properties.runReport({ property, requestBody: { dateRanges: [{ startDate: '2026-09-01', endDate: '2026-10-11' }], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], dimensionFilter: mkt } })
  console.log('요청 안 한 항목으로 거르기: 가능')
  for (const row of r.data.rows) console.log(`  ${row.dimensionValues[0].value}: ${row.metricValues[0].value}`)
} catch (e) { console.log('불가:', e.message.slice(0, 200)) }
