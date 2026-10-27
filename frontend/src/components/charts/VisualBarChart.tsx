import React, { useState } from 'react';
import { PeriodSummaryItem } from '../../types';

interface VisualBarChartProps {
  data: PeriodSummaryItem[];
  height?: number;
  title?: string;
  subtitle?: string;
}

export const VisualBarChart: React.FC<VisualBarChartProps> = ({
  data,
  height = 250,
  title,
  subtitle,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const formatVND = (amt: number) => {
    return Number(amt || 0).toLocaleString('vi-VN') + ' ₫';
  };

  const formatCompactVND = (amt: number) => {
    if (Math.abs(amt) >= 1_000_000_000) {
      return (amt / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + ' tỷ';
    }
    if (Math.abs(amt) >= 1_000_000) {
      return (amt / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' Tr';
    }
    if (Math.abs(amt) >= 1_000) {
      return (amt / 1_000).toFixed(0) + ' k';
    }
    return String(amt);
  };

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: `${height}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          background: '#f8fafc',
          borderRadius: '10px',
          border: '1px dashed #e2e8f0',
        }}
      >
        <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>📊</div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>
          Chưa có số liệu phát sinh cho chu kỳ này
        </div>
        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
          Các khoản thu chi mới ghi nhận sẽ tự động hiển thị trên biểu đồ
        </div>
      </div>
    );
  }

  // Calculate layout & dimensions
  const svgWidth = 650;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Max value calculation for scaling
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.income, d.expense)),
    100_000
  );

  // Generate 4 nice tick marks
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const val = Math.round((maxVal / tickCount) * i);
    const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
    return { val, y };
  });

  const groupWidth = chartWidth / data.length;
  const barWidth = Math.max(10, Math.min(24, (groupWidth - 20) / 2));
  const barGap = 4;

  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* HEADER / LEGEND */}
      {(title || subtitle) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            {title && (
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                {title}
              </h4>
            )}
            {subtitle && (
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                {subtitle}
              </p>
            )}
          </div>

          {/* Interactive Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '3px',
                  background: '#10b981',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#475569', fontWeight: 500 }}>Thu (Income)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '3px',
                  background: '#f43f5e',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#475569', fontWeight: 500 }}>Chi (Expense)</span>
            </div>
          </div>
        </div>
      )}

      {/* SVG CHART CONTAINER */}
      <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', minWidth: '400px' }}
        >
          <defs>
            <linearGradient id="lightIncomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>

            <linearGradient id="lightExpenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
          </defs>

          {/* HORIZONTAL GRID LINES & TICKS */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={paddingLeft}
                y1={t.y}
                x2={svgWidth - paddingRight}
                y2={t.y}
                stroke="#f1f5f9"
                strokeWidth="1.2"
                strokeDasharray={i === 0 ? 'none' : '3 3'}
              />
              <text
                x={paddingLeft - 8}
                y={t.y + 3.5}
                textAnchor="end"
                fontSize="11"
                fontWeight="500"
                fill="#64748b"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {formatCompactVND(t.val)}
              </text>
            </g>
          ))}

          {/* BARS & HOVER COLUMNS */}
          {data.map((item, index) => {
            const groupX = paddingLeft + index * groupWidth;
            const centerX = groupX + groupWidth / 2;

            const incomeHeight = (item.income / maxVal) * chartHeight;
            const expenseHeight = (item.expense / maxVal) * chartHeight;

            const incomeY = paddingTop + chartHeight - incomeHeight;
            const expenseY = paddingTop + chartHeight - expenseHeight;

            const incomeX = centerX - barWidth - barGap / 2;
            const expenseX = centerX + barGap / 2;

            const isHovered = hoveredIndex === index;

            return (
              <g
                key={item.period_key || index}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Subtle Hover backdrop */}
                {isHovered && (
                  <rect
                    x={groupX + 4}
                    y={paddingTop - 6}
                    width={groupWidth - 8}
                    height={chartHeight + 12}
                    rx="6"
                    fill="#f8fafc"
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                )}

                {/* Income Bar */}
                <rect
                  x={incomeX}
                  y={incomeY}
                  width={barWidth}
                  height={Math.max(2, incomeHeight)}
                  rx="3"
                  fill="url(#lightIncomeGrad)"
                  opacity={hoveredIndex !== null && !isHovered ? 0.6 : 1}
                  style={{ transition: 'all 0.15s ease' }}
                />

                {/* Expense Bar */}
                <rect
                  x={expenseX}
                  y={expenseY}
                  width={barWidth}
                  height={Math.max(2, expenseHeight)}
                  rx="3"
                  fill="url(#lightExpenseGrad)"
                  opacity={hoveredIndex !== null && !isHovered ? 0.6 : 1}
                  style={{ transition: 'all 0.15s ease' }}
                />

                {/* X-axis Label */}
                <text
                  x={centerX}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isHovered ? '700' : '500'}
                  fill={isHovered ? '#0f172a' : '#64748b'}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* FLOATING HOVER CARD TOOLTIP (LIGHT CLEAN CARD) */}
        {hoveredItem && hoveredIndex !== null && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: `${Math.min(
                Math.max(
                  ((paddingLeft + hoveredIndex * groupWidth + groupWidth / 2) / svgWidth) * 100,
                  18
                ),
                82
              )}%`,
              transform: 'translateX(-50%)',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '8px 12px',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 4px 6px -2px rgba(15, 23, 42, 0.05)',
              zIndex: 10,
              pointerEvents: 'none',
              minWidth: '180px',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', marginBottom: '4px' }}>
              {hoveredItem.label}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.78rem', color: '#059669', margin: '2px 0' }}>
              <span>Thu:</span>
              <span style={{ fontWeight: 700 }}>+{formatVND(hoveredItem.income)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.78rem', color: '#e11d48', margin: '2px 0' }}>
              <span>Chi:</span>
              <span style={{ fontWeight: 700 }}>-{formatVND(hoveredItem.expense)}</span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '0.78rem',
                borderTop: '1px solid #f1f5f9',
                paddingTop: '4px',
                marginTop: '4px',
                color: hoveredItem.net >= 0 ? '#0284c7' : '#ea580c',
                fontWeight: 700,
              }}
            >
              <span>Chênh lệch:</span>
              <span>{hoveredItem.net >= 0 ? '+' : ''}{formatVND(hoveredItem.net)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
