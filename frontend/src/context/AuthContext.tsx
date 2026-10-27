import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isDepartmentHead: boolean;
  isMember: boolean;
  isTreasurer: boolean;
  isFinanceManager: boolean;
  canManage: boolean;
  viewMode: 'manage' | 'personal';
  setViewMode: (mode: 'manage' | 'personal') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isAdmin = user?.role === 'admin';
  const isDepartmentHead = user?.role === 'department_head';
  const isMember = user !== null;
  const isTreasurer = Boolean(user?.is_treasurer);
  const isFinanceManager = Boolean(isAdmin || isTreasurer);
  const canManage = Boolean(isAdmin || isDepartmentHead || isTreasurer);

  const [viewMode, setViewModeState] = useState<'manage' | 'personal'>(() => {
    const savedMode = localStorage.getItem('clb_view_mode');
    if (savedMode === 'manage' || savedMode === 'personal') return savedMode;
    return 'manage';
  });

  const setViewMode = (mode: 'manage' | 'personal') => {
    setViewModeState(mode);
    localStorage.setItem('clb_view_mode', mode);
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const freshUser = await api.auth.getMe();
          setUser(freshUser);
          localStorage.setItem('user', JSON.stringify(freshUser));
        } catch {
          // Token hết hạn hoặc không hợp lệ
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email: string, pass: string): Promise<User> => {
    const data = await api.auth.login(email, pass);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.access_token);
    setUser(data.user);
    if (data.user.role === 'admin' || data.user.role === 'department_head' || data.user.is_treasurer) {
      setViewMode('manage');
    } else {
      setViewMode('personal');
    }
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('clb_view_mode');
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    try {
      const freshUser = await api.auth.getMe();
      setUser(freshUser);
      localStorage.setItem('user', JSON.stringify(freshUser));
    } catch {
      logout();
    }
  };

  // Nếu user không có quyền quản lý, viewMode luôn là 'personal'
  const effectiveViewMode = canManage ? viewMode : 'personal';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
        isAdmin,
        isDepartmentHead,
        isMember,
        isTreasurer,
        isFinanceManager,
        canManage,
        viewMode: effectiveViewMode,
        setViewMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
