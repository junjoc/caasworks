import { NextResponse } from 'next/server'
import { google } from 'googleapis'

const CALENDAR_ID = 'c_036pj2g4597caud3s5i654hcts@group.calendar.google.com'

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials: any
  try {
    // Try direct JSON parse first
    credentials = JSON.parse(raw)
  } catch {
    // If that fails, try base64 decode
    credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  })
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const filter = searchParams.get('filter') || 'all' // all | vacation | work

    const auth = getAuth()
    const calendar = google.calendar({ version: 'v3', auth })

    const timeMin = new Date(year, month - 1, 1).toISOString()
    const timeMax = new Date(year, month, 0, 23, 59, 59).toISOString()

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })

    const events = (res.data.items || []).map((event) => {
      const summary = event.summary || ''
      // Parse name from [이름] pattern
      const nameMatch = summary.match(/\[(.+?)\]/)
      const name = nameMatch ? nameMatch[1] : null

      // Determine event type
      let type: 'vacation' | 'remote' | 'meeting' | 'other' = 'other'
      if (summary.includes('🌴') || summary.includes('휴가')) type = 'vacation'
      else if (summary.includes('🧑‍💻') || summary.includes('원격')) type = 'remote'
      else if (summary.includes('미팅') || summary.includes('교육')) type = 'meeting'

      return {
        id: event.id,
        title: summary,
        name,
        type,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        allDay: !!event.start?.date,
        description: event.description || null,
      }
    })

    // Filter
    let filtered = events
    if (filter === 'vacation') {
      filtered = events.filter(e => e.type === 'vacation')
    } else if (filter === 'work') {
      filtered = events.filter(e => e.type === 'remote')
    }

    return NextResponse.json({ events: filtered, total: filtered.length })
  } catch (error: any) {
    console.error('Calendar API error:', error.message)
    return NextResponse.json({ events: [], total: 0, error: error.message }, { status: 500 })
  }
}
