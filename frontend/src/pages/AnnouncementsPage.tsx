import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Pin,
  Check,
  Eye,
  Plus,
  Clock,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import {
  Announcement,
  AnnouncementReader,
  Department,
  AnnouncementScope,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/Modal';
import { Pagination, paginateArray } from '../components/Pagination';
import { Alert } from '../components/Alert';

export const AnnouncementsPage: React.FC = () => {
  const { user: currentUser, isAdmin, isDepartmentHead } = useAuth();
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const canPostAnnouncement = isAdmin || isDepartmentHead;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filter & Pagination
  const [scopeFilter, setScopeFilter] = useState<'all' | 'department' | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [readersModal, setReadersModal] = useState<{
    isOpen: boolean;
    announcementTitle: string;
    readers: AnnouncementReader[];
    total: number;
  }>({
    isOpen: false,
    announcementTitle: '',
    readers: [],
    total: 0,
  });

  // Create/Edit form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    scope: 'all' as AnnouncementScope,
    department_id: '' as string | number,
    is_pinned: false,
    status: 'published' as 'draft' | 'published',
  });

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    try {
      const res = await api.announcements.list({
        scope: scopeFilter || undefined,
        page_size: 50,
      });
      setAnnouncements(res.items);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [scopeFilter]);

  useEffect(() => {
    if (canPostAnnouncement) {
      api.departments.list({ page_size: 100 }).then((res) => setDepartments(res.items)).catch(() => {});
    }
  }, [canPostAnnouncement]);

  const handleOpenCreate = () => {
    setFormData({
      title: '',
      content: '',
      scope: isDepartmentHead && !isAdmin ? 'department' : 'all',
      department_id: isDepartmentHead && currentUser?.department_id ? currentUser.department_id : '',
      is_pinned: false,
      status: 'published',
    });
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      setError('Vui lòng điền tiêu đề và nội dung thông báo.');
      return;
    }

    try {
      await api.announcements.create({
        title: formData.title.trim(),
        content: formData.content.trim(),
        scope: formData.scope,
        department_id: formData.scope === 'department' && formData.department_id ? Number(formData.department_id) : undefined,
        is_pinned: formData.is_pinned,
        status: formData.status,
      });
      showSuccess('Đã đăng bảng tin thành công!');
      setIsCreateOpen(false);
      fetchAnnouncements();
    } catch (err) {
      showError(err);
    }
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await api.announcements.markRead(id);
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_read: true, read_count: (a.read_count || 0) + 1 } : a))
      );
      showSuccess('Đã đánh dấu đã đọc thông báo!');
    } catch (err) {
      showError(err);
    }
  };

  const handleOpenReaders = async (announcement: Announcement) => {
    try {
      const res = await api.announcements.getReaders(announcement.id);
      setReadersModal({
        isOpen: true,
        announcementTitle: announcement.title,
        readers: res.readers,
        total: res.total_readers ?? res.read_count ?? 0,
      });
    } catch (err) {
      showError(err);
    }
  };

  const handleToggleRetract = async (a: Announcement) => {
    const nextStatus = a.status === 'published' ? 'draft' : 'published';
    const isRetracting = nextStatus === 'draft';
    const ok = await confirm({
      title: isRetracting ? 'Thu hồi thông báo' : 'Xuất bản thông báo',
      message: isRetracting
        ? `Bạn có chắc muốn thu hồi thông báo "${a.title}" về trạng thái bản nháp? Thông báo sẽ tạm ẩn đối với các thành viên khác.`
        : `Bạn có chắc muốn xuất bản lại thông báo "${a.title}" lên bảng tin chung của CLB?`,
      variant: isRetracting ? 'warning' : 'info',
      confirmText: isRetracting ? 'Thu hồi' : 'Xuất bản',
    });
    if (!ok) return;

    try {
      await api.announcements.update(a.id, { status: nextStatus });
      showSuccess(`Đã ${isRetracting ? 'thu hồi' : 'xuất bản'} thông báo thành công!`);
      fetchAnnouncements();
    } catch (err) {
      showError(err);
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('vi-VN') + ' lúc ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  // Separate pinned announcements
  const pinnedAnnouncements = announcements.filter((a) => a.is_pinned);
  const otherAnnouncements = announcements.filter((a) => !a.is_pinned);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Bảng Tin Chung</h1>
          <p className="page-header-subtitle">
            Cập nhật các tin tức, chỉ đạo và thông báo quan trọng trong toàn câu lạc bộ
          </p>
        </div>

        <div className="page-header-actions">
          <div className="segmented-tabs">
            <button
              type="button"
              className={`segmented-tab-btn ${scopeFilter === '' ? 'active' : ''}`}
              onClick={() => setScopeFilter('')}
            >
              <span>Tất cả</span>
            </button>
            <button
              type="button"
              className={`segmented-tab-btn ${scopeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setScopeFilter('all')}
            >
              <span>Toàn CLB</span>
            </button>
            <button
              type="button"
              className={`segmented-tab-btn ${scopeFilter === 'department' ? 'active' : ''}`}
              onClick={() => setScopeFilter('department')}
            >
              <span>Ban chuyên môn</span>
            </button>
          </div>

          {canPostAnnouncement && (
            <button onClick={handleOpenCreate} className="btn btn-primary btn-sm">
              <Plus size={16} /> Đăng thông báo mới
            </button>
          )}
        </div>
      </div>

      {/* FEEDBACK ALERTS */}
      {error && (
        <Alert
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      )}
      {success && (
        <Alert
          type="success"
          message={success}
          onClose={() => setSuccess(null)}
        />
      )}

      {/* PINNED ANNOUNCEMENTS SECTION */}
      {pinnedAnnouncements.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Pin size={16} /> Thông báo đã ghim
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {pinnedAnnouncements.map((a) => (
              <div
                key={a.id}
                className="card"
                style={{
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05), rgba(99, 102, 241, 0.03))',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Pin size={12} /> Đã ghim
                    </span>
                    <span className="badge badge-neutral">
                      {a.scope === 'all' ? 'Toàn CLB' : `Ban: ${a.department_name || 'Chuyên môn'}`}
                    </span>
                    {!(a.is_read ?? a.is_read_by_me) && (
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                        Chưa đọc
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} /> {formatDateTime(a.published_at || a.created_at)}
                  </div>
                </div>

                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '12px' }}>{a.title}</h3>

                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.95rem', marginBottom: '16px', color: 'var(--text-primary)' }}>
                  {a.content}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Đăng bởi: <strong style={{ color: 'var(--text-primary)' }}>{a.created_by_name || a.creator_name || 'BQL CLB'}</strong>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {(isAdmin || a.created_by_id === currentUser?.id) && (
                      <>
                        <button
                          onClick={() => handleOpenReaders(a)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <Eye size={14} style={{ marginRight: '4px' }} />
                          {a.read_count} đã đọc
                        </button>
                        <button
                          onClick={() => handleToggleRetract(a)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#f59e0b' }}
                        >
                          {a.status === 'published' ? 'Thu hồi (Nháp)' : 'Xuất bản lại'}
                        </button>
                      </>
                    )}

                    {!(a.is_read ?? a.is_read_by_me) && (
                      <button
                        onClick={() => handleMarkAsRead(a.id)}
                        className="btn btn-primary btn-sm"
                      >
                        <Check size={14} style={{ marginRight: '4px' }} /> Đã đọc
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GENERAL ANNOUNCEMENTS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {pinnedAnnouncements.length > 0 && (
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Thông báo khác
          </div>
        )}

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Đang tải thông báo...
          </div>
        ) : otherAnnouncements.length === 0 && pinnedAnnouncements.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Megaphone size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <div>Chưa có thông báo nào được đăng tải.</div>
          </div>
        ) : (
          paginateArray(otherAnnouncements, page, pageSize).map((a) => (
            <div key={a.id} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-neutral">
                    {a.scope === 'all' ? 'Toàn CLB' : `Ban: ${a.department_name || 'Chuyên môn'}`}
                  </span>
                  {!(a.is_read ?? a.is_read_by_me) && (
                    <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                      Chưa đọc
                    </span>
                  )}
                  {a.status === 'draft' && (
                    <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                      Bản nháp
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={13} /> {formatDateTime(a.published_at || a.created_at)}
                </div>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '10px' }}>{a.title}</h3>

              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.95rem', marginBottom: '16px', color: 'var(--text-primary)' }}>
                {a.content}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Người đăng: <strong style={{ color: 'var(--text-primary)' }}>{a.created_by_name || a.creator_name || 'BQL CLB'}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {(isAdmin || a.created_by_id === currentUser?.id) && (
                    <>
                      <button
                        onClick={() => handleOpenReaders(a)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Eye size={14} style={{ marginRight: '4px' }} />
                        {a.read_count} đã đọc
                      </button>
                      <button
                        onClick={() => handleToggleRetract(a)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#f59e0b' }}
                      >
                        {a.status === 'published' ? 'Thu hồi (Nháp)' : 'Xuất bản lại'}
                      </button>
                    </>
                  )}

                  {!(a.is_read ?? a.is_read_by_me) && (
                    <button
                      onClick={() => handleMarkAsRead(a.id)}
                      className="btn btn-primary btn-sm"
                    >
                      <Check size={14} style={{ marginRight: '4px' }} /> Đã đọc
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {otherAnnouncements.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(otherAnnouncements.length / pageSize) || 1}
            totalItems={otherAnnouncements.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            pageSizeOptions={[5, 10, 20]}
            itemName="thông báo"
          />
        )}
      </div>

      {/* MODAL TẠO THÔNG BÁO MỚI */}
      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Đăng thông báo mới"
        >
          <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Tiêu đề thông báo *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="VD: Thông báo lịch sinh hoạt định kỳ tháng..."
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Nội dung chi tiết *</label>
              <textarea
                className="form-input"
                rows={5}
                required
                placeholder="Nội dung truyền đạt cụ thể đến các thành viên..."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Phạm vi công bố</label>
                <select
                  className="form-select"
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value as AnnouncementScope })}
                  disabled={isDepartmentHead && !isAdmin}
                >
                  {isAdmin && <option value="all">Toàn CLB</option>}
                  <option value="department">Ban chuyên môn</option>
                </select>
              </div>

              {formData.scope === 'department' && (
                <div>
                  <label className="form-label">Chọn ban chuyên môn</label>
                  <select
                    className="form-select"
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    disabled={isDepartmentHead && !isAdmin}
                  >
                    <option value="">-- Chọn ban --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.is_pinned}
                  onChange={(e) => setFormData({ ...formData, is_pinned: e.target.checked })}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Ghim lên đầu bảng tin</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.status === 'draft'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.checked ? 'draft' : 'published' })}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Lưu dưới dạng bản nháp</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-secondary">
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Đăng bảng tin
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL DANH SÁCH NGƯỜI ĐÃ ĐỌC (CHỈ AUTHOR / ADMIN) */}
      {readersModal.isOpen && (
        <Modal
          isOpen={readersModal.isOpen}
          onClose={() => setReadersModal({ ...readersModal, isOpen: false })}
          title={`Người đã đọc: ${readersModal.announcementTitle}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Tổng số thành viên đã đọc: <strong>{readersModal.total}</strong>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {readersModal.readers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  Chưa có ai đọc thông báo này.
                </div>
              ) : (
                readersModal.readers.map((r) => (
                  <div
                    key={r.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.user_name || r.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MSSV: {r.student_id}</div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {formatDateTime(r.read_at)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setReadersModal({ ...readersModal, isOpen: false })}
                className="btn btn-secondary"
              >
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
