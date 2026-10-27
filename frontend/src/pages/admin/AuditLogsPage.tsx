import React, { useEffect, useState } from 'react';
import {
  Search,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { AuditLog } from '../../types';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { ModuleSubTabs } from '../../components/ModuleSubTabs';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';

export const AuditLogsPage: React.FC = () => {
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.auditLogs.list({
        action: actionFilter || undefined,
        q: searchQuery.trim() || undefined,
        page,
        page_size: pageSize,
      });
      setLogs(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Không thể tải nhật ký hoạt động.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleCleanupLogs = async () => {
    const ok = await confirm({
      title: 'Dọn dẹp nhật ký hệ thống',
      message:
        'Bạn có chắc chắn muốn xóa toàn bộ các bản ghi nhật ký hoạt động đã ghi nhận quá 7 ngày trước không? Thao tác này giúp giải phóng dữ liệu và không thể hoàn tác.',
      variant: 'danger',
      confirmText: 'Xác nhận xóa sau 7 ngày',
    });
    if (!ok) return;

    setIsCleaning(true);
    try {
      const res = await api.auditLogs.cleanup(7);
      showSuccess(res.message);
      fetchLogs();
    } catch (err) {
      showError(err);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteLog = async (logId: number) => {
    const ok = await confirm({
      title: 'Xóa bản ghi nhật ký',
      message: 'Bạn có chắc chắn muốn xóa bản ghi nhật ký này khỏi hệ thống không?',
      variant: 'danger',
      confirmText: 'Xóa bản ghi',
    });
    if (!ok) return;

    try {
      await api.auditLogs.delete(logId);
      showSuccess('Đã xóa bản ghi nhật ký thành công!');
      fetchLogs();
    } catch (err) {
      showError(err);
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
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const renderActionBadge = (action: string) => {
    if (action.includes('SUCCESS') || action.includes('APPROVED')) {
      return <span className="badge badge-success">{action}</span>;
    }
    if (action.includes('FAILED') || action.includes('REJECTED') || action.includes('DELETED') || action.includes('LOCKED')) {
      return <span className="badge badge-danger">{action}</span>;
    }
    if (action.includes('PASSWORD') || action.includes('RESET') || action.includes('ROLE')) {
      return <span className="badge badge-warning">{action}</span>;
    }
    return <span className="badge badge-primary">{action}</span>;
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module="system" />

      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Nhật Ký Hoạt Động Hệ Thống (Audit Logs)</h1>
          <p className="page-header-subtitle">
            Ghi nhận toàn bộ các thao tác nhạy cảm: đăng nhập, phân quyền, khóa tài khoản, duyệt đơn và đổi mật khẩu
          </p>
        </div>

        <div className="page-header-actions">
          <button
            type="button"
            onClick={handleCleanupLogs}
            disabled={isCleaning}
            className="btn btn-danger btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Trash2 size={15} />
            <span>{isCleaning ? 'Đang dọn dẹp...' : 'Dọn dẹp log cũ (> 7 ngày)'}</span>
          </button>
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* SEARCH & FILTERS */}
      <div className="card" style={{ padding: '18px 24px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '40px' }}
              placeholder="Tìm kiếm trong Actor, Target, Details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ width: '220px' }}>
            <select
              className="form-select"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả hành động</option>
              <option value="LOGIN_SUCCESS">LOGIN_SUCCESS (Đăng nhập thành công)</option>
              <option value="LOGIN_FAILED">LOGIN_FAILED (Đăng nhập thất bại)</option>
              <option value="LOGIN_FAILED_BLOCKED">LOGIN_FAILED_BLOCKED (Tài khoản bị chặn)</option>
              <option value="USER_CREATED_BY_ADMIN">USER_CREATED_BY_ADMIN (Tạo thành viên)</option>
              <option value="USER_ROLE_CHANGED">USER_ROLE_CHANGED (Đổi vai trò)</option>
              <option value="USER_LOCKED">USER_LOCKED (Khóa tài khoản)</option>
              <option value="USER_UNLOCKED">USER_UNLOCKED (Mở khóa)</option>
              <option value="USER_SOFT_DELETED">USER_SOFT_DELETED (Xóa mềm)</option>
              <option value="PASSWORD_RESET_BY_ADMIN">PASSWORD_RESET_BY_ADMIN (Đặt lại MK)</option>
              <option value="PASSWORD_CHANGED">PASSWORD_CHANGED (Đổi mật khẩu)</option>
              <option value="JOIN_REQUEST_SUBMITTED">JOIN_REQUEST_SUBMITTED (Nộp đơn)</option>
              <option value="JOIN_REQUEST_APPROVED">JOIN_REQUEST_APPROVED (Duyệt đơn)</option>
              <option value="JOIN_REQUEST_REJECTED">JOIN_REQUEST_REJECTED (Từ chối đơn)</option>
            </select>
          </div>

          <button type="submit" className="btn btn-secondary">
            <span>Tìm kiếm</span>
          </button>
        </form>
      </div>

      {/* TABLE */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '180px' }}>Thời gian</th>
              <th>Hành động (Action)</th>
              <th>Người thực hiện (Actor)</th>
              <th>Đối tượng (Target)</th>
              <th>Địa chỉ IP</th>
              <th>Chi tiết thao tác</th>
              <th style={{ textAlign: 'right', width: '90px' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Đang tải nhật ký...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Không tìm thấy bản ghi nhật ký nào.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(log.created_at)}
                    </span>
                  </td>
                  <td>{renderActionBadge(log.action)}</td>
                  <td>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{log.actor}</span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {log.target || '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                      {log.ip_address || '—'}
                    </span>
                  </td>
                  <td>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        color: 'var(--text-secondary)',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        maxWidth: '280px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={log.details || ''}
                    >
                      {log.details || '—'}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteLog(log.id)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#ef4444', padding: '6px' }}
                      title="Xóa bản ghi này"
                    >
                      <Trash2 size={15} />
                    </button>
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
        pageSizeOptions={[10, 15, 30, 50]}
        itemName="bản ghi"
      />
    </div>
  );
};
