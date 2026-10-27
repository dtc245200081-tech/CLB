import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  ThumbsDown,
  AlertTriangle,
  Clock,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import { ChatbotAdminStats, UnansweredQueryItem } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { ModuleSubTabs } from '../../components/ModuleSubTabs';
import { Pagination, paginateArray } from '../../components/Pagination';

export const ChatbotQualityPage: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const [stats, setStats] = useState<ChatbotAdminStats | null>(null);
  const [unanswered, setUnanswered] = useState<UnansweredQueryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchQualityData = async () => {
    setIsLoading(true);
    try {
      const [statsData, unansweredData] = await Promise.all([
        api.chat.getAdminStats(30),
        api.chat.getUnansweredQueries(50),
      ]);
      setStats(statsData);
      setUnanswered(unansweredData);
    } catch (_) {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQualityData();
  }, []);

  const handleClearAllUnanswered = async () => {
    const ok = await confirm({
      title: 'Dọn dẹp nhật ký câu hỏi',
      message: 'Bạn có chắc chắn muốn xóa toàn bộ danh sách các câu hỏi chưa được giải đáp hoặc bị đánh giá kém của tất cả tác nhân không? Thao tác này sẽ làm sạch danh sách theo dõi chất lượng.',
      variant: 'danger',
      confirmText: 'Xác nhận xóa tất cả',
    });
    if (!ok) return;

    try {
      const res = await api.chat.clearUnansweredQueries();
      showSuccess(res.message);
      fetchQualityData();
    } catch (err) {
      showError('Không thể xóa nhật ký câu hỏi.');
    }
  };

  const handleDeleteQuery = async (id: number) => {
    const ok = await confirm({
      title: 'Xóa câu hỏi khỏi danh sách',
      message: 'Bạn có chắc chắn muốn xóa bản ghi câu hỏi này không?',
      variant: 'danger',
      confirmText: 'Xóa câu hỏi',
    });
    if (!ok) return;

    try {
      await api.chat.deleteUnansweredQuery(id);
      showSuccess('Đã xóa bản ghi câu hỏi thành công!');
      fetchQualityData();
    } catch (err) {
      showError('Không thể xóa câu hỏi.');
    }
  };

  const filteredUnanswered = unanswered.filter((item) =>
    searchFilter.trim()
      ? item.normalized_query.toLowerCase().includes(searchFilter.toLowerCase())
      : true
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ModuleSubTabs module="system" />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Đánh Giá Chất Lượng & Phản Hồi Chatbot AI</h1>
          <p className="page-header-subtitle">
            Theo dõi hiệu suất hội thoại, độ trễ và phát hiện các chủ đề câu hỏi còn thiếu trong kho tri thức
          </p>
        </div>

        <div className="page-header-actions">
          <button
            onClick={fetchQualityData}
            disabled={isLoading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
          {unanswered.length > 0 && (
            <button
              onClick={handleClearAllUnanswered}
              disabled={isLoading}
              className="btn btn-danger btn-sm"
              title="Xóa toàn bộ câu hỏi chưa giải đáp"
            >
              <Trash2 size={15} />
              <span>Xóa nhật ký câu hỏi</span>
            </button>
          )}
          <button
            onClick={() => navigate('/admin/knowledge')}
            className="btn btn-primary btn-sm"
          >
            <Plus size={16} />
            <span>Bổ Sung Tài Liệu</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Card 1: Tổng số câu hỏi */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Tổng lượt truy vấn
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BarChart3 size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
            {stats ? stats.total_queries.toLocaleString() : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Đã trả lời thành công: <strong style={{ color: '#10b981' }}>{stats?.answered_count ?? 0}</strong>
          </div>
        </div>

        {/* Card 2: Tỷ lệ Chưa có thông tin (no_info) */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Chưa có thông tin
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HelpCircle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
            {stats ? `${stats.no_info_rate}%` : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Cần bổ sung tài liệu: <strong style={{ color: '#f59e0b' }}>{stats?.no_info_count ?? 0}</strong> câu
          </div>
        </div>

        {/* Card 3: Tỷ lệ Đánh giá kém (Thumbs Down) */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Phản hồi kém (👎)
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ThumbsDown size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
            {stats ? `${stats.negative_feedback_rate}%` : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Tỷ lệ trên các câu có đánh giá
          </div>
        </div>

        {/* Card 4: Thời gian phản hồi trung bình */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Độ trễ trung bình
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
            {stats?.avg_total_latency_ms ? `${Math.round(stats.avg_total_latency_ms)} ms` : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Token đầu tiên: <strong style={{ color: '#c084fc' }}>{stats?.avg_first_token_latency_ms ? `${Math.round(stats.avg_first_token_latency_ms)} ms` : 'N/A'}</strong>
          </div>
        </div>
      </div>

      {/* Danh sách Câu hỏi Chưa Trả Lời Được (Đã ẩn danh) */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', margin: 0 }}>
              <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
              Danh Sách Câu Hỏi Chưa Được Giải Đáp Hoặc Bị Đánh Giá Kém
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Dữ liệu đã được ẩn danh hóa danh tính cá nhân. Quản trị viên dựa vào các câu hỏi thực tế này để bổ sung tài liệu mới.
            </p>
          </div>

          <div style={{ position: 'relative', width: '260px', maxWidth: '100%' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Lọc theo câu hỏi..."
              value={searchFilter}
              onChange={(e) => {
                setSearchFilter(e.target.value);
                setPage(1);
              }}
              className="form-input"
              style={{ paddingLeft: '32px', fontSize: '0.8125rem' }}
            />
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Câu hỏi người dùng (Đã chuẩn hóa)</th>
                <th>Vai trò</th>
                <th>Kết cục (Outcome)</th>
                <th>Đánh giá / Ghi chú</th>
                <th>Thời gian</th>
                <th style={{ textAlign: 'right' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                    Đang nạp dữ liệu thống kê...
                  </td>
                </tr>
              ) : filteredUnanswered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px 0', color: '#10b981' }}>
                    <CheckCircle2 size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    Không có câu hỏi nào bị thiếu thông tin hoặc bị đánh giá kém. Chatbot đang hoạt động rất tốt!
                  </td>
                </tr>
              ) : (
                paginateArray(filteredUnanswered, page, pageSize).map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: '#ffffff', maxWidth: '320px' }}>
                      "{item.normalized_query}"
                    </td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                      {item.user_role}
                    </td>
                    <td>
                      {item.outcome === 'no_info' ? (
                        <span className="badge badge-warning">Chưa có thông tin</span>
                      ) : (
                        <span className="badge badge-danger">{item.outcome}</span>
                      )}
                    </td>
                    <td>
                      {item.feedback === 'down' && (
                        <span style={{ color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                          <ThumbsDown size={12} />
                          {item.feedback_note || 'Không có ghi chú'}
                        </span>
                      )}
                      {!item.feedback && <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(item.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => navigate('/admin/knowledge')}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          title="Bổ sung tài liệu vào kho tri thức"
                        >
                          <Plus size={13} />
                          <span>Bổ sung tài liệu</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuery(item.id)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#ef4444', padding: '5px' }}
                          title="Xóa nhật ký câu hỏi này"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredUnanswered.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(filteredUnanswered.length / pageSize) || 1}
              totalItems={filteredUnanswered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              pageSizeOptions={[5, 10, 20]}
              itemName="truy vấn"
            />
          </div>
        )}
      </div>
    </div>
  );
};
