import React, { useEffect, useState } from 'react';
import {
  Search,
  UserPlus,
  KeyRound,
  Lock,
  Unlock,
  Trash2,
  Edit2,
  Check,
  Copy,
  Layers,
  ArrowRightLeft,
  Coins,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { User, SystemRole, Department } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { ModuleSubTabs } from '../../components/ModuleSubTabs';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';
import { PasswordStrengthIndicator, evaluatePassword } from '../../components/PasswordStrengthIndicator';

export const MemberManagementPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const confirm = useConfirm();
  const { showSuccess, showError, showWarning } = useToast();
  const isAdmin = currentUser?.role === 'admin';
  const isDeptHead = currentUser?.role === 'department_head';

  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal Tạo Thành viên
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createData, setCreateData] = useState({
    email: '',
    student_id: '',
    full_name: '',
    phone: '',
    faculty: '',
    class_name: '',
    title: '',
    role: 'member' as SystemRole,
    password: '',
  });

  // Modal Chỉnh sửa
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editData, setEditData] = useState({
    full_name: '',
    phone: '',
    faculty: '',
    class_name: '',
    title: '',
    role: 'member' as SystemRole,
    is_active: true,
  });

  // Modal Đổi Ban / Chuyển ban
  const [transferModal, setTransferModal] = useState<{
    isOpen: boolean;
    user: User | null;
    selectedDeptId: number | '';
  }>({
    isOpen: false,
    user: null,
    selectedDeptId: '',
  });

  // Modal Đặt lại mật khẩu tạm thời
  const [tempPasswordModal, setTempPasswordModal] = useState<{
    isOpen: boolean;
    user: User | null;
    password: string;
    copied: boolean;
  }>({
    isOpen: false,
    user: null,
    password: '',
    copied: false,
  });

  // Tải danh sách ban nếu là admin
  useEffect(() => {
    if (isAdmin) {
      api.departments.list({ page_size: 100 }).then((res) => {
        setDepartments(res.items);
      }).catch(() => {});
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await api.users.list({
        q: searchQuery.trim() || undefined,
        role: roleFilter || undefined,
        department_id: deptFilter ? Number(deptFilter) : undefined,
        page,
        page_size: pageSize,
      });
      setUsers(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Không thể tải danh sách thành viên.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, deptFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  // Tạo thành viên
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const val = evaluatePassword(createData.password);
    if (!val.hasMinLength) {
      setActionError('Mật khẩu phải có tối thiểu 8 ký tự.');
      return;
    }
    if (!val.hasUppercase) {
      setActionError('Mật khẩu phải chứa ít nhất 1 chữ cái in hoa (A-Z).');
      return;
    }
    if (!val.hasSpecialChar) {
      setActionError('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (!@#$%^&*...).');
      return;
    }

    try {
      await api.users.create({
        email: createData.email.trim(),
        student_id: createData.student_id.trim(),
        full_name: createData.full_name.trim(),
        phone: createData.phone.trim() || undefined,
        faculty: createData.faculty.trim() || undefined,
        class_name: createData.class_name.trim() || undefined,
        title: createData.title.trim() || undefined,
        role: createData.role,
        password: createData.password,
      });
      setIsCreateModalOpen(false);
      setActionSuccess('Thêm thành viên mới thành công!');
      fetchUsers();
      setCreateData({
        email: '',
        student_id: '',
        full_name: '',
        phone: '',
        faculty: '',
        class_name: '',
        title: '',
        role: 'member',
        password: '',
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Lỗi khi thêm thành viên.');
      }
    }
  };

  // Mở modal sửa
  const handleOpenEdit = (user: User) => {
    setSelectedUser(user);
    setEditData({
      full_name: user.full_name,
      phone: user.phone || '',
      faculty: user.faculty || '',
      class_name: user.class_name || '',
      title: user.title || '',
      role: user.role,
      is_active: user.is_active,
    });
    setIsEditModalOpen(true);
  };

  // Lưu sửa
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setActionError(null);

    try {
      await api.users.updateAdmin(selectedUser.id, {
        full_name: editData.full_name.trim(),
        phone: editData.phone.trim() || undefined,
        faculty: editData.faculty.trim() || undefined,
        class_name: editData.class_name.trim() || undefined,
        title: editData.title.trim() || undefined,
        role: editData.role,
        is_active: editData.is_active,
      });
      setIsEditModalOpen(false);
      setActionSuccess('Cập nhật thông tin thành viên thành công!');
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Lỗi khi cập nhật thành viên.');
      }
    }
  };

  // Mở modal Chuyển ban
  const handleOpenTransfer = (user: User) => {
    setTransferModal({
      isOpen: true,
      user,
      selectedDeptId: user.department_id || '',
    });
  };

  // Lưu Chuyển ban
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModal.user) return;
    setActionError(null);

    const targetDeptId = transferModal.selectedDeptId === '' ? null : Number(transferModal.selectedDeptId);
    try {
      await api.users.updateDepartment(transferModal.user.id, targetDeptId);
      setTransferModal({ isOpen: false, user: null, selectedDeptId: '' });
      setActionSuccess('Cập nhật ban chuyên môn cho thành viên thành công!');
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Lỗi khi cập nhật ban cho thành viên.');
      }
    }
  };

  // Khóa / Mở khóa nhanh
  const handleToggleLock = async (user: User) => {
    if (user.id === currentUser?.id) {
      showWarning('Bạn không thể tự khóa tài khoản của chính mình!');
      return;
    }

    const actionText = user.is_active ? 'khóa' : 'mở khóa';
    const isLocking = user.is_active;
    const ok = await confirm({
      title: isLocking ? 'Khóa tài khoản thành viên' : 'Mở khóa tài khoản thành viên',
      message: `Bạn có chắc chắn muốn ${actionText} tài khoản của ${user.full_name}? ${
        isLocking ? 'Thành viên này sẽ không thể đăng nhập vào hệ thống.' : 'Thành viên sẽ được khôi phục quyền truy cập.'
      }`,
      variant: isLocking ? 'danger' : 'info',
      confirmText: isLocking ? 'Khóa tài khoản' : 'Mở khóa',
    });
    if (!ok) return;

    try {
      await api.users.updateAdmin(user.id, { is_active: !user.is_active });
      showSuccess(`Đã ${actionText} tài khoản của ${user.full_name} thành công!`);
      fetchUsers();
    } catch (err) {
      showError(err);
    }
  };

  // Đặt lại mật khẩu tạm thời
  const handleResetPassword = async (user: User) => {
    const ok = await confirm({
      title: 'Đặt lại mật khẩu tạm thời',
      message: `Bạn có chắc muốn đặt lại mật khẩu tạm thời cho ${user.full_name}? Mật khẩu hiện tại của thành viên sẽ bị vô hiệu ngay lập tức.`,
      variant: 'warning',
      confirmText: 'Đặt lại mật khẩu',
    });
    if (!ok) return;

    try {
      const res = await api.users.resetPassword(user.id);
      setTempPasswordModal({
        isOpen: true,
        user,
        password: res.temporary_password,
        copied: false,
      });
      showSuccess('Mật khẩu tạm thời mới đã được tạo thành công!');
    } catch (err) {
      showError(err);
    }
  };

  // Xóa mềm
  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      showWarning('Bạn không thể tự xóa tài khoản của chính mình!');
      return;
    }

    const ok = await confirm({
      title: 'Xóa thành viên',
      message: `Bạn có chắc chắn muốn xóa thành viên "${user.full_name}" (MSSV: ${user.student_id})? Dữ liệu của thành viên sẽ được lưu trữ và có thể khôi phục khi cần.`,
      variant: 'danger',
      confirmText: 'Xác nhận xóa',
    });
    if (!ok) return;

    try {
      await api.users.delete(user.id);
      showSuccess('Đã xóa mềm thành viên thành công!');
      fetchUsers();
    } catch (err) {
      showError(err);
    }
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(tempPasswordModal.password);
    setTempPasswordModal((prev) => ({ ...prev, copied: true }));
    showSuccess('Đã sao chép mật khẩu tạm thời vào bộ nhớ tạm!');
    setTimeout(() => {
      setTempPasswordModal((prev) => ({ ...prev, copied: false }));
    }, 2000);
  };

  const handleToggleTreasurer = async (user: User) => {
    const nextState = !user.is_treasurer;
    const ok = await confirm({
      title: nextState ? 'Cấp quyền Thủ quỹ' : 'Hủy quyền Thủ quỹ',
      message: nextState
        ? `Bạn có chắc muốn cấp cờ quyền Thủ quỹ cho "${user.full_name}"? Thành viên này sẽ có quyền truy cập Sổ quỹ và xử lý các phiếu thu chi.`
        : `Bạn có chắc muốn hủy cờ quyền Thủ quỹ của "${user.full_name}"?`,
      variant: nextState ? 'info' : 'warning',
      confirmText: nextState ? 'Cấp quyền' : 'Hủy quyền',
    });
    if (!ok) return;

    try {
      await api.users.toggleTreasurer(user.id, nextState);
      showSuccess(`Đã ${nextState ? 'cấp' : 'hủy'} cờ quyền Thủ quỹ thành công!`);
      fetchUsers();
    } catch (err) {
      showError(err);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  const getRoleBadge = (role: SystemRole) => {
    if (role === 'admin') {
      return <span className="badge badge-primary">Quản trị viên</span>;
    }
    if (role === 'department_head') {
      return (
        <span
          className="badge"
          style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }}
        >
          Trưởng ban
        </span>
      );
    }
    return <span className="badge badge-neutral">Thành viên</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module={isDeptHead ? 'department' : 'personnel'} />

      {/* HEADER & ACTIONS */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">
            {isDeptHead
              ? `Thành Viên Ban: ${currentUser?.department_name || 'Ban của bạn'}`
              : 'Quản Lý Thành Viên CLB'}
          </h1>
          <p className="page-header-subtitle">
            {isDeptHead
              ? `Danh sách thành viên thuộc ban của bạn (${total} thành viên) - Chế độ chỉ đọc`
              : `Tổng số: ${total} thành viên trong hệ thống`}
          </p>
        </div>

        {isAdmin && (
          <div className="page-header-actions">
            <button
              id="btn-add-member"
              onClick={() => setIsCreateModalOpen(true)}
              className="btn btn-primary btn-sm"
            >
              <UserPlus size={16} />
              <span>Thêm thành viên mới</span>
            </button>
          </div>
        )}
      </div>

      {/* FEEDBACK ALERTS */}
      {actionError && (
        <Alert
          type="error"
          message={actionError}
          onClose={() => setActionError(null)}
        />
      )}

      {actionSuccess && (
        <Alert
          type="success"
          message={actionSuccess}
          onClose={() => setActionSuccess(null)}
        />
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="card" style={{ padding: '18px 24px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '40px' }}
              placeholder="Tìm kiếm theo Tên, Email hoặc MSSV..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* BỘ LỌC THEO BAN (CHỈ DÀNH CHO ADMIN) */}
          {isAdmin && (
            <div style={{ width: '200px' }}>
              <select
                className="form-select"
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả các ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ width: '180px' }}>
            <select
              className="form-select"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả vai trò</option>
              {isAdmin && <option value="admin">Quản trị viên</option>}
              <option value="department_head">Trưởng ban</option>
              <option value="member">Thành viên</option>
            </select>
          </div>

          <button type="submit" className="btn btn-secondary">
            <span>Tìm kiếm</span>
          </button>
        </form>
      </div>

      {/* TABLE */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Họ và tên / Chức danh</th>
              <th>MSSV</th>
              <th>Thông tin liên hệ</th>
              <th>Khoa / Lớp</th>
              <th>Ban chuyên môn</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              {isAdmin && <th style={{ textAlign: 'right' }}>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Đang tải dữ liệu thành viên...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Không tìm thấy thành viên nào phù hợp.
                </td>
              </tr>
            ) : (
              users.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.full_name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {item.title || 'Hội viên'}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.student_id}</span>
                  </td>
                  <td>
                    <div>{item.email}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.phone || '—'}</div>
                  </td>
                  <td>
                    <div>{item.faculty || '—'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.class_name || '—'}</div>
                  </td>
                  {/* CỘT BAN CHUYÊN MÔN */}
                  <td>
                    {item.department_name ? (
                      <span
                        className="badge badge-neutral"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Layers size={13} style={{ color: '#818cf8' }} />
                        <span>{item.department_name}</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chưa vào ban</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      {getRoleBadge(item.role)}
                      {item.is_treasurer && (
                        <span
                          className="badge"
                          style={{
                            background: '#ecfdf5',
                            color: '#047857',
                            border: '1px solid #a7f3d0',
                            fontSize: '0.72rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontWeight: 700,
                          }}
                        >
                          <Coins size={12} />
                          Thủ quỹ
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {item.is_active ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {/* THAO TÁC CẤP/HỦY QUYỀN THỦ QUỸ */}
                        <button
                          title={item.is_treasurer ? 'Hủy cờ quyền Thủ quỹ' : 'Cấp cờ quyền Thủ quỹ'}
                          onClick={() => handleToggleTreasurer(item)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: item.is_treasurer ? '#059669' : 'var(--text-muted)' }}
                        >
                          <Coins size={16} />
                        </button>

                        {/* THAO TÁC CHUYỂN BAN */}
                        <button
                          title="Gán / Chuyển ban chuyên môn"
                          onClick={() => handleOpenTransfer(item)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#818cf8' }}
                        >
                          <ArrowRightLeft size={16} />
                        </button>

                        <button
                          title="Chỉnh sửa thông tin & vai trò"
                          onClick={() => handleOpenEdit(item)}
                          className="btn btn-ghost btn-sm"
                        >
                          <Edit2 size={16} />
                        </button>

                        <button
                          title="Đặt lại mật khẩu tạm thời"
                          onClick={() => handleResetPassword(item)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#f59e0b' }}
                        >
                          <KeyRound size={16} />
                        </button>

                        {item.id !== currentUser?.id && (
                          <>
                            <button
                              title={item.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                              onClick={() => handleToggleLock(item)}
                              className="btn btn-ghost btn-sm"
                              style={{ color: item.is_active ? '#ef4444' : '#10b981' }}
                            >
                              {item.is_active ? <Lock size={16} /> : <Unlock size={16} />}
                            </button>

                            <button
                              title="Xóa mềm thành viên"
                              onClick={() => handleDeleteUser(item)}
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PHÂN TRANG */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        pageSizeOptions={[10, 20, 50]}
        itemName="thành viên"
      />

      {/* MODAL GÁN / CHUYỂN BAN (ADMIN) */}
      <Modal
        isOpen={transferModal.isOpen}
        onClose={() => setTransferModal({ isOpen: false, user: null, selectedDeptId: '' })}
        title={`Chuyển Ban: ${transferModal.user?.full_name || ''}`}
      >
        <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Hiện tại: <strong>{transferModal.user?.department_name || 'Chưa thuộc ban nào'}</strong>
            <br />
            Lưu ý: Nếu thành viên đang là Trưởng ban của ban cũ và được chuyển sang ban khác, hệ thống sẽ tự động bãi nhiệm vị trí trưởng ban ban cũ và chuyển vai trò về thành viên.
          </div>

          <div>
            <label className="form-label">Chọn ban chuyên môn mục tiêu</label>
            <select
              className="form-select"
              value={transferModal.selectedDeptId}
              onChange={(e) => setTransferModal({ ...transferModal, selectedDeptId: e.target.value === '' ? '' : Number(e.target.value) })}
            >
              <option value="">-- Đưa ra khỏi ban (Không thuộc ban nào) --</option>
              {departments.filter((d) => d.is_active).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.head_id === transferModal.user?.id ? '(Đang là trưởng ban)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTransferModal({ isOpen: false, user: null, selectedDeptId: '' })}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              Lưu thay đổi
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL TẠO THÀNH VIÊN */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Thêm Thành Viên Mới Vào CLB"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Họ và tên *</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="Nguyễn Văn A"
                value={createData.full_name}
                onChange={(e) => setCreateData({ ...createData, full_name: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Mã số sinh viên *</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="SV2024..."
                value={createData.student_id}
                onChange={(e) => setCreateData({ ...createData, student_id: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Email tài khoản *</label>
              <input
                type="email"
                required
                className="form-input"
                placeholder="user@clb.edu.vn"
                value={createData.email}
                onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Mật khẩu khởi tạo *</label>
              <input
                type="password"
                required
                minLength={8}
                className="form-input"
                placeholder="Tối thiểu 8 ký tự (hoa & ký tự đặc biệt)"
                value={createData.password}
                onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
              />
            </div>
          </div>

          {/* Đo độ mạnh mật khẩu khi tạo tài khoản */}
          <PasswordStrengthIndicator password={createData.password} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Số điện thoại</label>
              <input
                type="text"
                className="form-input"
                placeholder="0901234567"
                value={createData.phone}
                onChange={(e) => setCreateData({ ...createData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Vai trò ban đầu</label>
              <select
                className="form-select"
                value={createData.role}
                onChange={(e) => setCreateData({ ...createData, role: e.target.value as SystemRole })}
              >
                <option value="member">Thành viên (Member)</option>
                <option value="department_head">Trưởng ban (Department Head)</option>
                <option value="admin">Quản trị viên (Admin)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Khoa / Viện</label>
              <input
                type="text"
                className="form-input"
                placeholder="CNTT, Kinh tế..."
                value={createData.faculty}
                onChange={(e) => setCreateData({ ...createData, faculty: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Lớp sinh hoạt</label>
              <input
                type="text"
                className="form-input"
                placeholder="K60-CNTT..."
                value={createData.class_name}
                onChange={(e) => setCreateData({ ...createData, class_name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Chức danh hiển thị nội bộ</label>
            <input
              type="text"
              className="form-input"
              placeholder="VD: Hội viên, Trưởng ban, Phó chủ nhiệm..."
              value={createData.title}
              onChange={(e) => setCreateData({ ...createData, title: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              Tạo thành viên
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL SỬA THÔNG TIN */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Chỉnh Sửa: ${selectedUser?.full_name || ''}`}
      >
        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="form-label">Họ và tên *</label>
            <input
              type="text"
              required
              className="form-input"
              value={editData.full_name}
              onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Số điện thoại</label>
              <input
                type="text"
                className="form-input"
                value={editData.phone}
                onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Chức danh nội bộ</label>
              <input
                type="text"
                className="form-input"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Khoa / Viện</label>
              <input
                type="text"
                className="form-input"
                value={editData.faculty}
                onChange={(e) => setEditData({ ...editData, faculty: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Lớp sinh hoạt</label>
              <input
                type="text"
                className="form-input"
                value={editData.class_name}
                onChange={(e) => setEditData({ ...editData, class_name: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
            <div>
              <label className="form-label">Vai trò hệ thống</label>
              <select
                className="form-select"
                value={editData.role}
                onChange={(e) => setEditData({ ...editData, role: e.target.value as SystemRole })}
              >
                <option value="member">Thành viên</option>
                <option value="department_head">Trưởng ban</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </div>
            <div style={{ paddingTop: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editData.is_active}
                  onChange={(e) => setEditData({ ...editData, is_active: e.target.checked })}
                />
                <span style={{ fontSize: '0.875rem' }}>Đang hoạt động (Mở khóa)</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsEditModalOpen(false)}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              Lưu thay đổi
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL MẬT KHẨU TẠM THỜI */}
      <Modal
        isOpen={tempPasswordModal.isOpen}
        onClose={() => setTempPasswordModal({ ...tempPasswordModal, isOpen: false })}
        title="Mật Khẩu Tạm Thời Khởi Tạo"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Mật khẩu tạm thời đã được đặt lại thành công cho thành viên{' '}
            <strong>{tempPasswordModal.user?.full_name}</strong>. Vui lòng sao chép và gửi trực tiếp cho hội viên:
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.1em' }}>
              {tempPasswordModal.password}
            </span>

            <button
              onClick={handleCopyPassword}
              className="btn btn-secondary btn-sm"
              style={{ gap: '6px' }}
            >
              {tempPasswordModal.copied ? <Check size={16} style={{ color: '#10b981' }} /> : <Copy size={16} />}
              <span>{tempPasswordModal.copied ? 'Đã sao chép' : 'Sao chép'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setTempPasswordModal({ ...tempPasswordModal, isOpen: false })}
            >
              Đã hiểu & Đóng
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
