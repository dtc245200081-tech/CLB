import React from 'react';
import { Check, X, Shield, ShieldCheck } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password?: string;
  showCriteria?: boolean;
}

export interface PasswordValidationResult {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasSpecialChar: boolean;
  hasLowerOrDigit: boolean;
  isValid: boolean;
  score: number;
  label: string;
  color: string;
}

export function evaluatePassword(password: string = ''): PasswordValidationResult {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);
  const hasLowerOrDigit = /[a-z]/.test(password) && /[0-9]/.test(password);

  let score = 0;
  if (hasMinLength) score += 1;
  if (hasUppercase) score += 1;
  if (hasSpecialChar) score += 1;
  if (hasLowerOrDigit) score += 1;

  let label = 'Chưa nhập';
  let color = '#94a3b8'; // gray

  if (password.length > 0) {
    if (score <= 1) {
      label = 'Rất yếu';
      color = '#ef4444'; // red
    } else if (score === 2) {
      label = 'Yếu';
      color = '#f97316'; // orange
    } else if (score === 3) {
      label = 'Trung bình';
      color = '#eab308'; // amber/yellow
    } else if (score === 4) {
      label = 'Mạnh';
      color = '#10b981'; // emerald green
    }
  }

  // Hợp lệ khi thỏa mãn tối thiểu: 8 ký tự, có in hoa, có ký tự đặc biệt
  const isValid = hasMinLength && hasUppercase && hasSpecialChar;

  return {
    hasMinLength,
    hasUppercase,
    hasSpecialChar,
    hasLowerOrDigit,
    isValid,
    score,
    label,
    color,
  };
}

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({
  password = '',
  showCriteria = true,
}) => {
  const {
    hasMinLength,
    hasUppercase,
    hasSpecialChar,
    hasLowerOrDigit,
    score,
    label,
    color,
  } = evaluatePassword(password);

  if (!password && !showCriteria) {
    return null;
  }

  return (
    <div style={{ marginTop: '8px', marginBottom: '8px' }}>
      {/* Thanh đo độ mạnh mật khẩu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
          {score >= 3 ? <ShieldCheck size={13} style={{ color }} /> : <Shield size={13} style={{ color }} />}
          Độ mạnh mật khẩu:
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>
          {password.length === 0 ? 'Chưa nhập' : label}
        </span>
      </div>

      {/* Progress Bar 4 vạch */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '4px',
          height: '6px',
          borderRadius: '9999px',
          overflow: 'hidden',
          background: '#f1f5f9',
          marginBottom: showCriteria ? '8px' : '0',
        }}
      >
        <div style={{ background: score >= 1 ? color : '#e2e8f0', borderRadius: '4px', transition: 'background 0.3s' }} />
        <div style={{ background: score >= 2 ? color : '#e2e8f0', borderRadius: '4px', transition: 'background 0.3s' }} />
        <div style={{ background: score >= 3 ? color : '#e2e8f0', borderRadius: '4px', transition: 'background 0.3s' }} />
        <div style={{ background: score >= 4 ? color : '#e2e8f0', borderRadius: '4px', transition: 'background 0.3s' }} />
      </div>

      {/* Tiêu chí chi tiết */}
      {showCriteria && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '6px',
            padding: '8px 10px',
            background: 'var(--bg-subtle, #f8fafc)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: '8px',
            fontSize: '0.72rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: hasMinLength ? '#10b981' : '#94a3b8' }}>
            {hasMinLength ? <Check size={12} strokeWidth={3} /> : <X size={12} />}
            <span>Tối thiểu 8 ký tự</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: hasUppercase ? '#10b981' : '#94a3b8' }}>
            {hasUppercase ? <Check size={12} strokeWidth={3} /> : <X size={12} />}
            <span>Có chữ cái in hoa (A-Z)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: hasSpecialChar ? '#10b981' : '#94a3b8' }}>
            {hasSpecialChar ? <Check size={12} strokeWidth={3} /> : <X size={12} />}
            <span>Có ký tự đặc biệt (!@#$%...)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: hasLowerOrDigit ? '#10b981' : '#94a3b8' }}>
            {hasLowerOrDigit ? <Check size={12} strokeWidth={3} /> : <X size={12} />}
            <span>Có chữ thường và số</span>
          </div>
        </div>
      )}
    </div>
  );
};
