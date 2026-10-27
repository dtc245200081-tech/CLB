import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api/client';
import { EventAttendance } from '../types';
import { toVNDateTime } from '../utils/date';
import { AlertCircle, CheckCircle, Clock, ShieldAlert, XCircle, Camera, Upload } from 'lucide-react';

interface AttendancePhotoModalProps {
  attendance: EventAttendance | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  canReview?: boolean;
}

export const AttendancePhotoModal: React.FC<AttendancePhotoModalProps> = ({
  attendance,
  isOpen,
  onClose,
  onApprove,
  onReject,
  canReview = false,
}) => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let currentUrl: string | null = null;
    if (isOpen && attendance) {
      if (attendance.source === 'manual' || !attendance.photo_path) {
        setPhotoUrl(null);
        return;
      }

      setLoading(true);
      setError(null);
      api.attendances
        .getPhotoUrl(attendance.id)
        .then((url) => {
          currentUrl = url;
          setPhotoUrl(url);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Không thể tải ảnh điểm danh.');
          setLoading(false);
        });
    }

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [isOpen, attendance]);

  if (!isOpen || !attendance) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ảnh điểm danh #${attendance.id} - ${attendance.type === 'check_in' ? 'Lúc Đến' : 'Lúc Về'}`}
      maxWidth="680px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Đóng
          </button>
          {canReview && attendance.review_status === 'pending' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {onReject && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => onReject(attendance.id)}
                >
                  <XCircle size={14} />
                  <span>Từ chối</span>
                </button>
              )}
              {onApprove && (
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => onApprove(attendance.id)}
                >
                  <CheckCircle size={14} />
                  <span>Duyệt ảnh</span>
                </button>
              )}
            </div>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Khung ảnh */}
        <div
          style={{
            width: '100%',
            height: '380px',
            background: '#040711',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {attendance.source === 'manual' ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <Clock size={40} style={{ marginBottom: '8px', opacity: 0.7 }} />
              <div>Điểm danh thủ công (không có ảnh)</div>
            </div>
          ) : loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Đang tải ảnh từ máy chủ bảo mật...</div>
          ) : error ? (
            <div style={{ textAlign: 'center', color: '#dc2626', padding: '20px' }}>
              <AlertCircle size={36} style={{ marginBottom: '8px' }} />
              <div>{error}</div>
            </div>
          ) : photoUrl ? (
            <img
              src={photoUrl}
              alt="Ảnh điểm danh"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : null}
        </div>

        {/* Thông tin chi tiết */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            background: 'rgba(255, 255, 255, 0.02)',
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.875rem',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.775rem' }}>Người tham dự</span>
            <strong>{attendance.user_name || '—'}</strong>
            {attendance.student_id && (
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.8rem' }}>
                MSSV: {attendance.student_id}
              </span>
            )}
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.775rem' }}>Lượt & Nguồn</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span className={`badge ${attendance.type === 'check_in' ? 'badge-primary' : 'badge-neutral'}`}>
                {attendance.type === 'check_in' ? 'Điểm danh đến' : 'Điểm danh về'}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {attendance.source === 'camera' ? (
                  <>
                    <Camera size={12} /> Camera
                  </>
                ) : attendance.source === 'upload' ? (
                  <>
                    <Upload size={12} /> Tải tệp
                  </>
                ) : (
                  'Thủ công'
                )}
              </span>
            </div>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.775rem' }}>Giờ chụp (Server)</span>
            <span>{toVNDateTime(attendance.taken_at)}</span>
            {attendance.is_late && (
              <span
                className="badge badge-warning"
                style={{ marginLeft: '6px', fontSize: '0.7rem', padding: '2px 6px' }}
              >
                Đến muộn
              </span>
            )}
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.775rem' }}>Trạng thái duyệt</span>
            <div style={{ marginTop: '2px' }}>
              {attendance.review_status === 'approved' && (
                <span className="badge badge-success">
                  <CheckCircle size={12} /> Đã duyệt
                </span>
              )}
              {attendance.review_status === 'pending' && (
                <span className="badge badge-warning">
                  <Clock size={12} /> Chờ duyệt
                </span>
              )}
              {attendance.review_status === 'rejected' && (
                <span className="badge badge-danger">
                  <ShieldAlert size={12} /> Bị từ chối
                </span>
              )}
            </div>
          </div>
        </div>

        {attendance.review_note && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: attendance.review_status === 'rejected' ? 'var(--danger-light)' : 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.85rem',
            }}
          >
            <strong style={{ color: attendance.review_status === 'rejected' ? '#b91c1c' : 'var(--text-secondary)' }}>
              Ghi chú duyệt:{' '}
            </strong>
            <span>{attendance.review_note}</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
