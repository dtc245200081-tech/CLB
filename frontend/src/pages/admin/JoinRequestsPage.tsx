import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  Check,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { JoinRequest, JoinRequestStatus } from '../../types';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { ModuleSubTabs } from '../../components/ModuleSubTabs';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';

export const JoinRequestsPage: React.FC = () => {
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal Chi tiết
  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    request: JoinRequest | null;
  }>({
    isOpen: false,
    request: null,
  });

  // Modal Từ chối
  const [rejectModal, setRejectModal] = useState<{
    isOpen: boolean;
    requestId: number | null;
    note: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    requestId: null,
    note: '',
    isSubmitting: false,
  });

  const fetchRequests = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await api.joinRequests.list({
        status: statusFilter || undefined,
        page,
        page_size: pageSize,
      });
      setRequests(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Không thể tải danh sách đơn gia nhập.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [page, statusFilter]);

  // Duyệt đơn
  const handleApprove = async (id: number) => {
    const ok = await confirm({
      title: 'Duyệt đơn gia nhập CLB',
      message: 'Xác nhận duyệt đơn gia nhập này? Hệ thống sẽ tự động kích hoạt tài khoản thành viên và tạo hồ sơ nhân sự mới.',
      variant: 'success',
      confirmText: 'Duyệt đơn',
    });
    if (!ok) return;

    try {
      await api.joinRequests.approve(id);
      showSuccess('Đã duyệt đơn và tạo tài khoản thành viên thành công!');
      fetchRequests();
      if (detailModal.isOpen) setDetailModal({ isOpen: false, request: null });
    } catch (err) {
      showError(err);
    }
  };

  // Mở modal từ chối
  const handleOpenReject = (id: number) => {
    setRejectModal({
      isOpen: true,
      requestId: id,
      note: '',
      isSubmitting: false,
    });
  };

  // Xác nhận từ chối
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModal.requestId) return;

    setRejectModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await api.joinRequests.reject(rejectModal.requestId, rejectModal.note.trim() || undefined);
      setRejectModal({ isOpen: false, requestId: null, note: '', isSubmitting: false });
      showSuccess('Đã từ chối đơn gia nhập.');
      fetchRequests();
      if (detailModal.isOpen) setDetailModal({ isOpen: false, request: null });
    } catch (err) {
      showError(err);
      setRejectModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: JoinRequestStatus) => {
    switch (status) {
      case 'pending':
        return <span className="badge badge-warning"><Clock size={12} /> Chờ duyệt</span>;
      case 'approved':
        return <span className="badge badge-success"><CheckCircle size={12} /> Đã duyệt</span>;
      case 'rejected':
        return <span className="badge badge-danger"><XCircle size={12} /> Đã từ chối</span>;
      default:
        return null;
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module="personnel" />

      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Xét Duyệt Đơn Gia Nhập CLB</h1>
          <p className="page-header-subtitle">
            Tổng số: <strong style={{ color: 'var(--text-primary)' }}>{total}</strong> đơn đăng ký
          </p>
        </div>

        {/* STATUS TABS */}
        <div className="segmented-tabs">
          {[
            { label: 'Tất cả', value: '' },
            { label: 'Chờ duyệt', value: 'pending' },
            { label: 'Đã duyệt', value: 'approved' },
            { label: 'Từ chối', value: 'rejected' },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`segmented-tab-btn ${statusFilter === tab.value ? 'active' : ''}`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ALERTS */}
      {actionError && (
        <Alert
          type="error"
          message={actionError}
          onClose={() => setActionError(null)}
        />
      )}

      {actionSuccess && (
        <Alert
          type="success"
          message={actionSuccess}
          onClose={() => setActionSuccess(null)}
        />
      )}

      {/* TABLE */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Họ và tên ứng viên</th>
              <th>MSSV</th>
              <th>Email & SĐT</th>
              <th>Khoa / Lớp</th>
              <th>Thời gian nộp</th>
              <th>Trạng thái</th>
              <th style={{ textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Đang tải danh sách đơn gia nhập...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Không có đơn gia nhập nào trong mục này.
                </td>
              </tr>
            ) : (
              requests.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.full_name}</div>
                    {item.reason && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                          maxWidth: '220px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.reason}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.student_id}</span>
                  </td>
                  <td>
                    <div>{item.email}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.phone || '—'}</div>
                  </td>
                  <td>
                    <div>{item.faculty || '—'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.class_name || '—'}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                      {formatDate(item.created_at)}
                    </span>
                  </td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        title="Xem chi tiết đơn"
                        onClick={() => setDetailModal({ isOpen: true, request: item })}
                        className="btn btn-secondary btn-sm"
                      >
                        <Eye size={15} />
                        <span>Xem</span>
                      </button>

                      {item.status === 'pending' && (
                        <>
                          <button
                            title="Duyệt đơn"
                            onClick={() => handleApprove(item.id)}
                            className="btn btn-success btn-sm"
                          >
                            <Check size={15} />
                            <span>Duyệt</span>
                          </button>

                          <button
                            title="Từ chối đơn"
                            onClick={() => handleOpenReject(item.id)}
                            className="btn btn-danger btn-sm"
                          >
                            <XCircle size={15} />
                            <span>Từ chối</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        pageSizeOptions={[10, 20, 50]}
        itemName="đơn gia nhập"
      />

      {/* MODAL CHI TIẾT ĐƠN */}
      <Modal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal({ isOpen: false, request: null })}
        title={`Chi tiết đơn gia nhập: ${detailModal.request?.full_name}`}
        maxWidth="620px"
      >
        {detailModal.request && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem' }}>{detailModal.request.full_name}</h3>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Nộp lúc: {formatDate(detailModal.request.created_at)}
                </span>
              </div>
              <div>{getStatusBadge(detailModal.request.status)}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>EMAIL</span>
                <div style={{ fontWeight: 600 }}>{detailModal.request.email}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MÃ SỐ SINH VIÊN</span>
                <div style={{ fontWeight: 600 }}>{detailModal.request.student_id}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SỐ ĐIỆN THOẠI</span>
                <div style={{ fontWeight: 600 }}>{detailModal.request.phone || 'Chưa cung cấp'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>KHOA / LỚP</span>
                <div style={{ fontWeight: 600 }}>
                  {detailModal.request.faculty || '—'} ({detailModal.request.class_name || '—'})
                </div>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Lý do gia nhập & Kỹ năng / Sở trường:
              </span>
              <div
                style={{
                  marginTop: '8px',
                  padding: '14px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.925rem',
                }}
              >
                {detailModal.request.reason || 'Ứng viên không điền lý do.'}
              </div>
            </div>

            {detailModal.request.review_note && (
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626' }}>
                  Ghi chú từ chối của Quản trị viên:
                </span>
                <div
                  style={{
                    marginTop: '8px',
                    padding: '12px',
                    background: 'var(--danger-light)',
                    borderRadius: 'var(--radius-md)',
                    color: '#b91c1c',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                  }}
                >
                  {detailModal.request.review_note}
                </div>
              </div>
            )}

            {detailModal.request.status === 'pending' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={() => handleOpenReject(detailModal.request!.id)}
                  className="btn btn-danger"
                >
                  <XCircle size={16} />
                  <span>Từ chối đơn</span>
                </button>
                <button
                  onClick={() => handleApprove(detailModal.request!.id)}
                  className="btn btn-success"
                >
                  <Check size={16} />
                  <span>Duyệt đơn này</span>
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL NHẬP LÝ DO TỪ CHỐI */}
      <Modal
        isOpen={rejectModal.isOpen}
        onClose={() => setRejectModal({ isOpen: false, requestId: null, note: '', isSubmitting: false })}
        title="Từ chối đơn xin gia nhập"
      >
        <form onSubmit={handleRejectSubmit}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
            Vui lòng nhập lý do từ chối để lưu vào nhật ký hồ sơ ứng viên:
          </p>

          <div className="form-group">
            <textarea
              className="form-textarea"
              placeholder="Ví dụ: Chưa đáp ứng tiêu chí kỹ năng cho đợt tuyển này..."
              value={rejectModal.note}
              onChange={(e) => setRejectModal((prev) => ({ ...prev, note: e.target.value }))}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setRejectModal({ isOpen: false, requestId: null, note: '', isSubmitting: false })}
              className="btn btn-secondary"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={rejectModal.isSubmitting}
            >
              {rejectModal.isSubmitting ? 'Đang xử lý...' : 'Xác nhận từ chối'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
