import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Department, Event, EventCreateInput } from '../types';
import { toVNDateTime, getEventTimingDetails } from '../utils/date';
import { Modal } from '../components/Modal';
import { QuickDateTimePicker } from '../components/QuickDateTimePicker';
import { toDateTimeLocalValue } from '../utils/date';
import { ModuleSubTabs } from '../components/ModuleSubTabs';
import { Pagination } from '../components/Pagination';
import { Alert } from '../components/Alert';
import {
  Calendar,
  MapPin,
  Users,
  Search,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle,
  CheckCircle2,
  FileText,
  Lock,
  Globe,
  RefreshCw,
  AlertCircle,
  Timer,
  UserCheck,
  LogOut,
  Camera,
} from 'lucide-react';

export const EventsPage: React.FC = () => {
  const { user, isAdmin, isDepartmentHead } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [events, setEvents] = useState<Event[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Bộ lọc tab: upcoming | registered | past | all | draft | pending_approval
  const urlTab = searchParams.get('tab');
  const initialTab =
    urlTab === 'registered' ||
    urlTab === 'past' ||
    urlTab === 'all' ||
    urlTab === 'draft' ||
    urlTab === 'pending_approval'
      ? urlTab
      : 'upcoming';

  const [tab, setTab] = useState<'upcoming' | 'registered' | 'past' | 'all' | 'draft' | 'pending_approval'>(initialTab);
  const [registeredCount, setRegisteredCount] = useState<number>(0);
  const [registeringId, setRegisteringId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const [search, setSearch] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);

  // Tự động đếm nhịp thời gian mỗi 30 giây để cập nhật đồng hồ đếm ngược
  useEffect(() => {
    const ticker = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(ticker);
  }, []);

  // Đồng bộ tab từ URL search params khi người dùng nhấn subtab hoặc back/forward
  useEffect(() => {
    const currentUrlTab = searchParams.get('tab');
    if (currentUrlTab === 'registered' && tab !== 'registered') {
      setTab('registered');
      setPage(1);
    } else if (currentUrlTab === 'past' && tab !== 'past') {
      setTab('past');
      setPage(1);
    } else if (!currentUrlTab && tab === 'registered') {
      setTab('upcoming');
      setPage(1);
    }
  }, [searchParams]);

  // Modal tạo sự kiện
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  // Form state
  const [createData, setCreateData] = useState<EventCreateInput>({
    title: '',
    description: '',
    location: '',
    start_time: '',
    end_time: '',
    registration_deadline: '',
    capacity: null,
    department_id: isDepartmentHead && user?.department_id ? user.department_id : null,
    is_public: true,
    checkin_open_minutes_before: 30,
    late_after_minutes: 15,
    checkin_close_minutes_after_start: null,
    checkout_open_after_minutes: null,
    checkout_close_minutes_after_end: 60,
  });

  const canCreateEvent = isAdmin || isDepartmentHead;

  // Lấy tổng số sự kiện đã đăng ký để hiển thị badge
  const refreshRegisteredCount = async () => {
    try {
      const res = await api.events.list({ registered_only: true, page_size: 1 });
      setRegisteredCount(res.total);
    } catch {
      // Bỏ qua lỗi
    }
  };

  useEffect(() => {
    refreshRegisteredCount();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {
        q: search || undefined,
        department_id: selectedDept ? parseInt(selectedDept) : undefined,
        page,
        page_size: 9,
      };

      if (tab === 'upcoming') {
        params.timeline = 'upcoming';
        params.upcoming_only = true;
        params.status = 'published';
      } else if (tab === 'registered') {
        params.registered_only = true;
      } else if (tab === 'past') {
        params.timeline = 'past';
        params.past_only = true;
      } else if (tab === 'all') {
        params.timeline = 'all';
      } else if (tab === 'draft') {
        params.status = 'draft';
      } else if (tab === 'pending_approval') {
        params.status = 'pending_approval';
      }

      const [eventsRes, deptsRes] = await Promise.all([
        api.events.list(params),
        api.departments.list({ is_active: true, page_size: 50 }).catch(() => ({ items: [] })),
      ]);

      setEvents(eventsRes.items);
      setTotal(eventsRes.total);
      setDepartments(deptsRes.items);

      if (tab === 'registered') {
        setRegisteredCount(eventsRes.total);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách sự kiện.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tab, search, selectedDept, page]);

  // Chuyển tab và cập nhật search params
  const handleTabChange = (newTab: typeof tab) => {
    setTab(newTab);
    setPage(1);
    if (newTab === 'registered') {
      setSearchParams({ tab: 'registered' });
    } else if (newTab === 'past') {
      setSearchParams({ tab: 'past' });
    } else {
      setSearchParams({});
    }
  };

  // Đăng ký nhanh từ card
  const handleQuickRegister = async (eventId: number, eventTitle: string) => {
    try {
      setRegisteringId(eventId);
      await api.events.register(eventId);
      showSuccess(`Đăng ký thành công tham gia "${eventTitle}"!`);
      await loadData();
      refreshRegisteredCount();
    } catch (err: any) {
      showError(err, 'Lỗi đăng ký sự kiện');
    } finally {
      setRegisteringId(null);
    }
  };

  // Xử lý tạo sự kiện
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateFormError(null);

    // Validate
    if (!createData.title.trim()) {
      setCreateFormError('Vui lòng nhập tiêu đề sự kiện.');
      return;
    }
    if (!createData.location.trim()) {
      setCreateFormError('Vui lòng nhập địa điểm tổ chức.');
      return;
    }
    if (!createData.start_time || !createData.end_time) {
      setCreateFormError('Vui lòng chọn thời gian bắt đầu và kết thúc.');
      return;
    }
    if (new Date(createData.end_time) <= new Date(createData.start_time)) {
      setCreateFormError('Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: EventCreateInput = {
        ...createData,
        capacity: createData.capacity ? Number(createData.capacity) : null,
        registration_deadline: createData.registration_deadline || null,
        checkin_close_minutes_after_start: createData.checkin_close_minutes_after_start
          ? Number(createData.checkin_close_minutes_after_start)
          : null,
        checkout_open_after_minutes: createData.checkout_open_after_minutes
          ? Number(createData.checkout_open_after_minutes)
          : null,
      };

      const newEvent = await api.events.create(payload);
      setIsCreateModalOpen(false);
      navigate(`/events/${newEvent.id}`);
    } catch (err: any) {
      setCreateFormError(err.message || 'Không thể tạo sự kiện.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <ModuleSubTabs module="events" />

      {/* HEADER SECTION */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Sự Kiện & Hoạt Động</h1>
          <p className="page-header-subtitle">
            Xem danh sách các sự kiện của câu lạc bộ, đăng ký tham gia và theo dõi điểm danh.
          </p>
        </div>

        {canCreateEvent && (
          <div className="page-header-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const defaultStart = new Date();
                defaultStart.setHours(20, 0, 0, 0); // Mặc định 20h tối
                const defaultEnd = new Date(defaultStart);
                defaultEnd.setHours(22, 0, 0, 0); // Mặc định 22h tối

                setCreateData({
                  title: '',
                  description: '',
                  location: '',
                  start_time: toDateTimeLocalValue(defaultStart),
                  end_time: toDateTimeLocalValue(defaultEnd),
                  registration_deadline: '',
                  capacity: null,
                  department_id: isDepartmentHead ? (user?.department_id ?? null) : null,
                  is_public: true,
                  checkin_open_minutes_before: 30,
                  late_after_minutes: 15,
                  checkin_close_minutes_after_start: null,
                  checkout_open_after_minutes: null,
                  checkout_close_minutes_after_end: 60,
                });
                setCreateFormError(null);
                setIsCreateModalOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Tạo sự kiện mới</span>
            </button>
          </div>
        )}
      </div>

      {/* TABS LỌC TRẠNG THÁI */}
      <div className="segmented-tabs-wrapper">
        <div className="segmented-tabs">
          <button
            type="button"
            className={`segmented-tab-btn ${tab === 'upcoming' ? 'active' : ''}`}
            onClick={() => handleTabChange('upcoming')}
          >
            <Calendar size={15} />
            <span>Sắp tới</span>
          </button>

          <button
            type="button"
            className={`segmented-tab-btn ${tab === 'registered' ? 'active' : ''}`}
            onClick={() => handleTabChange('registered')}
          >
            <CheckCircle2 size={15} />
            <span>Đã đăng ký</span>
            {registeredCount > 0 && (
              <span
                style={{
                  background: tab === 'registered' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  marginLeft: '4px',
                }}
              >
                {registeredCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`segmented-tab-btn ${tab === 'past' ? 'active' : ''}`}
            onClick={() => handleTabChange('past')}
          >
            <Clock size={15} />
            <span>Đã qua</span>
          </button>

          <button
            type="button"
            className={`segmented-tab-btn ${tab === 'all' ? 'active' : ''}`}
            onClick={() => handleTabChange('all')}
          >
            <span>Tất cả</span>
          </button>

          {canCreateEvent && (
            <>
              <button
                type="button"
                className={`segmented-tab-btn ${tab === 'draft' ? 'active' : ''}`}
                onClick={() => handleTabChange('draft')}
              >
                <FileText size={15} />
                <span>Bản nháp</span>
              </button>
              <button
                type="button"
                className={`segmented-tab-btn ${tab === 'pending_approval' ? 'active' : ''}`}
                onClick={() => handleTabChange('pending_approval')}
              >
                <Clock size={15} />
                <span>Chờ duyệt</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* THANH TÌM KIẾM VÀ LỌC BAN */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Tìm theo tên sự kiện, địa điểm..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ paddingLeft: '38px' }}
            />
          </div>

          <div style={{ minWidth: '200px' }}>
            <select
              className="form-select"
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả các ban / Toàn CLB</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={loadData}
          disabled={loading}
          title="Tải lại"
        >
          <RefreshCw size={16} className={loading ? 'spin-animate' : ''} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* DANH SÁCH SỰ KIỆN */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={36} className="spin-animate" style={{ marginBottom: '12px' }} />
          <div>Đang tải sự kiện...</div>
        </div>
      ) : error ? (
        <Alert
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      ) : events.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '60px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          {tab === 'registered' ? (
            <>
              <CheckCircle2 size={52} style={{ opacity: 0.35, marginBottom: '14px', color: 'var(--primary)' }} />
              <h3 style={{ marginBottom: '8px' }}>Bạn chưa đăng ký sự kiện nào</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Khám phá các sự kiện và hoạt động hấp dẫn sắp tới của CLB để đăng ký tham gia ngay!
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ display: 'inline-flex' }}
                onClick={() => handleTabChange('upcoming')}
              >
                <Calendar size={16} />
                <span>Xem sự kiện sắp tới</span>
              </button>
            </>
          ) : (
            <>
              <Calendar size={52} style={{ opacity: 0.35, marginBottom: '14px' }} />
              <h3 style={{ marginBottom: '8px' }}>Không tìm thấy sự kiện nào</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Chưa có sự kiện nào trong danh mục này hoặc không khớp với từ khóa tìm kiếm.
              </p>
            </>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '22px',
          }}
        >
          {events.map((event) => {
            const isRegistered = Boolean(
              event.is_registered ||
              (event.my_registration && event.my_registration.status === 'registered')
            );
            const isFull = event.capacity !== null && (event.registered_count || 0) >= event.capacity;
            const timing = getEventTimingDetails(event, event.my_registration, currentTime);

            return (
              <div
                key={event.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  borderTop:
                    event.status === 'draft'
                      ? '3px solid var(--warning)'
                      : event.status === 'pending_approval'
                      ? '3px solid #f59e0b'
                      : event.status === 'rejected'
                      ? '3px solid var(--danger)'
                      : event.status === 'cancelled'
                      ? '3px solid var(--danger)'
                      : isRegistered
                      ? '3px solid var(--success)'
                      : '3px solid var(--primary)',
                }}
              >
                <div>
                  {/* HÀNG BADGES TRẠNG THÁI */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px',
                      flexWrap: 'wrap',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span className="badge badge-primary">
                        {event.department ? event.department.name : 'Toàn CLB'}
                      </span>
                      {event.is_public ? (
                        <span className="badge badge-neutral" title="Sự kiện mở công khai">
                          <Globe size={11} /> Công khai
                        </span>
                      ) : (
                        <span className="badge badge-neutral" title="Chỉ hội viên nội bộ">
                          <Lock size={11} /> Nội bộ
                        </span>
                      )}
                    </div>

                    <div>
                      {event.status === 'draft' && (
                        <span className="badge badge-warning">Bản nháp</span>
                      )}
                      {event.status === 'pending_approval' && (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>Chờ duyệt</span>
                      )}
                      {event.status === 'rejected' && (
                        <span className="badge badge-danger">Bị từ chối</span>
                      )}
                      {event.status === 'cancelled' && (
                        <span className="badge badge-danger">Đã hủy</span>
                      )}
                      {event.status === 'published' && isFull && (
                        <span className="badge badge-danger">Hết chỗ</span>
                      )}
                      {event.status === 'published' && !isFull && (
                        <span className="badge badge-success">Đang mở</span>
                      )}
                    </div>
                  </div>

                  {/* KHUNG ĐẾM NGƯỢC THỜI GIAN BẮT ĐẦU */}
                  {timing.startCountdown.isUpcoming ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        color: '#1d4ed8',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        marginBottom: '12px',
                      }}
                    >
                      <Timer size={15} color="#2563eb" />
                      <span>{timing.startCountdown.text}</span>
                    </div>
                  ) : timing.startCountdown.isOngoing ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#047857',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        marginBottom: '12px',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#059669',
                          display: 'inline-block',
                          boxShadow: '0 0 8px rgba(5, 150, 105, 0.6)',
                        }}
                      />
                      <span>{timing.startCountdown.text}</span>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-muted)',
                        fontSize: '0.82rem',
                        marginBottom: '12px',
                      }}
                    >
                      <Clock size={14} />
                      <span>Sự kiện đã kết thúc</span>
                    </div>
                  )}

                  <h3
                    style={{
                      fontSize: '1.2rem',
                      marginBottom: '8px',
                      lineHeight: 1.35,
                    }}
                  >
                    <Link to={`/events/${event.id}`} style={{ color: 'inherit' }}>
                      {event.title}
                    </Link>
                  </h3>

                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '14px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.5,
                    }}
                  >
                    {event.description || 'Không có mô tả chi tiết.'}
                  </p>

                  {/* THÔNG TIN ĐỊA ĐIỂM & CHỖ NGỒI */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px',
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={15} color="var(--primary)" />
                      <span>{toVNDateTime(event.start_time)}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={15} color="var(--accent-purple)" />
                      <span>{event.location}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={15} color="var(--accent-cyan)" />
                      <span>
                        Đã đăng ký: <strong>{event.registered_count || 0}</strong>
                        {event.capacity !== null ? ` / ${event.capacity}` : ' (không giới hạn)'}
                      </span>
                    </div>
                  </div>

                  {/* TIẾN TRÌNH KHUNG GIỜ ĐIỂM DANH ĐẾN VÀ VỀ */}
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {/* ĐIỂM DANH ĐẾN */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                        <UserCheck size={14} color="var(--primary)" />
                        <span>Điểm danh đến:</span>
                      </div>
                      <span className={`badge badge-${timing.checkIn.badgeType}`} style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
                        {timing.checkIn.text}
                      </span>
                    </div>

                    {/* ĐIỂM DANH VỀ */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                        <LogOut size={14} color="var(--accent-purple)" />
                        <span>Điểm danh về:</span>
                      </div>
                      <span className={`badge badge-${timing.checkOut.badgeType}`} style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
                        {timing.checkOut.text}
                      </span>
                    </div>
                  </div>
                </div>

                {/* FOOTER CỦA CARD */}
                <div
                  style={{
                    paddingTop: '14px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div>
                    {isRegistered ? (
                      <span className="badge badge-success" style={{ textTransform: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle size={13} /> Đã đăng ký
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Chưa đăng ký
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* NÚT THAO TÁC TRỰC TIẾP TỪ CARD */}
                    {isRegistered && (timing.canCheckInNow || timing.canCheckOutNow) ? (
                      <Link
                        to={`/events/${event.id}`}
                        className="btn btn-primary btn-sm"
                        title="Đang trong khung giờ điểm danh, nhấn để chụp ảnh điểm danh ngay"
                      >
                        <Camera size={14} />
                        <span>{timing.canCheckInNow ? 'Điểm danh đến' : 'Điểm danh về'}</span>
                      </Link>
                    ) : !isRegistered && event.status === 'published' && !isFull && !timing.startCountdown.isEnded ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleQuickRegister(event.id, event.title)}
                        disabled={registeringId === event.id}
                      >
                        {registeringId === event.id ? (
                          <RefreshCw size={13} className="spin-animate" />
                        ) : (
                          <Plus size={13} />
                        )}
                        <span>Đăng ký</span>
                      </button>
                    ) : null}

                    <Link to={`/events/${event.id}`} className="btn btn-secondary btn-sm">
                      <span>{isRegistered ? 'Chi tiết' : 'Xem chi tiết'}</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PHÂN TRANG */}
      <Pagination
        currentPage={page}
        totalPages={Math.ceil(total / 9) || 1}
        totalItems={total}
        pageSize={9}
        onPageChange={setPage}
        itemName="sự kiện"
      />

      {/* MODAL TẠO SỰ KIỆN MỚI */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Tạo sự kiện mới"
        maxWidth="680px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSubmitting}
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreateSubmit}
              disabled={isSubmitting || (isDepartmentHead && !user?.department_id)}
            >
              {isSubmitting ? 'Đang tạo...' : 'Tạo sự kiện'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          {isDepartmentHead && !user?.department_id && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--warning-light)',
                color: '#fcd34d',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>
                Tài khoản của bạn có vai trò <strong>Trưởng ban</strong> nhưng chưa được chỉ định vào ban chuyên môn nào. Vui lòng liên hệ Quản trị viên vào mục <strong>Quản lý ban / Thành viên</strong> để chỉ định ban trước khi tạo sự kiện.
              </span>
            </div>
          )}

          {createFormError && (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--danger-light)',
                color: '#fca5a5',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                fontSize: '0.875rem',
              }}
            >
              {createFormError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              <span>Tiêu đề sự kiện *</span>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="VD: Workshop Kỹ năng Phỏng vấn & Viết CV"
              value={createData.title}
              onChange={(e) => setCreateData({ ...createData, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <span>Mô tả sự kiện</span>
            </label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Nội dung, mục đích và diễn giả sự kiện..."
              value={createData.description || ''}
              onChange={(e) => setCreateData({ ...createData, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">
                <span>Địa điểm tổ chức *</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="VD: Hội trường A, Tầng 3"
                value={createData.location}
                onChange={(e) => setCreateData({ ...createData, location: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Giới hạn số chỗ (để trống = không giới hạn)</span>
              </label>
              <input
                type="number"
                className="form-input"
                placeholder="VD: 100"
                min={1}
                value={createData.capacity ?? ''}
                onChange={(e) =>
                  setCreateData({
                    ...createData,
                    capacity: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>

          {/* TRỢ LÝ ĐẶT NHANH NGÀY & GIỜ */}
          <QuickDateTimePicker
            startTime={createData.start_time}
            endTime={createData.end_time}
            registrationDeadline={createData.registration_deadline}
            onChangeStartTime={(val) => setCreateData((prev) => ({ ...prev, start_time: val }))}
            onChangeEndTime={(val) => setCreateData((prev) => ({ ...prev, end_time: val }))}
            onChangeDeadline={(val) => setCreateData((prev) => ({ ...prev, registration_deadline: val }))}
          />

          <div className="form-group">
            <label className="form-label">
              <span>Phạm vi tổ chức</span>
            </label>
            {isAdmin ? (
              <select
                className="form-select"
                value={createData.department_id ?? ''}
                onChange={(e) =>
                  setCreateData({
                    ...createData,
                    department_id: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              >
                <option value="">Toàn câu lạc bộ (Toàn CLB)</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    Ban: {dept.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="form-input"
                disabled
                value={
                  user?.department_name
                    ? `Sự kiện ban: ${user.department_name}`
                    : user?.department_id
                    ? `Sự kiện ban ID #${user.department_id}`
                    : 'Chưa được chỉ định ban (Liên hệ Admin)'
                }
              />
            )}
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={createData.is_public}
                onChange={(e) => setCreateData({ ...createData, is_public: e.target.checked })}
              />
              <span style={{ fontSize: '0.9rem' }}>
                Công khai sự kiện cho khách và người ngoài câu lạc bộ xem
              </span>
            </label>
          </div>

          {/* CẤU HÌNH ĐIỂM DANH */}
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              marginTop: '10px',
            }}
          >
            <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--primary)' }}>
              Cấu hình tham số điểm danh (phút)
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Mở điểm danh đến trước (phút)
                </label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  value={createData.checkin_open_minutes_before}
                  onChange={(e) =>
                    setCreateData({
                      ...createData,
                      checkin_open_minutes_before: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Tính là đến muộn sau (phút)
                </label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  value={createData.late_after_minutes}
                  onChange={(e) =>
                    setCreateData({
                      ...createData,
                      late_after_minutes: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Đóng điểm danh đến sau giờ bắt đầu (để trống = đến hết giờ)
                </label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  placeholder="Mặc định: hết giờ sự kiện"
                  value={createData.checkin_close_minutes_after_start ?? ''}
                  onChange={(e) =>
                    setCreateData({
                      ...createData,
                      checkin_close_minutes_after_start: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Mở điểm danh về sau giờ bắt đầu (để trống = nửa thời lượng)
                </label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  placeholder="Mặc định: 50% thời lượng"
                  value={createData.checkout_open_after_minutes ?? ''}
                  onChange={(e) =>
                    setCreateData({
                      ...createData,
                      checkout_open_after_minutes: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
