import React, { useState, useEffect } from 'react';
import {
  Plus,
  Clock,
  User,
  Users,
  Building2,
  Sparkles,
  MessageSquare,
  Trash2,
  Send,
  Kanban,
  List,
  Search,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Task, TaskPriority, TaskStatus, Department, Event, User as UserType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/Modal';
import { Pagination, paginateArray } from '../components/Pagination';
import { Alert } from '../components/Alert';

export const TasksPage: React.FC = () => {
  const { user: currentUser, isAdmin, isDepartmentHead } = useAuth();
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const canCreateTask = isAdmin || isDepartmentHead;

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [candidateUsers, setCandidateUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Pagination for list view
  const [listPage, setListPage] = useState<number>(1);
  const [listPageSize, setListPageSize] = useState<number>(10);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [isOverdueOnly, setIsOverdueOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // New task form state
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    priority: 'normal' as TaskPriority,
    due_date: '',
    department_id: '' as string | number,
    event_id: '' as string | number,
    assignee_ids: [] as number[],
  });

  // Comments state inside detail modal
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [newAssigneeId, setNewAssigneeId] = useState<number | ''>('');

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await api.tasks.list({
        status: statusFilter ? (statusFilter as TaskStatus) : undefined,
        department_id: deptFilter ? Number(deptFilter) : undefined,
        is_overdue: isOverdueOnly ? true : undefined,
        page_size: 100,
      });
      setTasks(res.items);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [statusFilter, deptFilter, isOverdueOnly]);

  useEffect(() => {
    if (canCreateTask) {
      api.departments.list({ page_size: 100 }).then((res) => setDepartments(res.items)).catch(() => {});
      api.events.list({ page_size: 50 }).then((res) => setEvents(res.items)).catch(() => {});
      // Load candidate users for assignment
      if (isAdmin) {
        api.users.list({ page_size: 200 }).then((res) => setCandidateUsers(res.items)).catch(() => {});
      } else if (isDepartmentHead && currentUser?.department_id) {
        api.departments.getMembers(currentUser.department_id).then((res) => setCandidateUsers(res.items)).catch(() => {});
      }
    }
  }, [canCreateTask, isAdmin, isDepartmentHead, currentUser?.department_id]);

  const handleOpenCreate = () => {
    setCreateForm({
      title: '',
      description: '',
      priority: 'normal',
      due_date: '',
      department_id: isDepartmentHead && currentUser?.department_id ? currentUser.department_id : '',
      event_id: '',
      assignee_ids: [],
    });
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setError('Vui lòng nhập tiêu đề công việc.');
      return;
    }

    try {
      await api.tasks.create({
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        priority: createForm.priority,
        due_date: createForm.due_date ? new Date(createForm.due_date).toISOString() : undefined,
        department_id: createForm.department_id ? Number(createForm.department_id) : undefined,
        event_id: createForm.event_id ? Number(createForm.event_id) : undefined,
        assignee_ids: createForm.assignee_ids,
      });
      setSuccess('Đã giao công việc thành công!');
      setIsCreateOpen(false);
      fetchTasks();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleOpenDetail = async (task: Task) => {
    try {
      const fullTask = await api.tasks.get(task.id);
      const comments = await api.tasks.listComments(task.id);
      setSelectedTask({ ...fullTask, comments });
      setIsDetailOpen(true);
      setCommentText('');
      setNewAssigneeId('');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!selectedTask) return;
    try {
      const updated = await api.tasks.updateStatus(selectedTask.id, newStatus);
      setSelectedTask(updated);
      setSuccess('Đã cập nhật trạng thái công việc.');
      fetchTasks();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !commentText.trim()) return;
    setIsSubmittingComment(true);
    try {
      const newComment = await api.tasks.addComment(selectedTask.id, commentText.trim());
      setSelectedTask({
        ...selectedTask,
        comments: [...(selectedTask.comments || []), newComment],
      });
      setCommentText('');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleAddAssignee = async () => {
    if (!selectedTask || !newAssigneeId) return;
    try {
      const updated = await api.tasks.addAssignees(selectedTask.id, [Number(newAssigneeId)]);
      setSelectedTask(updated);
      setNewAssigneeId('');
      fetchTasks();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleRemoveAssignee = async (userId: number) => {
    if (!selectedTask) return;
    try {
      const updated = await api.tasks.removeAssignee(selectedTask.id, userId);
      setSelectedTask(updated);
      fetchTasks();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  useEffect(() => {
    setListPage(1);
  }, [searchQuery, statusFilter, deptFilter, isOverdueOnly]);

  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    const confirmed = await confirm({
      title: 'Xác nhận xóa công việc',
      message: `Bạn có chắc chắn muốn xóa công việc "${selectedTask.title}"? Hành động này sẽ xóa vĩnh viễn công việc cùng toàn bộ phân công và thảo luận liên quan.`,
      type: 'danger',
      confirmText: 'Xóa vĩnh viễn',
    });
    if (!confirmed) return;

    try {
      await api.tasks.delete(selectedTask.id);
      setIsDetailOpen(false);
      const msg = 'Đã xóa công việc thành công.';
      setSuccess(msg);
      showSuccess(msg);
      fetchTasks();
    } catch (err: any) {
      const msg = err?.message || 'Không thể xóa công việc.';
      setError(msg);
      showError(err);
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const getPriorityBadge = (p: TaskPriority) => {
    switch (p) {
      case 'high':
        return <span className="badge badge-danger">Ưu tiên cao</span>;
      case 'normal':
        return <span className="badge badge-primary">Bình thường</span>;
      case 'low':
        return <span className="badge badge-neutral">Thấp</span>;
    }
  };

  const getStatusBadge = (s: TaskStatus) => {
    switch (s) {
      case 'todo':
        return <span className="badge badge-neutral">Cần làm</span>;
      case 'in_progress':
        return <span className="badge badge-warning">Đang làm</span>;
      case 'done':
        return <span className="badge badge-success">Hoàn thành</span>;
      case 'cancelled':
        return <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>Đã hủy</span>;
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  });

  const isUserAssignee = (t: Task) =>
    t.assignees.some((a) => a.user_id === currentUser?.id);
  const isCreatorOrAdmin = (t: Task) =>
    currentUser?.role === 'admin' || t.created_by_id === currentUser?.id;

  const kanbanColumns: { status: TaskStatus; title: string; color: string }[] = [
    { status: 'todo', title: 'Cần làm (To-Do)', color: 'var(--text-muted)' },
    { status: 'in_progress', title: 'Đang tiến hành', color: '#f59e0b' },
    { status: 'done', title: 'Hoàn thành', color: '#10b981' },
    { status: 'cancelled', title: 'Đã hủy', color: '#ef4444' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Công Việc CLB</h1>
          <p className="page-header-subtitle">
            Theo dõi phân công nhiệm vụ, tiến độ hoàn thành và phối hợp ban chuyên môn
          </p>
        </div>

        <div className="page-header-actions">
          <div className="segmented-tabs">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`segmented-tab-btn ${viewMode === 'kanban' ? 'active' : ''}`}
            >
              <Kanban size={15} />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`segmented-tab-btn ${viewMode === 'list' ? 'active' : ''}`}
            >
              <List size={15} />
              <span>Danh sách</span>
            </button>
          </div>

          {canCreateTask && (
            <button onClick={handleOpenCreate} className="btn btn-primary btn-sm">
              <Plus size={16} /> Giao việc mới
            </button>
          )}
        </div>
      </div>

      {/* FEEDBACK ALERTS */}
      {error && (
        <Alert
          type="error"
          error={error}
          onClose={() => setError(null)}
        />
      )}
      {success && (
        <Alert
          type="success"
          message={success}
          onClose={() => setSuccess(null)}
        />
      )}

      {/* FILTERS */}
      <div className="card" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '38px' }}
            placeholder="Tìm theo tiêu đề, mô tả công việc..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {viewMode === 'list' && (
          <div style={{ width: '160px' }}>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="todo">Cần làm</option>
              <option value="in_progress">Đang làm</option>
              <option value="done">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </div>
        )}

        {isAdmin && (
          <div style={{ width: '180px' }}>
            <select
              className="form-select"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
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

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
          <input
            type="checkbox"
            checked={isOverdueOnly}
            onChange={(e) => setIsOverdueOnly(e.target.checked)}
          />
          <span style={{ color: isOverdueOnly ? '#dc2626' : 'var(--text-secondary)' }}>
            ⚠️ Chỉ hiện việc quá hạn
          </span>
        </label>
      </div>

      {/* CONTENT: KANBAN OR LIST */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          Đang tải danh sách công việc...
        </div>
      ) : viewMode === 'kanban' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'start' }}>
          {kanbanColumns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  minHeight: '400px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: col.color }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{col.title}</span>
                  </div>
                  <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                    {colTasks.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {colTasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Không có công việc nào
                    </div>
                  ) : (
                    colTasks.map((t) => (
                      <div
                        key={t.id}
                        className="card"
                        onClick={() => handleOpenDetail(t)}
                        style={{
                          padding: '14px',
                          cursor: 'pointer',
                          border: t.is_overdue ? '1px solid rgba(239, 68, 68, 0.6)' : undefined,
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          {getPriorityBadge(t.priority)}
                          {t.is_overdue && (
                            <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                              ⚠️ Quá hạn
                            </span>
                          )}
                        </div>

                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '6px' }}>{t.title}</h4>

                        {t.description && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {t.description}
                          </p>
                        )}

                        {t.needs_reassignment && (
                          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', marginBottom: '8px' }}>
                            ⚠️ Cần giao lại việc (thành viên đã bị vô hiệu)
                          </div>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                          {t.department_name && (
                            <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                              <Building2 size={10} style={{ marginRight: '3px' }} />
                              {t.department_name}
                            </span>
                          )}
                          {t.event_title && (
                            <span className="badge badge-neutral" style={{ fontSize: '0.7rem', color: '#818cf8' }}>
                              <Sparkles size={10} style={{ marginRight: '3px' }} />
                              {t.event_title}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> {t.due_date ? new Date(t.due_date).toLocaleDateString('vi-VN') : 'Không hạn'}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={12} /> {t.assignees.length} người
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(() => {
            const { pagedItems: pagedTasks, totalPages: taskTotalPages } = paginateArray(filteredTasks, listPage, listPageSize);
            return (
              <>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table className="table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Tiêu đề / Công việc</th>
                        <th>Ưu tiên</th>
                        <th>Trạng thái</th>
                        <th>Hạn chót</th>
                        <th>Ban / Sự kiện</th>
                        <th>Người nhận</th>
                        <th style={{ textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                            Không có công việc nào phù hợp.
                          </td>
                        </tr>
                      ) : (
                        pagedTasks.map((t) => (
                          <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenDetail(t)}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{t.title}</div>
                              {t.needs_reassignment && (
                                <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>⚠️ Cần giao lại việc</span>
                              )}
                            </td>
                            <td>{getPriorityBadge(t.priority)}</td>
                            <td>{getStatusBadge(t.status)}</td>
                            <td>
                              <div style={{ color: t.is_overdue ? '#dc2626' : 'var(--text-primary)', fontWeight: t.is_overdue ? 700 : 400 }}>
                                {t.due_date ? new Date(t.due_date).toLocaleDateString('vi-VN') : '—'}
                              </div>
                              {t.is_overdue && <div style={{ fontSize: '0.7rem', color: '#dc2626' }}>Quá hạn</div>}
                            </td>
                            <td>
                              <div>{t.department_name || 'Toàn CLB'}</div>
                              {t.event_title && <div style={{ fontSize: '0.75rem', color: '#4f46e5' }}>{t.event_title}</div>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Users size={14} style={{ color: 'var(--text-muted)' }} />
                                <span>{t.assignees.length} người</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDetail(t);
                                }}
                                className="btn btn-ghost btn-sm"
                              >
                                Chi tiết
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredTasks.length > 0 && (
                  <Pagination
                    currentPage={listPage}
                    totalPages={taskTotalPages}
                    totalItems={filteredTasks.length}
                    pageSize={listPageSize}
                    onPageChange={setListPage}
                    onPageSizeChange={(newSize) => {
                      setListPageSize(newSize);
                      setListPage(1);
                    }}
                    pageSizeOptions={[5, 10, 20, 50]}
                    itemName="công việc"
                  />
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* MODAL GIAO VIỆC MỚI */}
      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Giao công việc mới"
        >
          <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Tiêu đề công việc *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="VD: Chuẩn bị backdrop và banner sự kiện..."
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Mô tả chi tiết</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Mô tả các yêu cầu cụ thể, tài liệu tham khảo..."
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Mức độ ưu tiên</label>
                <select
                  className="form-select"
                  value={createForm.priority}
                  onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value as TaskPriority })}
                >
                  <option value="low">Thấp</option>
                  <option value="normal">Bình thường</option>
                  <option value="high">Ưu tiên cao</option>
                </select>
              </div>

              <div>
                <label className="form-label">Hạn hoàn thành</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={createForm.due_date}
                  onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
                />
              </div>
            </div>

            {isAdmin && (
              <div>
                <label className="form-label">Gắn với Ban chuyên môn (tùy chọn)</label>
                <select
                  className="form-select"
                  value={createForm.department_id}
                  onChange={(e) => setCreateForm({ ...createForm, department_id: e.target.value })}
                >
                  <option value="">Toàn CLB (Không gắn ban)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="form-label">Gắn với Sự kiện (tùy chọn)</label>
              <select
                className="form-select"
                value={createForm.event_id}
                onChange={(e) => setCreateForm({ ...createForm, event_id: e.target.value })}
              >
                <option value="">Không gắn sự kiện</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Phân công người nhận</label>
              <select
                multiple
                className="form-select"
                style={{ height: '120px' }}
                value={createForm.assignee_ids.map(String)}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (option) => Number(option.value));
                  setCreateForm({ ...createForm, assignee_ids: selected });
                }}
              >
                {candidateUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.student_id}) {u.department_name ? `- ${u.department_name}` : ''}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Giữ phím Ctrl (hoặc Cmd) để chọn nhiều thành viên
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-secondary">
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Tạo và giao việc
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL CHI TIẾT CÔNG VIỆC & BÌNH LUẬN */}
      {isDetailOpen && selectedTask && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Chi tiết: ${selectedTask.title}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top metadata */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {getPriorityBadge(selectedTask.priority)}
                {getStatusBadge(selectedTask.status)}
                {selectedTask.is_overdue && (
                  <span className="badge badge-danger">⚠️ Đã quá hạn</span>
                )}
              </div>

              {/* Status transition dropdown */}
              {(isUserAssignee(selectedTask) || isCreatorOrAdmin(selectedTask)) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Đổi trạng thái:</span>
                  <select
                    className="form-select form-select-sm"
                    style={{ width: '150px' }}
                    value={selectedTask.status}
                    onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                  >
                    <option value="todo">Cần làm</option>
                    <option value="in_progress">Đang làm</option>
                    <option value="done">Hoàn thành</option>
                    {isCreatorOrAdmin(selectedTask) && (
                      <option value="cancelled">Hủy bỏ</option>
                    )}
                  </select>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                MÔ TẢ
              </div>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '0.95rem' }}>
                {selectedTask.description || 'Không có mô tả chi tiết.'}
              </p>
            </div>

            {/* Metadata info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hạn chót:</span>
                <div style={{ fontWeight: 600, color: selectedTask.is_overdue ? '#dc2626' : 'var(--text-primary)' }}>
                  {formatDateTime(selectedTask.due_date)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Người giao:</span>
                <div style={{ fontWeight: 600 }}>{selectedTask.creator_name || selectedTask.created_by_name || 'Quản trị viên'}</div>
              </div>
              {selectedTask.department_name && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ban phụ trách:</span>
                  <div style={{ fontWeight: 600 }}>{selectedTask.department_name}</div>
                </div>
              )}
              {selectedTask.event_title && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gắn sự kiện:</span>
                  <div style={{ fontWeight: 600, color: '#4f46e5' }}>{selectedTask.event_title}</div>
                </div>
              )}
              {selectedTask.completed_at && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hoàn thành lúc:</span>
                  <div style={{ fontWeight: 600, color: '#059669' }}>{formatDateTime(selectedTask.completed_at)}</div>
                </div>
              )}
            </div>

            {/* Assignees */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  NGƯỜI NHẬN VIỆC ({selectedTask.assignees.length})
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {selectedTask.assignees.map((a) => (
                  <span
                    key={a.user_id}
                    className="badge badge-neutral"
                    style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <User size={12} />
                    <span>{a.user_name || a.full_name} ({a.student_id})</span>
                    {isCreatorOrAdmin(selectedTask) && (
                      <button
                        onClick={() => handleRemoveAssignee(a.user_id)}
                        className="btn-ghost"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#dc2626' }}
                        title="Gỡ người nhận"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {/* Add Assignee (only creator/admin) */}
              {isCreatorOrAdmin(selectedTask) && candidateUsers.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <select
                    className="form-select form-select-sm"
                    style={{ flex: 1 }}
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">+ Chọn thành viên bổ sung...</option>
                    {candidateUsers
                      .filter((u) => !selectedTask.assignees.some((a) => a.user_id === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.student_id})
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={handleAddAssignee}
                    disabled={!newAssigneeId}
                    className="btn btn-secondary btn-sm"
                  >
                    Thêm
                  </button>
                </div>
              )}
            </div>

            {/* Comments Section */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={16} /> BÌNH LUẬN & TRAO ĐỔI ({selectedTask.comments?.length || 0})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto', marginBottom: '14px' }}>
                {(!selectedTask.comments || selectedTask.comments.length === 0) ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '16px' }}>
                    Chưa có trao đổi nào. Hãy để lại bình luận bên dưới.
                  </div>
                ) : (
                  (selectedTask.comments || []).map((c: any) => (
                    <div
                      key={c.id}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--primary)' }}>
                          {c.user_name}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {formatDateTime(c.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{c.content}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Add comment box */}
              <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Viết bình luận, cập nhật tiến độ..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  disabled={isSubmittingComment}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || isSubmittingComment}
                  className="btn btn-primary"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>

            {/* Admin Delete task button */}
            {isCreatorOrAdmin(selectedTask) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                <button onClick={handleDeleteTask} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
                  <Trash2 size={16} style={{ marginRight: '6px' }} />
                  Xóa công việc này
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
