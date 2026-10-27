import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'var(--warning-light)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--warning)',
          marginBottom: '20px',
        }}
      >
        <AlertTriangle size={36} />
      </div>
      <h1 style={{ fontSize: '3rem', marginBottom: '12px' }}>404</h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: 'var(--text-secondary)' }}>
        Không tìm thấy trang
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
        Đường dẫn bạn yêu cầu không tồn tại hoặc đã được di chuyển.
      </p>
      <Link to="/" className="btn btn-primary btn-lg">
        <Home size={18} />
        <span>Về Trang chủ</span>
      </Link>
    </div>
  );
};
