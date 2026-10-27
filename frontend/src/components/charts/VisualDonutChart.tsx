import React, { useState } from 'react';

interface DonutItem {
  category: string;
  amount: number;
  color?: string;
}

interface VisualDonutChartProps {
  items: DonutItem[];
  title?: string;
  subtitle?: string;
  centerLabel?: string;
  size?: number;
}

const PALETTE = [
  '#ea580c', // Primary Orange
  '#0284c7', // Sky Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#f43f5e', // Rose
  '#14b8a6', // Teal
  '#64748b', // Slate
];

export const VisualDonutChart: React.FC<VisualDonutChartProps> = ({
  items,
  title,
  subtitle,
  centerLabel = 'Tổng chi',
  size = 190,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const formatVND = (amt: number) => {
    return Number(amt || 0).toLocaleString('vi-VN') + ' ₫';
  };

  const total = items.reduce((sum, it) => sum + (it.amount || 0), 0);

  if (!items || items.length === 0 || total === 0) {
    return (
      <div
        style={{
          height: `${size}px`,
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
        <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>🍩</div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>
          Chưa có phát sinh chi tiêu
        </div>
      </div>
    );
  }

  const radius = 68;
  const strokeWidth = 22;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  const slices = items.map((it, idx) => {
    const percent = it.amount / total;
    const strokeDasharray = `${percent * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedPercent * circumference;
    accumulatedPercent += percent;
    const color = it.color || PALETTE[idx % PALETTE.length];
    return {
      ...it,
      percent,
      strokeDasharray,
      strokeDashoffset,
      color,
      index: idx,
    };
  });

  const activeItem = hoveredIndex !== null ? slices[hoveredIndex] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
      {(title || subtitle) && (
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
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        {/* SVG CIRCLE */}
        <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <g transform={`rotate(-90 ${center} ${center})`}>
              {slices.map((slice) => {
                const isHovered = hoveredIndex === slice.index;
                return (
                  <circle
                    key={slice.category}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="transparent"
                    stroke={slice.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={slice.strokeDasharray}
                    strokeDashoffset={slice.strokeDashoffset}
                    style={{
                      transition: 'all 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredIndex(slice.index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                );
              })}
            </g>
          </svg>

          {/* CENTER TEXT */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
              maxWidth: '95px',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, lineHeight: 1.2 }}>
              {activeItem ? activeItem.category : centerLabel}
            </div>
            <div
              style={{
                fontSize: activeItem ? '0.95rem' : '1.05rem',
                fontWeight: 800,
                color: activeItem ? activeItem.color : '#0f172a',
                marginTop: '2px',
              }}
            >
              {activeItem ? `${(activeItem.percent * 100).toFixed(1)}%` : formatVND(total)}
            </div>
            {activeItem && (
              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '1px' }}>
                {formatVND(activeItem.amount)}
              </div>
            )}
          </div>
        </div>

        {/* LEGEND LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '180px' }}>
          {slices.map((slice) => {
            const isHovered = hoveredIndex === slice.index;
            return (
              <div
                key={slice.category}
                onMouseEnter={() => setHoveredIndex(slice.index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: isHovered ? '#f1f5f9' : '#fafafa',
                  border: isHovered ? '1px solid #cbd5e1' : '1px solid #f1f5f9',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: slice.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                    {slice.category}
                  </span>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                    {formatVND(slice.amount)}
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: slice.color,
                      background: '#ffffff',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    {(slice.percent * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
