import {
  AuditLog,
  Department,
  Event,
  EventAttendance,
  EventCreateInput,
  EventPublic,
  EventRegistration,
  EventStats,
  EventUpdateInput,
  JoinRequest,
  LoginResponse,
  PaginatedResponse,
  User,
  UserEventHistoryItem,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  TaskComment,
  Announcement,
  AnnouncementCreateInput,
  AnnouncementStats,
  Notification,
  FeePeriod,
  FeePeriodCreateInput,
  MemberFee,
  FeePayment,
  PaymentClaim,
  DepartmentMemberFeeStatus,
  ExpenseRequest,
  ExpenseRequestCreateInput,
  RecordExpenseInput,
  RecordIncomeInput,
  LedgerEntry,
  FinanceOverview,
  FundReport,
  FeePeriodReport,
  BankTransferInstructions,
  MyFeesResponse,
  ChatMessage,
  ConversationSummary,
  ConversationDetail,
  KnowledgeDocument,
  ChatbotAdminStats,
  UnansweredQueryItem,
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    throw new ApiError(
      'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng internet.',
      0
    );
  }

  if (response.status === 401 && !endpoint.includes('/auth/login')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/join')) {
      window.location.href = '/login?expired=1';
    }
  }

  let data: any;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let message = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
    if (data && typeof data === 'object' && data.detail) {
      if (typeof data.detail === 'string') {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        message = data.detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
      }
    } else if (typeof data === 'string' && data.trim()) {
      message = data;
    }
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const api = {
  auth: {
    login: (email: string, password: string): Promise<LoginResponse> =>
      request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    getMe: (): Promise<User> =>
      request<User>('/auth/me', { method: 'GET' }),

    changePassword: (oldPassword: string, newPassword: string): Promise<{ message: string }> =>
      request<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      }),
  },

  departments: {
    list: (params?: { q?: string; is_active?: boolean; page?: number; page_size?: number }): Promise<PaginatedResponse<Department>> => {
      const query = new URLSearchParams();
      if (params?.q) query.set('q', params.q);
      if (params?.is_active !== undefined) query.set('is_active', params.is_active.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<Department>>(`/departments?${query.toString()}`);
    },

    getById: (id: number): Promise<Department> =>
      request<Department>(`/departments/${id}`),

    create: (data: { name: string; description?: string }): Promise<Department> =>
      request<Department>('/departments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: number, data: { name?: string; description?: string; is_active?: boolean }): Promise<Department> =>
      request<Department>(`/departments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/departments/${id}`, {
        method: 'DELETE',
      }),

    assignHead: (id: number, userId: number): Promise<Department> =>
      request<Department>(`/departments/${id}/head`, {
        method: 'PUT',
        body: JSON.stringify({ user_id: userId }),
      }),

    dismissHead: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/departments/${id}/head`, {
        method: 'DELETE',
      }),

    getMembers: (id: number, params?: { q?: string; page?: number; page_size?: number }): Promise<PaginatedResponse<User>> => {
      const query = new URLSearchParams();
      if (params?.q) query.set('q', params.q);
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<User>>(`/departments/${id}/members?${query.toString()}`);
    },
  },

  users: {
    list: (params?: { q?: string; role?: string; department_id?: number; page?: number; page_size?: number }): Promise<PaginatedResponse<User>> => {
      const query = new URLSearchParams();
      if (params?.q) query.set('q', params.q);
      if (params?.role) query.set('role', params.role);
      if (params?.department_id !== undefined) query.set('department_id', params.department_id.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<User>>(`/users?${query.toString()}`);
    },

    getById: (id: number): Promise<User> =>
      request<User>(`/users/${id}`),

    updateSelf: (data: Partial<Pick<User, 'full_name' | 'phone' | 'faculty' | 'class_name'>>): Promise<User> =>
      request<User>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    uploadAvatar: (file: File): Promise<User> => {
      const formData = new FormData();
      formData.append('file', file);
      return request<User>('/users/me/avatar', {
        method: 'POST',
        body: formData,
      });
    },

    deleteAvatar: (): Promise<User> =>
      request<User>('/users/me/avatar', {
        method: 'DELETE',
      }),

    create: (userData: any): Promise<User> =>
      request<User>('/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      }),

    updateAdmin: (id: number, data: any): Promise<User> =>
      request<User>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    updateDepartment: (id: number, departmentId: number | null): Promise<User> =>
      request<User>(`/users/${id}/department`, {
        method: 'PATCH',
        body: JSON.stringify({ department_id: departmentId }),
      }),

    resetPassword: (id: number): Promise<{ message: string; temporary_password: string }> =>
      request<{ message: string; temporary_password: string }>(`/users/${id}/reset-password`, {
        method: 'POST',
      }),

    delete: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/users/${id}`, {
        method: 'DELETE',
      }),

    toggleTreasurer: (id: number, isTreasurer: boolean): Promise<User> =>
      request<User>(`/users/${id}/treasurer`, {
        method: 'PATCH',
        body: JSON.stringify({ is_treasurer: isTreasurer }),
      }),

    getMyRegistrations: (params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<UserEventHistoryItem>> => {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<UserEventHistoryItem>>(`/users/me/registrations?${query.toString()}`);
    },
  },

  joinRequests: {
    submit: (formData: any): Promise<JoinRequest> =>
      request<JoinRequest>('/join-requests', {
        method: 'POST',
        body: JSON.stringify(formData),
      }),

    list: (params?: { status?: string; page?: number; page_size?: number }): Promise<PaginatedResponse<JoinRequest>> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<JoinRequest>>(`/join-requests?${query.toString()}`);
    },

    approve: (id: number): Promise<JoinRequest> =>
      request<JoinRequest>(`/join-requests/${id}/approve`, {
        method: 'POST',
      }),

    reject: (id: number, review_note?: string): Promise<JoinRequest> =>
      request<JoinRequest>(`/join-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ review_note }),
      }),
  },

  auditLogs: {
    list: (params?: { action?: string; actor?: string; q?: string; page?: number; page_size?: number }): Promise<PaginatedResponse<AuditLog>> => {
      const query = new URLSearchParams();
      if (params?.action) query.set('action', params.action);
      if (params?.actor) query.set('actor', params.actor);
      if (params?.q) query.set('q', params.q);
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<AuditLog>>(`/audit-logs?${query.toString()}`);
    },

    cleanup: (days: number = 7): Promise<{ message: string; deleted_count: number; days: number }> =>
      request<{ message: string; deleted_count: number; days: number }>(`/audit-logs/cleanup?days=${days}`, {
        method: 'DELETE',
      }),

    delete: (logId: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/audit-logs/${logId}`, {
        method: 'DELETE',
      }),
  },

  events: {
    list: (params?: {
      q?: string;
      status?: string;
      department_id?: number;
      timeline?: 'all' | 'upcoming' | 'past';
      upcoming_only?: boolean;
      past_only?: boolean;
      registered_only?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedResponse<Event>> => {
      const query = new URLSearchParams();
      if (params?.q) query.set('q', params.q);
      if (params?.status) query.set('status', params.status);
      if (params?.department_id !== undefined) query.set('department_id', params.department_id.toString());
      if (params?.timeline) query.set('timeline', params.timeline);
      if (params?.upcoming_only !== undefined) query.set('upcoming_only', params.upcoming_only.toString());
      if (params?.past_only !== undefined) query.set('past_only', params.past_only.toString());
      if (params?.registered_only !== undefined) query.set('registered_only', params.registered_only.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<Event>>(`/events?${query.toString()}`);
    },

    getById: (id: number): Promise<Event> =>
      request<Event>(`/events/${id}`),

    create: (data: EventCreateInput): Promise<Event> =>
      request<Event>('/events', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: number, data: EventUpdateInput): Promise<Event> =>
      request<Event>(`/events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    submit: (id: number): Promise<Event> =>
      request<Event>(`/events/${id}/submit`, {
        method: 'POST',
      }),

    publish: (id: number): Promise<Event> =>
      request<Event>(`/events/${id}/publish`, {
        method: 'POST',
      }),

    approve: (id: number): Promise<Event> =>
      request<Event>(`/events/${id}/publish`, {
        method: 'POST',
      }),

    reject: (id: number, reason: string): Promise<Event> =>
      request<Event>(`/events/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    cancel: (id: number): Promise<Event> =>
      request<Event>(`/events/${id}/cancel`, {
        method: 'POST',
      }),

    register: (id: number): Promise<EventRegistration> =>
      request<EventRegistration>(`/events/${id}/register`, {
        method: 'POST',
      }),

    cancelRegistration: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/events/${id}/register`, {
        method: 'DELETE',
      }),

    getRegistrations: (
      id: number,
      params?: { status?: string; search?: string; page?: number; page_size?: number }
    ): Promise<PaginatedResponse<EventRegistration>> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.search) query.set('search', params.search);
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<EventRegistration>>(`/events/${id}/registrations?${query.toString()}`);
    },

    checkIn: (id: number, file: File | Blob, source: 'camera' | 'upload'): Promise<EventAttendance> => {
      const formData = new FormData();
      formData.append('file', file, 'check_in.jpg');
      formData.append('source', source);
      return request<EventAttendance>(`/events/${id}/attendance/check-in`, {
        method: 'POST',
        body: formData,
      });
    },

    checkOut: (id: number, file: File | Blob, source: 'camera' | 'upload'): Promise<EventAttendance> => {
      const formData = new FormData();
      formData.append('file', file, 'check_out.jpg');
      formData.append('source', source);
      return request<EventAttendance>(`/events/${id}/attendance/check-out`, {
        method: 'POST',
        body: formData,
      });
    },

    getAttendances: (
      id: number,
      params?: { review_status?: string; type?: string; page?: number; page_size?: number }
    ): Promise<PaginatedResponse<EventAttendance>> => {
      const query = new URLSearchParams();
      if (params?.review_status) query.set('review_status', params.review_status);
      if (params?.type) query.set('type', params.type);
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<EventAttendance>>(`/events/${id}/attendances?${query.toString()}`);
    },

    manualAttendance: (
      id: number,
      userId: number,
      data: { type: 'check_in' | 'check_out'; is_late?: boolean; note?: string }
    ): Promise<EventAttendance> =>
      request<EventAttendance>(`/events/${id}/registrations/${userId}/attendance`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    cancelAttendance: (
      id: number,
      userId: number,
      type: 'check_in' | 'check_out'
    ): Promise<{ message: string }> =>
      request<{ message: string }>(`/events/${id}/registrations/${userId}/attendance?type=${type}`, {
        method: 'DELETE',
      }),

    getStats: (id: number): Promise<EventStats> =>
      request<EventStats>(`/events/${id}/stats`),

    exportCsv: async (id: number, filename?: string): Promise<void> => {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/events/${id}/registrations/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new ApiError('Không thể xuất danh sách CSV.', response.status);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `event_${id}_attendees.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
  },

  attendances: {
    approve: (id: number, note?: string): Promise<EventAttendance> =>
      request<EventAttendance>(`/attendances/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ review_note: note || null }),
      }),

    reject: (id: number, note: string): Promise<EventAttendance> =>
      request<EventAttendance>(`/attendances/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ review_note: note }),
      }),

    getPhotoUrl: async (id: number): Promise<string> => {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/attendances/${id}/photo`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new ApiError('Không thể tải ảnh điểm danh.', response.status);
      }
      const blob = await response.blob();
      return window.URL.createObjectURL(blob);
    },
  },

  publicEvents: {
    list: (params?: {
      q?: string;
      department_id?: number;
      upcoming_only?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedResponse<EventPublic>> => {
      const query = new URLSearchParams();
      if (params?.q) query.set('q', params.q);
      if (params?.department_id !== undefined) query.set('department_id', params.department_id.toString());
      if (params?.upcoming_only !== undefined) query.set('upcoming_only', params.upcoming_only.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<EventPublic>>(`/public/events?${query.toString()}`);
    },

    getById: (id: number): Promise<EventPublic> =>
      request<EventPublic>(`/public/events/${id}`),
  },

  tasks: {
    list: (params?: {
      status?: string;
      priority?: string;
      department_id?: number;
      assignee_id?: number;
      event_id?: number;
      is_overdue?: boolean;
      needs_reassignment?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedResponse<Task>> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.priority) query.set('priority', params.priority);
      if (params?.department_id !== undefined) query.set('department_id', params.department_id.toString());
      if (params?.assignee_id !== undefined) query.set('assignee_id', params.assignee_id.toString());
      if (params?.event_id !== undefined) query.set('event_id', params.event_id.toString());
      if (params?.is_overdue !== undefined) query.set('is_overdue', params.is_overdue.toString());
      if (params?.needs_reassignment !== undefined) query.set('needs_reassignment', params.needs_reassignment.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<Task>>(`/tasks?${query.toString()}`);
    },

    myTasks: (params?: { status?: string; page?: number; page_size?: number }): Promise<PaginatedResponse<Task>> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<Task>>(`/tasks/me?${query.toString()}`);
    },

    get: (id: number): Promise<Task> => request<Task>(`/tasks/${id}`),

    create: (data: TaskCreateInput): Promise<Task> =>
      request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),

    update: (id: number, data: TaskUpdateInput): Promise<Task> =>
      request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    updateStatus: (id: number, status: string): Promise<Task> =>
      request<Task>(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

    delete: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' }),

    listComments: (id: number): Promise<TaskComment[]> =>
      request<TaskComment[]>(`/tasks/${id}/comments`),

    addComment: (id: number, content: string): Promise<TaskComment> =>
      request<TaskComment>(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),

    addAssignees: (id: number, userIds: number[]): Promise<Task> =>
      request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ assignee_ids: userIds }) }),

    removeAssignee: (id: number, userId: number): Promise<Task> =>
      request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ remove_assignee_ids: [userId] }) }),
  },

  announcements: {
    list: (params?: { scope?: string; department_id?: number; page?: number; page_size?: number }): Promise<PaginatedResponse<Announcement>> => {
      const query = new URLSearchParams();
      if (params?.scope) query.set('scope', params.scope);
      if (params?.department_id !== undefined) query.set('department_id', params.department_id.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<Announcement>>(`/announcements?${query.toString()}`);
    },

    get: (id: number): Promise<Announcement> => request<Announcement>(`/announcements/${id}`),

    create: (data: AnnouncementCreateInput): Promise<Announcement> =>
      request<Announcement>('/announcements', { method: 'POST', body: JSON.stringify(data) }),

    update: (id: number, data: Partial<AnnouncementCreateInput>): Promise<Announcement> =>
      request<Announcement>(`/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    read: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/announcements/${id}/read`, { method: 'POST' }),

    markRead: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/announcements/${id}/read`, { method: 'POST' }),

    getReaders: (id: number): Promise<AnnouncementStats> =>
      request<AnnouncementStats>(`/announcements/${id}/readers`),

    delete: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/announcements/${id}`, { method: 'DELETE' }),
  },

  notifications: {
    list: (params?: { is_read?: boolean; page?: number; page_size?: number }): Promise<PaginatedResponse<Notification>> => {
      const query = new URLSearchParams();
      if (params?.is_read !== undefined) query.set('is_read', params.is_read.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<Notification>>(`/notifications?${query.toString()}`);
    },

    unreadCount: (): Promise<{ unread_count: number }> =>
      request<{ unread_count: number }>('/notifications/unread-count'),

    getUnreadCount: (): Promise<{ unread_count: number }> =>
      request<{ unread_count: number }>('/notifications/unread-count'),

    markRead: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/notifications/${id}/read`, { method: 'PATCH' }),

    markAsRead: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/notifications/${id}/read`, { method: 'PATCH' }),

    markReadAll: (): Promise<{ message: string }> =>
      request<{ message: string }>('/notifications/read-all', { method: 'POST' }),

    markAllAsRead: (): Promise<{ message: string }> =>
      request<{ message: string }>('/notifications/read-all', { method: 'POST' }),
  },

  fees: {
    listPeriods: (status?: string): Promise<FeePeriod[]> => {
      const query = status ? `?status=${status}` : '';
      return request<FeePeriod[]>(`/fees/periods${query}`);
    },

    createPeriod: (data: FeePeriodCreateInput): Promise<FeePeriod> =>
      request<FeePeriod>('/fees/periods', { method: 'POST', body: JSON.stringify(data) }),

    updatePeriodStatus: (id: number, data: { name?: string; status?: string; due_date?: string }): Promise<FeePeriod> =>
      request<FeePeriod>(`/fees/periods/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),

    updatePeriod: (id: number, data: { name?: string; status?: string; due_date?: string }): Promise<FeePeriod> =>
      request<FeePeriod>(`/fees/periods/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),

    addMemberToPeriod: (periodId: number, data: { user_id: number; amount_due?: number; discount_amount?: number; discount_reason?: string }): Promise<MemberFee> =>
      request<MemberFee>(`/fees/periods/${periodId}/members`, { method: 'POST', body: JSON.stringify(data) }),

    listPeriodMembers: (periodId: number, params?: { department_id?: number; status?: string; is_overdue?: boolean; page?: number; page_size?: number }): Promise<PaginatedResponse<MemberFee>> => {
      const query = new URLSearchParams();
      if (params?.department_id !== undefined) query.set('department_id', params.department_id.toString());
      if (params?.status) query.set('status', params.status);
      if (params?.is_overdue !== undefined) query.set('is_overdue', params.is_overdue.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<MemberFee>>(`/fees/periods/${periodId}/members?${query.toString()}`);
    },

    listMemberFees: (periodId: number, params?: { department_id?: number; status?: string; is_overdue?: boolean; page?: number; page_size?: number }): Promise<PaginatedResponse<MemberFee>> => {
      const query = new URLSearchParams();
      if (params?.department_id !== undefined) query.set('department_id', params.department_id.toString());
      if (params?.status) query.set('status', params.status);
      if (params?.is_overdue !== undefined) query.set('is_overdue', params.is_overdue.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<MemberFee>>(`/fees/periods/${periodId}/members?${query.toString()}`);
    },

    listDeptMemberStatuses: (periodId: number): Promise<DepartmentMemberFeeStatus[]> =>
      request<DepartmentMemberFeeStatus[]>(`/fees/periods/${periodId}/dept-members`),

    getMyFees: async (): Promise<MyFeesResponse> => {
      const fees = await request<MemberFee[]>('/fees/me');
      const payments = fees.flatMap((f) => f.payments || []);
      const claims = fees.flatMap((f) => f.claims || []);
      return { items: fees, payments, claims };
    },

    getBankInstructions: async (periodId?: number): Promise<BankTransferInstructions> => {
      const query = periodId ? `?period_id=${periodId}` : '';
      const res = await request<{
        bank_name: string;
        bank_account_number: string;
        bank_account_name: string;
        transfer_syntax: string;
      }>(`/fees/bank-instructions${query}`);
      return {
        bank_name: res.bank_name,
        account_number: res.bank_account_number,
        account_name: res.bank_account_name,
        syntax_guide: res.transfer_syntax,
      };
    },

    updateDiscount: (memberFeeId: number, data: { discount_amount: number; discount_reason?: string } | number, reason?: string): Promise<MemberFee> => {
      const amt = typeof data === 'object' ? data.discount_amount : data;
      const r = typeof data === 'object' ? (data.discount_reason || '') : (reason || '');
      return request<MemberFee>(`/fees/member-fees/${memberFeeId}/discount`, {
        method: 'PATCH',
        body: JSON.stringify({ discount_amount: amt, discount_reason: r }),
      });
    },

    recordPayment: (data: { member_fee_id: number; amount: number; method: string; note?: string; proof_photo_path?: string }): Promise<FeePayment> =>
      request<FeePayment>('/fees/payments', { method: 'POST', body: JSON.stringify(data) }),

    voidPayment: (paymentId: number, reason: string): Promise<FeePayment> =>
      request<FeePayment>(`/fees/payments/${paymentId}/void`, {
        method: 'POST',
        body: JSON.stringify({ void_reason: reason }),
      }),

    getReceipt: (receiptCode: string): Promise<FeePayment> =>
      request<FeePayment>(`/fees/payments/receipt/${receiptCode}`),

    createClaim: async (memberFeeId: number, formData: FormData): Promise<PaymentClaim> => {
      return request<PaymentClaim>(`/fees/payment-claims?member_fee_id=${memberFeeId}`, {
        method: 'POST',
        body: formData,
      });
    },

    submitClaim: async (memberFeeId: number, amount: number, transferTime: string, note: string | undefined, file: File): Promise<PaymentClaim> => {
      const formData = new FormData();
      formData.append('file', file);
      const query = new URLSearchParams();
      query.set('member_fee_id', memberFeeId.toString());
      query.set('amount', amount.toString());
      query.set('transfer_time', transferTime);
      if (note) query.set('note', note);
      return request<PaymentClaim>(`/fees/payment-claims?${query.toString()}`, {
        method: 'POST',
        body: formData,
      });
    },

    listClaims: (params?: { status?: string; period_id?: number }): Promise<PaymentClaim[]> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.period_id) query.set('period_id', params.period_id.toString());
      return request<PaymentClaim[]>(`/fees/payment-claims?${query.toString()}`);
    },

    reviewClaim: (claimId: number, status: 'confirmed' | 'rejected', reviewNote?: string): Promise<PaymentClaim> =>
      request<PaymentClaim>(`/fees/payment-claims/${claimId}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, review_note: reviewNote }),
      }),

    exportCsv: async (periodId: number): Promise<Blob> => {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/fees/periods/${periodId}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new ApiError('Không thể xuất file CSV.', response.status);
      }
      return response.blob();
    },
  },

  funds: {
    createExpenseRequest: (data: ExpenseRequestCreateInput): Promise<ExpenseRequest> =>
      request<ExpenseRequest>('/funds/expense-requests', { method: 'POST', body: JSON.stringify(data) }),

    listExpenseRequests: (params?: { status?: string; department_id?: number }): Promise<ExpenseRequest[]> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.department_id) query.set('department_id', params.department_id.toString());
      return request<ExpenseRequest[]>(`/funds/expense-requests?${query.toString()}`);
    },

    reviewExpenseRequest: (id: number, data: { action?: 'approved' | 'rejected'; status?: 'approved' | 'rejected'; review_note?: string } | 'approved' | 'rejected', reviewNote?: string): Promise<ExpenseRequest> => {
      const status = typeof data === 'object' ? (data.action || data.status) : data;
      const note = typeof data === 'object' ? data.review_note : reviewNote;
      return request<ExpenseRequest>(`/funds/expense-requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, review_note: note }),
      });
    },

    recordExpense: (data: RecordExpenseInput): Promise<LedgerEntry> => {
      return request<LedgerEntry>('/funds/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    recordIncome: (data: RecordIncomeInput): Promise<LedgerEntry> =>
      request<LedgerEntry>('/funds/income', { method: 'POST', body: JSON.stringify(data) }),

    recordOtherIncome: (data: RecordIncomeInput): Promise<LedgerEntry> => {
      return request<LedgerEntry>('/funds/income', { method: 'POST', body: JSON.stringify(data) });
    },

    voidLedger: (id: number, reason: string): Promise<LedgerEntry> =>
      request<LedgerEntry>(`/funds/ledger/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ void_reason: reason }),
      }),

    voidLedgerEntry: (id: number, reason: string): Promise<LedgerEntry> =>
      request<LedgerEntry>(`/funds/ledger/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ void_reason: reason }),
      }),

    listLedger: (params?: {
      type?: string;
      category?: string;
      department_id?: number;
      event_id?: number;
      include_voided?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedResponse<LedgerEntry>> => {
      const query = new URLSearchParams();
      if (params?.type) query.set('type', params.type);
      if (params?.category) query.set('category', params.category);
      if (params?.department_id) query.set('department_id', params.department_id.toString());
      if (params?.event_id) query.set('event_id', params.event_id.toString());
      if (params?.include_voided !== undefined) query.set('include_voided', params.include_voided.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<LedgerEntry>>(`/funds/ledger?${query.toString()}`);
    },

    listLedgerEntries: (params?: {
      type?: string;
      category?: string;
      department_id?: number;
      event_id?: number;
      include_voided?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedResponse<LedgerEntry>> => {
      const query = new URLSearchParams();
      if (params?.type) query.set('type', params.type);
      if (params?.category) query.set('category', params.category);
      if (params?.department_id) query.set('department_id', params.department_id.toString());
      if (params?.event_id) query.set('event_id', params.event_id.toString());
      if (params?.include_voided !== undefined) query.set('include_voided', params.include_voided.toString());
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      return request<PaginatedResponse<LedgerEntry>>(`/funds/ledger?${query.toString()}`);
    },

    getReport: (): Promise<FundReport> => request<FundReport>('/funds/report'),

    getPeriodReport: (periodId: number): Promise<FeePeriodReport> =>
      request<FeePeriodReport>(`/funds/period-report/${periodId}`),

    getOverview: (): Promise<FinanceOverview> => request<FinanceOverview>('/funds/overview'),

    getPublicOverview: (): Promise<FinanceOverview> => request<FinanceOverview>('/funds/overview'),

    uploadReceipt: async (file: File): Promise<{ filename: string; message: string }> => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{ filename: string; message: string }>('/funds/upload-receipt', {
        method: 'POST',
        body: formData,
      });
    },

    getReceiptPhotoUrl: async (filename: string): Promise<string> => {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/funds/receipt-photos/${filename}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new ApiError('Không thể tải ảnh chứng từ.', response.status);
      }
      const blob = await response.blob();
      return window.URL.createObjectURL(blob);
    },

    exportCsv: async (): Promise<Blob> => {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/funds/ledger/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new ApiError('Không thể xuất file CSV sổ quỹ.', response.status);
      }
      return response.blob();
    },
  },

  // ============================================================
  // Giai đoạn 5: Trợ lý Chatbot AI & Kho Tri Thức RAG
  // ============================================================
  chat: {
    streamMessage: async (
      content: string,
      conversationId?: number,
      onEvent?: (event: { type: string; data: any }) => void,
      signal?: AbortSignal
    ): Promise<void> => {
      await streamSSE('/chat/messages', { content, conversation_id: conversationId }, onEvent || (() => {}), signal);
    },

    streamPublicMessage: async (
      content: string,
      sessionId?: string,
      onEvent?: (event: { type: string; data: any }) => void,
      signal?: AbortSignal
    ): Promise<void> => {
      await streamSSE('/public/chat', { content, session_id: sessionId }, onEvent || (() => {}), signal);
    },

    streamChat: async (
      payload: { message: string; conversation_id?: number },
      handlers: {
        onStatus?: (status: string) => void;
        onToolCall?: (toolCall: any) => void;
        onDelta?: (delta: string) => void;
        onDone?: (data: any) => void;
        onError?: (err: any) => void;
      },
      signal?: AbortSignal
    ): Promise<void> => {
      await streamSSE(
        '/chat/messages',
        { content: payload.message, conversation_id: payload.conversation_id },
        (event) => {
          if (event.type === 'status' && handlers.onStatus) {
            handlers.onStatus(event.data?.text || event.data);
          } else if (event.type === 'tool_call' && handlers.onToolCall) {
            handlers.onToolCall(event.data);
          } else if (event.type === 'delta' && handlers.onDelta) {
            handlers.onDelta(event.data?.text || event.data);
          } else if (event.type === 'done' && handlers.onDone) {
            handlers.onDone(event.data);
          } else if (event.type === 'error' && handlers.onError) {
            handlers.onError(event.data);
          }
        },
        signal
      );
    },

    streamPublicChat: async (
      message: string,
      handlers: {
        onStatus?: (status: string) => void;
        onDelta?: (delta: string) => void;
        onDone?: (data: any) => void;
        onError?: (err: any) => void;
      },
      signal?: AbortSignal
    ): Promise<void> => {
      await streamSSE(
        '/public/chat',
        { content: message },
        (event) => {
          if (event.type === 'status' && handlers.onStatus) {
            handlers.onStatus(event.data?.text || event.data);
          } else if (event.type === 'delta' && handlers.onDelta) {
            handlers.onDelta(event.data?.text || event.data);
          } else if (event.type === 'done' && handlers.onDone) {
            handlers.onDone(event.data);
          } else if (event.type === 'error' && handlers.onError) {
            handlers.onError(event.data);
          }
        },
        signal
      );
    },

    listConversations: (): Promise<ConversationSummary[]> =>
      request<ConversationSummary[]>('/chat/conversations'),

    getConversation: (id: number): Promise<ConversationDetail> =>
      request<ConversationDetail>(`/chat/conversations/${id}`),

    deleteConversation: (id: number): Promise<void> =>
      request<void>(`/chat/conversations/${id}`, { method: 'DELETE' }),

    clearConversations: (): Promise<{ message: string; deleted_count: number }> =>
      request<{ message: string; deleted_count: number }>('/chat/conversations', { method: 'DELETE' }),

    clearAllSystemConversations: (): Promise<{ message: string; deleted_count: number }> =>
      request<{ message: string; deleted_count: number }>('/chat/admin/conversations', { method: 'DELETE' }),

    adminDeleteConversation: (id: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/chat/admin/conversations/${id}`, { method: 'DELETE' }),

    clearUnansweredQueries: (): Promise<{ message: string; deleted_count: number }> =>
      request<{ message: string; deleted_count: number }>('/chat/admin/unanswered', { method: 'DELETE' }),

    deleteUnansweredQuery: (logId: number): Promise<{ message: string }> =>
      request<{ message: string }>(`/chat/admin/unanswered/${logId}`, { method: 'DELETE' }),

    submitFeedback: (messageId: number, feedback: 'up' | 'down', note?: string): Promise<ChatMessage> =>
      request<ChatMessage>(`/chat/messages/${messageId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback, note }),
      }),

    sendFeedback: (messageId: number, feedback: 'up' | 'down', note?: string): Promise<ChatMessage> =>
      request<ChatMessage>(`/chat/messages/${messageId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback, note }),
      }),

    getAdminStats: (days?: number): Promise<ChatbotAdminStats> => {
      const q = days ? `?days=${days}` : '';
      return request<ChatbotAdminStats>(`/chat/admin/stats${q}`);
    },

    getUnansweredQueries: (limit?: number): Promise<UnansweredQueryItem[]> => {
      const q = limit ? `?limit=${limit}` : '';
      return request<UnansweredQueryItem[]>(`/chat/admin/unanswered${q}`);
    },
  },

  knowledge: {
    list: (params?: { category?: string; audience?: string; is_active?: boolean }): Promise<KnowledgeDocument[]> => {
      const query = new URLSearchParams();
      if (params?.category) query.set('category', params.category);
      if (params?.audience) query.set('audience', params.audience);
      if (params?.is_active !== undefined) query.set('is_active', params.is_active.toString());
      return request<KnowledgeDocument[]>(`/knowledge/documents?${query.toString()}`);
    },

    get: (id: number): Promise<KnowledgeDocument> =>
      request<KnowledgeDocument>(`/knowledge/documents/${id}`),

    create: (data: { title: string; category: string; audience: string; content: string }): Promise<KnowledgeDocument> =>
      request<KnowledgeDocument>('/knowledge/documents', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: number, data: Partial<KnowledgeDocument>): Promise<KnowledgeDocument> =>
      request<KnowledgeDocument>(`/knowledge/documents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: number): Promise<void> =>
      request<void>(`/knowledge/documents/${id}`, { method: 'DELETE' }),

    reindex: (): Promise<{ status: string; docs_created: number; docs_updated: number; total_chunks_indexed: number }> =>
      request<{ status: string; docs_created: number; docs_updated: number; total_chunks_indexed: number }>('/knowledge/reindex', {
        method: 'POST',
      }),
  },
};

async function streamSSE(
  endpoint: string,
  body: any,
  onEvent: (event: { type: string; data: any }) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errMsg = 'Lỗi kết nối tới máy chủ AI.';
    try {
      const errJson = await response.json();
      errMsg = errJson.detail || errMsg;
    } catch (_) {}
    throw new ApiError(errMsg, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiError('Trình duyệt không hỗ trợ đọc dữ liệu stream.', 0);
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const block of lines) {
      if (!block.trim()) continue;
      let eventType = 'message';
      let dataStr = '';

      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataStr = line.slice(6).trim();
        }
      }

      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          onEvent({ type: eventType, data: parsed });
        } catch (_) {
          onEvent({ type: eventType, data: dataStr });
        }
      }
    }
  }
}

