import React, { useState } from 'react';
import {
  User as UserIcon,
  Mail,
  CreditCard,
  Phone,
  BookOpen,
  GraduationCap,
  Award,
  Calendar,
  Lock,
  Edit2,
  Check,
  AlertCircle,
  KeyRound,
  Layers,
  Camera,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../api/client';
import { Modal } from '../components/Modal';
import { PasswordStrengthIndicator, evaluatePassword } from '../components/PasswordStrengthIndicator';

export const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();

  // State sửa thông tin cá nhân
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    faculty: user?.faculty || '',
    class_name: user?.class_name || '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // State upload ảnh đại diện
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);

  // State đổi mật khẩu
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  if (!user) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showError('Dung lượng ảnh đại diện không được vượt quá 2MB.');
      e.target.value = '';
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showError('Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP.');
      e.target.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    try {
      await api.users.uploadAvatar(file);
      await refreshUser();
      showSuccess('Cập nhật ảnh đại diện thành công!');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Không thể tải ảnh đại diện lên. Vui lòng thử lại sau.');
      }
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    setIsDeletingAvatar(true);
    try {
      await api.users.deleteAvatar();
      await refreshUser();
      showSuccess('Đã gỡ ảnh đại diện.');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Không thể gỡ ảnh đại diện.');
      }
    } finally {
      setIsDeletingAvatar(false);
    }
  };

  const handleOpenEdit = () => {
    setEditFormData({
      full_name: user.full_name,
      phone: user.phone || '',
      faculty: user.faculty || '',
      class_name: user.class_name || '',
    });
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setIsEditing(true);

    try {
      await api.users.updateSelf({
        full_name: editFormData.full_name.trim(),
        phone: editFormData.phone.trim() || undefined,
        faculty: editFormData.faculty.trim() || undefined,
        class_name: editFormData.class_name.trim() || undefined,
      });
      await refreshUser();
      setIsEditModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setEditError(err.message);
      } else {
        setEditError('Không thể cập nhật thông tin. Vui lòng thử lại sau.');
      }
    } finally {
      setIsEditing(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    const val = evaluatePassword(passwordData.new_password);
    if (!val.hasMinLength) {
      setPasswordError('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }
    if (!val.hasUppercase) {
      setPasswordError('Mật khẩu mới phải chứa ít nhất 1 chữ cái in hoa (A-Z).');
      return;
    }
    if (!val.hasSpecialChar) {
      setPasswordError('Mật khẩu mới phải chứa ít nhất 1 ký tự đặc biệt (!@#$%^&*...).');
      return;
    }

    if (passwordData.new_password === passwordData.old_password) {
      setPasswordError('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      setPasswordError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await api.auth.changePassword(
        passwordData.old_password,
        passwordData.new_password
      );
      setPasswordSuccess(res.message);
      setPasswordData({ old_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordSuccess(null);
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message);
      } else {
        setPasswordError('Không thể đổi mật khẩu. Vui lòng thử lại sau.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* HEADER CARD */}
      <div className="card card-glowing" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid #ffffff',
                    boxShadow: '0 8px 24px var(--primary-glow)',
                  }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2.1rem',
                    fontWeight: 800,
                    color: '#fff',
                    boxShadow: '0 8px 24px var(--primary-glow)',
                  }}
                >
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Nút Upload Avatar (Camera) */}
              <label
                htmlFor="avatar-upload-input"
                title="Thay đổi ảnh đại diện (Tối đa 2MB)"
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isUploadingAvatar ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                  border: '2px solid #ffffff',
                  transition: 'transform 0.15s, background 0.15s',
                }}
              >
                {isUploadingAvatar ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Camera size={15} />
                )}
              </label>
              <input
                id="avatar-upload-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                disabled={isUploadingAvatar}
                onChange={handleAvatarUpload}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <h2 style={{ fontSize: '1.6rem' }}>{user.full_name}</h2>
                <span
                  className={`badge ${
                    user.role === 'admin'
                      ? 'badge-primary'
                      : user.role === 'department_head'
                      ? 'badge-warning'
                      : 'badge-neutral'
                  }`}
                  style={
                    user.role === 'department_head'
                      ? { background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }
                      : undefined
                  }
                >
                  {user.role === 'admin' ? 'Quản trị viên' : user.role === 'department_head' ? 'Trưởng ban' : 'Thành viên'}
                </span>
                <span className={`badge ${user.is_active ? 'badge-success' : 'badge-danger'}`}>
                  {user.is_active ? 'Đang hoạt động' : 'Tài khoản khóa'}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                {user.title || (user.role === 'department_head' ? 'Trưởng ban' : 'Hội viên chính thức')} • MSSV:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{user.student_id}</strong>
                {user.department_name && (
                  <span>
                    {' '}• Ban: <strong style={{ color: '#818cf8' }}>{user.department_name}</strong>
                  </span>
                )}
              </p>
              {user.avatar_url && (
                <button
                  type="button"
                  onClick={handleDeleteAvatar}
                  disabled={isDeletingAvatar}
                  title="Gỡ ảnh đại diện"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 0',
                    marginTop: '4px',
                    fontWeight: 500,
                  }}
                >
                  <Trash2 size={12} />
                  <span>{isDeletingAvatar ? 'Đang gỡ ảnh...' : 'Gỡ ảnh đại diện'}</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button id="btn-open-edit-profile" onClick={handleOpenEdit} className="btn btn-secondary">
              <Edit2 size={16} />
              <span>Chỉnh sửa hồ sơ</span>
            </button>
            <button id="btn-open-change-password" onClick={() => setIsPasswordModalOpen(true)} className="btn btn-primary">
              <KeyRound size={16} />
              <span>Đổi mật khẩu</span>
            </button>
          </div>
        </div>
      </div>

      {/* DETAIL INFO GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {/* Email */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
            <Mail size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Địa chỉ Email
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>{user.email}</div>
          </div>
        </div>

        {/* Số điện thoại */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--success-light)', borderRadius: '12px', color: 'var(--success)' }}>
            <Phone size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Số điện thoại
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>{user.phone || 'Chưa cập nhật'}</div>
          </div>
        </div>

        {/* MSSV */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '12px', color: 'var(--accent-purple)' }}>
            <CreditCard size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Mã số sinh viên
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>{user.student_id}</div>
          </div>
        </div>

        {/* Khoa */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(6, 182, 212, 0.15)', borderRadius: '12px', color: 'var(--accent-cyan)' }}>
            <BookOpen size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Khoa / Viện
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>{user.faculty || 'Chưa cập nhật'}</div>
          </div>
        </div>

        {/* Lớp / Khóa */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--warning-light)', borderRadius: '12px', color: 'var(--warning)' }}>
            <GraduationCap size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Lớp / Khóa
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>{user.class_name || 'Chưa cập nhật'}</div>
          </div>
        </div>

        {/* Chức danh nội bộ */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
            <Award size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Chức danh nội bộ
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>
              {user.title || (user.role === 'department_head' ? 'Trưởng ban' : 'Hội viên')}
            </div>
          </div>
        </div>

        {/* Ban chuyên môn */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '12px', color: '#818cf8' }}>
            <Layers size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Ban chuyên môn
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px', color: user.department_name ? '#818cf8' : 'var(--text-muted)' }}>
              {user.department_name || 'Chưa tham gia ban nào'}
            </div>
          </div>
        </div>

        {/* Ngày tham gia */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
            <Calendar size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Ngày tham gia CLB
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>{formatDate(user.created_at)}</div>
          </div>
        </div>
      </div>

      {/* MODAL SỬA THÔNG TIN */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Cập nhật thông tin cá nhân"
      >
        <form onSubmit={handleSaveProfile}>
          {editError && (
            <div
              style={{
                background: 'var(--danger-light)',
                color: '#dc2626',
                fontWeight: 600,
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>{editError}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="edit-name">
              <UserIcon size={16} />
              <span>Họ và tên</span>
            </label>
            <input
              id="edit-name"
              type="text"
              className="form-input"
              value={editFormData.full_name}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, full_name: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-phone">
              <Phone size={16} />
              <span>Số điện thoại</span>
            </label>
            <input
              id="edit-phone"
              type="tel"
              className="form-input"
              value={editFormData.phone}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-faculty">
              <BookOpen size={16} />
              <span>Khoa / Viện</span>
            </label>
            <input
              id="edit-faculty"
              type="text"
              className="form-input"
              value={editFormData.faculty}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, faculty: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-class">
              <GraduationCap size={16} />
              <span>Lớp / Khóa</span>
            </label>
            <input
              id="edit-class"
              type="text"
              className="form-input"
              value={editFormData.class_name}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, class_name: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn btn-secondary">
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={isEditing}>
              {isEditing ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL ĐỔI MẬT KHẨU */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Đổi mật khẩu tài khoản"
      >
        <form onSubmit={handleChangePassword}>
          {passwordError && (
            <div
              style={{
                background: 'var(--danger-light)',
                color: '#dc2626',
                fontWeight: 600,
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>{passwordError}</span>
            </div>
          )}

          {passwordSuccess && (
            <div
              style={{
                background: 'var(--success-light)',
                color: '#047857',
                fontWeight: 600,
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Check size={16} />
              <span>{passwordSuccess}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="pw-old">
              <Lock size={16} />
              <span>Mật khẩu hiện tại</span>
            </label>
            <input
              id="pw-old"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={passwordData.old_password}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, old_password: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pw-new">
              <Lock size={16} />
              <span>Mật khẩu mới (tối thiểu 8 ký tự, có in hoa & ký tự đặc biệt)</span>
            </label>
            <input
              id="pw-new"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={passwordData.new_password}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, new_password: e.target.value }))}
              required
            />
            {/* Thanh đo & tiêu chí độ mạnh mật khẩu */}
            <PasswordStrengthIndicator password={passwordData.new_password} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pw-confirm">
              <Lock size={16} />
              <span>Xác nhận mật khẩu mới</span>
            </label>
            <input
              id="pw-confirm"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={passwordData.confirm_password}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, confirm_password: e.target.value }))}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsPasswordModalOpen(false)} className="btn btn-secondary">
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={isChangingPassword}>
              {isChangingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
