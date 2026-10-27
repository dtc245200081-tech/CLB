import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { formatVietnameseError } from '../utils/errors';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  showSuccess: (message: string, title?: string, duration?: number) => void;
  showError: (error: unknown, title?: string, duration?: number) => void;
  showWarning: (message: string, title?: string, duration?: number) => void;
  showInfo: (message: string, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string, duration = 4500) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: Toast = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const showSuccess = useCallback(
    (message: string, title: string = 'Thành công', duration = 4000) => {
      showToast('success', message, title, duration);
    },
    [showToast]
  );

  const showError = useCallback(
    (error: unknown, title: string = 'Đã có lỗi xảy ra', duration = 6000) => {
      const message = formatVietnameseError(error);
      showToast('error', message, title, duration);
    },
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, title: string = 'Cảnh báo', duration = 5000) => {
      showToast('warning', message, title, duration);
    },
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, title: string = 'Thông báo', duration = 4000) => {
      showToast('info', message, title, duration);
    },
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        removeToast,
      }}
    >
      {children}
      {/* Toast Overlay Container */}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => {
          const icon =
            toast.type === 'success' ? (
              <CheckCircle2 size={20} className="toast-icon toast-icon-success" />
            ) : toast.type === 'error' ? (
              <AlertTriangle size={20} className="toast-icon toast-icon-error" />
            ) : toast.type === 'warning' ? (
              <AlertCircle size={20} className="toast-icon toast-icon-warning" />
            ) : (
              <Info size={20} className="toast-icon toast-icon-info" />
            );

          return (
            <div
              key={toast.id}
              className={`toast-item toast-${toast.type}`}
              role="alert"
            >
              <div className="toast-content-wrapper">
                <div className="toast-icon-wrapper">{icon}</div>
                <div className="toast-text-area">
                  {toast.title && <div className="toast-title">{toast.title}</div>}
                  <div className="toast-message">{toast.message}</div>
                </div>
                <button
                  type="button"
                  className="toast-close-btn"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Đóng thông báo"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast phải được sử dụng bên trong ToastProvider');
  }
  return context;
};
