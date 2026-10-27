import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import './LoginPage.css';

const LOGO_IMG_SRC =
  'https://lh3.googleusercontent.com/aida/AEtjO1U4l2GK98vrLAyA8lX80GtR5-6ydt6OJL7eelEVm8sMbU_P1iEhXup1Xw8_DcXy3YbnScp_WyyYZ7Rpbfbq0w2HHwG3AQzBBTs2CldmhjVqH9VI419oFx5UlDY7oR9-zwaz-xfe3HaBWqYr9WUKx9mMsrA_MJWq9HvA_Mt9Xk8MoHkwli7er1hgA6jg4z964-S29hfiSmGgCydtcnZmtHl88ZTb5GvBZ_bLpOzxOejZ1AvQrSxeA-4tL-n6';

export const LoginPage: React.FC = () => {
  const { showInfo } = useToast();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const isExpired = queryParams.get('expired') === '1';

  React.useEffect(() => {
    if (user) {
      if (user.role === 'admin') {
        navigate('/admin/users', { replace: true });
      } else {
        navigate('/profile', { replace: true });
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedIdentity = identity.trim();
    if (!trimmedIdentity || !password) {
      setError('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setIsLoading(true);
    try {
      const loggedInUser = await login(trimmedIdentity, password);
      if (loggedInUser.role === 'admin') {
        navigate('/admin/users');
      } else {
        navigate('/profile');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-login-body">
      {/* BEGIN: PublicHeader */}
      <header className="min-login-header">
        <div className="min-login-header-inner">
          {/* Brand Logo Section */}
          <Link to="/" aria-label="Trang chủ CLB Sinh Viên" className="min-login-brand">
            <div className="min-login-logo-box">
              <img
                src={LOGO_IMG_SRC}
                alt="Logo CLB Sinh Viên"
                className="min-login-logo-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <span className="min-login-brand-text">CLB Sinh Viên</span>
          </Link>

          {/* Public Navigation & CTA */}
          <nav className="min-login-nav">
            <Link to="/" className="min-login-nav-link">
              Giới thiệu
            </Link>
            <Link to="/join" className="min-login-nav-btn">
              Đăng ký thành viên mới
            </Link>
          </nav>
        </div>
      </header>
      {/* END: PublicHeader */}

      {/* BEGIN: MainContent */}
      <main className="min-login-main">
        <div className="min-login-card">
          {/* Header of Form with Brand Badge */}
          <div className="min-login-card-header">
            <div className="min-login-card-logo">
              <img
                src={LOGO_IMG_SRC}
                alt="Logo CLB Sinh Viên"
                className="min-login-logo-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <h1 className="min-login-card-title">Đăng nhập hệ thống</h1>
            <p className="min-login-card-desc">Dành cho thành viên và ban quản lý CLB</p>
          </div>

          {/* Alert: Expired Session or Error Message */}
          {(isExpired || error) && (
            <div className="min-login-alert" id="auth-alert" role="alert">
              <svg className="min-login-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              <p className="min-login-alert-text">
                {isExpired
                  ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
                  : error || 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.'}
              </p>
            </div>
          )}

          {/* Login Form Element */}
          <form className="min-login-form" id="login-form" onSubmit={handleSubmit}>
            {/* Email / Username Field */}
            <div className="min-login-field">
              <label className="min-login-label" htmlFor="identity">
                Email
              </label>
              <div className="min-login-input-wrap">
                <div className="min-login-input-icon">
                  <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </div>
                <input
                  id="identity"
                  name="identity"
                  type="text"
                  className="min-login-input"
                  placeholder="Nhập email sinh viên"
                  required
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  autoComplete="username email"
                />
              </div>
            </div>

            {/* Password Field with Toggle */}
            <div className="min-login-field">
              <label className="min-login-label" htmlFor="password">
                Mật khẩu
              </label>
              <div className="min-login-input-wrap">
                <div className="min-login-input-icon">
                  <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="min-login-input min-login-input-password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  id="toggle-password-visibility"
                  type="button"
                  aria-label="Ẩn hoặc hiện mật khẩu"
                  className="min-login-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    /* Eye Off Icon */
                    <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  ) : (
                    /* Eye Icon */
                    <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Utilities: Remember Me & Forgot Password */}
            <div className="min-login-options">
              <label className="min-login-checkbox-label">
                <input
                  id="remember-me"
                  name="remember"
                  type="checkbox"
                  className="min-login-checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="min-login-checkbox-text">Ghi nhớ đăng nhập</span>
              </label>
              <a
                href="#quen-mat-khau"
                className="min-login-forgot-link"
                onClick={(e) => {
                  e.preventDefault();
                  showInfo('Vui lòng liên hệ Quản trị viên hoặc Ban chủ nhiệm CLB để được cấp lại mật khẩu truy cập.');
                }}
              >
                Quên mật khẩu?
              </a>
            </div>

            {/* Submit Primary CTA */}
            <div className="min-login-submit-wrap">
              <button
                id="submit-button"
                type="submit"
                className="min-login-submit-btn"
                disabled={isLoading}
              >
                {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </div>
          </form>

          {/* Join CTA Link at the bottom */}
          <div className="min-login-card-footer">
            Chưa là thành viên CLB?
            <Link to="/join" className="min-login-join-link">
              Nộp đơn gia nhập ngay
            </Link>
          </div>
        </div>
      </main>
      {/* END: MainContent */}

      {/* BEGIN: PublicFooter */}
      <footer className="min-login-footer">
        <div className="min-login-footer-inner">
          <span>© 2026 CLB Sinh Viên</span>
          <span className="min-login-footer-dot">•</span>
          <span>Hệ thống quản lý nội bộ</span>
          <span className="min-login-footer-dot">•</span>
          <a
            href="#ho-tro"
            className="min-login-footer-link"
            onClick={(e) => {
              e.preventDefault();
              showInfo('Kênh hỗ trợ kỹ thuật CLB: support@clb.edu.vn - Hotline: 0901234567');
            }}
          >
            Hỗ trợ kỹ thuật
          </a>
        </div>
      </footer>
      {/* END: PublicFooter */}
    </div>
  );
};
