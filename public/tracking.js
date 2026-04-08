/**
 * CaaS.Works Site Tracking Script v1.0
 *
 * 사용법: 사이트 <head>에 아래 한 줄 추가
 * <script src="https://crm.caasworks.com/tracking.js" data-endpoint="https://crm.caasworks.com/api/tracking" defer></script>
 *
 * 자동 수집 항목:
 * - 세션 (UTM, 레퍼러, 디바이스, 랜딩페이지)
 * - 페이지뷰 (URL, 제목, 체류시간, 스크롤 깊이)
 * - CTA 클릭 (data-cta 속성이 있는 요소)
 * - 문의 폼 이벤트 (data-track-form 속성이 있는 폼)
 */
;(function() {
  'use strict'

  // ── 설정 ──
  var script = document.currentScript
  var ENDPOINT = (script && script.getAttribute('data-endpoint')) || '/api/tracking'

  // ── 유틸리티 ──
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  }

  function getOrSet(key, generator) {
    var val = localStorage.getItem(key)
    if (!val) { val = generator(); localStorage.setItem(key, val) }
    return val
  }

  function getUTM() {
    var params = new URLSearchParams(window.location.search)
    return {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content'),
      utm_term: params.get('utm_term'),
    }
  }

  function getDevice() {
    var ua = navigator.userAgent
    var mobile = /Mobile|Android|iPhone|iPad/.test(ua)
    var tablet = /iPad|Tablet/.test(ua)
    var browser = /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : /Edge/.test(ua) ? 'Edge' : 'Other'
    var os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Other'
    return {
      device_type: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop',
      browser: browser,
      os: os,
      screen_resolution: screen.width + 'x' + screen.height,
    }
  }

  function send(type, payload) {
    var data = JSON.stringify({ type: type, payload: payload })
    // Use sendBeacon for unload events, fetch otherwise
    if (type === 'end_session' || type === 'update_pageview') {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, data)
        return
      }
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      keepalive: true,
    }).catch(function() {})
  }

  // ── 세션/방문자 관리 ──
  var visitorId = getOrSet('cw_vid', uuid)
  var sessionId = sessionStorage.getItem('cw_sid')
  var isNewSession = !sessionId
  if (!sessionId) {
    sessionId = uuid()
    sessionStorage.setItem('cw_sid', sessionId)
  }

  var pageCount = parseInt(sessionStorage.getItem('cw_pc') || '0')
  var sessionStart = parseInt(sessionStorage.getItem('cw_ss') || Date.now().toString())
  if (isNewSession) sessionStorage.setItem('cw_ss', sessionStart.toString())

  // ── 세션 시작 ──
  if (isNewSession) {
    var utm = getUTM()
    var device = getDevice()
    send('session', Object.assign({
      session_id: sessionId,
      visitor_id: visitorId,
      referrer: document.referrer || null,
      landing_page: window.location.pathname,
    }, utm, device))
  }

  // ── 페이지뷰 ──
  pageCount++
  sessionStorage.setItem('cw_pc', pageCount.toString())
  var pageviewStart = Date.now()
  var maxScroll = 0

  send('pageview', {
    session_id: sessionId,
    visitor_id: visitorId,
    page_url: window.location.pathname + window.location.search,
    page_title: document.title,
    page_count: pageCount,
  })

  // ── 스크롤 깊이 추적 ──
  function getScrollDepth() {
    var h = document.documentElement.scrollHeight - window.innerHeight
    if (h <= 0) return 100
    return Math.round((window.scrollY / h) * 100)
  }

  window.addEventListener('scroll', function() {
    var depth = getScrollDepth()
    if (depth > maxScroll) maxScroll = depth
  }, { passive: true })

  // ── CTA 클릭 추적 ──
  // data-cta="hero" 같은 속성이 있는 요소 클릭 시 자동 추적
  document.addEventListener('click', function(e) {
    var el = e.target
    // 최대 5단계 부모까지 탐색
    for (var i = 0; i < 5 && el && el !== document; i++) {
      var cta = el.getAttribute && el.getAttribute('data-cta')
      if (cta) {
        send('event', {
          session_id: sessionId,
          visitor_id: visitorId,
          event_type: 'cta_click',
          event_data: { location: cta, text: el.textContent.trim().substring(0, 100) },
          page_url: window.location.pathname,
        })
        break
      }
      el = el.parentElement
    }
  })

  // ── 문의 폼 추적 ──
  // data-track-form 속성이 있는 폼을 자동 추적
  function trackForms() {
    var forms = document.querySelectorAll('[data-track-form]')
    forms.forEach(function(form) {
      if (form._cwTracked) return
      form._cwTracked = true
      var formName = form.getAttribute('data-track-form') || 'inquiry'
      var started = false

      // 폼 필드 포커스 = 작성 시작
      form.addEventListener('focusin', function() {
        if (!started) {
          started = true
          send('event', {
            session_id: sessionId,
            visitor_id: visitorId,
            event_type: 'form_start',
            event_data: { form: formName },
            page_url: window.location.pathname,
          })
        }
      })

      // 개별 필드 입력 완료 추적
      form.addEventListener('change', function(e) {
        var field = e.target
        var name = field.name || field.id || 'unknown'
        send('event', {
          session_id: sessionId,
          visitor_id: visitorId,
          event_type: 'form_field',
          event_data: { form: formName, field: name, filled: !!field.value },
          page_url: window.location.pathname,
        })
      })

      // 폼 제출
      form.addEventListener('submit', function() {
        send('event', {
          session_id: sessionId,
          visitor_id: visitorId,
          event_type: 'form_submit',
          event_data: {
            form: formName,
            customer_code: form.querySelector('[name="customer_code"]')?.value || null,
          },
          page_url: window.location.pathname,
        })
      })
    })
  }

  // 초기 + 동적 폼 대응
  trackForms()
  if (window.MutationObserver) {
    new MutationObserver(trackForms).observe(document.body, { childList: true, subtree: true })
  }

  // ── 페이지 이탈 시 체류시간/스크롤 전송 ──
  function onLeave() {
    var duration = Math.round((Date.now() - pageviewStart) / 1000)
    send('end_session', {
      session_id: sessionId,
      duration_seconds: Math.round((Date.now() - sessionStart) / 1000),
      page_count: pageCount,
    })
    // 스크롤 이벤트 (25% 단위)
    if (maxScroll >= 25) {
      send('event', {
        session_id: sessionId,
        visitor_id: visitorId,
        event_type: 'scroll',
        event_data: { depth: maxScroll, duration: duration },
        page_url: window.location.pathname,
      })
    }
  }

  window.addEventListener('beforeunload', onLeave)
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') onLeave()
  })

  // ── 외부 API: 수동 이벤트 전송 ──
  window.cwTrack = function(eventType, eventData) {
    send('event', {
      session_id: sessionId,
      visitor_id: visitorId,
      event_type: eventType,
      event_data: eventData || {},
      page_url: window.location.pathname,
    })
  }
})()
