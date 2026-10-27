import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { PasswordStrengthIndicator, evaluatePassword } from '../components/PasswordStrengthIndicator';
import './JoinPage.css';

const LOGO_IMG_SRC =
  'https://lh3.googleusercontent.com/aida/AEtjO1U4l2GK98vrLAyA8lX80GtR5-6ydt6OJL7eelEVm8sMbU_P1iEhXup1Xw8_DcXy3YbnScp_WyyYZ7Rpbfbq0w2HHwG3AQzBBTs2CldmhjVqH9VI419oFx5UlDY7oR9-zwaz-xfe3HaBWqYr9WUKx9mMsrA_MJWq9HvA_Mt9Xk8MoHkwli7er1hgA6jg4z964-S29hfiSmGgCydtcnZmtHl88ZTb5GvBZ_bLpOzxOejZ1AvQrSxeA-4tL-n6';

export const JoinPage: React.FC = () => {
  const { showInfo } = useToast();
  const [formData, setFormData] = useState({
    fullName: '',
    mssv: '',
    phone: '',
    email: '',
    faculty: '',
    studentClass: '',
    department: '',
    statement: '',
    password: '',
    confirmPassword: '',
    terms: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const target = e.target;
    if (target.type === 'checkbox') {
      const checked = (target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [target.name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [target.name]: target.value }));
    }
  };

  const handleMssvBlur = () => {
    const val = formData.mssv.trim().toLowerCase();
    if (val && !formData.email) {
      setFormData((prev) => ({ ...prev, email: `${val}@sinhvien.edu.vn` }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Form validations
    if (
      !formData.fullName.trim() ||
      !formData.mssv.trim() ||
      !formData.phone.trim() ||
      !formData.email.trim() ||
      !formData.faculty ||
      !formData.studentClass.trim() ||
      !formData.department ||
      !formData.statement.trim() ||
      !formData.password
    ) {
      setError('Vui lòng điền đầy đủ tất cả các trường có dấu hoa thị (*).');
      return;
    }

    const val = evaluatePassword(formData.password);
    if (!val.hasMinLength) {
      setError('Mật khẩu phải có tối thiểu 8 ký tự.');
      return;
    }
    if (!val.hasUppercase) {
      setError('Mật khẩu phải chứa ít nhất 1 chữ cái in hoa (A-Z).');
      return;
    }
    if (!val.hasSpecialChar) {
      setError('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (!@#$%^&*...).');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Mật khẩu và xác nhận mật khẩu không khớp. Vui lòng kiểm tra lại!');
      return;
    }

    if (!formData.terms) {
      setError('Vui lòng cam kết thông tin cung cấp là chính xác trước khi gửi đơn.');
      return;
    }

    setIsLoading(true);
    try {
      const facultyText =
        formData.faculty === 'cntt'
          ? 'Công nghệ Thông tin'
          : formData.faculty === 'ktpm'
          ? 'Kỹ thuật Phần mềm & AI'
          : formData.faculty === 'kinhte'
          ? 'Kinh tế & Quản trị'
          : formData.faculty === 'truyenthong'
          ? 'Truyền thông Đa phương tiện'
          : 'Khoa / Viện khác';

      const departmentText =
        formData.department === 'tech'
          ? 'Ban Kỹ thuật - Công nghệ'
          : formData.department === 'event'
          ? 'Ban Sự kiện'
          : formData.department === 'media'
          ? 'Ban Truyền thông'
          : formData.department === 'hr'
          ? 'Ban Nhân sự'
          : formData.department;

      const combinedReason = `[Ban ứng tuyển: ${departmentText}]\n${formData.statement.trim()}`;

      await api.joinRequests.submit({
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        student_id: formData.mssv.trim().toUpperCase(),
        phone: formData.phone.trim() || undefined,
        faculty: facultyText,
        class_name: formData.studentClass.trim() || undefined,
        reason: combinedReason,
        password: formData.password,
      });

      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Không thể gửi đơn đăng ký lúc này. Vui lòng thử lại sau.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-join-body">
      {/* BEGIN: TopNavigationBar */}
      <header className="min-join-header">
        <div className="min-join-header-inner">
          <Link to="/" aria-label="Trang chủ CLB Sinh Viên" className="min-join-brand">
            <div className="min-join-logo-box">
              <img
                src={LOGO_IMG_SRC}
                alt="Logo CLB Sinh Viên"
                className="min-join-logo-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <span className="min-join-brand-text">CLB Sinh Viên</span>
          </Link>
          <nav className="min-join-nav">
            <Link to="/" className="min-join-nav-link">
              Giới thiệu
            </Link>
            <Link to="/login" className="min-join-nav-btn">
              Đăng nhập
            </Link>
          </nav>
        </div>
      </header>
      {/* END: TopNavigationBar */}

      {/* BEGIN: MainContent */}
      <main className="min-join-main">
        <div className="min-join-card">
          {/* Header with brand badge */}
          <div className="min-join-card-header">
            <div className="min-join-card-logo">
              <img
                src={LOGO_IMG_SRC}
                alt="Logo CLB Sinh Viên"
                className="min-join-logo-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <h1 className="min-join-card-title">Đăng ký gia nhập CLB</h1>
            <p className="min-join-card-desc">Điền thông tin để đăng ký xét tuyển thành viên mới</p>
          </div>

          {isSuccess ? (
            /* Success State */
            <div className="min-join-success-card">
              <div className="min-join-success-icon">
                <svg style={{ width: '36px', height: '36px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                Gửi đơn đăng ký thành công!
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '28px' }}>
                Hồ sơ gia nhập CLB của bạn đã được tiếp nhận an toàn. Ban chủ nhiệm sẽ tiến hành xét duyệt trong thời gian sớm nhất.
                Sau khi được phê duyệt, bạn có thể đăng nhập ngay bằng Email và Mật khẩu vừa tạo.
              </p>
              <Link to="/login" className="min-join-submit-btn" style={{ textDecoration: 'none' }}>
                Đến trang Đăng nhập
              </Link>
            </div>
          ) : (
            /* Unified Minimal Form */
            <form className="min-join-form" id="club-registration-form" onSubmit={handleSubmit}>
              {/* Alert: Error Notification */}
              {error && (
                <div className="min-join-alert" role="alert">
                  <svg className="min-join-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p className="min-join-alert-text">{error}</p>
                </div>
              )}

              {/* Họ và tên */}
              <div className="min-join-field">
                <label className="min-join-label" htmlFor="fullName">
                  Họ và tên <span className="min-join-req">*</span>
                </label>
                <div className="min-join-input-wrap">
                  <div className="min-join-input-icon">
                    <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    className="min-join-input"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    required
                    value={formData.fullName}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* MSSV & Số điện thoại (2 cột) */}
              <div className="min-join-row-2">
                <div className="min-join-field">
                  <label className="min-join-label" htmlFor="mssv">
                    Mã số sinh viên <span className="min-join-req">*</span>
                  </label>
                  <div className="min-join-input-wrap">
                    <div className="min-join-input-icon">
                      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                        />
                      </svg>
                    </div>
                    <input
                      id="mssv"
                      name="mssv"
                      type="text"
                      className="min-join-input min-join-input-uppercase"
                      placeholder="Ví dụ: 22120341"
                      required
                      value={formData.mssv}
                      onChange={handleChange}
                      onBlur={handleMssvBlur}
                    />
                  </div>
                </div>

                <div className="min-join-field">
                  <label className="min-join-label" htmlFor="phone">
                    Số điện thoại <span className="min-join-req">*</span>
                  </label>
                  <div className="min-join-input-wrap">
                    <div className="min-join-input-icon">
                      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                    </div>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      className="min-join-input"
                      placeholder="0912 345 678"
                      required
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>

              {/* Email sinh viên */}
              <div className="min-join-field">
                <label className="min-join-label" htmlFor="email">
                  Email sinh viên <span className="min-join-req">*</span>
                </label>
                <div className="min-join-input-wrap">
                  <div className="min-join-input-icon">
                    <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206"
                      />
                    </svg>
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    className="min-join-input"
                    placeholder="an.nguyen@sinhvien.edu.vn"
                    required
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Khoa & Lớp sinh hoạt (2 cột) */}
              <div className="min-join-row-2">
                <div className="min-join-field">
                  <label className="min-join-label" htmlFor="faculty">
                    Khoa <span className="min-join-req">*</span>
                  </label>
                  <div className="min-join-input-wrap">
                    <div className="min-join-input-icon">
                      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
                        />
                      </svg>
                    </div>
                    <select
                      id="faculty"
                      name="faculty"
                      className="min-join-input min-join-select"
                      required
                      value={formData.faculty}
                      onChange={handleChange}
                    >
                      <option value="" disabled>
                        Chọn Khoa / Viện
                      </option>
                      <option value="cntt">Công nghệ Thông tin</option>
                      <option value="ktpm">Kỹ thuật Phần mềm &amp; AI</option>
                      <option value="kinhte">Kinh tế &amp; Quản trị</option>
                      <option value="truyenthong">Truyền thông Đa phương tiện</option>
                      <option value="other">Khoa / Viện khác</option>
                    </select>
                  </div>
                </div>

                <div className="min-join-field">
                  <label className="min-join-label" htmlFor="studentClass">
                    Lớp/ Khóa học <span className="min-join-req">*</span>
                  </label>
                  <div className="min-join-input-wrap">
                    <div className="min-join-input-icon">
                      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    </div>
                    <input
                      id="studentClass"
                      name="studentClass"
                      type="text"
                      className="min-join-input"
                      placeholder="Ví dụ: K65-CNTT hoặc D21-PM01"
                      required
                      value={formData.studentClass}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>

              {/* Ban chuyên môn */}
              <div className="min-join-field">
                <label className="min-join-label" htmlFor="department">
                  Ban chuyên môn <span className="min-join-req">*</span>
                </label>
                <div className="min-join-input-wrap">
                  <div className="min-join-input-icon">
                    <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <select
                    id="department"
                    name="department"
                    className="min-join-input min-join-select"
                    required
                    value={formData.department}
                    onChange={handleChange}
                  >
                    <option value="" disabled>
                      Chọn ban ứng tuyển
                    </option>
                    <option value="tech">Ban Kỹ thuật - Công nghệ</option>
                    <option value="event">Ban Sự kiện</option>
                    <option value="media">Ban Truyền thông</option>
                    <option value="hr">Ban Nhân sự</option>
                  </select>
                </div>
              </div>

              {/* Lý do & Kỹ năng */}
              <div className="min-join-field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="min-join-label" style={{ marginBottom: 0 }} htmlFor="statement">
                    Lý do muốn vào CLB &amp; Kỹ năng <span className="min-join-req">*</span>
                  </label>
                  <span
                    className={`min-join-char-counter ${
                      formData.statement.length >= 380 ? 'min-join-char-counter-warn' : ''
                    }`}
                  >
                    {formData.statement.length} / 400 ký tự
                  </span>
                </div>
                <textarea
                  id="statement"
                  name="statement"
                  rows={3}
                  maxLength={400}
                  className="min-join-textarea"
                  placeholder="Chia sẻ ngắn gọn về sở trường, kinh nghiệm hoặc mong muốn đồng hành..."
                  required
                  value={formData.statement}
                  onChange={handleChange}
                />
              </div>

              {/* Mật khẩu & Xác nhận mật khẩu (2 cột) */}
              <div className="min-join-row-2">
                <div className="min-join-field">
                  <label className="min-join-label" htmlFor="password">
                    Mật khẩu <span className="min-join-req">*</span>
                  </label>
                  <div className="min-join-input-wrap">
                    <div className="min-join-input-icon">
                      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      className="min-join-input min-join-input-password"
                      placeholder="••••••••"
                      required
                      minLength={8}
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      aria-label="Ẩn hoặc hiện mật khẩu"
                      className="min-join-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          />
                        </svg>
                      ) : (
                        <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="min-join-field">
                  <label className="min-join-label" htmlFor="confirmPassword">
                    Xác nhận mật khẩu <span className="min-join-req">*</span>
                  </label>
                  <div className="min-join-input-wrap">
                    <div className="min-join-input-icon">
                      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                    </div>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="min-join-input min-join-input-password"
                      placeholder="••••••••"
                      required
                      minLength={8}
                      value={formData.confirmPassword}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      aria-label="Ẩn hoặc hiện mật khẩu xác nhận"
                      className="min-join-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          />
                        </svg>
                      ) : (
                        <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Đo độ mạnh mật khẩu khi tạo tài khoản */}
              <div style={{ marginTop: '-4px', marginBottom: '16px' }}>
                <PasswordStrengthIndicator password={formData.password} />
              </div>

              {/* Cam kết */}
              <div className="min-join-terms-wrap">
                <label className="min-join-checkbox-label">
                  <input
                    id="terms"
                    name="terms"
                    type="checkbox"
                    className="min-join-checkbox"
                    checked={formData.terms}
                    onChange={handleChange}
                    required
                  />
                  <span className="min-join-checkbox-text">Tôi cam kết thông tin cung cấp là chính xác</span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="min-join-submit-wrap">
                <button
                  id="submit-button"
                  type="submit"
                  className="min-join-submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? 'Đang gửi đơn đăng ký...' : 'Gửi đơn đăng ký'}
                </button>
              </div>
            </form>
          )}

          {/* Link to login */}
          <div className="min-join-card-footer">
            Đã có tài khoản?
            <Link to="/login" className="min-join-login-link">
              Đăng nhập ngay
            </Link>
          </div>
        </div>
      </main>
      {/* END: MainContent */}

      {/* BEGIN: SiteFooter */}
      <footer className="min-join-footer">
        <div className="min-join-footer-inner">
          <span>© 2026 CLB Sinh Viên</span>
          <span className="min-join-footer-dot">•</span>
          <span>Hệ thống quản lý nội bộ</span>
          <span className="min-join-footer-dot">•</span>
          <a
            href="#ho-tro"
            className="min-join-footer-link"
            onClick={(e) => {
              e.preventDefault();
              showInfo('Kênh hỗ trợ kỹ thuật CLB: support@clb.edu.vn - Hotline: 0901234567');
            }}
          >
            Hỗ trợ kỹ thuật
          </a>
        </div>
      </footer>
      {/* END: SiteFooter */}
    </div>
  );
};
