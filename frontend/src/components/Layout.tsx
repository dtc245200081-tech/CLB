import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  Calendar,
  CheckCircle2,
  Users,
  Megaphone,
  Wallet,
  Settings,
  History,
  CreditCard,
  User as UserIcon,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NotificationDropdown } from './NotificationDropdown';
import { ChatWidget } from './ChatWidget';

export const Layout: React.FC = () => {
  const { user, isAdmin, isDepartmentHead, isTreasurer, canManage, viewMode, setViewMode, logout } = useAuth();
  const { themeMode, cycleTheme } = useTheme();
  const location = useLocation();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Tự động đóng menu trên màn hình di động khi chuyển route
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Nếu chưa đăng nhập, tự động chuyển về trang Đăng nhập
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Lấy 2 chữ cái đầu làm avatar
  const getInitials = (name?: string) => {
    if (!name) return 'SV';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getUserSubtitle = () => {
    if (!user) return 'Hội viên';
    if (user.title) return user.title;
    if (isAdmin) return 'Chủ nhiệm CLB';
    if (isDepartmentHead) return `Trưởng ban ${user.department_name || ''}`;
    if (isTreasurer) return 'Thủ quỹ CLB';
    return 'Hội viên';
  };

  const getThemeLabel = () => {
    if (themeMode === 'auto') return 'Theo thiết bị';
    if (themeMode === 'dark') return 'Giao diện Tối';
    return 'Giao diện Sáng';
  };

  return (
    <div className="app-layout">
      {/* MOBILE BACKDROP OVERLAY */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="sidebar-logo">CLB</div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                CLB Sinh Viên
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {canManage && viewMode === 'manage' ? 'Quản trị hệ thống' : 'Cổng hội viên'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Đóng menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {/* NẾU LÀ GIAO DIỆN QUẢN TRỊ */}
          {canManage && viewMode === 'manage' ? (
            <>
              {/* SECTION: TỔNG QUAN */}
              <div className="sidebar-section-title">
                <span>Tổng quan</span>
              </div>
              <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                <LayoutGrid size={18} />
                <span>Tổng quan</span>
              </NavLink>

              {/* SECTION: QUẢN LÝ HOẠT ĐỘNG */}
              <div className="sidebar-section-title">
                <span>Quản lý hoạt động</span>
              </div>
              <NavLink to="/events" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Calendar size={18} />
                <span>Sự kiện</span>
              </NavLink>
              <NavLink to="/tasks" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <CheckCircle2 size={18} />
                <span>Công việc</span>
              </NavLink>
              {/* Thành viên & Ban: Chỉ Admin hoặc Trưởng ban */}
              {(isAdmin || isDepartmentHead) && (
                <NavLink
                  to="/admin/users"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={() => {
                    const isPersonnelActive =
                      location.pathname.startsWith('/admin/users') ||
                      location.pathname.startsWith('/admin/departments') ||
                      location.pathname.startsWith('/admin/join-requests');
                    return `nav-item ${isPersonnelActive ? 'active' : ''}`;
                  }}
                >
                  <Users size={18} />
                  <span>{isDepartmentHead ? 'Thành viên ban' : 'Thành viên & Ban'}</span>
                </NavLink>
              )}
              <NavLink to="/announcements" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Megaphone size={18} />
                <span>Bảng tin</span>
              </NavLink>

              {/* SECTION: TÀI CHÍNH */}
              <div className="sidebar-section-title">
                <span>Tài chính</span>
              </div>
              {isAdmin || isTreasurer ? (
                <>
                  <NavLink to="/admin/funds" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Wallet size={18} />
                    <span>Sổ quỹ & Thu chi</span>
                  </NavLink>
                  <NavLink to="/admin/fees" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <CreditCard size={18} />
                    <span>Quản lý Hội phí</span>
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/admin/funds" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Wallet size={18} />
                    <span>Đề xuất chi</span>
                  </NavLink>
                  <NavLink to="/admin/fees" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <CreditCard size={18} />
                    <span>Hội phí ban</span>
                  </NavLink>
                </>
              )}

              {/* SECTION: HỆ THỐNG (CHỈ DÀNH RIÊNG CHO ADMIN) */}
              {isAdmin && (
                <>
                  <div className="sidebar-section-title">
                    <span>Hệ thống & AI</span>
                  </div>
                  <NavLink
                    to="/admin/audit-logs"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={() => {
                      const isSystemActive =
                        location.pathname.startsWith('/admin/audit-logs') ||
                        location.pathname.startsWith('/admin/knowledge') ||
                        location.pathname.startsWith('/admin/chatbot-quality');
                      return `nav-item ${isSystemActive ? 'active' : ''}`;
                    }}
                  >
                    <Settings size={18} />
                    <span>Nhật ký & Hệ thống</span>
                  </NavLink>
                </>
              )}
            </>
          ) : (
            /* GIAO DIỆN HỘI VIÊN / CÁ NHÂN ("CỦA TÔI") */
            <>
              <div className="sidebar-section-title">
                <span>Tổng quan</span>
              </div>
              <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                <LayoutGrid size={18} />
                <span>Trang chủ</span>
              </NavLink>

              <div className="sidebar-section-title">
                <span>Hoạt động của tôi</span>
              </div>
              <NavLink to="/events" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Calendar size={18} />
                <span>Sự kiện CLB</span>
              </NavLink>
              <NavLink to="/my-registrations" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <History size={18} />
                <span>Lịch sử tham gia</span>
              </NavLink>
              <NavLink to="/tasks" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <CheckCircle2 size={18} />
                <span>Công việc</span>
              </NavLink>
              <NavLink to="/announcements" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Megaphone size={18} />
                <span>Bảng tin</span>
              </NavLink>

              <div className="sidebar-section-title">
                <span>Tài chính</span>
              </div>
              <NavLink to="/my-fees" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <CreditCard size={18} />
                <span>Hội phí cá nhân</span>
              </NavLink>
              <NavLink to="/finance-overview" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Wallet size={18} />
                <span>Minh bạch quỹ CLB</span>
              </NavLink>

              <div className="sidebar-section-title">
                <span>Cá nhân</span>
              </div>
              <NavLink to="/profile" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <UserIcon size={18} />
                <span>Hồ sơ cá nhân</span>
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="main-content">
        {/* TOPBAR HEADER */}
        <header className="topbar">
          {/* LEFT: HAMBURGER BUTTON & BỘ CHUYỂN ĐỔI CHẾ ĐỘ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="mobile-menu-toggle"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              title="Menu điều hướng"
              aria-label="Menu điều hướng"
            >
              <Menu size={20} />
            </button>

            {canManage && (
              <div className="mode-toggle-group">
                <button
                  type="button"
                  onClick={() => setViewMode('personal')}
                  className={`mode-toggle-btn ${viewMode === 'personal' ? 'active' : ''}`}
                >
                  Của tôi
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('manage')}
                  className={`mode-toggle-btn ${viewMode === 'manage' ? 'active' : ''}`}
                >
                  Quản lý
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: THEME SWITCHER, THÔNG BÁO VÀ HỒ SƠ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Bộ đổi giao diện tự động theo thiết bị / Sáng / Tối */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={cycleTheme}
              title={`Giao diện: ${getThemeLabel()} (Nhấn để chuyển)`}
              aria-label="Chuyển chế độ giao diện"
            >
              {themeMode === 'auto' ? (
                <>
                  <Monitor size={15} style={{ color: 'var(--primary)' }} />
                  <span className="theme-toggle-text">Thiết bị</span>
                </>
              ) : themeMode === 'dark' ? (
                <>
                  <Moon size={15} style={{ color: '#fbbf24' }} />
                  <span className="theme-toggle-text">Tối</span>
                </>
              ) : (
                <>
                  <Sun size={15} style={{ color: '#ea580c' }} />
                  <span className="theme-toggle-text">Sáng</span>
                </>
              )}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
              {/* Notification Dropdown Bell */}
              <NotificationDropdown />

              {/* User Profile Capsule */}
              <div
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '10px',
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#ea580c',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    letterSpacing: '-0.02em',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.full_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    getInitials(user.full_name)
                  )}
                </div>
                <div className="topbar-user-text" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {user.full_name}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {getUserSubtitle()}
                  </span>
                </div>
                <ChevronDown size={14} style={{ color: 'var(--text-muted)', marginLeft: '2px' }} />
              </div>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50px',
                    right: 0,
                    width: '210px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-lg)',
                    padding: '8px',
                    zIndex: 60,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <Link
                    to="/profile"
                    onClick={() => setIsUserMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                    }}
                  >
                    <UserIcon size={16} />
                    <span>Hồ sơ cá nhân</span>
                  </Link>
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      logout();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      color: 'var(--danger)',
                      fontWeight: 600,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <LogOut size={16} />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-body">
          <Outlet />
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="mobile-bottom-nav">
        <NavLink to="/" className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`} end>
          <LayoutGrid size={20} />
          <span>Trang chủ</span>
        </NavLink>
        <NavLink to="/events" className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`}>
          <Calendar size={20} />
          <span>Sự kiện</span>
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`}>
          <CheckCircle2 size={20} />
          <span>Công việc</span>
        </NavLink>
        <NavLink to="/announcements" className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`}>
          <Megaphone size={20} />
          <span>Bảng tin</span>
        </NavLink>
        <button
          type="button"
          className={`mobile-bottom-nav-item ${isMobileMenuOpen ? 'active' : ''}`}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>
      </nav>

      {/* FLOATING CHATBOT AI WIDGET */}
      <ChatWidget />
    </div>
  );
};

export default Layout;
