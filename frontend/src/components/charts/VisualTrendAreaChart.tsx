import React, { useState } from 'react';
import { PeriodSummaryItem } from '../../types';

interface VisualTrendAreaChartProps {
  data: PeriodSummaryItem[];
  height?: number;
  title?: string;
  subtitle?: string;
}

export const VisualTrendAreaChart: React.FC<VisualTrendAreaChartProps> = ({
  data,
  height = 250,
  title,
  subtitle,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [metricMode, setMetricMode] = useState<'balance' | 'net'>('balance');

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
        <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>📈</div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>
          Chưa có xu hướng phát sinh trong chu kỳ này
        </div>
      </div>
    );
  }

  const values = data.map((d) => (metricMode === 'balance' ? (d.running_balance ?? d.net) : d.net));

  const svgWidth = 650;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 100_000);
  const valRange = maxVal - minVal || 1;

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const val = minVal + (valRange / tickCount) * i;
    const y = paddingTop + chartHeight - ((val - minVal) / valRange) * chartHeight;
    return { val, y };
  });

  const points = data.map((_, i) => {
    const x =
      data.length === 1
        ? paddingLeft + chartWidth / 2
        : paddingLeft + (i / (data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((values[i] - minVal) / valRange) * chartHeight;
    return { x, y };
  });

  const linePathD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const baseY = paddingTop + chartHeight - ((0 - minVal) / valRange) * chartHeight;
  const clampedBaseY = Math.min(Math.max(baseY, paddingTop), paddingTop + chartHeight);
  const areaPathD =
    points.length > 0
      ? `${linePathD} L ${points[points.length - 1].x} ${clampedBaseY} L ${points[0].x} ${clampedBaseY} Z`
      : '';

  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* HEADER & TOGGLE */}
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

        {/* METRIC MODE SWITCHER */}
        <div
          style={{
            display: 'inline-flex',
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '2px',
            gap: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => setMetricMode('balance')}
            style={{
              padding: '3px 8px',
              fontSize: '0.75rem',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: metricMode === 'balance' ? '#ffffff' : 'transparent',
              color: metricMode === 'balance' ? '#0f172a' : '#64748b',
              fontWeight: metricMode === 'balance' ? 700 : 500,
              boxShadow: metricMode === 'balance' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Số dư lũy kế
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('net')}
            style={{
              padding: '3px 8px',
              fontSize: '0.75rem',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: metricMode === 'net' ? '#ffffff' : 'transparent',
              color: metricMode === 'net' ? '#0f172a' : '#64748b',
              fontWeight: metricMode === 'net' ? 700 : 500,
              boxShadow: metricMode === 'net' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Dòng tiền ròng
          </button>
        </div>
      </div>

      {/* SVG CHART CONTAINER */}
      <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', minWidth: '400px' }}
        >
          <defs>
            <linearGradient id="lightTrendAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={metricMode === 'balance' ? '#2563eb' : '#0284c7'}
                stopOpacity="0.18"
              />
              <stop
                offset="100%"
                stopColor={metricMode === 'balance' ? '#2563eb' : '#0284c7'}
                stopOpacity="0.01"
              />
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

          {/* AREA FILL */}
          {areaPathD && <path d={areaPathD} fill="url(#lightTrendAreaGrad)" />}

          {/* MAIN LINE */}
          {linePathD && (
            <path
              d={linePathD}
              fill="none"
              stroke={metricMode === 'balance' ? '#2563eb' : '#0284c7'}
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* DATA POINTS & INTERACTIVE ZONES */}
          {points.map((pt, index) => {
            const isHovered = hoveredIndex === index;
            const item = data[index];

            return (
              <g
                key={index}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Vertical hover guide line */}
                {isHovered && (
                  <line
                    x1={pt.x}
                    y1={paddingTop}
                    x2={pt.x}
                    y2={paddingTop + chartHeight}
                    stroke="#cbd5e1"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Hit target */}
                <circle cx={pt.x} cy={pt.y} r="16" fill="transparent" />

                {/* Outer Glow on hover */}
                {isHovered && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="7"
                    fill="rgba(37, 99, 235, 0.15)"
                    stroke="#2563eb"
                    strokeWidth="1.5"
                  />
                )}

                {/* Core point */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 4.5 : 3.5}
                  fill="#ffffff"
                  stroke={metricMode === 'balance' ? '#2563eb' : '#0284c7'}
                  strokeWidth="2.2"
                />

                {/* X-axis Label */}
                <text
                  x={pt.x}
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

        {/* FLOATING HOVER CARD TOOLTIP */}
        {hoveredItem && hoveredIndex !== null && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: `${Math.min(
                Math.max((points[hoveredIndex].x / svgWidth) * 100, 18),
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
              minWidth: '190px',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', marginBottom: '4px' }}>
              {hoveredItem.label}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.78rem', color: '#64748b', margin: '2px 0' }}>
              <span>Dòng tiền ròng:</span>
              <span style={{ fontWeight: 700, color: hoveredItem.net >= 0 ? '#059669' : '#e11d48' }}>
                {hoveredItem.net >= 0 ? '+' : ''}{formatVND(hoveredItem.net)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.78rem', color: '#2563eb', margin: '2px 0' }}>
              <span>Số dư lũy kế:</span>
              <span style={{ fontWeight: 700 }}>
                {formatVND(hoveredItem.running_balance ?? hoveredItem.net)}
              </span>
            </div>

            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
              Thu: +{formatVND(hoveredItem.income)} | Chi: -{formatVND(hoveredItem.expense)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
