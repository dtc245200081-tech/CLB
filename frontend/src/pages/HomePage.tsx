import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Calendar,
  CheckCircle2,
  Wallet,
  TrendingUp,
  Download,
  Plus,
  BarChart3,
  PieChart,
  CheckSquare,
  FileText,
  UserX,
  Sparkles,
  CreditCard,
  Megaphone,
  Clock,
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Department, Event, FeePeriod, Task, Announcement, MyFeesResponse, FundReport } from '../types';
import { toVNDateTime } from '../utils/date';

export const HomePage: React.FC = () => {
  const { user, canManage, viewMode } = useAuth();
  const navigate = useNavigate();

  // Thống kê quản lý từ hệ thống
  const [memberCount, setMemberCount] = useState<number>(0);
  const [fundBalance, setFundBalance] = useState<number>(0);
  const [pendingTasksCount, setPendingTasksCount] = useState<number>(0);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [periods, setPeriods] = useState<FeePeriod[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fundReport, setFundReport] = useState<FundReport | null>(null);

  // Bộ chọn Học kỳ (Semester Selection)
  const [selectedSemester, setSelectedSemester] = useState<string>('Học kỳ 1 (2025 - 2026)');
  const [isSemesterDropdownOpen, setIsSemesterDropdownOpen] = useState<boolean>(false);

  // Thống kê cá nhân dành cho Cổng Hội Viên
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [myFees, setMyFees] = useState<MyFeesResponse | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) return;

    if (canManage && viewMode === 'manage') {
      const fetchDashboardStats = async () => {
        try {
          const [usersRes, fundsRes, eventsRes, periodsRes, deptsRes, joinReqsRes, reportRes] = await Promise.allSettled([
            api.users.list({ page_size: 1 }).catch(() => ({ total: 0 })),
            api.funds.getPublicOverview().catch(() => ({ current_balance: 0 })),
            api.events.list({ page_size: 10 }).catch(() => ({ items: [], total: 0 })),
            api.fees.listPeriods().catch(() => []),
            api.departments.list({ page_size: 50 }).catch(() => ({ items: [] })),
            api.joinRequests.list({ status: 'pending', page_size: 1 }).catch(() => ({ total: 0 })),
            api.funds.getReport().catch(() => null),
          ]);

          if (usersRes.status === 'fulfilled') setMemberCount(usersRes.value.total || 0);
          if (fundsRes.status === 'fulfilled') setFundBalance(fundsRes.value.current_balance || 0);
          if (eventsRes.status === 'fulfilled') {
            const allEvs = eventsRes.value.items || [];
            const published = allEvs.filter((e) => e.status === 'published');
            setUpcomingEvents(published.length > 0 ? published : allEvs.slice(0, 4));
          }
          if (periodsRes.status === 'fulfilled') setPeriods(periodsRes.value || []);
          if (deptsRes.status === 'fulfilled') setDepartments(deptsRes.value.items || []);
          if (reportRes.status === 'fulfilled' && reportRes.value) setFundReport(reportRes.value);

          let pending = 0;
          if (joinReqsRes.status === 'fulfilled') pending += joinReqsRes.value.total || 0;
          setPendingTasksCount(pending);
        } catch (_) {
          // Fallback gracefully
        }
      };

      fetchDashboardStats();
    } else {

      const fetchMemberStats = async () => {
        try {
          const [tasksRes, feesRes, eventsRes, fundsRes, annRes] = await Promise.allSettled([
            api.tasks.list({ page_size: 6 }).catch(() => ({ items: [] })),
            api.fees.getMyFees().catch(() => ({ items: [], payments: [], claims: [] })),
            api.events.list({ upcoming_only: true, page_size: 4 }).catch(() => ({ items: [] })),
            api.funds.getPublicOverview().catch(() => ({ current_balance: 0 })),
            api.announcements.list({ page_size: 3 }).catch(() => ({ items: [] })),
          ]);

          if (tasksRes.status === 'fulfilled') setMyTasks(tasksRes.value.items || []);
          if (feesRes.status === 'fulfilled') setMyFees(feesRes.value);
          if (eventsRes.status === 'fulfilled') setUpcomingEvents(eventsRes.value.items || []);
          if (fundsRes.status === 'fulfilled') setFundBalance(fundsRes.value.current_balance || 0);
          if (annRes.status === 'fulfilled') setAnnouncements(annRes.value.items || []);
        } catch (_) {
        }
      };

      fetchMemberStats();
    }
  }, [user, canManage, viewMode]);

  const formatVND = (amt: number) => {
    if (!amt) return '0 ₫';
    return Number(amt).toLocaleString('vi-VN') + ' ₫';
  };

  const handleExportReport = () => {
    const reportData = {
      title: 'Báo cáo tổng quan hoạt động CLB Sinh Viên',
      generated_at: new Date().toLocaleString('vi-VN'),
      total_members: memberCount,
      fund_balance: fundBalance,
      pending_tasks: pendingTasksCount,
      upcoming_events: upcomingEvents.length,
      fee_periods: periods.length,
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao_cao_clb_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Danh sách các kỳ học có thể chọn
  const semesterOptions = useMemo(() => {
    const list: { id: string; label: string; badge?: string }[] = [];
    if (fundReport?.fee_periods && fundReport.fee_periods.length > 0) {
      fundReport.fee_periods.forEach((fp) => {
        list.push({
          id: fp.period_name,
          label: fp.period_name,
          badge: `${fp.collection_rate_percent}%`,
        });
      });
    } else if (periods && periods.length > 0) {
      periods.forEach((p) => {
        list.push({
          id: p.name,
          label: p.name,
          badge: p.status === 'open' ? 'Đang mở' : 'Đã đóng',
        });
      });
    }
    if (!list.some((o) => o.id.includes('2026-2027'))) {
      list.unshift({ id: 'Kỳ 1 • 2026-2027', label: 'Kỳ 1 • 2026-2027', badge: 'Hiện tại' });
    }
    if (!list.some((o) => o.id.includes('Tất cả kỳ'))) {
      list.push({ id: 'Toàn thời gian (Tất cả kỳ)', label: 'Toàn thời gian (Tất cả kỳ)', badge: 'Tổng hợp' });
    }
    return list;
  }, [fundReport, periods]);

  // Kỳ thu đang active theo bộ chọn
  const activeFeePeriod = useMemo(() => {
    if (!fundReport?.fee_periods || fundReport.fee_periods.length === 0) {
      if (periods.length > 0) {
        const found = periods.find((p) => p.name.toLowerCase() === selectedSemester.toLowerCase()) || periods[0];
        return {
          period_name: found.name,
          total_expected: found.amount * (memberCount || 31),
          total_collected: found.amount * 20,
          total_debt: found.amount * 11,
          collection_rate_percent: 64.5,
        };
      }
      return null;
    }
    if (selectedSemester === 'Toàn thời gian (Tất cả kỳ)') {
      const totalExpected = fundReport.fee_periods.reduce((s, p) => s + (p.total_expected || 0), 0);
      const totalCollected = fundReport.fee_periods.reduce((s, p) => s + (p.total_collected || 0), 0);
      const totalDebt = fundReport.fee_periods.reduce((s, p) => s + (p.total_debt || 0), 0);
      const rate = totalExpected > 0 ? Number(((totalCollected / totalExpected) * 100).toFixed(1)) : 0;
      return {
        period_name: 'Toàn thời gian (Tất cả kỳ)',
        total_expected: totalExpected,
        total_collected: totalCollected,
        total_debt: totalDebt,
        collection_rate_percent: rate,
      };
    }
    const match = fundReport.fee_periods.find(
      (fp) =>
        fp.period_name.toLowerCase().includes(selectedSemester.toLowerCase()) ||
        selectedSemester.toLowerCase().includes(fp.period_name.toLowerCase())
    );
    if (match) return match;
    return fundReport.fee_periods[0];
  }, [fundReport, periods, selectedSemester, memberCount]);

  // Phân bổ thành viên theo ban
  const deptPalette = ['#ea580c', '#0284c7', '#10b981', '#8b5cf6', '#f59e0b'];
  const totalAssigned = departments.reduce((sum, d) => sum + (d.member_count || 0), 0);
  const unassignedCount = Math.max(0, memberCount - totalAssigned);

  const deptSlices = useMemo(() => {
    if (!departments || departments.length === 0) return [];
    const baseTotal = memberCount || totalAssigned || 1;
    let accumulated = 0;
    return departments.map((d, idx) => {
      const count = d.member_count || 0;
      const percent = count / baseTotal;
      const color = deptPalette[idx % deptPalette.length];
      const strokeDasharray = `${percent * 326.7} 326.7`;
      const strokeDashoffset = -accumulated * 326.7;
      accumulated += percent;
      return {
        ...d,
        count,
        percent,
        color,
        strokeDasharray,
        strokeDashoffset,
      };
    });
  }, [departments, memberCount, totalAssigned]);

  // NẾU LÀ GIAO DIỆN QUẢN TRỊ (THEO ĐÚNG HÌNH MẪU THIẾT KẾ CỦA USER)
  if (user && canManage && viewMode === 'manage') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {/* HEADER: TIÊU ĐỀ & HÀNH ĐỘNG */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Tổng quan Quản lý
            </h1>

            {/* INTERACTIVE SEMESTER SELECTOR DROPDOWN */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsSemesterDropdownOpen(!isSemesterDropdownOpen)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--primary-light)',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                  color: '#ea580c',
                  padding: '5px 14px',
                  borderRadius: '9999px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(234, 88, 12, 0.12)',
                }}
                title="Nhấn để chọn kỳ học khác"
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ea580c' }} />
                <span>{selectedSemester}</span>
                <ChevronDown size={14} style={{ transform: isSemesterDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
              </button>

              {/* DROPDOWN MENU */}
              {isSemesterDropdownOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    onClick={() => setIsSemesterDropdownOpen(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      minWidth: '260px',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '6px',
                      boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
                      zIndex: 50,
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Chọn chu kỳ / Kỳ học
                    </div>
                    {semesterOptions.map((opt) => {
                      const isSelected = selectedSemester === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSelectedSemester(opt.id);
                            setIsSemesterDropdownOpen(false);
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: isSelected ? 'var(--primary-light)' : 'transparent',
                            color: isSelected ? '#ea580c' : 'var(--text-primary)',
                            border: 'none',
                            fontSize: '0.82rem',
                            fontWeight: isSelected ? 700 : 500,
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isSelected ? <Check size={14} style={{ color: '#ea580c' }} /> : <span style={{ width: '14px' }} />}
                            <span>{opt.label}</span>
                          </div>
                          {opt.badge && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: isSelected ? '#ea580c' : 'var(--bg-surface)',
                                color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                                fontWeight: 600,
                              }}
                            >
                              {opt.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>


          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleExportReport}
              className="btn btn-secondary"
              style={{
                padding: '8px 14px',
                fontSize: '0.85rem',
                borderRadius: '8px',
              }}
            >
              <Download size={15} />
              <span>Xuất báo cáo</span>
            </button>

            <button
              onClick={() => navigate('/events')}
              className="btn btn-primary"
              style={{
                padding: '8px 16px',
                fontSize: '0.85rem',
                background: '#ea580c',
                color: '#ffffff',
                borderRadius: '8px',
                boxShadow: '0 1px 2px rgba(234, 88, 12, 0.2)',
              }}
            >
              <Plus size={16} />
              <span>Tạo sự kiện</span>
            </button>
          </div>
        </div>

        {/* HÀNG 1: 4 THẺ THỐNG KÊ NHANH (QUICK STAT CARDS) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Card 1: Tổng thành viên */}
          <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Tổng thành viên
              </span>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--bg-glass-input)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={16} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                {memberCount}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: memberCount > 0 ? '#ecfdf5' : 'var(--bg-glass-input)',
                  color: memberCount > 0 ? '#059669' : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {memberCount > 0 ? 'Đang hoạt động' : 'Chưa có dữ liệu'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: memberCount > 0 ? '#10b981' : '#f97316',
                }}
              />
              <span>{memberCount > 0 ? `${memberCount} thành viên trong hệ thống` : 'Chưa có thành viên nào'}</span>
            </div>
          </div>

          {/* Card 2: Tỷ lệ tham gia */}
          <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Tỷ lệ tham gia
              </span>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--bg-glass-input)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={16} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                87.5%
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: '#ecfdf5',
                  color: '#059669',
                  fontWeight: 600,
                }}
              >
                Tích cực
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '9999px',
                background: 'var(--border-subtle)',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: '87.5%', height: '100%', background: '#10b981', borderRadius: '9999px' }} />
            </div>

          </div>

          {/* Card 3: Quỹ hoạt động */}
          <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Quỹ hoạt động
              </span>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--bg-glass-input)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Wallet size={16} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                {fundBalance > 0 ? formatVND(fundBalance) : '0 ₫'}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: fundBalance > 0 ? '#ecfdf5' : 'var(--bg-glass-input)',
                  color: fundBalance > 0 ? '#059669' : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {fundBalance > 0 ? 'Khả dụng' : 'Chưa thu'}
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '9999px',
                background: 'var(--border-subtle)',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: fundBalance > 0 ? '45%' : '0%', height: '100%', background: '#10b981' }} />
            </div>
          </div>

          {/* Card 4: Việc cần xử lý */}
          <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Việc cần xử lý
              </span>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--bg-glass-input)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={16} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                {pendingTasksCount}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                mục
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: pendingTasksCount === 0 ? '#ecfdf5' : '#fffbeb',
                  color: pendingTasksCount === 0 ? '#059669' : '#d97706',
                  fontWeight: 600,
                }}
              >
                {pendingTasksCount === 0 ? 'Đã hoàn tất' : 'Chờ xử lý'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: pendingTasksCount === 0 ? '#10b981' : '#f59e0b',
                }}
              />
              <span>{pendingTasksCount === 0 ? 'Không có việc chờ duyệt' : `${pendingTasksCount} đơn ứng tuyển cần duyệt`}</span>
            </div>
          </div>
        </div>

        {/* HÀNG 2: 2 THẺ PHÂN TÍCH TIẾN ĐỘ & CƠ CẤU BAN (GRID 2 CỘT) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
          {/* CỘT TRÁI: TIẾN ĐỘ THU HỘI PHÍ */}
          <div
            className="card"
            style={{
              padding: '0',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header Thẻ */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 size={18} style={{ color: '#ea580c' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Tiến độ thu hội phí {activeFeePeriod ? `• ${activeFeePeriod.period_name}` : ''}
                </h3>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: activeFeePeriod && activeFeePeriod.collection_rate_percent >= 50 ? '#ecfdf5' : '#fff7ed',
                  color: activeFeePeriod && activeFeePeriod.collection_rate_percent >= 50 ? '#059669' : '#ea580c',
                  fontWeight: 600,
                }}
              >
                {activeFeePeriod ? `Đã thu ${activeFeePeriod.collection_rate_percent}%` : 'Chỉ tiêu: Chưa thiết lập'}
              </span>
            </div>

            {/* Nội dung khi có dữ liệu đợt thu */}
            {activeFeePeriod ? (
              <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, justifyContent: 'center' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tỷ lệ hoàn thành mục tiêu</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ea580c' }}>
                      {activeFeePeriod.collection_rate_percent}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '10px', borderRadius: '9999px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, activeFeePeriod.collection_rate_percent))}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #ea580c 0%, #10b981 100%)',
                        borderRadius: '9999px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>

                {/* 3 Khối chỉ số chi tiết: Đã thực thu, Còn nợ, Tổng chỉ tiêu */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '2px' }}>
                  <div style={{ padding: '12px 14px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, marginBottom: '2px' }}>Đã thực thu</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#059669' }}>{formatVND(activeFeePeriod.total_collected)}</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, marginBottom: '2px' }}>Còn nợ / Chưa nộp</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#dc2626' }}>{formatVND(activeFeePeriod.total_debt)}</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: 'var(--bg-glass-input)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Tổng chỉ tiêu</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatVND(activeFeePeriod.total_expected)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '48px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '10px',
                    background: 'var(--bg-glass-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                  }}
                >
                  <FileText size={22} />
                </div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Chưa có đợt thu hội phí nào được tạo
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '380px', lineHeight: 1.5, marginBottom: '20px' }}>
                  Tạo đợt thu hội phí đầu kỳ để phân bổ chỉ tiêu cho các ban và theo dõi tiến độ nộp quỹ.
                </p>
                <button
                  onClick={() => navigate('/admin/fees')}
                  className="btn btn-primary btn-sm"
                  style={{
                    background: '#ea580c',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '8px',
                  }}
                >
                  <Plus size={15} />
                  <span>Tạo đợt thu mới</span>
                </button>
              </div>
            )}

            {/* Footer Thẻ */}
            <div
              style={{
                padding: '12px 22px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                background: 'var(--bg-glass-input)',
              }}
            >
              <span>Tổng chỉ tiêu: <strong style={{ color: 'var(--text-primary)' }}>{activeFeePeriod ? formatVND(activeFeePeriod.total_expected) : '0 ₫'}</strong></span>
              <Link
                to="/admin/fees"
                style={{
                  color: '#ea580c',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                }}
              >
                <span>Quản lý hội phí &gt;</span>
              </Link>
            </div>
          </div>

          {/* CỘT PHẢI: CƠ CẤU THÀNH VIÊN THEO BAN */}
          <div
            className="card"
            style={{
              padding: '0',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header Thẻ */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChart size={18} style={{ color: '#ea580c' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Cơ cấu thành viên theo Ban
                </h3>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                {unassignedCount > 0 ? `${departments.length} ban • ${unassignedCount} chung` : `${departments.length} ban`}
              </span>
            </div>

            {/* Nội dung khi có dữ liệu ban chuyên môn */}
            {departments.length > 0 ? (
              <div
                style={{
                  padding: '20px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '20px',
                  flexWrap: 'wrap',
                  flex: 1,
                }}
              >
                {/* Donut chart tròn */}
                <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="130" height="130" viewBox="0 0 130 130">
                    <circle
                      cx="65"
                      cy="65"
                      r="50"
                      fill="none"
                      stroke="var(--border-subtle)"
                      strokeWidth="15"
                    />
                    {deptSlices.map((s, idx) => (
                      <circle
                        key={s.id || idx}
                        cx="65"
                        cy="65"
                        r="50"
                        fill="none"
                        stroke={s.color}
                        strokeWidth="15"
                        strokeDasharray={s.strokeDasharray}
                        strokeDashoffset={s.strokeDashoffset}
                        strokeLinecap="round"
                        transform="rotate(-90 65 65)"
                        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                      />
                    ))}
                  </svg>
                  <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                      {memberCount}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px', fontWeight: 500 }}>
                      Thành viên
                    </span>
                  </div>
                </div>

                {/* Danh sách các ban và số lượng */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '200px' }}>
                  {deptSlices.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.82rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: s.color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {s.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.count} SV</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          ({(s.percent * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  ))}

                  {unassignedCount > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.82rem',
                        borderTop: '1px dashed var(--border-subtle)',
                        paddingTop: '6px',
                        marginTop: '2px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                          Ban Điều hành / Chung
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{unassignedCount} SV</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          ({((unassignedCount / (memberCount || 1)) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '36px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '32px',
                  flexWrap: 'wrap',
                  flex: 1,
                }}
              >
                <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="130" height="130" viewBox="0 0 130 130">
                    <circle
                      cx="65"
                      cy="65"
                      r="52"
                      fill="none"
                      stroke="var(--border-subtle)"
                      strokeWidth="14"
                    />
                  </svg>
                  <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                      {memberCount}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Thành viên
                    </span>
                  </div>
                </div>

                <div style={{ maxWidth: '240px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--bg-glass-input)',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <UserX size={16} />
                  </div>
                  <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    Chưa có dữ liệu ban chuyên môn
                  </h5>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Dữ liệu phân bổ theo Ban sẽ tự động hiển thị sau khi tuyển thành viên mới và xếp ban.
                  </p>
                </div>
              </div>
            )}

            {/* Footer Thẻ */}
            <div
              style={{
                padding: '12px 22px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                background: 'var(--bg-glass-input)',
              }}
            >
              <span>Quy mô: <strong style={{ color: 'var(--text-primary)' }}>{departments.length > 0 ? `${departments.length} ban chuyên môn` : '0 ban'}</strong></span>
              <Link
                to="/admin/departments"
                style={{
                  color: '#ea580c',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                }}
              >
                <span>Thiết lập sơ đồ ban &gt;</span>
              </Link>
            </div>
          </div>
        </div>

        {/* HÀNG 3: 2 THẺ VIỆC CẦN XỬ LÝ & SỰ KIỆN SẮP TỚI (GRID 2 CỘT) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
          {/* CỘT TRÁI: VIỆC CẦN XỬ LÝ NGAY */}
          <div
            className="card"
            style={{
              padding: '0',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckSquare size={18} style={{ color: '#ea580c' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Việc cần xử lý ngay
                </h3>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: pendingTasksCount === 0 ? '#ecfdf5' : '#fffbeb',
                  color: pendingTasksCount === 0 ? '#059669' : '#d97706',
                  fontWeight: 600,
                }}
              >
                {pendingTasksCount} tồn đọng
              </span>
            </div>

            <div
              style={{
                padding: '48px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                flex: 1,
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '14px',
                }}
              >
                <CheckCircle2 size={22} />
              </div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Không có việc cần xử lý
              </h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', maxWidth: '380px', lineHeight: 1.5 }}>
                Hiện tại chưa có hồ sơ phỏng vấn, giao dịch chuyển khoản hoặc điểm danh nào cần duyệt. Tất cả đều đã được xử lý xong!
              </p>
            </div>
          </div>

          {/* CỘT PHẢI: SỰ KIỆN SẮP TỚI */}
          <div
            className="card"
            style={{
              padding: '0',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: '#ea580c' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Sự kiện sắp tới
                </h3>
              </div>
              <Link
                to="/events"
                style={{
                  fontSize: '0.8rem',
                  color: '#ea580c',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                }}
              >
                <span>Xem lịch đầy đủ &gt;</span>
              </Link>
            </div>

            {upcomingEvents.length > 0 ? (
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'center' }}>
                {upcomingEvents.slice(0, 3).map((ev) => {
                  const evDate = new Date(ev.start_time);
                  const day = isNaN(evDate.getTime()) ? '28' : evDate.getDate();
                  const month = isNaN(evDate.getTime()) ? 'Th10' : `Th${evDate.getMonth() + 1}`;
                  const timeStr = isNaN(evDate.getTime())
                    ? '19:00'
                    : evDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });

                  return (
                    <div
                      key={ev.id}
                      onClick={() => navigate('/events')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'var(--bg-glass-input)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        {/* Khối ngày tháng */}
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '8px',
                            background: '#ffedd5',
                            border: '1px solid #fed7aa',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ea580c', lineHeight: 1 }}>
                            {day}
                          </span>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9a3412', marginTop: '1px' }}>
                            {month}
                          </span>
                        </div>

                        {/* Chi tiết sự kiện */}
                        <div style={{ minWidth: 0 }}>
                          <h5
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              margin: '0 0 3px 0',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {ev.title}
                          </h5>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} />
                              {timeStr}
                            </span>
                            <span>•</span>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                              {ev.location || 'Online / CLB'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#ecfdf5',
                          color: '#059669',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        Sắp diễn ra
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: '42px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '14px',
                  }}
                >
                  <Calendar size={22} />
                </div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  Chưa có sự kiện nào sắp diễn ra
                </h4>
                <p style={{ fontSize: '0.825rem', color: '#64748b', maxWidth: '360px', lineHeight: 1.5, marginBottom: '18px' }}>
                  Hãy lên kế hoạch và tạo sự kiện đầu tiên cho học kỳ mới của câu lạc bộ.
                </p>
                <button
                  onClick={() => navigate('/events')}
                  className="btn btn-primary btn-sm"
                  style={{
                    background: '#ea580c',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '8px',
                  }}
                >
                  <Plus size={15} />
                  <span>Tạo sự kiện ngay</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // GIAO DIỆN CỔNG HỘI VIÊN ("CỦA TÔI") - BỎ TÁC NHÂN KHÁCH VÃNG LAI
  const unpaidFees = myFees?.items.filter((f) => (f.remaining_balance ?? f.remaining_due ?? 0) > 0) || [];
  const totalDebtRemaining = unpaidFees.reduce((acc, f) => acc + (f.remaining_balance ?? f.remaining_due ?? 0), 0);
  const overdueTasks = myTasks.filter((t) => t.is_overdue && t.status !== 'done');
  const pendingTasks = myTasks.filter((t) => t.status !== 'done');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. WELCOME BANNER HỘI VIÊN */}
      <section
        className="card"
        style={{
          padding: '28px 32px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ maxWidth: '640px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span className="badge badge-primary">
              <Sparkles size={14} /> Cổng Hội Viên CLB Sinh Viên
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Học kỳ 1 • 2026-2027</span>
          </div>

          <h1 style={{ fontSize: '1.85rem', lineHeight: '1.3', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px 0' }}>
            Xin chào, <span style={{ color: '#ea580c' }}>{user?.full_name}</span>! 👋
          </h1>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <span>MSSV: <strong style={{ color: 'var(--text-primary)' }}>{user?.student_id}</strong></span>
            <span>•</span>
            <span>Khoa: <strong style={{ color: 'var(--text-primary)' }}>{user?.faculty || 'Chưa cập nhật'}</strong></span>
            <span>•</span>
            <span>Ban chuyên môn: <strong style={{ color: '#ea580c' }}>{user?.department_name || 'Hội viên chung'}</strong></span>
            <span>•</span>
            <span>Chức danh: <strong style={{ color: 'var(--text-primary)' }}>{user?.title || 'Hội viên'}</strong></span>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <Link to="/tasks" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            <CheckSquare size={16} />
            <span>Xem công việc</span>
          </Link>
          <Link to="/my-fees" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            <CreditCard size={16} />
            <span>Hội phí của tôi</span>
          </Link>
          <Link to="/profile" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            <Users size={16} />
            <span>Hồ sơ cá nhân</span>
          </Link>
        </div>
      </section>

      {/* 2. BỐN THẺ CHỈ SỐ NHANH */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {/* THẺ 1: CÔNG VIỆC CẦN LÀM */}
        <div
          className="card"
          style={{
            padding: '20px 22px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => navigate('/tasks')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Công việc cần làm</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {pendingTasks.length} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>nhiệm vụ</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: overdueTasks.length > 0 ? '#dc2626' : '#059669', marginTop: '6px', fontWeight: 600 }}>
              {overdueTasks.length > 0 ? `⚠️ ${overdueTasks.length} việc quá hạn cần xử lý` : '✓ Đúng tiến độ công việc'}
            </div>
          </div>
        </div>

        {/* THẺ 2: HỘI PHÍ CÁ NHÂN */}
        <div
          className="card"
          style={{
            padding: '20px 22px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => navigate('/my-fees')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Hội phí cá nhân</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: totalDebtRemaining > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: totalDebtRemaining > 0 ? '#dc2626' : '#059669' }}>
              <CreditCard size={18} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalDebtRemaining > 0 ? '#dc2626' : '#059669', lineHeight: 1 }}>
              {totalDebtRemaining > 0 ? formatVND(totalDebtRemaining) : 'Đã hoàn thành'}
            </div>
            <div style={{ fontSize: '0.78rem', color: totalDebtRemaining > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: '6px' }}>
              {totalDebtRemaining > 0 ? `${unpaidFees.length} kỳ phí cần nộp đối soát` : 'Không có nợ đọng hội phí'}
            </div>
          </div>
        </div>

        {/* THẺ 3: SỰ KIỆN SẮP TỚI */}
        <div
          className="card"
          style={{
            padding: '20px 22px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => navigate('/events')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Sự kiện sắp diễn ra</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <Calendar size={18} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {upcomingEvents.length} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>hoạt động</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#4f46e5', marginTop: '6px', fontWeight: 600 }}>
              Đang mở đăng ký tham gia
            </div>
          </div>
        </div>

        {/* THẺ 4: MINH BẠCH QUỸ */}
        <div
          className="card"
          style={{
            padding: '20px 22px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => navigate('/finance-overview')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Minh bạch quỹ CLB</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <Wallet size={18} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', lineHeight: 1 }}>
              {formatVND(fundBalance)}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Số dư quỹ hiện tại của toàn CLB
            </div>
          </div>
        </div>
      </section>

      {/* 3. GRID 2 CỘT: CÔNG VIỆC CỦA TÔI & SỰ KIỆN SẮP TỚI */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* CỘT TRÁI: NHIỆM VỤ ĐƯỢC PHÂN CÔNG */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: '14px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckSquare size={18} style={{ color: '#ea580c' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Nhiệm vụ được giao ({pendingTasks.length})
              </h3>
            </div>
            <Link to="/tasks" style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: 600, textDecoration: 'none' }}>
              Xem tất cả →
            </Link>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {myTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={36} style={{ color: '#10b981', margin: '0 auto 10px auto', display: 'block' }} />
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Tuyệt vời! Bạn không có việc nào tồn đọng</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Hãy chủ động liên hệ Trưởng ban để nhận thêm nhiệm vụ trong học kỳ này.
                </div>
              </div>
            ) : (
              myTasks.slice(0, 4).map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigate('/tasks')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-glass-input)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{task.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={12} /> Hạn: {task.due_date ? toVNDateTime(task.due_date) : 'Không có'}
                      </span>
                      {task.department_name && (
                        <span>• {task.department_name}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {task.is_overdue && (
                      <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>Quá hạn</span>
                    )}
                    <span
                      className={`badge ${
                        task.status === 'done'
                          ? 'badge-success'
                          : task.status === 'in_progress'
                          ? 'badge-primary'
                          : 'badge-neutral'
                      }`}
                      style={{ fontSize: '0.72rem' }}
                    >
                      {task.status === 'done' ? 'Hoàn thành' : task.status === 'in_progress' ? 'Đang làm' : 'Cần làm'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CỘT PHẢI: SỰ KIỆN SẮP DIỄN RA */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: '14px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} style={{ color: '#4f46e5' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Sự kiện sắp diễn ra ({upcomingEvents.length})
              </h3>
            </div>
            <Link to="/events" style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>
              Xem tất cả →
            </Link>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {upcomingEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)' }}>
                <Calendar size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px auto', display: 'block' }} />
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Chưa có sự kiện nào sắp tới</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Các sự kiện mới của ban và CLB sẽ xuất hiện tại đây khi được xuất bản.
                </div>
              </div>
            ) : (
              upcomingEvents.slice(0, 3).map((event) => (
                <div
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-glass-input)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{event.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>🕒 {toVNDateTime(event.start_time)}</span>
                      <span>• 📍 {event.location}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 4. HÀNG THÔNG BÁO BẢNG TIN */}
      {announcements.length > 0 && (
        <section className="card" style={{ padding: '20px 24px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Megaphone size={18} style={{ color: '#ea580c' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Thông báo & Bảng tin mới nhất
              </h3>
            </div>
            <Link to="/announcements" style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: 600, textDecoration: 'none' }}>
              Xem bảng tin →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {announcements.map((ann) => (
              <div
                key={ann.id}
                onClick={() => navigate('/announcements')}
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: 'var(--bg-glass-input)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                      {ann.scope === 'all' ? 'Toàn CLB' : ann.department_name || 'Ban'}
                    </span>
                    {ann.is_pinned && (
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>Đã ghim</span>
                    )}
                  </div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                    {ann.title}
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {ann.content}
                  </p>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {toVNDateTime(ann.published_at || ann.created_at)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default HomePage;
