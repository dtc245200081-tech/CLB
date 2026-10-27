import React, { useState, useEffect } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Info,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { FinanceOverview } from '../types';
import { ModuleSubTabs } from '../components/ModuleSubTabs';
import { FinancialReportVisuals } from '../components/charts/FinancialReportVisuals';


export const FinanceOverviewPage: React.FC = () => {
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      setIsLoading(true);
      try {
        const res = await api.funds.getPublicOverview();
        setData(res);
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOverview();
  }, []);

  const formatVND = (amt?: number | null) => {
    if (amt === null || amt === undefined) return '0 ₫';
    return Number(amt).toLocaleString('vi-VN') + ' ₫';
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('vi-VN');
    } catch {
      return isoString;
    }
  };

  const recentExpenses = data?.recent_expenses || (data?.recent_entries ? data.recent_entries.filter((e) => e.type === 'expense') : []) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module="finance" />

      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Báo Cáo Tài Chính & Quỹ</h1>
          <p className="page-header-subtitle">
            Công khai thu chi, số dư quỹ và các khoản đầu tư cho hoạt động phong trào của toàn thể hội viên
          </p>
        </div>
      </div>

      {/* FEEDBACK ALERTS */}
      {error && (
        <div style={{ background: 'var(--danger-light)', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          Đang tải thông tin tài chính...
        </div>
      ) : !data ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Info size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <div>Hiện tại bảng tin tài chính công khai đang được bảo trì hoặc chưa có dữ liệu.</div>
        </div>
      ) : (
        <>
          {/* THREE METRIC CARDS (UNIFIED CLEAN LIGHT THEME) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div className="card" style={{ padding: '20px 24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                  SỐ DƯ QUỸ HIỆN HỮU
                </span>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wallet size={16} />
                </div>
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#059669', lineHeight: 1.1 }}>
                {formatVND(data.current_balance ?? data.fund_balance)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                Nguồn quỹ an toàn phục vụ các sự kiện sắp tới
              </div>
            </div>

            <div className="card" style={{ padding: '20px 24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                  TỔNG THU
                </span>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={16} />
                </div>
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#059669', lineHeight: 1.1 }}>
                +{formatVND(data.total_income)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                Bao gồm hội phí thành viên và các khoản tài trợ
              </div>
            </div>

            <div className="card" style={{ padding: '20px 24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                  TỔNG CHI
                </span>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#fff1f2', color: '#e11d48', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingDown size={16} />
                </div>
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#e11d48', lineHeight: 1.1 }}>
                -{formatVND(data.total_expense)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                Chi trả vật tư, tổ chức hội thảo và truyền thông
              </div>
            </div>
          </div>

          {/* VISUAL CHARTS & PERIOD ANALYSIS (TUẦN, THÁNG, KỲ HỌC, NĂM) */}
          <FinancialReportVisuals
            weeklySummary={data.weekly_summary || []}
            monthlySummary={data.monthly_summary || []}
            semesterSummary={data.semester_summary || []}
            yearlySummary={data.yearly_summary || []}
            categorySummary={data.by_category || []}
            totalIncome={data.total_income}
            totalExpense={data.total_expense}
            currentBalance={data.current_balance ?? data.fund_balance}
            showDonut={true}
            defaultPeriod="month"
          />


          {/* RECENT EXPENSES ACTIVITIES */}
          <div className="card" style={{ padding: '24px' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>
              Các Khoản Chi Hoạt Động Gần Đây
            </h4>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Nội dung chi tiêu</th>
                    <th>Hạng mục</th>
                    <th style={{ textAlign: 'right' }}>Số tiền (VND)</th>
                  </tr>
                </thead>
                <tbody>
                  {recentExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>
                        Chưa có khoản chi nào được ghi nhận.
                      </td>
                    </tr>
                  ) : (
                    recentExpenses.map((exp, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatDateTime(exp.occurred_at)}</td>
                        <td style={{ fontWeight: 600 }}>{exp.description}</td>
                        <td>
                          <span className="badge badge-neutral">{exp.category}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                          -{formatVND(exp.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
              🛡️ Dữ liệu được bảo chứng bởi hệ thống kiểm toán tự động của CLB. Không hiển thị thông tin riêng tư cá nhân.
            </div>
          </div>
        </>
      )}
    </div>
  );
};
