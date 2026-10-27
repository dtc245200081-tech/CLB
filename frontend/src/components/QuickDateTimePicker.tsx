import React from 'react';
import {
  toDateTimeLocalValue,
  addHoursToLocal,
  setTimeOnLocal,
  formatFriendlyDate,
} from '../utils/date';
import { Clock, Calendar, Zap } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface QuickDateTimePickerProps {
  startTime: string;
  endTime: string;
  registrationDeadline?: string | null;
  onChangeStartTime: (val: string) => void;
  onChangeEndTime: (val: string) => void;
  onChangeDeadline?: (val: string | null) => void;
}

export const QuickDateTimePicker: React.FC<QuickDateTimePickerProps> = ({
  startTime,
  endTime,
  registrationDeadline,
  onChangeStartTime,
  onChangeEndTime,
  onChangeDeadline,
}) => {
  const { showWarning } = useToast();
  // Preset nhanh ngày & giờ
  const applyPreset = (preset: 'tonight_20' | 'tomorrow_20' | 'tomorrow_morning' | 'tomorrow_afternoon' | 'sunday_morning') => {
    const now = new Date();
    let startDate = new Date();
    let startHour = 20;
    let startMin = 0;
    let durationHours = 2;

    if (preset === 'tonight_20') {
      startDate = new Date();
      startHour = 20;
      startMin = 0;
      durationHours = 2;
    } else if (preset === 'tomorrow_20') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      startHour = 20;
      startMin = 0;
      durationHours = 2;
    } else if (preset === 'tomorrow_morning') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      startHour = 8;
      startMin = 30;
      durationHours = 3;
    } else if (preset === 'tomorrow_afternoon') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      startHour = 14;
      startMin = 0;
      durationHours = 3;
    } else if (preset === 'sunday_morning') {
      startDate = new Date();
      const day = startDate.getDay();
      const diff = (7 - day) % 7 || 7;
      startDate.setDate(startDate.getDate() + diff);
      startHour = 9;
      startMin = 0;
      durationHours = 2.5;
    }

    startDate.setHours(startHour, startMin, 0, 0);
    const startVal = toDateTimeLocalValue(startDate);

    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + Math.round(durationHours * 60));
    const endVal = toDateTimeLocalValue(endDate);

    onChangeStartTime(startVal);
    onChangeEndTime(endVal);

    if (onChangeDeadline) {
      // Mặc định hạn chót trước giờ bắt đầu 2 tiếng (hoặc tối đa hiện tại nếu là tối nay)
      const deadlineDate = new Date(startDate);
      deadlineDate.setHours(deadlineDate.getHours() - 2);
      if (deadlineDate > now) {
        onChangeDeadline(toDateTimeLocalValue(deadlineDate));
      } else {
        onChangeDeadline(null);
      }
    }
  };

  // Đổi giờ bắt đầu cụ thể
  const handleSetStartHour = (hour: number, minute: number = 0) => {
    let base = startTime;
    if (!base) {
      base = toDateTimeLocalValue(new Date());
    }
    const newStart = setTimeOnLocal(base, hour, minute);
    onChangeStartTime(newStart);

    // Tự động tính giờ kết thúc sau đó 2 tiếng nếu chưa có hoặc không hợp lệ
    const startD = new Date(newStart);
    const endD = endTime ? new Date(endTime) : null;
    if (!endD || endD <= startD) {
      onChangeEndTime(addHoursToLocal(newStart, 2));
    }
  };

  // Cộng thời lượng cho giờ kết thúc
  const handleAddDuration = (hours: number) => {
    if (!startTime) {
      showWarning('Vui lòng chọn thời gian bắt đầu trước.');
      return;
    }
    const newEnd = addHoursToLocal(startTime, hours);
    onChangeEndTime(newEnd);
  };

  // Đặt hạn chót đăng ký
  const handleSetDeadlineHoursBefore = (hoursBefore: number) => {
    if (!startTime) {
      showWarning('Vui lòng chọn thời gian bắt đầu trước.');
      return;
    }
    const startD = new Date(startTime);
    startD.setMinutes(startD.getMinutes() - Math.round(hoursBefore * 60));
    if (onChangeDeadline) {
      onChangeDeadline(toDateTimeLocalValue(startD));
    }
  };

  // Tính thời lượng
  let durationText = '';
  if (startTime && endTime) {
    const s = new Date(startTime).getTime();
    const e = new Date(endTime).getTime();
    if (e > s) {
      const diffMins = Math.round((e - s) / (60 * 1000));
      const h = Math.floor(diffMins / 60);
      const m = diffMins % 60;
      durationText = m > 0 ? `${h} tiếng ${m} phút` : `${h} tiếng`;
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        background: 'rgba(99, 102, 241, 0.05)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      {/* TIÊU ĐỀ KHỐI TRỢ LÝ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem' }}>
          <Zap size={16} />
          <span>Trợ lý đặt nhanh ngày & giờ sự kiện</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          1 chạm đặt chuẩn giờ 24h, không cần gõ thủ công
        </span>
      </div>

      {/* DẢI PRESETS THÔNG DỤNG */}
      <div>
        <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
          ⚡ Mẫu khung giờ phổ biến (Bấm 1 chạm để áp dụng cả bắt đầu & kết thúc):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('tonight_20')}
            style={{ fontSize: '0.8rem', padding: '5px 10px' }}
          >
            🌙 Tối nay (20:00 - 22:00)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('tomorrow_20')}
            style={{ fontSize: '0.8rem', padding: '5px 10px' }}
          >
            🌙 Tối mai (20:00 - 22:00)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('tomorrow_morning')}
            style={{ fontSize: '0.8rem', padding: '5px 10px' }}
          >
            ☀️ Sáng mai (08:30 - 11:30)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('tomorrow_afternoon')}
            style={{ fontSize: '0.8rem', padding: '5px 10px' }}
          >
            ⛅ Chiều mai (14:00 - 17:00)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('sunday_morning')}
            style={{ fontSize: '0.8rem', padding: '5px 10px' }}
          >
            📅 Sáng Chủ nhật (09:00 - 11:30)
          </button>
        </div>
      </div>

      {/* DÒNG INPUT CHÍNH BẮT ĐẦU VÀ KẾT THÚC */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
        {/* BẮT ĐẦU */}
        <div>
          <label className="form-label" style={{ marginBottom: '6px' }}>
            <Calendar size={14} color="var(--primary)" />
            <span>Thời gian bắt đầu *</span>
          </label>
          <input
            type="datetime-local"
            className="form-input"
            value={startTime}
            onChange={(e) => onChangeStartTime(e.target.value)}
            required
            style={{ fontWeight: 600 }}
          />

          {/* CÁC NÚT GIỜ CHUẨN 24H */}
          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Đổi sang giờ:</span>
            {[
              { label: '08:00', h: 8, m: 0 },
              { label: '09:00', h: 9, m: 0 },
              { label: '14:00', h: 14, m: 0 },
              { label: '18:00', h: 18, m: 0 },
              { label: '19:30', h: 19, m: 30 },
              { label: '20:00 (8h tối)', h: 20, m: 0, highlight: true },
            ].map((btn, idx) => (
              <button
                key={idx}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleSetStartHour(btn.h, btn.m)}
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: btn.highlight ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: btn.highlight ? '#4f46e5' : 'var(--text-secondary)',
                  border: btn.highlight ? '1px solid rgba(79, 70, 229, 0.4)' : '1px solid transparent',
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* KẾT THÚC */}
        <div>
          <label className="form-label" style={{ marginBottom: '6px' }}>
            <Clock size={14} color="var(--accent-purple)" />
            <span>Thời gian kết thúc *</span>
          </label>
          <input
            type="datetime-local"
            className="form-input"
            value={endTime}
            onChange={(e) => onChangeEndTime(e.target.value)}
            required
            style={{ fontWeight: 600 }}
          />

          {/* CÁC NÚT CỘNG THỜI LƯỢNG */}
          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Thời lượng:</span>
            {[
              { label: '+1 tiếng', h: 1 },
              { label: '+2 tiếng', h: 2, highlight: true },
              { label: '+3 tiếng', h: 3 },
              { label: '+4 tiếng', h: 4 },
            ].map((dur, idx) => (
              <button
                key={idx}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleAddDuration(dur.h)}
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: dur.highlight ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: dur.highlight ? '#c084fc' : 'var(--text-secondary)',
                  border: dur.highlight ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent',
                }}
              >
                {dur.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* HẠN CHÓT ĐĂNG KÝ */}
      {onChangeDeadline && (
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '0.825rem' }}>
              <span>Hạn chót đăng ký (tùy chọn)</span>
            </label>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleSetDeadlineHoursBefore(1)}
                style={{ fontSize: '0.725rem', padding: '2px 6px', background: 'rgba(255,255,255,0.04)' }}
              >
                Trước bắt đầu 1 tiếng
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleSetDeadlineHoursBefore(24)}
                style={{ fontSize: '0.725rem', padding: '2px 6px', background: 'rgba(255,255,255,0.04)' }}
              >
                Trước bắt đầu 1 ngày
              </button>
              {registrationDeadline && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onChangeDeadline(null)}
                  style={{ fontSize: '0.725rem', padding: '2px 6px', color: '#dc2626' }}
                >
                  Xóa hạn chót
                </button>
              )}
            </div>
          </div>

          <input
            type="datetime-local"
            className="form-input"
            value={registrationDeadline || ''}
            onChange={(e) => onChangeDeadline(e.target.value || null)}
            style={{ marginTop: '6px' }}
          />
        </div>
      )}

      {/* PREVIEW THÂN THIỆN XÁC NHẬN GIỜ TIẾNG VIỆT */}
      {startTime && (
        <div
          style={{
            padding: '8px 12px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            color: '#047857',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock size={15} style={{ flexShrink: 0 }} />
          <div>
            <strong>Xác nhận lịch: </strong>
            <span>{formatFriendlyDate(startTime)}</span>
            {endTime && (
              <span> ➔ Đến: <strong>{new Date(endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })}</strong></span>
            )}
            {durationText && <span style={{ color: 'var(--text-primary)' }}> ({durationText})</span>}
          </div>
        </div>
      )}
    </div>
  );
};
