import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { UserEventHistoryItem } from '../types';
import { toVNDateTime, getEventTimingDetails } from '../utils/date';
import { ModuleSubTabs } from '../components/ModuleSubTabs';
import { Pagination } from '../components/Pagination';
import { Alert } from '../components/Alert';
import {
  MapPin,
  ArrowRight,
  RefreshCw,
  History,
  Timer,
} from 'lucide-react';

export const MyRegistrationsPage: React.FC = () => {
  const [history, setHistory] = useState<UserEventHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const ticker = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(ticker);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.users.getMyRegistrations({ page, page_size: 10 });
      setHistory(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Không thể tải lịch sử tham gia sự kiện.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module="events" />

      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Lịch Sử Tham Gia Sự Kiện</h1>
          <p className="page-header-subtitle">
            Theo dõi tất cả sự kiện bạn đã đăng ký và kết quả điểm danh đến / về.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin-animate' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* DANH SÁCH LỊCH SỬ */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={36} className="spin-animate" style={{ marginBottom: '12px' }} />
          <div>Đang tải lịch sử...</div>
        </div>
      ) : error ? (
        <Alert
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      ) : history.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '60px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          <History size={48} style={{ opacity: 0.35, marginBottom: '12px' }} />
          <h3 style={{ marginBottom: '8px' }}>Bạn chưa tham gia sự kiện nào</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
            Hãy vào trang sự kiện để đăng ký tham gia các hoạt động sôi nổi của câu lạc bộ.
          </p>
          <Link to="/events" className="btn btn-primary">
            <span>Khám phá sự kiện</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tên sự kiện & Địa điểm</th>
                <th>Thời gian diễn ra</th>
                <th>Lúc ĐẾN</th>
                <th>Lúc VỀ</th>
                <th>Thời lượng</th>
                <th>Kết quả tham dự</th>
                <th style={{ textAlign: 'right' }}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => {
                const timing = getEventTimingDetails(
                  {
                    start_time: item.event_start_time,
                    end_time: item.event_end_time,
                    checkin_open_minutes_before: item.checkin_open_minutes_before,
                    late_after_minutes: item.late_after_minutes,
                    checkin_close_minutes_after_start: item.checkin_close_minutes_after_start,
                    checkout_open_after_minutes: item.checkout_open_after_minutes,
                    checkout_close_minutes_after_end: item.checkout_close_minutes_after_end,
                    is_registered: true,
                    my_registration: {
                      check_in: item.check_in,
                      check_out: item.check_out,
                      status: item.registration_status,
                    },
                  },
                  undefined,
                  currentTime
                );

                return (
                  <tr key={item.registration_id}>
                    <td>
                      <strong>
                        <Link to={`/events/${item.event_id}`} style={{ color: 'inherit' }}>
                          {item.event_title}
                        </Link>
                      </strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <MapPin size={12} />
                        <span>{item.event_location}</span>
                      </div>
                    </td>

                    {/* THỜI GIAN & ĐẾM NGƯỢC */}
                    <td>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toVNDateTime(item.event_start_time)}</div>
                      {timing.startCountdown.isUpcoming ? (
                        <div style={{ fontSize: '0.75rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                          <Timer size={11} />
                          <span>{timing.startCountdown.text}</span>
                        </div>
                      ) : timing.startCountdown.isOngoing ? (
                        <div style={{ fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                          <span>{timing.startCountdown.text}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                          Đã kết thúc
                        </div>
                      )}
                    </td>

                    {/* LƯỢT ĐẾN */}
                    <td>
                      {item.check_in ? (
                        <div>
                          <div style={{ fontSize: '0.85rem' }}>{toVNDateTime(item.check_in.taken_at)}</div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                            {item.check_in.review_status === 'approved' && (
                              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                Đã duyệt
                              </span>
                            )}
                            {item.check_in.review_status === 'pending' && (
                              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                Chờ duyệt
                              </span>
                            )}
                            {item.check_in.review_status === 'rejected' && (
                              <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                Bị từ chối
                              </span>
                            )}
                            {item.check_in.is_late && (
                              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                Muộn
                              </span>
                            )}
                          </div>
                        </div>
                      ) : timing.checkIn.state === 'open' ? (
                        <Link to={`/events/${item.event_id}`} className="badge badge-success" style={{ fontSize: '0.75rem', textDecoration: 'none' }}>
                          Đang mở điểm danh đến
                        </Link>
                      ) : timing.checkIn.state === 'waiting' ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {timing.checkIn.text}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa điểm danh</span>
                      )}
                    </td>

                    {/* LƯỢT VỀ */}
                    <td>
                      {item.check_out ? (
                        <div>
                          <div style={{ fontSize: '0.85rem' }}>{toVNDateTime(item.check_out.taken_at)}</div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                            {item.check_out.review_status === 'approved' && (
                              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                Đã duyệt
                              </span>
                            )}
                            {item.check_out.review_status === 'pending' && (
                              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                Chờ duyệt
                              </span>
                            )}
                            {item.check_out.review_status === 'rejected' && (
                              <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                Bị từ chối
                              </span>
                            )}
                          </div>
                        </div>
                      ) : timing.checkOut.state === 'open' ? (
                        <Link to={`/events/${item.event_id}`} className="badge badge-success" style={{ fontSize: '0.75rem', textDecoration: 'none' }}>
                          Đang mở điểm danh về
                        </Link>
                      ) : timing.checkOut.state === 'waiting' ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {timing.checkOut.text}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>

                  {/* THỜI LƯỢNG */}
                  <td>
                    {item.duration_minutes !== null && item.duration_minutes !== undefined ? (
                      <span style={{ fontWeight: 600 }}>
                        {Math.floor(item.duration_minutes / 60)}h {item.duration_minutes % 60}m
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>

                  {/* TRẠNG THÁI TỔNG */}
                  <td>
                    {item.registration_status === 'cancelled' ? (
                      <span className="badge badge-danger">Đã hủy đăng ký</span>
                    ) : item.check_in?.review_status === 'approved' && item.check_out?.review_status === 'approved' ? (
                      <span className="badge badge-success">Tham dự đầy đủ</span>
                    ) : item.check_in?.review_status === 'approved' ? (
                      <span className="badge badge-primary">Có mặt</span>
                    ) : item.check_in?.review_status === 'pending' || item.check_out?.review_status === 'pending' ? (
                      <span className="badge badge-warning">Đang chờ duyệt</span>
                    ) : (
                      <span className="badge badge-neutral">Chưa có mặt</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/events/${item.event_id}`} className="btn btn-secondary btn-sm">
                      <span>Vào sự kiện</span>
                      <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      )}

      {/* PHÂN TRANG */}
      <Pagination
        currentPage={page}
        totalPages={Math.ceil(total / 10) || 1}
        totalItems={total}
        pageSize={10}
        onPageChange={setPage}
        itemName="lịch sử tham gia"
      />
    </div>
  );
};
