import React, { useEffect, useState } from 'react';
import {
  Layers,
  Plus,
  Search,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  UserCheck,
  UserX,
  Users,
  Building2,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Department, User } from '../../types';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { ModuleSubTabs } from '../../components/ModuleSubTabs';
import { Pagination, paginateArray } from '../../components/Pagination';
import { Alert } from '../../components/Alert';

export const DepartmentManagementPage: React.FC = () => {
  const confirm = useConfirm();
  const { showSuccess, showError, showWarning } = useToast();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal Tạo Ban
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createData, setCreateData] = useState({ name: '', description: '' });

  // Modal Sửa Ban
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [editData, setEditData] = useState({ name: '', description: '', is_active: true });

  // Modal Chỉ định Trưởng ban
  const [isHeadModalOpen, setIsHeadModalOpen] = useState(false);
  const [deptForHead, setDeptForHead] = useState<Department | null>(null);
  const [availableMembers, setAvailableMembers] = useState<User[]>([]);
  const [selectedHeadUserId, setSelectedHeadUserId] = useState<number | ''>('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Modal Xem Thành viên trong ban
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [viewingDept, setViewingDept] = useState<Department | null>(null);
  const [deptMembers, setDeptMembers] = useState<User[]>([]);
  const [deptMembersTotal, setDeptMembersTotal] = useState(0);
  const [deptMemberSearch, setDeptMemberSearch] = useState('');
  const [isLoadingDeptMembers, setIsLoadingDeptMembers] = useState(false);
  const [deptMemberPage, setDeptMemberPage] = useState(1);
  const deptMemberPageSize = 10;

  const fetchDepartments = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      let is_active_param: boolean | undefined = undefined;
      if (statusFilter === 'active') is_active_param = true;
      if (statusFilter === 'inactive') is_active_param = false;

      const res = await api.departments.list({
        q: searchQuery.trim() || undefined,
        is_active: is_active_param,
        page,
        page_size: pageSize,
      });
      setDepartments(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Không thể tải danh sách ban chuyên môn.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchDepartments();
  };

  // Tạo ban mới
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await api.departments.create({
        name: createData.name.trim(),
        description: createData.description.trim() || undefined,
      });
      setIsCreateModalOpen(false);
      setActionSuccess('Tạo ban chuyên môn mới thành công!');
      setCreateData({ name: '', description: '' });
      fetchDepartments();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Lỗi khi tạo ban chuyên môn.');
      }
    }
  };

  // Mở modal sửa
  const handleOpenEdit = (dept: Department) => {
    setSelectedDept(dept);
    setEditData({
      name: dept.name,
      description: dept.description || '',
      is_active: dept.is_active,
    });
    setIsEditModalOpen(true);
  };

  // Lưu sửa ban
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDept) return;
    setActionError(null);
    try {
      await api.departments.update(selectedDept.id, {
        name: editData.name.trim(),
        description: editData.description.trim() || undefined,
        is_active: editData.is_active,
      });
      setIsEditModalOpen(false);
      setActionSuccess('Cập nhật ban chuyên môn thành công!');
      fetchDepartments();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Lỗi khi cập nhật ban chuyên môn.');
      }
    }
  };

  // Khóa / Mở khóa nhanh
  const handleToggleActive = async (dept: Department) => {
    const actionText = dept.is_active ? 'khóa' : 'mở khóa';
    const isLocking = dept.is_active;
    const ok = await confirm({
      title: isLocking ? 'Khóa ban chuyên môn' : 'Mở khóa ban chuyên môn',
      message: `Bạn có chắc chắn muốn ${actionText} ban "${dept.name}"? ${
        isLocking ? 'Ban này sẽ tạm ngưng nhận thành viên mới và tạm ẩn trong danh sách đăng ký tham gia.' : 'Ban sẽ hoạt động bình thường trở lại.'
      }`,
      variant: isLocking ? 'danger' : 'info',
      confirmText: isLocking ? 'Khóa ban' : 'Mở khóa',
    });
    if (!ok) return;

    try {
      await api.departments.update(dept.id, { is_active: !dept.is_active });
      showSuccess(`Đã ${actionText} ban "${dept.name}" thành công!`);
      fetchDepartments();
    } catch (err) {
      showError(err);
    }
  };

  // Xóa ban
  const handleDelete = async (dept: Department) => {
    if (dept.member_count > 0) {
      showWarning(`Ban "${dept.name}" hiện đang có ${dept.member_count} thành viên. Bạn phải chuyển hết thành viên sang ban khác trước khi có thể xóa ban!`);
      return;
    }
    const ok = await confirm({
      title: 'Xóa ban chuyên môn',
      message: `Xác nhận xóa vĩnh viễn ban "${dept.name}"? Thao tác này không thể hoàn tác.`,
      variant: 'danger',
      confirmText: 'Xác nhận xóa',
    });
    if (!ok) return;

    try {
      await api.departments.delete(dept.id);
      showSuccess('Đã xóa ban chuyên môn thành công!');
      fetchDepartments();
    } catch (err) {
      showError(err);
    }
  };

  // Mở modal chỉ định trưởng ban
  const handleOpenHeadModal = async (dept: Department) => {
    setDeptForHead(dept);
    setSelectedHeadUserId(dept.head_id || '');
    setIsHeadModalOpen(true);
    setIsLoadingMembers(true);
    try {
      // Lấy danh sách thành viên để chọn
      const res = await api.users.list({ page_size: 100 });
      setAvailableMembers(res.items.filter((u) => u.is_active));
    } catch (err) {
      showError('Không thể tải danh sách thành viên khả dụng.');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Lưu chỉ định trưởng ban
  const handleAssignHeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptForHead || !selectedHeadUserId) return;
    setActionError(null);
    try {
      await api.departments.assignHead(deptForHead.id, Number(selectedHeadUserId));
      setIsHeadModalOpen(false);
      showSuccess('Chỉ định Trưởng ban thành công! Thành viên đã được tự động thêm vào ban.');
      fetchDepartments();
    } catch (err) {
      showError(err);
    }
  };

  // Bãi nhiệm trưởng ban
  const handleDismissHead = async (dept: Department) => {
    if (!dept.head_id) return;
    const ok = await confirm({
      title: 'Bãi nhiệm Trưởng ban',
      message: `Xác nhận bãi nhiệm Trưởng ban của ban "${dept.name}"? Người này sẽ trở về vai trò Thành viên thông thường.`,
      variant: 'warning',
      confirmText: 'Bãi nhiệm',
    });
    if (!ok) return;

    try {
      await api.departments.dismissHead(dept.id);
      showSuccess('Đã bãi nhiệm Trưởng ban thành công!');
      fetchDepartments();
    } catch (err) {
      showError(err);
    }
  };

  // Xem thành viên trong ban
  const handleOpenMembersModal = async (dept: Department) => {
    setViewingDept(dept);
    setDeptMemberSearch('');
    setDeptMemberPage(1);
    setIsMembersModalOpen(true);
    fetchDeptMembers(dept.id, '');
  };

  const fetchDeptMembers = async (deptId: number, query: string) => {
    setIsLoadingDeptMembers(true);
    try {
      const res = await api.departments.getMembers(deptId, {
        q: query.trim() || undefined,
        page_size: 50,
      });
      setDeptMembers(res.items);
      setDeptMembersTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      }
    } finally {
      setIsLoadingDeptMembers(false);
    }
  };

  // Tính thống kê nhanh
  const activeCount = departments.filter((d) => d.is_active).length;
  const hasHeadCount = departments.filter((d) => d.head_id !== null).length;
  const totalMembers = departments.reduce((acc, d) => acc + (d.member_count || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module="personnel" />

      {/* HEADER & ACTIONS */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Quản Lý Ban Chuyên Môn</h1>
          <p className="page-header-subtitle">
            Điều hành các ban chuyên môn (Truyền thông, Sự kiện, Học thuật,...), chỉ định trưởng ban và phân công thành viên.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            id="btn-add-department"
            onClick={() => setIsCreateModalOpen(true)}
            className="btn btn-primary btn-sm"
          >
            <Plus size={16} />
            <span>Tạo ban mới</span>
          </button>
        </div>
      </div>

      {/* STATS OVERVIEW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tổng số ban</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{total}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ban đang hoạt động</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{activeCount}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Đã có Trưởng ban</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{hasHeadCount}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hội viên trong ban</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{totalMembers}</div>
          </div>
        </div>
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

      {/* FILTER & SEARCH */}
      <div className="card" style={{ padding: '18px 24px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '40px' }}
              placeholder="Tìm kiếm theo tên ban..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ width: '180px' }}>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Đã khóa</option>
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
              <th>Tên ban chuyên môn</th>
              <th>Mô tả chức năng</th>
              <th>Trưởng ban phụ trách</th>
              <th style={{ textAlign: 'center' }}>Thành viên</th>
              <th>Trạng thái</th>
              <th style={{ textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Đang tải dữ liệu ban chuyên môn...
                </td>
              </tr>
            ) : departments.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Không tìm thấy ban chuyên môn nào phù hợp.
                </td>
              </tr>
            ) : (
              departments.map((dept) => (
                <tr key={dept.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          background: dept.is_active ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          color: dept.is_active ? '#4f46e5' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                        }}
                      >
                        {dept.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 600 }}>{dept.name}</div>
                    </div>
                  </td>
                  <td style={{ maxWidth: '280px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {dept.description || 'Chưa có mô tả'}
                  </td>
                  <td>
                    {dept.head ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                          }}
                        >
                          {dept.head.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{dept.head.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dept.head.student_id}</div>
                        </div>
                      </div>
                    ) : (
                      <span className="badge badge-neutral" style={{ color: 'var(--text-muted)' }}>
                        Chưa có trưởng ban
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => handleOpenMembersModal(dept)}
                      className="btn btn-ghost btn-sm"
                      style={{ gap: '6px', fontWeight: 700 }}
                      title="Xem danh sách thành viên"
                    >
                      <Users size={14} />
                      <span>{dept.member_count}</span>
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${dept.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {dept.is_active ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        title="Xem thành viên trong ban"
                        onClick={() => handleOpenMembersModal(dept)}
                        className="btn btn-ghost btn-sm"
                      >
                        <Users size={16} />
                      </button>

                      <button
                        title="Chỉ định trưởng ban"
                        onClick={() => handleOpenHeadModal(dept)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#4f46e5' }}
                      >
                        <UserCheck size={16} />
                      </button>

                      {dept.head_id && (
                        <button
                          title="Bãi nhiệm trưởng ban"
                          onClick={() => handleDismissHead(dept)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#f59e0b' }}
                        >
                          <UserX size={16} />
                        </button>
                      )}

                      <button
                        title="Chỉnh sửa thông tin"
                        onClick={() => handleOpenEdit(dept)}
                        className="btn btn-ghost btn-sm"
                      >
                        <Edit2 size={16} />
                      </button>

                      <button
                        title={dept.is_active ? 'Khóa ban' : 'Mở khóa ban'}
                        onClick={() => handleToggleActive(dept)}
                        className="btn btn-ghost btn-sm"
                      >
                        {dept.is_active ? <Lock size={16} /> : <Unlock size={16} style={{ color: '#10b981' }} />}
                      </button>

                      <button
                        title="Xóa ban chuyên môn"
                        onClick={() => handleDelete(dept)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PHÂN TRANG DANH SÁCH BAN */}
      <Pagination
        currentPage={page}
        totalPages={Math.ceil(total / pageSize) || 1}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        pageSizeOptions={[10, 20, 50]}
        itemName="ban chuyên môn"
      />

      {/* MODAL TẠO BAN MỚI */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Tạo Ban Chuyên Môn Mới"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Tên ban chuyên môn *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="VD: Ban Truyền thông, Ban Sự kiện, Ban Học thuật..."
              value={createData.name}
              onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Mô tả chức năng nhiệm vụ</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Mô tả tóm tắt mục tiêu, nhiệm vụ và phạm vi hoạt động của ban..."
              value={createData.description}
              onChange={(e) => setCreateData({ ...createData, description: e.target.value })}
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
              Tạo ban
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL CHỈNH SỬA BAN */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Chỉnh Sửa Ban Chuyên Môn"
      >
        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Tên ban chuyên môn *</label>
            <input
              type="text"
              required
              className="form-input"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Mô tả chức năng</label>
            <textarea
              className="form-input"
              rows={3}
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="edit-is-active"
              checked={editData.is_active}
              onChange={(e) => setEditData({ ...editData, is_active: e.target.checked })}
            />
            <label htmlFor="edit-is-active" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
              Ban đang hoạt động (Bỏ chọn nếu muốn khóa ban)
            </label>
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

      {/* MODAL CHỈ ĐỊNH TRƯỞNG BAN */}
      <Modal
        isOpen={isHeadModalOpen}
        onClose={() => setIsHeadModalOpen(false)}
        title={`Chỉ Định Trưởng Ban: ${deptForHead?.name || ''}`}
      >
        <form onSubmit={handleAssignHeadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Lưu ý: Khi chỉ định, thành viên này sẽ tự động được chuyển vào ban <strong>{deptForHead?.name}</strong> và được cấp quyền <strong>Trưởng ban</strong>. Nếu ban đã có trưởng ban trước đó, người cũ sẽ trở về vai trò thành viên.
          </div>

          <div>
            <label className="form-label">Chọn thành viên làm Trưởng ban *</label>
            {isLoadingMembers ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Đang tải danh sách thành viên...</div>
            ) : (
              <select
                required
                className="form-select"
                value={selectedHeadUserId}
                onChange={(e) => setSelectedHeadUserId(Number(e.target.value))}
              >
                <option value="">-- Chọn thành viên --</option>
                {availableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.student_id}) - {m.department_name ? `Ban: ${m.department_name}` : 'Chưa vào ban'} [{m.role === 'admin' ? 'Quản trị viên' : m.role === 'department_head' ? 'Trưởng ban' : 'Hội viên'}]
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsHeadModalOpen(false)}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={!selectedHeadUserId}>
              Xác nhận chỉ định
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL XEM THÀNH VIÊN TRONG BAN */}
      <Modal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        title={`Thành Viên Ban: ${viewingDept?.name || ''} (${deptMembersTotal})`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '36px' }}
              placeholder="Tìm theo tên, email, MSSV..."
              value={deptMemberSearch}
              onChange={(e) => {
                setDeptMemberSearch(e.target.value);
                if (viewingDept) fetchDeptMembers(viewingDept.id, e.target.value);
              }}
            />
          </div>

          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {isLoadingDeptMembers ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                Đang tải danh sách thành viên...
              </div>
            ) : deptMembers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                Ban này hiện chưa có thành viên nào.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {paginateArray(deptMembers, deptMemberPage, deptMemberPageSize).map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: m.id === viewingDept?.head_id ? '#4f46e5' : '#e2e8f0',
                          color: m.id === viewingDept?.head_id ? '#ffffff' : '#334155',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                        }}
                      >
                        {m.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{m.full_name}</span>
                          {m.id === viewingDept?.head_id && (
                            <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                              Trưởng ban
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {m.student_id} • {m.email}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {m.faculty || m.class_name || 'Hội viên'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {deptMembers.length > deptMemberPageSize && (
            <Pagination
              currentPage={deptMemberPage}
              totalPages={Math.ceil(deptMembers.length / deptMemberPageSize) || 1}
              totalItems={deptMembers.length}
              pageSize={deptMemberPageSize}
              onPageChange={setDeptMemberPage}
              itemName="thành viên"
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsMembersModalOpen(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
