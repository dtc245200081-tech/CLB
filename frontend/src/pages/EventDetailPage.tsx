import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Event,
  EventRegistration,
  EventAttendance,
  EventStats,
  EventUpdateInput,
} from '../types';
import { toVNDateTime, computeAttendanceWindows, EventWindows, getEventTimingDetails } from '../utils/date';
import { Modal } from '../components/Modal';
import { CameraCapture } from '../components/CameraCapture';
import { AttendancePhotoModal } from '../components/AttendancePhotoModal';
import { QuickDateTimePicker } from '../components/QuickDateTimePicker';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Pagination, paginateArray } from '../components/Pagination';
import { Alert } from '../components/Alert';
import {
  Calendar,
  Clock,
  Timer,
  MapPin,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Camera,
  Edit,
  FileSpreadsheet,
  ArrowLeft,
  RefreshCw,
  Send,
  Eye,
  Shield,
  UserCheck,
  UserX,
} from 'lucide-react';

export const EventDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  const { user, isAdmin, isDepartmentHead } = useAuth();
  const confirm = useConfirm();
  const { showSuccess, showError, showWarning } = useToast();

  const [event, setEvent] = useState<Event | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [attendances, setAttendances] = useState<EventAttendance[]>([]);
  const [myRegistration, setMyRegistration] = useState<EventRegistration | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Pagination states
  const [regPage, setRegPage] = useState<number>(1);
  const [regPageSize, setRegPageSize] = useState<number>(10);
  const [reviewPage, setReviewPage] = useState<number>(1);
  const [reviewPageSize, setReviewPageSize] = useState<number>(8);

  // Quản lý tab phía người quản lý
  const [managerTab, setManagerTab] = useState<'attendees' | 'reviews'>('attendees');
  const [reviewFilter, setReviewFilter] = useState<string>('pending');
  const [attendeeSearch, setAttendeeSearch] = useState<string>('');

  // Modals
  const [cameraModalType, setCameraModalType] = useState<'check_in' | 'check_out' | null>(null);
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState<boolean>(false);

  const [selectedPhotoAttendance, setSelectedPhotoAttendance] = useState<EventAttendance | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState<boolean>(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editData, setEditData] = useState<EventUpdateInput>({});
  const [isUpdatingEvent, setIsUpdatingEvent] = useState<boolean>(false);

  // Điểm danh thủ công
  const [manualUser, setManualUser] = useState<EventRegistration | null>(null);
  const [manualType, setManualType] = useState<'check_in' | 'check_out'>('check_in');
  const [manualIsLate, setManualIsLate] = useState<boolean>(false);
  const [manualNote, setManualNote] = useState<string>('');
  const [isSubmittingManual, setIsSubmittingManual] = useState<boolean>(false);

  // Từ chối ảnh kèm lý do
  const [rejectingAttendanceId, setRejectingAttendanceId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState<string>('');

  // Phê duyệt / Từ chối sự kiện
  const [isRejectEventModalOpen, setIsRejectEventModalOpen] = useState<boolean>(false);
  const [eventRejectReason, setEventRejectReason] = useState<string>('');
  const [isSubmittingEventReject, setIsSubmittingEventReject] = useState<boolean>(false);
  const [isSubmittingEventSubmit, setIsSubmittingEventSubmit] = useState<boolean>(false);

  // Quyền quản lý sự kiện này: Admin hoặc Trưởng ban đúng ban của sự kiện
  const canManage =
    Boolean(user) &&
    (isAdmin ||
      (isDepartmentHead &&
        event?.department_id !== null &&
        event?.department_id === user?.department_id));

  // Tải dữ liệu sự kiện
  const loadEventData = async () => {
    if (!eventId) return;
    try {
      setLoading(true);
      setError(null);

      const eventRes = await api.events.getById(eventId);
      setEvent(eventRes);

      // Nếu có thể quản lý, tải thêm danh sách đăng ký, thống kê và ảnh duyệt
      if (
        user &&
        (user.role === 'admin' ||
          (user.role === 'department_head' &&
            eventRes.department_id !== null &&
            eventRes.department_id === user.department_id))
      ) {
        const [statsRes, regsRes, attsRes] = await Promise.all([
          api.events.getStats(eventId).catch(() => null),
          api.events.getRegistrations(eventId, { page_size: 100 }).catch(() => ({ items: [] })),
          api.events.getAttendances(eventId, { page_size: 100 }).catch(() => ({ items: [] })),
        ]);
        setStats(statsRes);
        setRegistrations(regsRes.items);
        setAttendances(attsRes.items);

        // Tìm đăng ký của chính mình trong danh sách nếu có
        const myReg = regsRes.items.find((r) => r.user_id === user.id);
        setMyRegistration(myReg || null);
      } else if (eventRes.is_registered) {
        // Tìm đăng ký của bản thân qua getMyRegistrations
        const historyRes = await api.users.getMyRegistrations({ page_size: 50 });
        const myItem = historyRes.items.find((h) => h.event_id === eventId);
        if (myItem) {
          setMyRegistration({
            id: myItem.registration_id,
            user_id: user?.id || 0,
            event_id: eventId,
            status: myItem.registration_status,
            created_at: myItem.registered_at,
            updated_at: myItem.registered_at,
            check_in: myItem.check_in,
            check_out: myItem.check_out,
            duration_minutes: myItem.duration_minutes,
            is_late: myItem.is_late,
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải thông tin sự kiện.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEventData();
  }, [eventId]);

  // Reset pagination on filter change
  useEffect(() => {
    setRegPage(1);
  }, [attendeeSearch]);

  useEffect(() => {
    setReviewPage(1);
  }, [reviewFilter]);

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const ticker = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(ticker);
  }, []);

  const isUserRegistered = Boolean(
    event?.is_registered ||
    (event?.my_registration && event?.my_registration.status === 'registered') ||
    (myRegistration && myRegistration.status === 'registered')
  );

  const timing = event ? getEventTimingDetails(event, myRegistration, currentTime) : null;

  // Tính toán khung giờ điểm danh
  const windows: EventWindows | null = event
    ? computeAttendanceWindows({
        start_time: event.start_time,
        end_time: event.end_time,
        checkin_open_minutes_before: event.checkin_open_minutes_before,
        late_after_minutes: event.late_after_minutes,
        checkin_close_minutes_after_start: event.checkin_close_minutes_after_start,
        checkout_open_after_minutes: event.checkout_open_after_minutes,
        checkout_close_minutes_after_end: event.checkout_close_minutes_after_end,
      })
    : null;

  // Đăng ký tham gia
  const handleRegister = async () => {
    if (!event) return;
    try {
      setActionSuccess(null);
      await api.events.register(event.id);
      const msg = 'Đăng ký tham gia sự kiện thành công!';
      setActionSuccess(msg);
      showSuccess(msg);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi đăng ký sự kiện');
    }
  };

  // Hủy đăng ký
  const handleCancelRegistration = async () => {
    if (!event) return;
    const ok = await confirm({
      title: 'Hủy đăng ký sự kiện',
      message: 'Bạn có chắc chắn muốn hủy đăng ký tham gia sự kiện này? Thao tác này sẽ nhường lại vị trí cho hội viên khác.',
      confirmText: 'Hủy đăng ký',
      type: 'danger',
    });
    if (!ok) return;

    try {
      setActionSuccess(null);
      await api.events.cancelRegistration(event.id);
      const msg = 'Đã hủy đăng ký thành công.';
      setActionSuccess(msg);
      showSuccess(msg);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi hủy đăng ký');
    }
  };

  // Gửi duyệt sự kiện (Trưởng ban gửi lên Admin)
  const handleSubmitEvent = async () => {
    if (!event) return;
    const ok = await confirm({
      title: 'Gửi duyệt sự kiện',
      message: 'Bạn có chắc chắn muốn gửi sự kiện này lên Quản trị viên để xét duyệt?',
      confirmText: 'Gửi xét duyệt',
      type: 'info',
    });
    if (!ok) return;

    try {
      setIsSubmittingEventSubmit(true);
      await api.events.submit(event.id);
      const msg = 'Đã gửi sự kiện lên Quản trị viên phê duyệt thành công!';
      setActionSuccess(msg);
      showSuccess(msg);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi gửi duyệt sự kiện');
    } finally {
      setIsSubmittingEventSubmit(false);
    }
  };

  // Duyệt / Xuất bản sự kiện (Admin)
  const handlePublish = async () => {
    if (!event) return;
    const isApproval = event.status === 'pending_approval';
    const ok = await confirm({
      title: isApproval ? 'Duyệt & Công bố sự kiện' : 'Xuất bản sự kiện',
      message: isApproval
        ? 'Bạn có chắc chắn muốn DUYỆT và công bố sự kiện này cho toàn thể thành viên tham gia?'
        : 'Bạn có chắc chắn muốn xuất bản sự kiện này để hội viên có thể đăng ký?',
      confirmText: isApproval ? 'Duyệt & Công bố' : 'Xuất bản ngay',
      type: 'success',
    });
    if (!ok) return;

    try {
      await api.events.publish(event.id);
      const msg = 'Phê duyệt và xuất bản sự kiện thành công!';
      setActionSuccess(msg);
      showSuccess(msg);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi xuất bản sự kiện');
    }
  };

  // Xác nhận từ chối sự kiện (Admin)
  const handleConfirmEventReject = async () => {
    if (!event) return;
    if (!eventRejectReason.trim()) {
      showWarning('Vui lòng nhập lý do từ chối duyệt sự kiện.');
      return;
    }
    try {
      setIsSubmittingEventReject(true);
      await api.events.reject(event.id, eventRejectReason.trim());
      const msg = 'Đã từ chối duyệt sự kiện.';
      setActionSuccess(msg);
      showSuccess(msg);
      setIsRejectEventModalOpen(false);
      setEventRejectReason('');
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi từ chối sự kiện');
    } finally {
      setIsSubmittingEventReject(false);
    }
  };

  // Hủy sự kiện
  const handleCancelEvent = async () => {
    if (!event) return;
    const ok = await confirm({
      title: 'Hủy tổ chức sự kiện',
      message: 'Bạn có chắc chắn muốn hủy sự kiện này? Hành động này sẽ khóa đăng ký và vô hiệu các lượt điểm danh.',
      confirmText: 'Hủy sự kiện',
      type: 'danger',
    });
    if (!ok) return;

    try {
      await api.events.cancel(event.id);
      const msg = 'Đã hủy sự kiện thành công.';
      setActionSuccess(msg);
      showSuccess(msg);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi hủy sự kiện');
    }
  };

  // Gửi điểm danh ảnh
  const handleAttendanceCapture = async (blob: Blob, source: 'camera' | 'upload') => {
    if (!event || !cameraModalType) return;
    try {
      setIsSubmittingAttendance(true);
      if (cameraModalType === 'check_in') {
        await api.events.checkIn(event.id, blob, source);
        const msg = 'Điểm danh lúc ĐẾN thành công!';
        setActionSuccess(msg);
        showSuccess(msg);
      } else {
        await api.events.checkOut(event.id, blob, source);
        const msg = 'Điểm danh lúc VỀ thành công!';
        setActionSuccess(msg);
        showSuccess(msg);
      }
      setCameraModalType(null);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi điểm danh');
    } finally {
      setIsSubmittingAttendance(false);
    }
  };

  // Xuất CSV
  const handleExportCsv = async () => {
    if (!event) return;
    try {
      await api.events.exportCsv(event.id, `su_kien_${event.id}_danh_sach.csv`);
      showSuccess('Xuất danh sách CSV thành công!');
    } catch (err: any) {
      showError(err, 'Lỗi xuất tệp CSV');
    }
  };

  // Duyệt ảnh
  const handleApprovePhoto = async (attendanceId: number) => {
    try {
      await api.attendances.approve(attendanceId);
      const msg = 'Đã duyệt ảnh điểm danh thành công!';
      setActionSuccess(msg);
      showSuccess(msg);
      setIsPhotoModalOpen(false);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi duyệt ảnh điểm danh');
    }
  };

  // Mở modal từ chối ảnh
  const handleOpenRejectModal = (attendanceId: number) => {
    setRejectingAttendanceId(attendanceId);
    setRejectNote('');
  };

  // Xác nhận từ chối ảnh
  const handleConfirmReject = async () => {
    if (!rejectingAttendanceId) return;
    if (!rejectNote.trim()) {
      showWarning('Vui lòng nhập lý do từ chối ảnh.');
      return;
    }
    try {
      await api.attendances.reject(rejectingAttendanceId, rejectNote.trim());
      const msg = 'Đã từ chối ảnh điểm danh.';
      setActionSuccess(msg);
      showSuccess(msg);
      setRejectingAttendanceId(null);
      setIsPhotoModalOpen(false);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi từ chối ảnh');
    }
  };

  // Điểm danh thủ công
  const handleManualAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !manualUser) return;
    try {
      setIsSubmittingManual(true);
      await api.events.manualAttendance(event.id, manualUser.user_id, {
        type: manualType,
        is_late: manualType === 'check_in' ? manualIsLate : false,
        note: manualNote.trim() || undefined,
      });
      const msg = `Điểm danh thủ công cho ${manualUser.user?.full_name} thành công!`;
      setActionSuccess(msg);
      showSuccess(msg);
      setManualUser(null);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi điểm danh thủ công');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Hủy một lượt điểm danh
  const handleCancelAttendance = async (userId: number, type: 'check_in' | 'check_out') => {
    if (!event) return;
    const ok = await confirm({
      title: 'Hủy lượt điểm danh',
      message: `Bạn có chắc chắn muốn hủy lượt ${type === 'check_in' ? 'ĐẾN' : 'VỀ'} của thành viên này?`,
      confirmText: 'Hủy lượt',
      type: 'warning',
    });
    if (!ok) return;

    try {
      await api.events.cancelAttendance(event.id, userId, type);
      const msg = 'Đã hủy lượt điểm danh thành công.';
      setActionSuccess(msg);
      showSuccess(msg);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi hủy lượt điểm danh');
    }
  };

  // Cập nhật sự kiện
  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    try {
      setIsUpdatingEvent(true);
      await api.events.update(event.id, editData);
      const msg = 'Cập nhật sự kiện thành công!';
      setActionSuccess(msg);
      showSuccess(msg);
      setIsEditModalOpen(false);
      await loadEventData();
    } catch (err: any) {
      showError(err, 'Lỗi cập nhật sự kiện');
    } finally {
      setIsUpdatingEvent(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={36} className="spin-animate" style={{ marginBottom: '14px' }} />
        <div>Đang tải chi tiết sự kiện...</div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
        <AlertCircle size={48} color="var(--danger)" style={{ marginBottom: '12px' }} />
        <h3 style={{ marginBottom: '8px' }}>Không tìm thấy sự kiện</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>{error || 'Sự kiện không tồn tại hoặc đã bị xóa.'}</p>
        <Link to="/events" className="btn btn-secondary">
          <ArrowLeft size={16} /> Quay lại danh sách sự kiện
        </Link>
      </div>
    );
  }

  // Danh sách ảnh lọc theo tab
  const filteredAttendances = attendances.filter((att) => {
    if (reviewFilter === 'all') return true;
    return att.review_status === reviewFilter;
  });

  // Danh sách người đăng ký lọc theo từ khóa
  const filteredRegistrations = registrations.filter((reg) => {
    if (!attendeeSearch.trim()) return true;
    const term = attendeeSearch.toLowerCase();
    return (
      reg.user?.full_name?.toLowerCase().includes(term) ||
      reg.user?.student_id?.toLowerCase().includes(term) ||
      reg.user?.email?.toLowerCase().includes(term)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* NÚT QUAY LẠI & THÔNG BÁO THÀNH CÔNG */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <Link to="/events" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
          <ArrowLeft size={16} />
          <span>Quay lại danh sách sự kiện</span>
        </Link>
      </div>

      {actionSuccess && (
        <Alert
          type="success"
          message={actionSuccess}
          onClose={() => setActionSuccess(null)}
        />
      )}
      {error && (
        <Alert
          type="error"
          error={error}
          onClose={() => setError(null)}
        />
      )}

      {/* HEADER CARD SỰ KIỆN */}
      <div className="card card-glowing" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <span className="badge badge-primary">
                {event.department ? event.department.name : 'Toàn câu lạc bộ'}
              </span>

              {event.is_public ? (
                <span className="badge badge-neutral">Sự kiện công khai</span>
              ) : (
                <span className="badge badge-neutral">Sự kiện nội bộ</span>
              )}

              {event.status === 'draft' && <span className="badge badge-warning">Bản nháp</span>}
              {event.status === 'pending_approval' && (
                <span
                  className="badge"
                  style={{
                    background: 'rgba(245, 158, 11, 0.2)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                  }}
                >
                  <Clock size={12} style={{ marginRight: '4px' }} />
                  Đang chờ duyệt
                </span>
              )}
              {event.status === 'rejected' && <span className="badge badge-danger">Bị từ chối</span>}
              {event.status === 'cancelled' && <span className="badge badge-danger">Đã hủy</span>}
              {event.status === 'published' && <span className="badge badge-success">Đã xuất bản</span>}
            </div>

            <h1 style={{ fontSize: '2.1rem', marginBottom: '12px', lineHeight: 1.25 }}>{event.title}</h1>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
                color: 'var(--text-secondary)',
                fontSize: '0.925rem',
                marginTop: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="var(--primary)" />
                <div>
                  <span style={{ display: 'block', fontSize: '0.775rem', color: 'var(--text-muted)' }}>Thời gian</span>
                  <strong>{toVNDateTime(event.start_time)}</strong> – {toVNDateTime(event.end_time)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={18} color="var(--accent-purple)" />
                <div>
                  <span style={{ display: 'block', fontSize: '0.775rem', color: 'var(--text-muted)' }}>Địa điểm</span>
                  <strong>{event.location}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} color="var(--accent-cyan)" />
                <div>
                  <span style={{ display: 'block', fontSize: '0.775rem', color: 'var(--text-muted)' }}>Chỗ ngồi</span>
                  <strong>{event.registered_count || 0}</strong>
                  {event.capacity !== null ? ` / ${event.capacity} người` : ' (không giới hạn)'}
                </div>
              </div>
            </div>

            {/* BANNER TIẾN ĐỘ THỜI GIAN & KHUNG GIỜ ĐIỂM DANH */}
            {timing && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: timing.startCountdown.isUpcoming
                    ? '#eff6ff'
                    : timing.startCountdown.isOngoing
                    ? '#ecfdf5'
                    : 'var(--bg-surface-elevated)',
                  border: `1px solid ${
                    timing.startCountdown.isUpcoming
                      ? '#bfdbfe'
                      : timing.startCountdown.isOngoing
                      ? '#a7f3d0'
                      : 'var(--border-subtle)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: timing.startCountdown.isUpcoming
                      ? '#1d4ed8'
                      : timing.startCountdown.isOngoing
                      ? '#047857'
                      : 'var(--text-muted)',
                  }}
                >
                  {timing.startCountdown.isOngoing ? (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#10b981',
                        display: 'inline-block',
                        boxShadow: '0 0 8px #10b981',
                      }}
                    />
                  ) : (
                    <Timer size={18} />
                  )}
                  <span>{timing.startCountdown.text}</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Điểm danh đến: </span>
                    <strong style={{ color: timing.checkIn.state === 'open' ? 'var(--success)' : 'inherit' }}>
                      {timing.checkIn.text}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Điểm danh về: </span>
                    <strong style={{ color: timing.checkOut.state === 'open' ? 'var(--success)' : 'inherit' }}>
                      {timing.checkOut.text}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CÁC NÚT ĐIỀU KHIỂN CỦA QUẢN LÝ */}
          {canManage && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {/* ADMIN: Duyệt hoặc Từ chối khi pending_approval */}
              {isAdmin && event.status === 'pending_approval' && (
                <>
                  <button type="button" className="btn btn-success btn-sm" onClick={handlePublish}>
                    <CheckCircle size={15} />
                    <span>Duyệt sự kiện</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      setEventRejectReason('');
                      setIsRejectEventModalOpen(true);
                    }}
                  >
                    <XCircle size={15} />
                    <span>Từ chối</span>
                  </button>
                </>
              )}

              {/* ADMIN: Xuất bản trực tiếp sự kiện toàn CLB ở trạng thái draft */}
              {isAdmin && event.status === 'draft' && event.department_id === null && (
                <button type="button" className="btn btn-success btn-sm" onClick={handlePublish}>
                  <Send size={15} />
                  <span>Xuất bản sự kiện</span>
                </button>
              )}

              {/* TRƯỞNG BAN: Gửi duyệt sự kiện ban mình ở trạng thái draft hoặc rejected */}
              {event.department_id !== null && (event.status === 'draft' || event.status === 'rejected') && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSubmitEvent}
                  disabled={isSubmittingEventSubmit}
                >
                  <Send size={15} />
                  <span>{event.status === 'rejected' ? 'Gửi duyệt lại' : 'Gửi duyệt sự kiện'}</span>
                </button>
              )}

              {/* THÔNG BÁO CHO TRƯỞNG BAN KHI ĐANG CHỜ DUYỆT */}
              {!isAdmin && event.status === 'pending_approval' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    fontSize: '0.85rem',
                  }}
                >
                  <Clock size={15} />
                  <span>Đang chờ Admin phê duyệt</span>
                </span>
              )}

              {event.status !== 'cancelled' && (
                <button type="button" className="btn btn-danger btn-sm" onClick={handleCancelEvent}>
                  <XCircle size={15} />
                  <span>Hủy sự kiện</span>
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditData({
                    title: event.title,
                    description: event.description || '',
                    location: event.location,
                    start_time: event.start_time.slice(0, 16),
                    end_time: event.end_time.slice(0, 16),
                    capacity: event.capacity,
                    is_public: event.is_public,
                    checkin_open_minutes_before: event.checkin_open_minutes_before,
                    late_after_minutes: event.late_after_minutes,
                    checkin_close_minutes_after_start: event.checkin_close_minutes_after_start,
                    checkout_open_after_minutes: event.checkout_open_after_minutes,
                    checkout_close_minutes_after_end: event.checkout_close_minutes_after_end,
                  });
                  setIsEditModalOpen(true);
                }}
              >
                <Edit size={15} />
                <span>Chỉnh sửa</span>
              </button>
            </div>
          )}
        </div>

        {/* THÔNG BÁO TỪ CHỐI KÈM LÝ DO */}
        {event.status === 'rejected' && event.rejection_reason && (
          <div
            style={{
              marginTop: '20px',
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <AlertCircle size={22} color="var(--danger)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong style={{ display: 'block', marginBottom: '4px', color: '#ef4444' }}>
                Lý do từ chối phê duyệt:
              </strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{event.rejection_reason}</div>
              {canManage && (
                <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Trưởng ban có thể nhấn <strong>Chỉnh sửa</strong> để cập nhật thông tin và nhấn <strong>Gửi duyệt lại</strong>.
                </div>
              )}
            </div>
          </div>
        )}

        {event.description && (
          <div
            style={{
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
            }}
          >
            {event.description}
          </div>
        )}
      </div>

      {/* KHU VỰC THÀNH VIÊN: ĐĂNG KÝ VÀ TỰ ĐIỂM DANH */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Camera size={20} color="var(--primary)" />
          <span>Điểm danh & Đăng ký tham gia của bạn</span>
        </h3>

        {!isUserRegistered ? (
          <div
            style={{
              padding: '24px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '4px' }}>
                Bạn chưa đăng ký tham gia sự kiện này
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {event.status === 'published'
                  ? 'Hãy đăng ký ngay để giữ chỗ và có quyền chụp ảnh điểm danh khi sự kiện diễn ra.'
                  : 'Sự kiện này chưa được mở cho đăng ký.'}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleRegister}
              disabled={event.status !== 'published'}
            >
              <CheckCircle size={18} />
              <span>Đăng ký tham gia ngay</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* THẺ TRẠNG THÁI ĐĂNG KÝ */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 'var(--radius-md)',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle size={20} color="#059669" />
                <span style={{ fontWeight: 600, color: '#047857' }}>Bạn đã đăng ký tham gia sự kiện này</span>
              </div>

              {/* Nút hủy đăng ký chỉ hiện khi chưa bắt đầu và chưa điểm danh */}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleCancelRegistration}
                disabled={Boolean(myRegistration?.check_in || myRegistration?.check_out)}
                title={
                  myRegistration?.check_in
                    ? 'Không thể hủy đăng ký khi đã có lượt điểm danh'
                    : 'Hủy đăng ký tham gia'
                }
              >
                <XCircle size={14} />
                <span>Hủy đăng ký</span>
              </button>
            </div>

            {/* HAI KHỐI ĐIỂM DANH: ĐẾN VÀ VỀ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '18px',
              }}
            >
              {/* LƯỢT ĐẾN */}
              <div
                style={{
                  padding: '20px',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '1.05rem' }}>1. Điểm danh ĐẾN</h4>
                    {windows && (
                      <span className={`badge badge-${windows.checkIn.badgeType}`}>
                        {windows.checkIn.message}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    {myRegistration?.check_in ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Thời gian ghi nhận:</span>
                          <strong>{toVNDateTime(myRegistration.check_in.taken_at)}</strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Trạng thái:</span>
                          {myRegistration.check_in.review_status === 'approved' && (
                            <span className="badge badge-success">Đã duyệt (Có mặt)</span>
                          )}
                          {myRegistration.check_in.review_status === 'pending' && (
                            <span className="badge badge-warning">Đang chờ duyệt</span>
                          )}
                          {myRegistration.check_in.review_status === 'rejected' && (
                            <span className="badge badge-danger">Bị từ chối</span>
                          )}
                          {myRegistration.check_in.is_late && (
                            <span className="badge badge-warning">Đến muộn</span>
                          )}
                        </div>
                        {myRegistration.check_in.review_note && (
                          <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '0.8rem' }}>
                            Lý do: {myRegistration.check_in.review_note}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>Chưa thực hiện điểm danh lúc đến.</div>
                    )}
                  </div>
                </div>

                <div>
                  {(!myRegistration?.check_in || myRegistration.check_in.review_status === 'rejected') && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => setCameraModalType('check_in')}
                      disabled={!windows?.checkIn.isOpen}
                    >
                      <Camera size={16} />
                      <span>{myRegistration?.check_in ? 'Chụp lại điểm danh đến' : 'Chụp ảnh điểm danh đến'}</span>
                    </button>
                  )}

                  {myRegistration?.check_in && myRegistration.check_in.review_status !== 'rejected' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => {
                        setSelectedPhotoAttendance(myRegistration.check_in || null);
                        setIsPhotoModalOpen(true);
                      }}
                    >
                      <Eye size={14} />
                      <span>Xem lại ảnh của tôi</span>
                    </button>
                  )}
                </div>
              </div>

              {/* LƯỢT VỀ */}
              <div
                style={{
                  padding: '20px',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '1.05rem' }}>2. Điểm danh VỀ</h4>
                    {windows && (
                      <span className={`badge badge-${windows.checkOut.badgeType}`}>
                        {windows.checkOut.message}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    {myRegistration?.check_out ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Thời gian ghi nhận:</span>
                          <strong>{toVNDateTime(myRegistration.check_out.taken_at)}</strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Trạng thái:</span>
                          {myRegistration.check_out.review_status === 'approved' && (
                            <span className="badge badge-success">Đã duyệt</span>
                          )}
                          {myRegistration.check_out.review_status === 'pending' && (
                            <span className="badge badge-warning">Đang chờ duyệt</span>
                          )}
                          {myRegistration.check_out.review_status === 'rejected' && (
                            <span className="badge badge-danger">Bị từ chối</span>
                          )}
                        </div>
                        {myRegistration.duration_minutes !== null && myRegistration.duration_minutes !== undefined && (
                          <div style={{ marginTop: '6px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            Thời lượng tham dự: {Math.floor(myRegistration.duration_minutes / 60)}h{' '}
                            {myRegistration.duration_minutes % 60}m
                          </div>
                        )}
                        {myRegistration.check_out.review_note && (
                          <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '0.8rem' }}>
                            Lý do: {myRegistration.check_out.review_note}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {myRegistration?.check_in && myRegistration.check_in.review_status !== 'rejected'
                          ? 'Chưa thực hiện điểm danh lúc về.'
                          : 'Cần hoàn tất điểm danh đến hợp lệ trước khi điểm danh về.'}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  {(!myRegistration?.check_out || myRegistration.check_out.review_status === 'rejected') && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => setCameraModalType('check_out')}
                      disabled={
                        !windows?.checkOut.isOpen ||
                        !myRegistration?.check_in ||
                        myRegistration.check_in.review_status === 'rejected'
                      }
                    >
                      <Camera size={16} />
                      <span>{myRegistration?.check_out ? 'Chụp lại điểm danh về' : 'Chụp ảnh điểm danh về'}</span>
                    </button>
                  )}

                  {myRegistration?.check_out && myRegistration.check_out.review_status !== 'rejected' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => {
                        setSelectedPhotoAttendance(myRegistration.check_out || null);
                        setIsPhotoModalOpen(true);
                      }}
                    >
                      <Eye size={14} />
                      <span>Xem lại ảnh của tôi</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KHU VỰC NGƯỜI QUẢN LÝ SỰ KIỆN */}
      {canManage && (
        <div className="card" style={{ padding: '24px' }}>
          {/* THANH THỐNG KÊ NHANH */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={20} color="var(--primary)" />
                <span>Bảng điều khiển Người tổ chức</span>
              </h3>

              <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
                <FileSpreadsheet size={16} color="var(--success)" />
                <span>Xuất danh sách Excel / CSV</span>
              </button>
            </div>

            {stats && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Tổng đăng ký
                  </span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px' }}>
                    {stats.total_registrations}
                  </div>
                </div>

                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 700, textTransform: 'uppercase' }}>
                    Có mặt (Đến)
                  </span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#047857' }}>
                    {stats.total_attended}
                  </div>
                </div>

                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>
                    Đến muộn
                  </span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#b45309' }}>
                    {stats.total_late}
                  </div>
                </div>

                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: '#eef2ff',
                    border: '1px solid #c7d2fe',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>
                    Tham dự đầy đủ
                  </span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#4338ca' }}>
                    {stats.total_fully_attended}
                  </div>
                </div>

                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Ảnh chờ duyệt
                  </span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#dc2626' }}>
                    {stats.total_pending_reviews}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TABS QUẢN LÝ: DANH SÁCH THAM DỰ & DUYỆT ẢNH */}
          <div className="segmented-tabs-wrapper" style={{ marginBottom: '20px' }}>
            <div className="segmented-tabs">
              <button
                type="button"
                className={`segmented-tab-btn ${managerTab === 'attendees' ? 'active' : ''}`}
                onClick={() => setManagerTab('attendees')}
              >
                <Users size={15} />
                <span>Danh sách đăng ký & Điểm danh</span>
                <span className="segmented-tab-badge">{registrations.length}</span>
              </button>

              <button
                type="button"
                className={`segmented-tab-btn ${managerTab === 'reviews' ? 'active' : ''}`}
                onClick={() => setManagerTab('reviews')}
              >
                <Camera size={15} />
                <span>Duyệt ảnh điểm danh</span>
                <span className="segmented-tab-badge">{attendances.length}</span>
              </button>
            </div>
          </div>

          {/* TAB 1: BẢNG DANH SÁCH ĐĂNG KÝ VÀ ĐIỂM DANH */}
          {managerTab === 'attendees' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Tìm thành viên theo tên, MSSV, email..."
                  value={attendeeSearch}
                  onChange={(e) => setAttendeeSearch(e.target.value)}
                  style={{ maxWidth: '360px' }}
                />
              </div>

              {(() => {
                const { pagedItems: pagedRegistrations, totalPages: regTotalPages } = paginateArray(filteredRegistrations, regPage, regPageSize);
                return (
                  <>
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Họ tên & MSSV</th>
                            <th>Lúc ĐẾN</th>
                            <th>Lúc VỀ</th>
                            <th>Thời lượng</th>
                            <th>Trạng thái</th>
                            <th style={{ textAlign: 'right' }}>Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRegistrations.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                                Chưa có thành viên nào đăng ký tham gia sự kiện này.
                              </td>
                            </tr>
                          ) : (
                            pagedRegistrations.map((reg) => (
                        <tr key={reg.id}>
                          <td>
                            <strong>{reg.user?.full_name}</strong>
                            <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                              {reg.user?.student_id} • {reg.user?.email}
                            </div>
                          </td>

                          {/* CỘT ĐẾN */}
                          <td>
                            {reg.check_in ? (
                              <div>
                                <div style={{ fontSize: '0.85rem' }}>{toVNDateTime(reg.check_in.taken_at)}</div>
                                <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                                  {reg.check_in.review_status === 'approved' && (
                                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                      Đã duyệt
                                    </span>
                                  )}
                                  {reg.check_in.review_status === 'pending' && (
                                    <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                      Chờ duyệt
                                    </span>
                                  )}
                                  {reg.check_in.review_status === 'rejected' && (
                                    <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                      Từ chối
                                    </span>
                                  )}
                                  {reg.check_in.is_late && (
                                    <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                      Muộn
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                            )}
                          </td>

                          {/* CỘT VỀ */}
                          <td>
                            {reg.check_out ? (
                              <div>
                                <div style={{ fontSize: '0.85rem' }}>{toVNDateTime(reg.check_out.taken_at)}</div>
                                <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                                  {reg.check_out.review_status === 'approved' && (
                                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                      Đã duyệt
                                    </span>
                                  )}
                                  {reg.check_out.review_status === 'pending' && (
                                    <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                      Chờ duyệt
                                    </span>
                                  )}
                                  {reg.check_out.review_status === 'rejected' && (
                                    <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                      Từ chối
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                            )}
                          </td>

                          {/* CỘT THỜI LƯỢNG */}
                          <td>
                            {reg.duration_minutes !== null && reg.duration_minutes !== undefined ? (
                              <span>
                                {Math.floor(reg.duration_minutes / 60)}h {reg.duration_minutes % 60}m
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>

                          {/* CỘT TRẠNG THÁI TỔNG */}
                          <td>
                            {reg.attendance_status === 'fully_attended' && (
                              <span className="badge badge-success">Đầy đủ</span>
                            )}
                            {reg.attendance_status === 'attended' && (
                              <span className="badge badge-primary">Có mặt</span>
                            )}
                            {reg.attendance_status === 'pending' && (
                              <span className="badge badge-warning">Chờ duyệt</span>
                            )}
                            {reg.attendance_status === 'not_attended' && (
                              <span className="badge badge-neutral">Vắng</span>
                            )}
                          </td>

                          {/* CỘT THAO TÁC */}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                title="Điểm danh thủ công"
                                onClick={() => {
                                  setManualUser(reg);
                                  setManualType(reg.check_in ? 'check_out' : 'check_in');
                                  setManualIsLate(false);
                                  setManualNote('');
                                }}
                              >
                                <UserCheck size={14} />
                                <span>Thủ công</span>
                              </button>

                              {reg.check_in && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  title="Hủy điểm danh đến"
                                  onClick={() => handleCancelAttendance(reg.user_id, 'check_in')}
                                >
                                  <UserX size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {filteredRegistrations.length > 0 && (
                <Pagination
                  currentPage={regPage}
                  totalPages={regTotalPages}
                  totalItems={filteredRegistrations.length}
                  pageSize={regPageSize}
                  onPageChange={setRegPage}
                  onPageSizeChange={(newSize) => {
                    setRegPageSize(newSize);
                    setRegPage(1);
                  }}
                  pageSizeOptions={[5, 10, 20, 50]}
                  itemName="người tham gia"
                />
              )}
            </>
          );
        })()}
      </div>
    )}

          {/* TAB 2: LƯỚI DUYỆT ẢNH ĐIỂM DANH */}
          {managerTab === 'reviews' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${reviewFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setReviewFilter('pending')}
                >
                  <span>Chờ duyệt</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${reviewFilter === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setReviewFilter('approved')}
                >
                  <span>Đã duyệt</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${reviewFilter === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setReviewFilter('rejected')}
                >
                  <span>Bị từ chối</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${reviewFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setReviewFilter('all')}
                >
                  <span>Tất cả</span>
                </button>
              </div>

              {(() => {
                const { pagedItems: pagedAttendances, totalPages: reviewTotalPages } = paginateArray(filteredAttendances, reviewPage, reviewPageSize);
                return (
                  <>
                    {filteredAttendances.length === 0 ? (
                      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Không có ảnh nào trong mục này.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                          gap: '16px',
                        }}
                      >
                        {pagedAttendances.map((att) => (
                          <div
                            key={att.id}
                            className="card"
                            style={{
                              padding: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '12px',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span className={`badge ${att.type === 'check_in' ? 'badge-primary' : 'badge-neutral'}`}>
                                  {att.type === 'check_in' ? 'Lúc Đến' : 'Lúc Về'}
                                </span>
                                <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                                  {att.source === 'camera' ? 'Camera' : att.source === 'upload' ? 'Tải tệp' : 'Thủ công'}
                                </span>
                              </div>

                              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{att.user_name || 'Hội viên'}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                MSSV: {att.student_id || '—'}
                              </div>

                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Giờ chụp: {toVNDateTime(att.taken_at)}
                              </div>

                              {att.is_late && (
                                <div style={{ marginTop: '4px' }}>
                                  <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                    Đến muộn
                                  </span>
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={() => {
                                  setSelectedPhotoAttendance(att);
                                  setIsPhotoModalOpen(true);
                                }}
                              >
                                <Eye size={14} />
                                <span>Xem ảnh lớn</span>
                              </button>

                              {att.review_status === 'pending' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-success btn-sm"
                                    onClick={() => handleApprovePhoto(att.id)}
                                  >
                                    <CheckCircle size={14} />
                                    <span>Duyệt</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleOpenRejectModal(att.id)}
                                  >
                                    <XCircle size={14} />
                                    <span>Từ chối</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {filteredAttendances.length > 0 && (
                      <Pagination
                        currentPage={reviewPage}
                        totalPages={reviewTotalPages}
                        totalItems={filteredAttendances.length}
                        pageSize={reviewPageSize}
                        onPageChange={setReviewPage}
                        onPageSizeChange={(newSize) => {
                          setReviewPageSize(newSize);
                          setReviewPage(1);
                        }}
                        pageSizeOptions={[4, 8, 16, 32]}
                        itemName="ảnh điểm danh"
                      />
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* MODAL CAMERA CHỤP ẢNH ĐIỂM DANH */}
      <Modal
        isOpen={cameraModalType !== null}
        onClose={() => setCameraModalType(null)}
        title={cameraModalType === 'check_in' ? 'Điểm danh lúc ĐẾN' : 'Điểm danh lúc VỀ'}
        maxWidth="620px"
      >
        {cameraModalType && (
          <CameraCapture
            title={cameraModalType === 'check_in' ? 'Chụp ảnh điểm danh ĐẾN' : 'Chụp ảnh điểm danh VỀ'}
            onCapture={handleAttendanceCapture}
            onCancel={() => setCameraModalType(null)}
            isSubmitting={isSubmittingAttendance}
          />
        )}
      </Modal>

      {/* MODAL XEM ẢNH ĐIỂM DANH */}
      <AttendancePhotoModal
        attendance={selectedPhotoAttendance}
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        canReview={canManage}
        onApprove={handleApprovePhoto}
        onReject={handleOpenRejectModal}
      />

      {/* MODAL TỪ CHỐI ẢNH KÈM GHI CHÚ */}
      <Modal
        isOpen={rejectingAttendanceId !== null}
        onClose={() => setRejectingAttendanceId(null)}
        title="Từ chối ảnh điểm danh"
        maxWidth="460px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRejectingAttendanceId(null)}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleConfirmReject}
            >
              Xác nhận từ chối
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Vui lòng nhập lý do từ chối để thành viên được biết và có thể chụp/gửi lại:
          </p>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="VD: Ảnh không rõ mặt, ảnh chụp màn hình khác, không đúng người tham dự..."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            required
          />
        </div>
      </Modal>

      {/* MODAL ĐIỂM DANH THỦ CÔNG */}
      <Modal
        isOpen={manualUser !== null}
        onClose={() => setManualUser(null)}
        title={`Điểm danh thủ công: ${manualUser?.user?.full_name || ''}`}
        maxWidth="480px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setManualUser(null)}
              disabled={isSubmittingManual}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleManualAttendanceSubmit}
              disabled={isSubmittingManual}
            >
              {isSubmittingManual ? 'Đang lưu...' : 'Ghi nhận điểm danh'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleManualAttendanceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Loại lượt điểm danh</label>
            <select
              className="form-select"
              value={manualType}
              onChange={(e) => setManualType(e.target.value as any)}
            >
              <option value="check_in">Điểm danh lúc ĐẾN</option>
              <option value="check_out">Điểm danh lúc VỀ</option>
            </select>
          </div>

          {manualType === 'check_in' && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={manualIsLate}
                  onChange={(e) => setManualIsLate(e.target.checked)}
                />
                <span style={{ fontSize: '0.875rem' }}>Đánh dấu là Đến muộn</span>
              </label>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Ghi chú (Lý do điểm danh thủ công)</label>
            <input
              type="text"
              className="form-input"
              placeholder="VD: Thiết bị hỏng camera, trưởng ban xác nhận có mặt..."
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* MODAL CHỈNH SỬA SỰ KIỆN */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Chỉnh sửa thông tin sự kiện"
        maxWidth="680px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isUpdatingEvent}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleUpdateEvent}
              disabled={isUpdatingEvent}
            >
              {isUpdatingEvent ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleUpdateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Tiêu đề sự kiện</label>
            <input
              type="text"
              className="form-input"
              value={editData.title || ''}
              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={editData.description || ''}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Địa điểm</label>
              <input
                type="text"
                className="form-input"
                value={editData.location || ''}
                onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Số chỗ (Capacity)</label>
              <input
                type="number"
                className="form-input"
                min={event.registered_count || 1}
                placeholder="Để trống = không giới hạn"
                value={editData.capacity ?? ''}
                onChange={(e) =>
                  setEditData({
                    ...editData,
                    capacity: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>

          <QuickDateTimePicker
            startTime={editData.start_time || ''}
            endTime={editData.end_time || ''}
            registrationDeadline={editData.registration_deadline}
            onChangeStartTime={(val) => setEditData((prev) => ({ ...prev, start_time: val }))}
            onChangeEndTime={(val) => setEditData((prev) => ({ ...prev, end_time: val }))}
            onChangeDeadline={(val) => setEditData((prev) => ({ ...prev, registration_deadline: val }))}
          />

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editData.is_public ?? false}
                onChange={(e) => setEditData({ ...editData, is_public: e.target.checked })}
              />
              <span style={{ fontSize: '0.9rem' }}>Sự kiện công khai cho người ngoài xem</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* MODAL ADMIN TỪ CHỐI DUYỆT SỰ KIỆN */}
      <Modal
        isOpen={isRejectEventModalOpen}
        onClose={() => setIsRejectEventModalOpen(false)}
        title="Từ chối phê duyệt sự kiện"
        maxWidth="520px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsRejectEventModalOpen(false)}
              disabled={isSubmittingEventReject}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleConfirmEventReject}
              disabled={isSubmittingEventReject || !eventRejectReason.trim()}
            >
              {isSubmittingEventReject ? 'Đang xử lý...' : 'Xác nhận từ chối'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Vui lòng nhập lý do từ chối để Trưởng ban nắm rõ thông tin và chỉnh sửa lại sự kiện trước khi gửi duyệt lại.
          </p>
          <div className="form-group">
            <label className="form-label">Lý do từ chối *</label>
            <textarea
              className="form-textarea"
              rows={4}
              placeholder="VD: Kế hoạch tổ chức chưa chi tiết, thời gian trùng với lịch thi..."
              value={eventRejectReason}
              onChange={(e) => setEventRejectReason(e.target.value)}
              required
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
