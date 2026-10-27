import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Department, EventPublic } from '../types';
import { toVNDateTime } from '../utils/date';
import { Pagination } from '../components/Pagination';
import { Alert } from '../components/Alert';
import {
  Calendar,
  MapPin,
  Users,
  Search,
  Filter,
  ArrowRight,
  LogIn,
  UserPlus,
  RefreshCw,
} from 'lucide-react';

export const PublicEventsPage: React.FC = () => {
  const [events, setEvents] = useState<EventPublic[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [upcomingOnly, setUpcomingOnly] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [eventsRes, deptsRes] = await Promise.all([
        api.publicEvents.list({
          q: search || undefined,
          department_id: selectedDept ? parseInt(selectedDept) : undefined,
          upcoming_only: upcomingOnly,
          page,
          page_size: 9,
        }),
        api.departments.list({ is_active: true, page_size: 50 }).catch(() => ({ items: [] })),
      ]);

      setEvents(eventsRes.items);
      setTotal(eventsRes.total);
      setDepartments(deptsRes.items);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách sự kiện.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedDept, upcomingOnly, page]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* HERO BANNER */}
      <div
        className="card card-glowing"
        style={{
          padding: '40px 32px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)',
          border: '1px solid var(--border-strong)',
        }}
      >
        <div style={{ maxWidth: '800px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span className="badge badge-primary">Sự kiện công khai</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Chào mừng bạn đến với CLB Sinh Viên</span>
          </div>
          <h1 style={{ fontSize: '2.4rem', marginBottom: '14px', lineHeight: 1.2 }}>
            Khám phá các sự kiện và hoạt động hấp dẫn
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: '24px', lineHeight: 1.6 }}>
            Các sự kiện mở dành cho toàn thể sinh viên. Hãy đăng nhập tài khoản hội viên hoặc nộp đơn gia nhập câu lạc bộ để trực tiếp đăng ký tham gia và điểm danh.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link to="/join" className="btn btn-primary btn-lg">
              <UserPlus size={18} />
              <span>Nộp đơn gia nhập CLB</span>
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              <LogIn size={18} />
              <span>Đăng nhập hội viên</span>
            </Link>
          </div>
        </div>
      </div>

      {/* THANH TÌM KIẾM & BỘ LỌC */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flex: 1, minWidth: '280px' }}>
          {/* Ô tìm kiếm */}
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

          {/* Lọc theo ban */}
          <div style={{ minWidth: '180px' }}>
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

          {/* Nút lọc sắp tới */}
          <button
            type="button"
            className={`btn ${upcomingOnly ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => {
              setUpcomingOnly(!upcomingOnly);
              setPage(1);
            }}
          >
            <Filter size={14} />
            <span>{upcomingOnly ? 'Chỉ xem sắp tới' : 'Xem cả đã qua'}</span>
          </button>
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
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={32} className="spin-animate" style={{ marginBottom: '12px' }} />
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
            padding: '48px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          <Calendar size={48} style={{ opacity: 0.4, marginBottom: '12px' }} />
          <h3 style={{ marginBottom: '8px' }}>Chưa có sự kiện công khai nào phù hợp</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Hãy thử tìm kiếm với từ khóa khác hoặc bỏ chọn bộ lọc sắp tới.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {events.map((event) => {
            const isFull = event.capacity !== null && event.registered_count >= event.capacity;
            return (
              <div
                key={event.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  transition: 'var(--transition)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className="badge badge-primary">
                      {event.department_id ? 'Sự kiện ban' : 'Toàn câu lạc bộ'}
                    </span>
                    {isFull ? (
                      <span className="badge badge-danger">Hết chỗ</span>
                    ) : (
                      <span className="badge badge-success">Đang nhận đăng ký</span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1.2rem', marginBottom: '10px', lineHeight: 1.3 }}>{event.title}</h3>

                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '16px',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.5,
                    }}
                  >
                    {event.description || 'Không có mô tả chi tiết cho sự kiện này.'}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
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
                        Đã đăng ký: <strong>{event.registered_count}</strong>
                        {event.capacity !== null ? ` / ${event.capacity} chỗ` : ' (không giới hạn)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Link
                    to="/login"
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <span>Đăng nhập để tham gia</span>
                    <ArrowRight size={14} />
                  </Link>
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
    </div>
  );
};
