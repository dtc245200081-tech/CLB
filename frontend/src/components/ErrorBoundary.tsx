import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 16px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              color: '#ef4444',
            }}
          >
            <AlertCircle size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            Đã xảy ra sự cố khi tải nội dung
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '480px', marginBottom: '24px', lineHeight: 1.5 }}>
            Hệ thống đã ghi nhận lỗi giao diện. Vui lòng thử tải lại trang hoặc quay về trang chủ.
          </p>

          {this.state.error && (
            <div
              style={{
                maxWidth: '600px',
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                textAlign: 'left',
                marginBottom: '24px',
                overflowX: 'auto',
                wordBreak: 'break-all',
              }}
            >
              {this.state.error.message}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={this.handleReload} className="btn btn-primary">
              <RefreshCw size={16} />
              <span>Tải lại trang</span>
            </button>
            <button onClick={this.handleGoHome} className="btn btn-secondary">
              <Home size={16} />
              <span>Về trang chủ</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
