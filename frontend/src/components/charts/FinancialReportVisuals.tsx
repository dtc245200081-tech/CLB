import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Building2,
} from 'lucide-react';
import { PeriodSummaryItem } from '../../types';
import { PeriodFilterSwitcher, ReportPeriodMode } from './PeriodFilterSwitcher';
import { VisualBarChart } from './VisualBarChart';
import { VisualTrendAreaChart } from './VisualTrendAreaChart';
import { VisualDonutChart } from './VisualDonutChart';

interface CategoryItem {
  category: string;
  amount?: number;
  total?: number;
  expense?: number;
  income?: number;
}

interface DepartmentItem {
  department: string;
  income: number;
  expense: number;
}

interface FinancialReportVisualsProps {
  weeklySummary?: PeriodSummaryItem[];
  monthlySummary?: PeriodSummaryItem[];
  semesterSummary?: PeriodSummaryItem[];
  yearlySummary?: PeriodSummaryItem[];
  categorySummary?: CategoryItem[];
  departmentSummary?: DepartmentItem[];
  totalIncome?: number;
  totalExpense?: number;
  currentBalance?: number;
  showDonut?: boolean;
  defaultPeriod?: ReportPeriodMode;
}

export const FinancialReportVisuals: React.FC<FinancialReportVisualsProps> = ({
  weeklySummary = [],
  monthlySummary = [],
  semesterSummary = [],
  yearlySummary = [],
  categorySummary = [],
  departmentSummary = [],
  showDonut = true,
  defaultPeriod = 'month',
}) => {
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>(defaultPeriod);
  const [chartType, setChartType] = useState<'bar' | 'trend'>('bar');

  // Select active dataset based on periodMode
  const activeData: PeriodSummaryItem[] = useMemo(() => {
    switch (periodMode) {
      case 'week':
        return weeklySummary;
      case 'semester':
        return semesterSummary;
      case 'year':
        return yearlySummary;
      case 'month':
      default:
        return monthlySummary;
    }
  }, [periodMode, weeklySummary, monthlySummary, semesterSummary, yearlySummary]);

  // Aggregate metrics for currently active period
  const periodTotals = useMemo(() => {
    const inc = activeData.reduce((sum, d) => sum + (d.income || 0), 0);
    const exp = activeData.reduce((sum, d) => sum + (d.expense || 0), 0);
    const net = inc - exp;
    return { inc, exp, net };
  }, [activeData]);

  // Transform category items for donut chart
  const donutItems = useMemo(() => {
    return categorySummary
      .map((c) => ({
        category: c.category,
        amount: c.amount ?? c.total ?? c.expense ?? 0,
      }))
      .filter((c) => c.amount > 0);
  }, [categorySummary]);

  const formatVND = (amt?: number | null) => {
    if (amt === null || amt === undefined) return '0 ₫';
    return Number(amt).toLocaleString('vi-VN') + ' ₫';
  };

  const periodModeTitle = {
    week: 'theo Tuần',
    month: 'theo Tháng',
    semester: 'theo Kỳ học',
    year: 'theo Năm',
  }[periodMode];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* COMPACT MAIN VISUAL CARD */}
      <div
        className="card"
        style={{
          padding: '20px 24px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
      >
        {/* COMPACT UNIFIED TOOLBAR */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: '16px',
            marginBottom: '16px',
          }}
        >
          {/* Title & Active Metric Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#fff7ed',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BarChart3 size={18} />
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Biểu Đồ Phân Tích Thu Chi
              </h3>
            </div>

            {/* Inline Period Summary Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#059669',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Thu: +{formatVND(periodTotals.inc)}
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#fff1f2',
                  border: '1px solid #fecdd3',
                  color: '#e11d48',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Chi: -{formatVND(periodTotals.exp)}
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#2563eb',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Dòng tiền ròng: {periodTotals.net >= 0 ? '+' : ''}{formatVND(periodTotals.net)}
              </span>
            </div>
          </div>

          {/* Right Controls: Period Switcher & Chart View Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* 4 PERIOD SWITCHER */}
            <PeriodFilterSwitcher
              activePeriod={periodMode}
              onChange={setPeriodMode}
              counts={{
                week: weeklySummary.length,
                month: monthlySummary.length,
                semester: semesterSummary.length,
                year: yearlySummary.length,
              }}
            />

            {/* CHART TYPE TOGGLE */}
            <div
              style={{
                display: 'inline-flex',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '2px',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setChartType('bar')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: chartType === 'bar' ? '#ffffff' : 'transparent',
                  color: chartType === 'bar' ? '#0f172a' : '#64748b',
                  fontWeight: chartType === 'bar' ? 700 : 500,
                  boxShadow: chartType === 'bar' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
                title="Xem dạng biểu đồ cột"
              >
                <BarChart3 size={13} />
                <span>Cột</span>
              </button>

              <button
                type="button"
                onClick={() => setChartType('trend')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: chartType === 'trend' ? '#ffffff' : 'transparent',
                  color: chartType === 'trend' ? '#0f172a' : '#64748b',
                  fontWeight: chartType === 'trend' ? 700 : 500,
                  boxShadow: chartType === 'trend' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
                title="Xem dạng đường xu hướng"
              >
                <TrendingUp size={13} />
                <span>Xu hướng</span>
              </button>
            </div>
          </div>
        </div>

        {/* COMPACT TWO-COLUMN LAYOUT: MAIN CHART (60%) + DONUT BREAKDOWN (40%) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: showDonut && donutItems.length > 0 ? 'repeat(auto-fit, minmax(360px, 1fr))' : '1fr',
            gap: '24px',
            alignItems: 'start',
          }}
        >
          {/* LEFT: MAIN CHART */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {chartType === 'bar' ? (
              <VisualBarChart
                data={activeData}
                height={250}
                title={`Thu vs Chi (${periodModeTitle})`}
                subtitle="So sánh tương quan khoản thu và chi trả thực tế"
              />
            ) : (
              <VisualTrendAreaChart
                data={activeData}
                height={250}
                title={`Đường cong dòng tiền (${periodModeTitle})`}
                subtitle="Biến động số dư quỹ lũy kế và dòng tiền ròng"
              />
            )}
          </div>

          {/* RIGHT: DONUT BREAKDOWN */}
          {showDonut && donutItems.length > 0 && (
            <div
              style={{
                borderLeft: '1px solid #f1f5f9',
                paddingLeft: '20px',
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
              }}
            >
              <VisualDonutChart
                items={donutItems}
                title="Cơ Cấu Chi Tiêu"
                subtitle="Tỷ lệ phân bổ chi phí theo các hạng mục"
                size={180}
              />
            </div>
          )}
        </div>
      </div>

      {/* DEPARTMENT BREAKDOWN (IF AVAILABLE IN ADMIN REPORT) */}
      {departmentSummary.length > 0 && (
        <div
          className="card"
          style={{
            padding: '20px 24px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Building2 size={16} style={{ color: '#ea580c' }} />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
              Chi Phí & Ngân Sách Theo Ban
            </h4>
          </div>
          <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: '#64748b' }}>
            Khoản chi thực tế phân bổ cho các hoạt động của từng ban chuyên môn
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {departmentSummary.map((dept) => {
              const totalDept = dept.expense;
              const maxDeptExpense = Math.max(...departmentSummary.map((d) => d.expense), 1);
              const percent = Math.min(100, Math.round((totalDept / maxDeptExpense) * 100));

              return (
                <div
                  key={dept.department}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span style={{ fontWeight: 600, color: '#334155' }}>
                      {dept.department}
                    </span>
                    <span style={{ fontWeight: 700, color: '#e11d48' }}>
                      {formatVND(totalDept)}
                    </span>
                  </div>

                  <div
                    style={{
                      width: '100%',
                      height: '5px',
                      background: '#e2e8f0',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${percent}%`,
                        height: '100%',
                        background: '#ea580c',
                        borderRadius: '3px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
