import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  RefreshCw,
  FileText,
  Layers,
  Eye,
} from 'lucide-react';
import { api } from '../../api/client';
import { KnowledgeDocument, DocumentAudience } from '../../types';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { ModuleSubTabs } from '../../components/ModuleSubTabs';
import { Pagination, paginateArray } from '../../components/Pagination';
import { Alert } from '../../components/Alert';

export const KnowledgeManagementPage: React.FC = () => {
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reindex state
  const [isReindexing, setIsReindexing] = useState(false);

  // Modal Create
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createData, setCreateData] = useState({
    title: '',
    category: 'Quy định',
    audience: 'public' as DocumentAudience,
    content: '',
  });

  // Modal Edit
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const [editData, setEditData] = useState({
    title: '',
    category: '',
    audience: 'public' as DocumentAudience,
    content: '',
    is_active: true,
  });

  // Modal View Detail
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<KnowledgeDocument | null>(null);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const data = await api.knowledge.list({
        audience: audienceFilter || undefined,
        category: categoryFilter || undefined,
      });
      setDocuments(data);
    } catch (err: any) {
      setActionError(err.message || 'Không thể tải danh sách tài liệu.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchDocuments();
  }, [audienceFilter, categoryFilter]);

  const handleReindex = async () => {
    const ok = await confirm({
      title: 'Lập lại chỉ mục tri thức',
      message: 'Bạn có chắc chắn muốn lập lại chỉ mục toàn bộ tài liệu tri thức (reindex)? Thao tác này sẽ quét thư mục knowledge/ và sinh lại vector embedding cho hệ thống chatbot AI.',
      variant: 'warning',
      confirmText: 'Lập chỉ mục',
    });
    if (!ok) return;

    setIsReindexing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.knowledge.reindex();
      const msg = `Lập chỉ mục thành công! Đã xử lý ${res.total_chunks_indexed} đoạn tài liệu.`;
      setActionSuccess(msg);
      showSuccess(msg);
      fetchDocuments();
    } catch (err: any) {
      showError(err);
      setActionError(err.message || 'Lập chỉ mục thất bại.');
    } finally {
      setIsReindexing(false);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createData.title.trim() || !createData.content.trim()) {
      setActionError('Vui lòng điền đầy đủ tiêu đề và nội dung tài liệu.');
      return;
    }
    try {
      await api.knowledge.create(createData);
      showSuccess('Đã thêm tài liệu mới và lập chỉ mục thành công!');
      setIsCreateModalOpen(false);
      setCreateData({ title: '', category: 'Quy định', audience: 'public', content: '' });
      fetchDocuments();
    } catch (err: any) {
      showError(err);
    }
  };

  const openEditModal = (doc: KnowledgeDocument) => {
    setSelectedDoc(doc);
    setEditData({
      title: doc.title,
      category: doc.category,
      audience: doc.audience,
      content: doc.content,
      is_active: doc.is_active,
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc) return;
    try {
      await api.knowledge.update(selectedDoc.id, editData);
      showSuccess('Cập nhật tài liệu thành công!');
      setIsEditModalOpen(false);
      setSelectedDoc(null);
      fetchDocuments();
    } catch (err: any) {
      showError(err);
    }
  };

  const handleDeleteDocument = async (id: number, title: string) => {
    const ok = await confirm({
      title: 'Xóa tài liệu tri thức',
      message: `Bạn có chắc chắn muốn xóa tài liệu "${title}"? Thao tác này sẽ xóa các đoạn vector embedding tương ứng trong cơ sở dữ liệu tri thức.`,
      variant: 'danger',
      confirmText: 'Xác nhận xóa',
    });
    if (!ok) return;

    try {
      await api.knowledge.delete(id);
      showSuccess(`Đã xóa tài liệu "${title}" thành công.`);
      fetchDocuments();
    } catch (err: any) {
      showError(err);
    }
  };

  const filteredDocs = documents.filter((doc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.category.toLowerCase().includes(q) ||
      doc.content.toLowerCase().includes(q)
    );
  });

  const getAudienceBadge = (audience: DocumentAudience) => {
    switch (audience) {
      case 'public':
        return <span className="badge badge-success">Công khai</span>;
      case 'member':
        return <span className="badge badge-primary">Hội viên</span>;
      case 'dept_head':
        return <span className="badge badge-warning">Trưởng ban</span>;
      case 'admin':
        return <span className="badge badge-danger">Quản trị viên</span>;
      default:
        return <span className="badge badge-neutral">{audience}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ModuleSubTabs module="system" />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Quản Lý Kho Tri Thức RAG</h1>
          <p className="page-header-subtitle">
            Quản lý tài liệu quy định, quy chế nội bộ phục vụ hỏi đáp và tìm kiếm ngữ nghĩa của Chatbot AI
          </p>
        </div>

        <div className="page-header-actions">
          <button
            onClick={handleReindex}
            disabled={isReindexing}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={15} className={isReindexing ? 'animate-spin' : ''} />
            <span>{isReindexing ? 'Đang Lập Chỉ Mục...' : 'Lập Chỉ Mục Lại (Reindex)'}</span>
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="btn btn-primary btn-sm"
          >
            <Plus size={16} />
            <span>Thêm Tài Liệu Mới</span>
          </button>
        </div>
      </div>

      {/* Thông báo Alert */}
      {actionSuccess && (
        <Alert
          type="success"
          message={actionSuccess}
          onClose={() => setActionSuccess(null)}
        />
      )}

      {actionError && (
        <Alert
          type="error"
          message={actionError}
          onClose={() => setActionError(null)}
        />
      )}

      {/* Thanh lọc & tìm kiếm */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Tìm kiếm tài liệu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '36px' }}
          />
        </div>

        <div style={{ minWidth: '200px' }}>
          <select
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            className="form-input"
          >
            <option value="">Tất cả phạm vi quyền hạn (Audience)</option>
            <option value="public">Công khai (Public)</option>
            <option value="member">Hội viên (Member)</option>
            <option value="dept_head">Trưởng ban (Dept Head)</option>
            <option value="admin">Quản trị viên (Admin)</option>
          </select>
        </div>

        <div style={{ minWidth: '180px' }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="form-input"
          >
            <option value="">Tất cả danh mục (Category)</option>
            <option value="Quy định">Quy định</option>
            <option value="Hướng dẫn">Hướng dẫn</option>
            <option value="Giới thiệu">Giới thiệu</option>
            <option value="Quy chế">Quy chế</option>
            <option value="Quy định nội bộ">Quy định nội bộ</option>
          </select>
        </div>
      </div>

      {/* Danh sách Tài liệu Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Tiêu đề tài liệu</th>
                <th>Danh mục</th>
                <th>Phạm vi xem</th>
                <th>Chunks</th>
                <th>Phiên bản</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                    Đang nạp dữ liệu tài liệu tri thức...
                  </td>
                </tr>
              ) : filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                    Chưa có tài liệu nào phù hợp với bộ lọc. Bấm "Lập Chỉ Mục Lại" để quét tài liệu mẫu trong thư mục knowledge/.
                  </td>
                </tr>
              ) : (
                paginateArray(filteredDocs, page, pageSize).map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <FileText size={16} style={{ color: '#818cf8', flexShrink: 0 }} />
                        <span>{doc.title}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {doc.content.slice(0, 90)}...
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{doc.category}</td>
                    <td>{getAudienceBadge(doc.audience)}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          background: 'rgba(255, 255, 255, 0.05)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        <Layers size={12} style={{ color: '#818cf8' }} />
                        {doc.chunks_count ?? 0}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>v{doc.version}</td>
                    <td>
                      {doc.is_active ? (
                        <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.8125rem' }}>Hoạt động</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Tạm ẩn</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          onClick={() => {
                            setViewingDoc(doc);
                            setIsViewModalOpen(true);
                          }}
                          className="btn btn-ghost btn-sm"
                          title="Xem chi tiết"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => openEditModal(doc)}
                          className="btn btn-ghost btn-sm"
                          title="Sửa tài liệu"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteDocument(doc.id, doc.title)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#ef4444' }}
                          title="Xóa tài liệu"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PHÂN TRANG TÀI LIỆU */}
        {filteredDocs.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(filteredDocs.length / pageSize) || 1}
              totalItems={filteredDocs.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              pageSizeOptions={[5, 10, 20]}
              itemName="tài liệu"
            />
          </div>
        )}
      </div>

      {/* Modal Thêm tài liệu mới */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Thêm Tài Liệu Mới Vào Kho Tri Thức">
        <form onSubmit={handleCreateDocument} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
              Tiêu đề tài liệu *
            </label>
            <input
              type="text"
              required
              value={createData.title}
              onChange={(e) => setCreateData({ ...createData, title: e.target.value })}
              placeholder="VD: Quy định về Hội phí và Quản lý Thu chi Quỹ"
              className="form-input"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Danh mục *
              </label>
              <input
                type="text"
                required
                value={createData.category}
                onChange={(e) => setCreateData({ ...createData, category: e.target.value })}
                placeholder="VD: Quy định, Hướng dẫn..."
                className="form-input"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Phạm vi quyền xem *
              </label>
              <select
                value={createData.audience}
                onChange={(e) => setCreateData({ ...createData, audience: e.target.value as DocumentAudience })}
                className="form-input"
              >
                <option value="public">Công khai (Public)</option>
                <option value="member">Hội viên (Member)</option>
                <option value="dept_head">Trưởng ban (Dept Head)</option>
                <option value="admin">Quản trị viên (Admin)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
              Nội dung tài liệu (Markdown) *
            </label>
            <textarea
              required
              rows={9}
              value={createData.content}
              onChange={(e) => setCreateData({ ...createData, content: e.target.value })}
              placeholder="Nhập nội dung markdown chuẩn. Chia mục rõ ràng theo ## 1. Tiêu đề mục..."
              className="form-input"
              style={{ fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              Tạo và Lập chỉ mục
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Sửa tài liệu */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Chỉnh Sửa Tài Liệu Tri Thức">
        <form onSubmit={handleUpdateDocument} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
              Tiêu đề tài liệu *
            </label>
            <input
              type="text"
              required
              value={editData.title}
              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              className="form-input"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Danh mục *
              </label>
              <input
                type="text"
                required
                value={editData.category}
                onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                className="form-input"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Phạm vi quyền xem *
              </label>
              <select
                value={editData.audience}
                onChange={(e) => setEditData({ ...editData, audience: e.target.value as DocumentAudience })}
                className="form-input"
              >
                <option value="public">Công khai (Public)</option>
                <option value="member">Hội viên (Member)</option>
                <option value="dept_head">Trưởng ban (Dept Head)</option>
                <option value="admin">Quản trị viên (Admin)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="is_active_checkbox"
              checked={editData.is_active}
              onChange={(e) => setEditData({ ...editData, is_active: e.target.checked })}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="is_active_checkbox" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Đang hoạt động (Kích hoạt cho Chatbot tìm kiếm)
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
              Nội dung markdown *
            </label>
            <textarea
              required
              rows={10}
              value={editData.content}
              onChange={(e) => setEditData({ ...editData, content: e.target.value })}
              className="form-input"
              style={{ fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              Lưu thay đổi & Cập nhật Vector
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Xem chi tiết tài liệu */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title={viewingDoc?.title || 'Chi Tiết Tài Liệu'}>
        {viewingDoc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.04)',
                fontSize: '0.8125rem',
              }}
            >
              <div><strong>Danh mục:</strong> {viewingDoc.category}</div>
              <div><strong>Quyền xem:</strong> {getAudienceBadge(viewingDoc.audience)}</div>
              <div><strong>Phiên bản:</strong> v{viewingDoc.version}</div>
              <div><strong>Số chunks:</strong> {viewingDoc.chunks_count ?? 0}</div>
            </div>
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-subtle)',
                maxHeight: '360px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: '0.8125rem',
                lineHeight: 1.6,
              }}
            >
              {viewingDoc.content}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
