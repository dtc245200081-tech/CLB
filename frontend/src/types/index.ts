export type SystemRole = 'admin' | 'department_head' | 'member';

export interface User {
  id: number;
  email: string;
  student_id: string;
  full_name: string;
  phone: string | null;
  faculty: string | null;
  class_name: string | null;
  title: string | null;
  avatar_url?: string | null;
  role: SystemRole;
  is_active: boolean;
  is_treasurer?: boolean;
  department_id?: number | null;
  department_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepartmentHeadOut {
  id: number;
  full_name: string;
  email: string;
  student_id: string;
  title: string | null;
  role: string;
}

export interface Department {
  id: number;
  name: string;
  description: string | null;
  head_id: number | null;
  head_name?: string | null;
  head?: DepartmentHeadOut | null;
  is_active: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface JoinRequest {
  id: number;
  email: string;
  student_id: string;
  full_name: string;
  phone: string | null;
  faculty: string | null;
  class_name: string | null;
  reason: string | null;
  status: JoinRequestStatus;
  review_note: string | null;
  reviewed_by_id: number | null;
  reviewed_at: string | null;
  user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  action: string;
  actor: string;
  target: string | null;
  ip_address: string | null;
  details: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ============================================================
// PHASE 3: EVENT & ATTENDANCE TYPES
// ============================================================

export type EventStatus = 'draft' | 'pending_approval' | 'published' | 'rejected' | 'cancelled';
export type RegistrationStatus = 'registered' | 'cancelled';
export type AttendanceType = 'check_in' | 'check_out';
export type AttendanceSource = 'camera' | 'upload' | 'manual';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Event {
  id: number;
  title: string;
  description: string | null;
  location: string;
  start_time: string;
  end_time: string;
  registration_deadline: string | null;
  capacity: number | null;
  department_id: number | null;
  is_public: boolean;
  status: EventStatus;
  rejection_reason?: string | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;

  // Tham số điểm danh
  checkin_open_minutes_before: number;
  late_after_minutes: number;
  checkin_close_minutes_after_start: number | null;
  checkout_open_after_minutes: number | null;
  checkout_close_minutes_after_end: number;

  // Quan hệ bổ sung
  department?: Department | null;
  creator?: {
    id: number;
    full_name: string;
    email: string;
  } | null;
  registered_count?: number;
  is_registered?: boolean;
  my_registration_status?: RegistrationStatus | null;
  my_registration?: any;
}

export interface EventPublic {
  id: number;
  title: string;
  description: string | null;
  location: string;
  start_time: string;
  end_time: string;
  registration_deadline: string | null;
  capacity: number | null;
  department_id: number | null;
  is_public: boolean;
  status: EventStatus;
  registered_count: number;
}

export interface EventAttendance {
  id: number;
  registration_id: number;
  type: AttendanceType;
  taken_at: string;
  photo_path: string | null;
  source: AttendanceSource;
  review_status: ReviewStatus;
  is_late: boolean;
  reviewed_by_id: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;

  // Thông tin mở rộng (khi truy vấn danh sách duyệt)
  user_name?: string;
  user_email?: string;
  student_id?: string;
  event_title?: string;
  event_id?: number;
}

export interface EventRegistration {
  id: number;
  user_id: number;
  event_id: number;
  status: RegistrationStatus;
  created_at: string;
  updated_at: string;

  user?: {
    id: number;
    full_name: string;
    email: string;
    student_id: string;
    phone: string | null;
    department_name?: string | null;
  };

  check_in?: EventAttendance | null;
  check_out?: EventAttendance | null;
  duration_minutes?: number | null;
  is_late?: boolean;
  attendance_status?: 'not_attended' | 'attended' | 'fully_attended' | 'pending';
}

export interface EventStats {
  event_id: number;
  total_registrations: number;
  total_attended: number;
  total_late: number;
  total_fully_attended: number;
  total_pending_reviews: number;
}

export interface UserEventHistoryItem {
  id?: number;
  registration_id: number;
  event_id: number;
  event_title: string;
  event_start_time: string;
  event_end_time: string;
  event_location: string;
  event_status?: EventStatus;
  department_name?: string | null;
  registration_status: RegistrationStatus;
  registered_at: string;
  checkin_open_minutes_before?: number;
  late_after_minutes?: number;
  checkin_close_minutes_after_start?: number | null;
  checkout_open_after_minutes?: number | null;
  checkout_close_minutes_after_end?: number;
  check_in?: EventAttendance | null;
  check_out?: EventAttendance | null;
  duration_minutes?: number | null;
  is_late: boolean;
}

export interface EventCreateInput {
  title: string;
  description?: string;
  location: string;
  start_time: string;
  end_time: string;
  registration_deadline?: string | null;
  capacity?: number | null;
  department_id?: number | null;
  is_public?: boolean;
  checkin_open_minutes_before?: number;
  late_after_minutes?: number;
  checkin_close_minutes_after_start?: number | null;
  checkout_open_after_minutes?: number | null;
  checkout_close_minutes_after_end?: number;
}

export interface EventUpdateInput {
  title?: string;
  description?: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  registration_deadline?: string | null;
  capacity?: number | null;
  department_id?: number | null;
  is_public?: boolean;
  checkin_open_minutes_before?: number;
  late_after_minutes?: number;
  checkin_close_minutes_after_start?: number | null;
  checkout_open_after_minutes?: number | null;
  checkout_close_minutes_after_end?: number;
}

// ============================================================
// PHASE 4: TASKS, ANNOUNCEMENTS, NOTIFICATIONS, FEES, FUNDS
// ============================================================

export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';

export interface TaskAssignee {
  user_id: number;
  full_name: string;
  user_name?: string;
  student_id: string;
  assigned_at?: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  content: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  department_id: number | null;
  department_name: string | null;
  event_id: number | null;
  event_title: string | null;
  created_by_id: number;
  creator_name: string | null;
  created_by_name?: string | null;
  completed_at: string | null;
  needs_reassignment: boolean;
  is_overdue: boolean;
  assignees: TaskAssignee[];
  comments_count: number;
  comments?: TaskComment[];
  created_at: string;
  updated_at: string;
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  due_date?: string | null;
  department_id?: number | null;
  event_id?: number | null;
  assignee_ids?: number[];
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  due_date?: string | null;
  department_id?: number | null;
  event_id?: number | null;
  assignee_ids?: number[];
}

// Bảng tin (Announcements)
export type AnnouncementScope = 'all' | 'department';
export type AnnouncementStatus = 'draft' | 'published';

export interface AnnouncementReader {
  user_id: number;
  full_name: string;
  user_name?: string;
  student_id: string;
  read_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  scope: AnnouncementScope;
  department_id: number | null;
  department_name: string | null;
  is_pinned: boolean;
  status: AnnouncementStatus;
  published_at: string | null;
  created_by_id: number;
  creator_name: string | null;
  created_by_name?: string | null;
  read_count: number;
  is_read_by_me: boolean;
  is_read?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementCreateInput {
  title: string;
  content: string;
  scope?: AnnouncementScope;
  department_id?: number | null;
  is_pinned?: boolean;
  status?: AnnouncementStatus;
}

export interface AnnouncementStats {
  read_count: number;
  readers: AnnouncementReader[];
  total_readers?: number;
}

// Thông báo cá nhân (Notifications)
export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

// Hội phí (Membership Fees)
export type FeePeriodStatus = 'open' | 'closed';
export type MemberFeeStatus = 'unpaid' | 'partial' | 'paid' | 'waived';
export type PaymentMethod = 'cash' | 'bank_transfer';
export type ClaimStatus = 'pending' | 'confirmed' | 'rejected';

export interface FeePeriod {
  id: number;
  name: string;
  amount: number;
  due_date: string;
  description: string | null;
  status: FeePeriodStatus;
  created_by_id: number;
  creator_name: string | null;
  total_members: number;
  total_collected: number;
  total_expected: number;
  created_at: string;
  updated_at: string;
}

export interface FeePeriodCreateInput {
  name: string;
  amount: number;
  due_date: string;
  description?: string;
}

export interface FeePayment {
  id: number;
  receipt_code: string;
  member_fee_id: number;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  received_by_id: number;
  receiver_name: string | null;
  received_by_name?: string | null;
  note: string | null;
  proof_photo_path: string | null;
  is_voided: boolean;
  voided_at: string | null;
  voided_by_id: number | null;
  voider_name: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface PaymentClaim {
  id: number;
  member_fee_id: number;
  period_name?: string | null;
  user_id?: number;
  user_name?: string | null;
  student_id?: string | null;
  amount: number;
  transfer_time: string;
  proof_photo_path: string;
  note: string | null;
  status: ClaimStatus;
  reviewed_by_id: number | null;
  reviewer_name: string | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface MemberFee {
  id: number;
  period_id: number;
  period_name: string;
  period_description?: string | null;
  period_due_date: string;
  due_date?: string;
  period_status: FeePeriodStatus;
  user_id: number;
  user_name: string;
  student_id: string;
  department_id: number | null;
  department_name: string | null;
  amount_due: number;
  discount_amount: number;
  discount_reason: string | null;
  net_amount_due: number;
  net_due?: number;
  total_paid: number;
  remaining_due: number;
  remaining_balance?: number;
  status: MemberFeeStatus;
  is_overdue: boolean;
  payments: FeePayment[];
  claims: PaymentClaim[];
  created_at: string;
}

export interface DepartmentMemberFeeStatus {
  user_id: number;
  full_name: string;
  student_id: string;
  department_id: number | null;
  status: MemberFeeStatus;
  is_overdue: boolean;
}

// Thu chi & Sổ quỹ (Funds & Treasury)
export type ExpenseRequestStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'cancelled';
export type LedgerType = 'income' | 'expense';

export interface ExpenseRequest {
  id: number;
  title: string;
  description: string;
  amount_requested: number;
  department_id: number | null;
  department_name: string | null;
  event_id: number | null;
  event_title: string | null;
  requested_by_id: number;
  requested_by_name: string | null;
  status: ExpenseRequestStatus;
  reviewed_by_id: number | null;
  reviewer_name: string | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseRequestCreateInput {
  title: string;
  description?: string;
  amount_requested: number;
  department_id?: number | null;
  event_id?: number | null;
}

export interface RecordExpenseInput {
  expense_request_id: number;
  amount: number;
  category?: string;
  description: string;
  occurred_at?: string;
  receipt_photo_path?: string;
  explanation_note?: string;
}

export interface RecordIncomeInput {
  amount: number;
  category: string;
  description: string;
  occurred_at?: string;
  event_id?: number | null;
  receipt_photo_path?: string;
}

export interface LedgerEntry {
  id: number;
  type: LedgerType;
  amount: number;
  category: string;
  description: string;
  occurred_at: string;
  event_id: number | null;
  event_title: string | null;
  department_id: number | null;
  department_name: string | null;
  fee_payment_id: number | null;
  expense_request_id: number | null;
  recorded_by_id: number;
  recorded_by_name: string | null;
  receipt_photo_path: string | null;
  is_voided: boolean;
  voided_at: string | null;
  voided_by_id: number | null;
  voider_name: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface PeriodSummaryItem {
  period_key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  running_balance?: number;
  month?: string;
}

export interface FinanceOverview {
  fund_balance: number;
  current_balance?: number;
  total_income: number;
  total_expense: number;
  by_category: { category: string; amount: number; total?: number }[];
  weekly_summary?: PeriodSummaryItem[];
  monthly_summary: PeriodSummaryItem[];
  semester_summary?: PeriodSummaryItem[];
  yearly_summary?: PeriodSummaryItem[];
  recent_entries: {
    id: number;
    type: LedgerType;
    category: string;
    description: string;
    amount: number;
    occurred_at: string;
  }[];
  recent_expenses?: {
    id: number;
    type: LedgerType;
    category: string;
    description: string;
    amount: number;
    occurred_at: string;
  }[];
}

export interface BankTransferInstructions {
  bank_name: string;
  account_number: string;
  account_name: string;
  syntax_guide: string;
}

export interface MyFeesResponse {
  items: MemberFee[];
  payments: FeePayment[];
  claims: PaymentClaim[];
}

export interface EventItem {
  id: number;
  title: string;
  description?: string;
  location: string;
  start_time: string;
  end_time: string;
}

export interface FundReport {
  current_balance: number;
  total_income: number;
  total_expense: number;
  by_month?: { month: string; income: number; expense: number; net: number }[];
  by_category?: { category: string; income?: number; expense?: number; total: number }[];
  weekly_summary?: PeriodSummaryItem[];
  monthly_summary: PeriodSummaryItem[];
  semester_summary?: PeriodSummaryItem[];
  yearly_summary?: PeriodSummaryItem[];
  fee_periods?: {
    period_id: number;
    period_name: string;
    total_expected: number;
    total_collected: number;
    total_debt: number;
    collection_rate_percent: number;
  }[];
  category_summary: { category: string; income: number; expense: number; total: number }[];
  event_summary: { event: string; income: number; expense: number }[];
  department_summary: { department: string; income: number; expense: number }[];
}


export interface FeePeriodReport {
  period_id: number;
  period_name: string;
  amount_per_member: number;
  total_members: number;
  total_expected: number;
  total_collected: number;
  total_remaining: number;
  collection_rate_percent: number;
  paid_count: number;
  partial_count: number;
  unpaid_count: number;
  waived_count: number;
}

// ============================================================
// Giai đoạn 5: Kiểu dữ liệu Chatbot AI & Kho Tri Thức RAG
// ============================================================

export interface ChatMessageSource {
  title: string;
  heading?: string | null;
  score?: number;
}

export interface ChatMessageToolCall {
  tool: string;
  params: Record<string, any>;
}

export interface ChatMessage {
  id: number;
  conversation_id?: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  sources?: ChatMessageSource[] | null;
  tool_calls?: ChatMessageToolCall[] | null;
  feedback?: 'up' | 'down' | null;
  feedback_note?: string | null;
  created_at: string;
}

export interface ConversationSummary {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationDetail {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export type DocumentAudience = 'public' | 'member' | 'dept_head' | 'admin';

export interface KnowledgeDocument {
  id: number;
  title: string;
  category: string;
  audience: DocumentAudience;
  content: string;
  is_active: boolean;
  version: number;
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
  chunks_count?: number;
}

export interface ChatbotAdminStats {
  total_queries: number;
  answered_count: number;
  no_info_count: number;
  out_of_scope_count: number;
  error_count: number;
  rate_limited_count: number;
  no_info_rate: number;
  negative_feedback_rate: number;
  avg_first_token_latency_ms?: number | null;
  avg_total_latency_ms?: number | null;
}

export interface UnansweredQueryItem {
  id: number;
  normalized_query: string;
  user_role: string;
  outcome: string;
  feedback?: string | null;
  feedback_note?: string | null;
  created_at: string;
}


