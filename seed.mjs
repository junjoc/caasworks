import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lqoudbcuetrxemlkfkzv.supabase.co',
  'sb_publishable_hMEihd9xHDUh3GO7YczeHg_HIh1nojf'
)

// First sign in as admin to get authenticated session
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: 'cso@ai-con.co.kr',
  password: 'CaasWorks2026!'
})

if (authError) {
  console.error('Auth failed:', authError.message)
  process.exit(1)
}
console.log('✅ Authenticated as:', authData.user.email)

const ADMIN_ID = '5fd61389-55d4-47c9-9609-d1175ab0fdae'

// ============================================
// 1. INSERT ADMIN USER
// ============================================
console.log('\n📌 Inserting admin user...')
const { error: userErr } = await supabase.from('users').upsert({
  id: ADMIN_ID,
  email: 'cso@ai-con.co.kr',
  name: '관리자',
  role: 'admin',
  is_active: true
}, { onConflict: 'id' })
if (userErr) console.error('  User error:', userErr.message)
else console.log('  ✅ Admin user created')

// ============================================
// 2. INSERT CUSTOMERS
// ============================================
console.log('\n📌 Inserting customers...')
const customers = [
  { customer_code: '221080903', company_name: '그린홈예진', company_type: '종합건설사', contact_person: '손은태 주임', contact_phone: '010-4337-8979', contact_email: 'yejin@yejinhouse.com', billing_type: '프로젝트 선납', billing_start: '2021-08-09', user_count: 29, service_type: '플랫폼', status: 'active', invoice_email: 'yejin@yejinhouse.com' },
  { customer_code: '222081001', company_name: '디자인이음새주식회사', company_type: '인테리어/리모델링', contact_person: '마혜린 대리', contact_phone: '010-9313-9993', contact_email: 'ieumsae@ieumsae.net', billing_type: '구독(월간)', billing_start: '2022-08-10', user_count: 19, service_type: '플랫폼', status: 'active', invoice_email: 'ieumsae@ieumsae.net' },
  { customer_code: '221080906', company_name: '주식회사 피아크건설', company_type: '전문건설사', contact_person: '송준홍 차장', contact_phone: '010-9858-7539', contact_email: 'parccon@naver.com', billing_type: '월간 후불', billing_start: '2021-08-09', user_count: 11, service_type: '플랫폼', status: 'active', invoice_email: 'parccon@naver.com' },
  { customer_code: '222072501', company_name: '텐일레븐', company_type: '종합건설사', contact_person: '윤종철 이사', contact_phone: '010-2433-4872', contact_email: '1011@1011.co.kr', billing_type: '월간 후불', billing_start: '2022-07-25', user_count: 9, service_type: '플랫폼', status: 'active', invoice_email: '1011@1011.co.kr' },
  { customer_code: '222062801', company_name: '(주)에이치디건설', company_type: '종합건설사', contact_person: '주찬희 차장', contact_phone: '010-2688-4879', contact_email: 'hdmw@hanmail.net', billing_type: '구독(월간)', billing_start: '2022-06-28', user_count: 9, service_type: '플랫폼', status: 'active', invoice_email: 'hdmw@hanmail.net' },
  { customer_code: '220052501', company_name: '주식회사 위드라움', company_type: '종합건설사', contact_person: '정혜원 차장', contact_phone: '010-7722-6810', contact_email: 'wraum@naver.com', billing_type: '월간 후불', billing_start: '2020-05-25', user_count: 11, service_type: '플랫폼', status: 'active', invoice_email: 'wraum@naver.com' },
  { customer_code: '218061801', company_name: '(주)지아택건설', company_type: '종합건설사', contact_person: '한희정 차장', contact_phone: '010-3020-0578', contact_email: 'ziataek@naver.com', billing_type: '월간 후불', billing_start: '2018-06-18', user_count: 9, service_type: '플랫폼', status: 'active', invoice_email: 'ziataek@naver.com' },
  { customer_code: '220262201', company_name: '(주)스타시스건설', company_type: '종합건설사', contact_person: '황인일 이사', contact_phone: '010-4152-7708', contact_email: 'account@starsis.kr', billing_type: '월간 후불', billing_start: '2020-06-22', user_count: 13, service_type: '플랫폼', status: 'active', invoice_email: 'account@starsis.kr' },
  { customer_code: '222102001', company_name: '이든하임 주식회사', company_type: '종합건설사', contact_person: '정종현 차장', contact_phone: '010-7120-0120', contact_email: 'syjh111@edenheim.com', billing_type: '월간 후불', billing_start: '2022-10-20', user_count: 6, service_type: '플랫폼', status: 'active', invoice_email: 'syjh111@edenheim.com' },
  { customer_code: '323010601', company_name: '패스트파이브', company_type: '인테리어/리모델링', contact_person: '박재규 팀장', contact_phone: '010-3777-0414', contact_email: 'jk.park@fastfive.co.kr', billing_type: '월간 선납', billing_start: '2023-01-06', user_count: 9, service_type: '플랫폼', status: 'active', invoice_email: 'jk.park@fastfive.co.kr' },
  { customer_code: '222011601', company_name: '(주)예진종합건설', company_type: '종합건설사', contact_person: '손은태 주임', contact_phone: '010-4337-8979', contact_email: 'yejin@yejinhouse.com', billing_type: '프로젝트 선납', billing_start: '2022-11-16', user_count: 2, service_type: '플랫폼', status: 'active', invoice_email: 'yejin@yejinhouse.com' },
  { customer_code: '123013002', company_name: '유안종합건설(주)', company_type: '종합건설사', contact_person: '김성희 담당자', contact_phone: '010-7157-1009', contact_email: 'kkeulrim22@naver.com', billing_type: '월간 선납', billing_start: '2023-01-30', user_count: 10, service_type: '플랫폼', status: 'active', invoice_email: 'kkeulrim22@naver.com' },
  { customer_code: '123021701', company_name: '금영종합건설', company_type: '종합건설사', contact_person: '김종찬 소장', contact_phone: '010-4818-2877', contact_email: 'kycnc01@hanmail.net', billing_type: '월간 선납', billing_start: '2023-02-17', user_count: 8, service_type: '플랫폼', status: 'active', invoice_email: 'kycnc01@hanmail.net' },
  { customer_code: '123022001', company_name: '(주)종합건축사사무소시건축', company_type: '건축사사무소', contact_person: '장세희 팀장', contact_phone: '02-559-6741', contact_email: 'shjang.see@gmail.com', billing_type: '월간 선납', billing_start: '2023-02-20', user_count: 41, service_type: '플랫폼', status: 'active', invoice_email: 'shjang.see@gmail.com' },
  { customer_code: '323030301', company_name: '(사)한국해비타트', company_type: '기타', contact_person: '이다영 매니저', contact_phone: '010-2605-9519', contact_email: 'dylee@habitat.or.kr', billing_type: '월간 후불', billing_start: '2023-03-03', user_count: 89, service_type: '플랫폼', status: 'active', invoice_email: 'dylee@habitat.or.kr', notes: '50% 할인' },
  { customer_code: '223051801', company_name: '주식회사 파크종합건설', company_type: '종합건설사', contact_person: '장영재 부장', contact_phone: '010-4170-1478', contact_email: 'parkconst125@naver.com', billing_type: '카드', billing_start: '2023-05-18', user_count: 7, service_type: '플랫폼', status: 'active', invoice_email: 'parkconst125@naver.com' },
  { customer_code: '123052101', company_name: '(주)고감도', company_type: '인테리어/리모델링', contact_person: '이정훈 대리', contact_phone: '010-5065-0821', contact_email: 'ljh2828@kokamdo.co.kr', billing_type: '월간 선납', billing_start: '2023-05-21', user_count: 15, service_type: '플랫폼', status: 'active', invoice_email: 'kokamdo@kokamdo.co.kr' },
  { customer_code: '123071401', company_name: '(주)퍼시스', company_type: '인테리어/리모델링', contact_person: '한상근', contact_phone: '010-8606-9959', contact_email: 'sangkeun_han@fursys.com', billing_type: '월간 후불', billing_start: '2023-07-14', user_count: 60, service_type: '플랫폼', status: 'active', invoice_email: 'hyewon_min@fursys.com', notes: '20%할인 적용' },
  { customer_code: '223080201', company_name: '(주)다우이엔씨건설', company_type: '종합건설사', contact_person: '최경순 부장', contact_phone: '010-7248-9119', contact_email: 'dowenc@naver.com', billing_type: '월간 선납', billing_start: '2023-08-02', user_count: 5, service_type: '플랫폼', status: 'active', invoice_email: 'dowenc@naver.com' },
  { customer_code: '223080301', company_name: '다산건설엔지니어링(주)', company_type: '종합건설사', contact_person: '전길용 부장', contact_phone: '010-9075-4702', contact_email: 'dasan.const@gmail.com', billing_type: '월간 선납', billing_start: '2023-08-03', user_count: 10, service_type: '플랫폼', status: 'active', invoice_email: 'dasan.const@gmail.com' },
  { customer_code: '123101602', company_name: '우륭건설(주)', company_type: '종합건설사', contact_person: '이철균 공사과장', contact_phone: '010-2853-6787', contact_email: 'wooryung@hotmail.com', billing_type: '월간 후불', billing_start: '2023-10-16', user_count: 3, service_type: '플랫폼', status: 'active', invoice_email: 'wooryung@hotmail.com' },
  { customer_code: '123102501', company_name: '인종합건설', company_type: '종합건설사', contact_person: '정진욱 팀장', contact_phone: '010-9330-2488', contact_email: 'inc9700@hanmail.net', billing_type: '프로젝트 선납', billing_start: '2023-10-25', user_count: 34, service_type: '플랫폼', status: 'active', invoice_email: 'inc9700@hanmail.net' },
  { customer_code: '223121401', company_name: '제이세컨즈핸드', company_type: '인테리어/리모델링', contact_person: '정수한 대표', contact_phone: '010-4858-9440', contact_email: 'cooljyen@gmail.com', billing_type: '프로젝트 선납', billing_start: '2023-12-14', user_count: 2, service_type: '플랫폼', status: 'active', invoice_email: 'cooljyen@gmail.com' },
  { customer_code: '224022601', company_name: '주식회사인디언즈', company_type: '인테리어/리모델링', contact_person: '박성규 대표', contact_phone: '010-2038-6633', contact_email: 'indeans@naver.com', billing_type: '구독(월간)', billing_start: '2024-02-26', user_count: 10, service_type: '플랫폼', status: 'active', invoice_email: 'indeans@naver.com' },
  { customer_code: '422081801', company_name: '영민종합건설(주)', company_type: '종합건설사', contact_person: '장현정 과장', contact_phone: '010-5187-0521', contact_email: '7706500@naver.com', billing_type: '카드', billing_start: '2022-08-18', user_count: 8, service_type: '플랫폼', status: 'active', invoice_email: '7706500@naver.com' },
]

for (const c of customers) {
  c.assigned_to = ADMIN_ID
  const { error } = await supabase.from('customers').upsert(c, { onConflict: 'customer_code' })
  if (error) console.error(`  ❌ ${c.company_name}:`, error.message)
  else console.log(`  ✅ ${c.company_name}`)
}

// ============================================
// 3. INSERT PIPELINE LEADS
// ============================================
console.log('\n📌 Inserting pipeline leads...')
const leads = [
  { customer_code: '2507231030', company_name: '아이엠유건설(주)', contact_person: '박태엽', contact_phone: '010-2845-9872', contact_email: 'taby5@naver.com', stage: '도입완료', core_need: '동영상 기록관리', inquiry_source: '검색채널', notes: '견적 16,700,000원', created_at: '2025-07-23' },
  { customer_code: '2508210001', company_name: '양우종합건설 주식회사', stage: '도입완료', core_need: '동영상 기록관리', inquiry_source: '대표전화', notes: '견적 14,000,000원', created_at: '2025-08-21' },
  { customer_code: '2511141304', company_name: '인천종합에너지', contact_person: '이상길', contact_phone: '010-9980-8721', stage: '도입완료', core_need: '안전장비', inquiry_source: '이용자 추천', notes: '견적 76,000,000원', created_at: '2025-11-14' },
  { customer_code: '2601151751', company_name: '신세계푸드', contact_person: '한승훈', contact_phone: '010-9559-6479', contact_email: 'gkstmdgns120@shinsegae.com', stage: '도입완료', core_need: '공정관리', inquiry_source: '박람회', notes: '견적 월 40~70만', created_at: '2026-01-15' },
  { customer_code: '2602091712', company_name: '삼성물산주식회사', contact_person: '손룡기', contact_phone: '010-3394-4808', contact_email: 'r318.son@samsung.com', stage: '도입완료', core_need: '영상관리', inquiry_source: '공식홈페이지', notes: '견적 6,000,000원', created_at: '2026-02-09' },
  { customer_code: '2602111732', company_name: '제아씨앤씨', contact_person: '전동훈', contact_phone: '010-7530-6728', contact_email: 'jd6728@daum.net', stage: '도입완료', core_need: '동영상 기록관리', inquiry_source: '검색채널', notes: '견적 9,156,000원', created_at: '2026-02-11' },
  { customer_code: '2602191044', company_name: '세영플러스(주)', contact_person: '권수범', contact_phone: '010-4765-8655', contact_email: 'sb.kwon@saeyoungplus.com', stage: '도입완료', core_need: '안전관리', inquiry_source: '검색채널', notes: '견적 10,000,000원', created_at: '2026-02-19' },
  { customer_code: '2602231113', company_name: '(주)원보', contact_person: '전석환', contact_phone: '010-9161-1697', contact_email: 'jsh9161@naver.com', stage: '도입완료', core_need: '안전장비', inquiry_source: '공식홈페이지', notes: '견적 4,500,000원', created_at: '2026-02-23' },
  { customer_code: '2603051017', company_name: '윤성하우징', contact_person: '권오성', contact_phone: '010-2405-8347', contact_email: 'osos8984@naver.com', stage: '도입완료', core_need: '동영상 기록관리', inquiry_source: '검색채널', notes: '견적 1,500,000원', created_at: '2026-03-05' },
  { customer_code: '2603110854', company_name: '삼흥종합건설 주식회사', contact_person: '이동희', contact_phone: '010-3318-2891', contact_email: 'jhjw0830@naver.com', stage: '도입완료', core_need: '영상관리', inquiry_source: '검색채널', notes: '견적 43,854,000원', created_at: '2026-03-11' },
  { customer_code: '2603111612', company_name: '삼우시너지건설', contact_person: '이해미', contact_phone: '010-9895-9939', contact_email: 'samwoo20630@naver.com', stage: '도입완료', core_need: '동영상 기록관리', inquiry_source: '개인전화', notes: '견적 1,500,000원', created_at: '2026-03-11' },
  { customer_code: '2603111845', company_name: '주식회사 모모랩', contact_person: '이현영', contact_phone: '010-2352-3366', contact_email: 'info@momolab.kr', stage: '도입완료', core_need: '공정관리', inquiry_source: '이용자 추천', notes: '월정액 4개 현장 월 30만원', created_at: '2026-03-11' },
  { customer_code: '2603131554', company_name: '(주)수리솔종합건설', contact_person: '이지훈', contact_phone: '010-9074-5708', contact_email: 'wlgns1936@naver.com', stage: '도입완료', core_need: '공정관리', inquiry_source: '공식홈페이지', notes: '건축주 요청', created_at: '2026-03-13' },
]

for (const l of leads) {
  l.assigned_to = ADMIN_ID
  const { error } = await supabase.from('pipeline_leads').upsert(l, { onConflict: 'customer_code' })
  if (error) console.error(`  ❌ ${l.company_name}:`, error.message)
  else console.log(`  ✅ ${l.company_name}`)
}

// ============================================
// 4. INSERT PROJECTS & REVENUES
// ============================================
console.log('\n📌 Inserting projects and revenues...')

// Helper to get customer ID by code
async function getCustomerId(code) {
  const { data } = await supabase.from('customers').select('id').eq('customer_code', code).single()
  return data?.id
}

// Helper to insert project + monthly revenues
async function insertProjectWithRevenue(customerCode, projectName, monthlyAmount, months, opts = {}) {
  const customerId = await getCustomerId(customerCode)
  if (!customerId) { console.error(`  ❌ Customer ${customerCode} not found`); return }

  const { data: project, error: pErr } = await supabase.from('projects').insert({
    customer_id: customerId,
    project_name: projectName,
    service_type: opts.serviceType || '플랫폼',
    billing_start: opts.billingStart,
    monthly_amount: monthlyAmount,
    status: 'active',
    notes: opts.notes
  }).select().single()

  if (pErr) { console.error(`  ❌ Project ${projectName}:`, pErr.message); return }
  console.log(`  ✅ Project: ${projectName}`)

  // Insert monthly revenues
  const revenues = months.map(([year, month, amount]) => ({
    project_id: project.id,
    customer_id: customerId,
    year,
    month,
    amount: amount || monthlyAmount,
    is_confirmed: year === 2026 && month <= 3
  }))

  const { error: rErr } = await supabase.from('monthly_revenues').insert(revenues)
  if (rErr) console.error(`  ❌ Revenue for ${projectName}:`, rErr.message)
  else console.log(`  ✅ ${revenues.length} months revenue inserted`)
}

// 에이치디건설 - 월 100만원 구독
await insertProjectWithRevenue('222062801', '월정액(플랫폼+카메라6대+어플)', 1000000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, 1000000]),
  { serviceType: '플랫폼+AI CCTV+Mobile APP', billingStart: '2023-08-01' })

// 디자인이음새 - 월 183만원
await insertProjectWithRevenue('222081001', '플랫폼 월정액+반출카메라8대', 1836000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, i < 2 ? 1836000 : 2436000]),
  { serviceType: '플랫폼+AI CCTV', billingStart: '2023-09-01' })

// 인디언즈 - 월 15만원
await insertProjectWithRevenue('224022601', '월정액(플랫폼 무제한)', 150000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, 150000]),
  { serviceType: '플랫폼', billingStart: '2024-02-26' })

// 텐일레븐 - 월 약 60만원
await insertProjectWithRevenue('222072501', '통일플러스센터 외', 600000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, 600000]),
  { serviceType: '플랫폼+AI CCTV', billingStart: '2022-07-25' })

// 스타시스건설 - 월 약 80만원
await insertProjectWithRevenue('220262201', '스타시스건설 현장', 800000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, 800000]),
  { serviceType: '플랫폼+AI CCTV', billingStart: '2020-06-22' })

// 퍼시스 - 월 약 300만원
await insertProjectWithRevenue('123071401', '퍼시스 인테리어 현장', 3000000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, 3000000]),
  { serviceType: '플랫폼+AI CCTV', billingStart: '2023-07-14', notes: '20% 할인 적용' })

// 고감도 - 월 약 200만원
await insertProjectWithRevenue('123052101', '고감도 인테리어 현장', 2000000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, 2000000]),
  { serviceType: '플랫폼+AI CCTV', billingStart: '2023-05-21' })

// 한국해비타트 - 월 약 150만원 (50%할인)
await insertProjectWithRevenue('323030301', '해비타트 봉사활동 현장', 1500000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, 1500000]),
  { serviceType: '플랫폼', billingStart: '2023-03-03', notes: '50% 할인' })

// 시건축 - 월 약 250만원
await insertProjectWithRevenue('123022001', '시건축 감리 현장', 2500000,
  Array.from({length: 12}, (_, i) => [2026, i + 1, 2500000]),
  { serviceType: '플랫폼+AI CCTV', billingStart: '2023-02-20' })

console.log('\n🎉 Seed complete!')
process.exit(0)
