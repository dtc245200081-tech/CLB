import React from 'react';
import { Calendar, CalendarDays, GraduationCap, Clock } from 'lucide-react';

export type ReportPeriodMode = 'week' | 'month' | 'semester' | 'year';

interface PeriodFilterSwitcherProps {
  activePeriod: ReportPeriodMode;
  onChange: (mode: ReportPeriodMode) => void;
  counts?: {
    week?: number;
    month?: number;
    semester?: number;
    year?: number;
  };
}

export const PeriodFilterSwitcher: React.FC<PeriodFilterSwitcherProps> = ({
  activePeriod,
  onChange,
  counts,
}) => {
  const options: { id: ReportPeriodMode; label: string; icon: React.ReactNode }[] = [
    {
      id: 'week',
      label: 'Tuần',
      icon: <Clock size={14} />,
    },
    {
      id: 'month',
      label: 'Tháng',
      icon: <CalendarDays size={14} />,
    },
    {
      id: 'semester',
      label: 'Kỳ học',
      icon: <GraduationCap size={14} />,
    },
    {
      id: 'year',
      label: 'Năm',
      icon: <Calendar size={14} />,
    },
  ];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        borderRadius: '9999px',
        padding: '3px',
        gap: '2px',
      }}
    >
      {options.map((opt) => {
        const isActive = activePeriod === opt.id;
        const count = counts ? counts[opt.id] : undefined;

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              border: isActive ? '1px solid #ea580c' : '1px solid transparent',
              background: isActive ? '#ea580c' : 'transparent',
              color: isActive ? '#ffffff' : '#64748b',
              boxShadow: isActive ? '0 1px 3px rgba(234, 88, 12, 0.25)' : 'none',
            }}
          >
            <span style={{ display: 'flex' }}>{opt.icon}</span>
            <span>{opt.label}</span>
            {count !== undefined && count > 0 && (
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '9999px',
                  background: isActive ? 'rgba(255, 255, 255, 0.25)' : '#e2e8f0',
                  color: isActive ? '#ffffff' : '#475569',
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
