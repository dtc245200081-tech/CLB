import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Users,
  Building2,
  FileText,
  Wallet,
  Coins,
  BarChart3,
  CreditCard,
  Calendar,
  CheckCircle,
  History,
  ShieldCheck,
  BookOpen,
  Sparkles,
  CheckSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type PredefinedModule =
  | 'personnel'
  | 'finance'
  | 'finance-member'
  | 'events'
  | 'system'
  | 'department';

export interface TabItem {
  to: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface ModuleSubTabsProps {
  module?: PredefinedModule;
  tabs?: TabItem[];
  className?: string;
}

export const ModuleSubTabs: React.FC<ModuleSubTabsProps> = ({
  module,
  tabs: customTabs,
  className = '',
}) => {
  const { isAdmin, isDepartmentHead, isTreasurer, viewMode } = useAuth();
  const location = useLocation();

  let resolvedTabs: TabItem[] = customTabs || [];

  if (!customTabs && module) {
    const isPersonal = viewMode === 'personal';

    if (module === 'personnel') {
      if (isAdmin && !isPersonal) {
        resolvedTabs = [
          { to: '/admin/users', label: 'Thành viên CLB', icon: <Users size={16} /> },
          { to: '/admin/departments', label: 'Ban chuyên môn', icon: <Building2 size={16} /> },
          { to: '/admin/join-requests', label: 'Đơn gia nhập', icon: <FileText size={16} /> },
        ];
      } else if (isDepartmentHead && !isPersonal) {
        resolvedTabs = [
          { to: '/admin/users', label: 'Thành viên ban', icon: <Users size={16} /> },
          { to: '/tasks', label: 'Công việc', icon: <CheckSquare size={16} /> },
          { to: '/admin/funds', label: 'Đề xuất chi', icon: <Wallet size={16} /> },
          { to: '/admin/fees', label: 'Hội phí ban', icon: <Coins size={16} /> },
        ];
      }
    } else if (module === 'finance') {
      if (isPersonal || (!isAdmin && !isTreasurer && !isDepartmentHead)) {
        resolvedTabs = [
          { to: '/my-fees', label: 'Hội phí cá nhân', icon: <CreditCard size={16} /> },
          { to: '/finance-overview', label: 'Minh bạch quỹ CLB', icon: <BarChart3 size={16} /> },
        ];
      } else if (isAdmin || isTreasurer) {
        resolvedTabs = [
          { to: '/admin/funds', label: 'Sổ quỹ & Thu chi', icon: <Wallet size={16} /> },
          { to: '/admin/fees', label: 'Quản lý Hội phí', icon: <Coins size={16} /> },
          { to: '/finance-overview', label: 'Báo cáo quỹ', icon: <BarChart3 size={16} /> },
        ];
      } else if (isDepartmentHead) {
        resolvedTabs = [
          { to: '/admin/funds', label: 'Đề xuất chi', icon: <Wallet size={16} /> },
          { to: '/admin/fees', label: 'Hội phí ban', icon: <Coins size={16} /> },
          { to: '/finance-overview', label: 'Báo cáo quỹ', icon: <BarChart3 size={16} /> },
        ];
      }
    } else if (module === 'finance-member') {
      resolvedTabs = [
        { to: '/my-fees', label: 'Hội phí cá nhân', icon: <CreditCard size={16} /> },
        { to: '/finance-overview', label: 'Minh bạch quỹ CLB', icon: <BarChart3 size={16} /> },
      ];
    } else if (module === 'events') {
      resolvedTabs = [
        { to: '/events', label: 'Sự kiện CLB', icon: <Calendar size={16} /> },
        { to: '/events?tab=registered', label: 'Sự kiện đã đăng ký', icon: <CheckCircle size={16} /> },
        { to: '/my-registrations', label: 'Lịch sử tham gia', icon: <History size={16} /> },
      ];
    } else if (module === 'system') {
      if (isAdmin && !isPersonal) {
        resolvedTabs = [
          { to: '/admin/audit-logs', label: 'Nhật ký hoạt động', icon: <ShieldCheck size={16} /> },
          { to: '/admin/knowledge', label: 'Tri thức AI', icon: <BookOpen size={16} /> },
          { to: '/admin/chatbot-quality', label: 'Đánh giá Bot', icon: <Sparkles size={16} /> },
        ];
      }
    } else if (module === 'department') {
      if (isDepartmentHead && !isPersonal) {
        resolvedTabs = [
          { to: '/admin/users', label: 'Thành viên ban', icon: <Users size={16} /> },
          { to: '/tasks', label: 'Công việc', icon: <CheckSquare size={16} /> },
          { to: '/admin/funds', label: 'Đề xuất chi', icon: <Wallet size={16} /> },
          { to: '/admin/fees', label: 'Hội phí ban', icon: <Coins size={16} /> },
        ];
      }
    }
  }

  if (resolvedTabs.length <= 1) {
    return null;
  }

  return (
    <div className={`module-subtabs-wrapper ${className}`}>
      <nav className="module-subtabs">
        {resolvedTabs.map((tab) => {
          const currentUrl = `${location.pathname}${location.search}`;
          const isExplicitActive = tab.to.includes('?')
            ? currentUrl === tab.to
            : location.pathname === tab.to && (!location.search || tab.to !== '/events');

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={() => `module-subtab-item ${isExplicitActive ? 'active' : ''}`}
            >
              {tab.icon && <span className="subtab-icon">{tab.icon}</span>}
              <span className="subtab-label">{tab.label}</span>
              {tab.badge !== undefined && <span className="subtab-badge">{tab.badge}</span>}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
