import React from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { formatVietnameseError } from '../utils/errors';

export interface AlertProps {
  type?: 'error' | 'warning' | 'success' | 'info';
  title?: string;
  message?: React.ReactNode;
  error?: unknown;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'error',
  title,
  message,
  error,
  onClose,
  className = '',
  style,
}) => {
  const displayMessage = error ? formatVietnameseError(error) : message;
  if (!displayMessage && !title) return null;

  const defaultTitles = {
    error: 'Đã có lỗi xảy ra',
    warning: 'Cảnh báo',
    success: 'Thao tác thành công',
    info: 'Thông tin hệ thống',
  };

  const currentTitle = title !== undefined ? title : defaultTitles[type];

  const icons = {
    error: <AlertTriangle size={20} className="alert-icon-error" />,
    warning: <AlertCircle size={20} className="alert-icon-warning" />,
    success: <CheckCircle2 size={20} className="alert-icon-success" />,
    info: <Info size={20} className="alert-icon-info" />,
  };

  return (
    <div
      className={`visual-alert visual-alert-${type} ${className}`}
      style={style}
      role="alert"
    >
      <div className="visual-alert-icon-wrapper">{icons[type]}</div>
      <div className="visual-alert-content">
        {currentTitle && <div className="visual-alert-title">{currentTitle}</div>}
        <div className="visual-alert-message">{displayMessage}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="visual-alert-close-btn"
          aria-label="Đóng cảnh báo"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};
