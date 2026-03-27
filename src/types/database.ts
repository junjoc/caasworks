export type UserRole = 'admin' | 'member' | 'accountant'

export type LeadStage = '신규리드' | '컨텍' | '제안' | '미팅' | '도입직전' | '도입완료' | '이탈'

export type CustomerStatus = 'active' | 'suspended' | 'churned'

export type PaymentStatus = 'pending' | 'paid' | 'overdue'

export type InvoiceStatus = 'draft' | 'confirmed' | 'sent' | 'paid' | 'overdue'

export type VocCategory = 'dev_request' | 'bug' | 'inquiry' | 'contract' | 'complaint'

export type VocChannel = 'phone' | 'message' | 'email' | 'meeting' | 'other'

export type LeadPriority = '긴급' | '높음' | '중간' | '낮음'

export type VocPriority = 'urgent' | 'high' | 'normal' | 'low'

export type VocStatus = 'received' | 'reviewing' | 'in_progress' | 'resolved' | 'closed'

export type ActivityType =
  | 'CALL_OUT' | 'CALL_IN' | 'EMAIL_SENT' | 'EMAIL_RECV'
  | 'MEETING' | 'DEMO' | 'PROPOSAL' | 'CONTRACT'
  | 'ONBOARDING' | 'FOLLOWUP' | 'NOTE'

export type ScheduleType = 'vacation' | 'half_day' | 'business_trip' | 'training' | 'other'

export type ScheduleApprovalStatus = 'pending' | 'approved' | 'rejected'

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'

export type QuotationType = '구매' | '임대' | '혼합' | '구독'

export type SupplyMethod = '구매' | '임대' | '구독' | '약정'

export type DiscountType = 'none' | 'rate' | 'amount' | 'target'

export type AuditAction = 'create' | 'update' | 'delete' | 'status_change'

// --- Database Row Types ---

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  slack_user_id: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface PipelineLead {
  id: string
  lead_number: number
  customer_code: string | null
  company_name: string
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  stage: LeadStage
  core_need: string | null
  interest_service: string | null
  inquiry_source: string | null
  inquiry_content: string | null
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
  converted_at: string | null
  customer_id: string | null
  // v2.0 新 fields
  priority: LeadPriority
  next_action: string | null
  next_action_date: string | null
  inquiry_date: string | null
  inquiry_channel: string | null
  industry: string | null
  contact_position: string | null
  // joined
  assigned_user?: User
}

export interface PipelineHistory {
  id: string
  lead_id: string
  field_changed: string
  old_value: string | null
  new_value: string | null
  changed_by: string
  changed_at: string
  // joined
  changed_by_user?: User
}

export interface Customer {
  id: string
  customer_code: string | null
  company_name: string
  company_type: string | null
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  assigned_to: string | null
  billing_type: string | null
  billing_start: string | null
  billing_end: string | null
  user_count: number | null
  service_type: string | null
  status: CustomerStatus
  invoice_email: string | null
  invoice_contact: string | null
  invoice_phone: string | null
  business_reg_no: string | null
  tax_invoice_email: string | null
  deposit_amount: number | null
  deposit_paid_at: string | null
  deposit_returned_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  assigned_user?: User
  projects?: Project[]
}

export type ProjectSource = 'manual' | 'slack' | 'import'

export interface Project {
  id: string
  customer_id: string
  project_name: string
  project_start: string | null
  project_end: string | null
  service_type: string | null
  site_category: string | null
  site_category2: string | null
  billing_start: string | null
  billing_end: string | null
  monthly_amount: number | null
  status: string
  address: string | null
  created_by: string | null
  solutions: string | null
  source: ProjectSource | null
  notes: string | null
  created_at: string
}

export interface MonthlyRevenue {
  id: string
  project_id: string
  customer_id: string
  year: number
  month: number
  amount: number
  is_confirmed: boolean
  notes: string | null
  created_at: string
}

export interface Invoice {
  id: string
  customer_id: string
  invoice_number: string
  year: number
  month: number
  sender_company: string | null
  sender_biz_no: string | null
  sender_ceo: string | null
  sender_address: string | null
  sender_contact_name: string | null
  sender_contact_info: string | null
  receiver_company: string | null
  receiver_biz_no: string | null
  receiver_contact: string | null
  receiver_email: string | null
  subtotal: number
  vat: number
  total: number
  due_date: string | null
  bank_info: string | null
  status: InvoiceStatus
  sent_at: string | null
  paid_at: string | null
  pdf_url: string | null
  notes: string | null
  created_by: string
  created_at: string
  // joined
  customer?: Customer
  items?: InvoiceItem[]
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  item_no: number
  project_name: string | null
  service_type: string | null
  period: string | null
  quantity: number
  unit_price: number
  amount: number
  notes: string | null
}

export interface VocTicket {
  id: string
  ticket_number: number
  customer_id: string
  category: VocCategory
  channel: VocChannel | null
  priority: VocPriority
  title: string
  description: string | null
  status: VocStatus
  assigned_to: string | null
  resolved_at: string | null
  closed_at: string | null
  resolution_note: string | null
  converted_to_lead: string | null
  reported_by: string | null
  reported_at: string
  created_by: string
  created_at: string
  updated_at: string
  // joined
  customer?: Customer
  assigned_user?: User
  responses?: VocResponse[]
}

export interface VocResponse {
  id: string
  ticket_id: string
  response_by: string
  content: string
  response_type: string
  created_at: string
  // joined
  response_by_user?: User
}

export interface Meeting {
  id: string
  customer_id: string | null
  lead_id: string | null
  meeting_number: number | null
  meeting_date: string
  internal_attendees: string[] | null
  external_attendees: string | null
  company_name: string | null
  industry: string | null
  grade: string | null
  site_count: number | null
  source: string | null
  pain_points: string | null
  positives: string | null
  difficulties: string | null
  meeting_result: string | null
  created_by: string
  created_at: string
  updated_at: string
  // joined
  customer?: Customer
}

export interface ActivityLog {
  id: string
  lead_id: string | null
  customer_id: string | null
  activity_type: ActivityType
  title: string | null
  description: string | null
  duration_minutes: number | null
  meeting_id: string | null
  voc_ticket_id: string | null
  performed_by: string
  performed_at: string
  created_at: string
  // joined
  performed_by_user?: User
}

export interface AuditLog {
  id: string
  entity_type: string
  entity_id: string
  action: AuditAction
  changes: Record<string, { old: unknown; new: unknown }> | null
  performed_by: string
  performed_at: string
  ip_address: string | null
  user_agent: string | null
  // joined
  performed_by_user?: User
}

export interface Quotation {
  id: string
  quotation_number: string
  lead_id: string | null
  customer_name: string
  contact_person: string | null
  project_name: string | null
  quotation_type: QuotationType
  version: number
  parent_quotation_id: string | null
  status: QuotationStatus
  quotation_date: string
  valid_until: string | null
  subtotal: number
  discount_type: DiscountType
  discount_value: number
  discount_amount: number
  vat_included: boolean
  vat: number
  total: number
  deposit: number
  deposit_note: string | null
  notes: string | null
  terms: string | null
  created_by: string
  created_at: string
  updated_at: string
  // joined
  items?: QuotationItem[]
  creator?: User
  lead?: PipelineLead
}

export interface QuotationItem {
  id: string
  quotation_id: string
  item_no: number
  category: string | null
  product_id: string | null
  item_name: string
  description: string | null
  unit_price: number
  quantity: number
  unit: string
  period_months: number | null
  supply_method: SupplyMethod | null
  amount: number
  cost_price: number | null
  notes: string | null
  sort_order: number
  // joined
  product?: Product
}

export type SupplyType = 'self' | 'partner'

export interface ProductCategory {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface Supplier {
  id: string
  company_name: string
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  category_id: string
  category?: ProductCategory
  supplier_id: string | null
  supplier?: Supplier
  name: string
  description: string | null
  supply_type: SupplyType

  // 가격 정보
  purchase_price: number | null
  rental_price: number | null
  subscription_price: number | null
  cost_price: number | null

  unit: string
  default_supply_method: string | null

  image_url: string | null
  is_active: boolean
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface UserSchedule {
  id: string
  user_id: string
  schedule_type: ScheduleType
  title: string | null
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: ScheduleApprovalStatus
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
  // joined
  user?: User
}

export type TemplateLayoutType = 'A' | 'B' | 'custom'

export interface TemplateColumn {
  key: string
  label: string
  visible: boolean
  order: number
}

export interface QuotationTemplate {
  id: string
  name: string
  description: string | null
  is_default: boolean
  title_format: string | null
  company_name: string | null
  biz_number: string | null
  ceo_name: string | null
  company_address: string | null
  company_phone: string | null
  bank_info: string | null
  logo_left_url: string | null
  logo_right_url: string | null
  stamp_url: string | null
  columns: TemplateColumn[] | null
  layout_type: TemplateLayoutType
  max_rows: number | null
  show_vat_row: boolean
  show_deposit_row: boolean
  show_discount_row: boolean
  default_notes: string | null
  default_terms: string | null
  footer_left: string | null
  footer_right: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
