import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { AlertTriangle, AlertCircle, HelpCircle, CheckCircle2, X } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  /** Alias for variant */
  type?: ConfirmVariant;
  danger?: boolean;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: 'Xác nhận thao tác',
    message: '',
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
      setIsOpen(true);
    });
  };

  const handleClose = (result: boolean) => {
    setIsOpen(false);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  const variant: ConfirmVariant =
    options.variant ||
    options.type ||
    (options.danger ? 'danger' : 'info');

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertTriangle size={24} style={{ color: '#ef4444' }} />,
          iconBg: '#fee2e2',
          btnClass: 'btn btn-danger',
          defaultConfirmText: 'Xác nhận xóa',
        };
      case 'warning':
        return {
          icon: <AlertCircle size={24} style={{ color: '#f59e0b' }} />,
          iconBg: '#fef3c7',
          btnClass: 'btn',
          btnStyle: { background: '#f59e0b', color: '#ffffff' },
          defaultConfirmText: 'Đồng ý',
        };
      case 'success':
        return {
          icon: <CheckCircle2 size={24} style={{ color: '#10b981' }} />,
          iconBg: '#d1fae5',
          btnClass: 'btn btn-success',
          defaultConfirmText: 'Xác nhận',
        };
      case 'info':
      default:
        return {
          icon: <HelpCircle size={24} style={{ color: '#ea580c' }} />,
          iconBg: '#ffedd5',
          btnClass: 'btn btn-primary',
          defaultConfirmText: 'Xác nhận',
        };
    }
  };

  const variantMeta = getVariantStyles();

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {isOpen && (
        <div
          className="modal-backdrop confirm-modal-backdrop"
          onClick={() => handleClose(false)}
          role="presentation"
        >
          <div
            className="modal-box confirm-modal-box"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
          >
            <div className="confirm-modal-header">
              <div
                className="confirm-icon-badge"
                style={{ backgroundColor: variantMeta.iconBg }}
              >
                {variantMeta.icon}
              </div>
              <div style={{ flex: 1 }}>
                <h3 id="confirm-dialog-title" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {options.title}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleClose(false)}
                style={{ padding: '6px', borderRadius: '50%' }}
                aria-label="Hủy bỏ"
              >
                <X size={18} />
              </button>
            </div>

            <div className="confirm-modal-body">
              <div id="confirm-dialog-desc" className="confirm-modal-message">
                {options.message}
              </div>
            </div>

            <div className="confirm-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleClose(false)}
                autoFocus
              >
                {options.cancelText || 'Hủy bỏ'}
              </button>
              <button
                type="button"
                className={variantMeta.btnClass}
                style={variantMeta.btnStyle}
                onClick={() => handleClose(true)}
              >
                {options.confirmText || variantMeta.defaultConfirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ((options: ConfirmOptions) => Promise<boolean>) => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm phải được sử dụng bên trong ConfirmProvider');
  }
  return context.confirm;
};
