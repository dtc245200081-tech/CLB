import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Download,
  Receipt,
  ExternalLink,
  BarChart3,
  FileText,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import {
  ExpenseRequest,
  LedgerEntry,
  FundReport,
  Department,
  Event,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { ModuleSubTabs } from '../../components/ModuleSubTabs';
import { Pagination, paginateArray } from '../../components/Pagination';
import { Alert } from '../../components/Alert';
import { FinancialReportVisuals } from '../../components/charts/FinancialReportVisuals';


export const FundManagementPage: React.FC = () => {
  const { user: currentUser, isAdmin, isTreasurer } = useAuth();
  const isFinanceManager = isAdmin || isTreasurer;

  const [activeTab, setActiveTab] = useState<'requests' | 'ledger' | 'reports'>('requests');

  // Requests state & pagination
  const [requests, setRequests] = useState<ExpenseRequest[]>([]);
  const [requestsFilter, setRequestsFilter] = useState<string>('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [requestsPage, setRequestsPage] = useState(1);
  const [requestsPageSize, setRequestsPageSize] = useState(10);

  // Ledger state & pagination
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'income' | 'expense' | ''>('');
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState<string>('');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(15);

  // Report state
  const [report, setReport] = useState<FundReport | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modals
  const [isCreateRequestOpen, setIsCreateRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    title: '',
    description: '',
    amount_requested: '',
    department_id: '' as string | number,
    event_id: '' as string | number,
  });

  const [reviewRequestModal, setReviewRequestModal] = useState<{
    isOpen: boolean;
    request: ExpenseRequest | null;
    action: 'approved' | 'rejected';
    review_note: string;
  }>({
    isOpen: false,
    request: null,
    action: 'approved',
    review_note: '',
  });

  const [recordExpenseModal, setRecordExpenseModal] = useState<{
    isOpen: boolean;
    request: ExpenseRequest | null;
    actual_amount: string;
    category: string;
    occurred_at: string;
    receipt_file: File | null;
    receipt_preview: string;
  }>({
    isOpen: false,
    request: null,
    actual_amount: '',
    category: 'Vật tư',
    occurred_at: '',
    receipt_file: null,
    receipt_preview: '',
  });

  const [recordIncomeModal, setRecordIncomeModal] = useState<{
    isOpen: boolean;
    amount: string;
    category: string;
    description: string;
    occurred_at: string;
    receipt_file: File | null;
    receipt_preview: string;
  }>({
    isOpen: false,
    amount: '',
    category: 'Tài trợ',
    description: '',
    occurred_at: '',
    receipt_file: null,
    receipt_preview: '',
  });

  const [voidEntryModal, setVoidEntryModal] = useState<{
    isOpen: boolean;
    entry: LedgerEntry | null;
    void_reason: string;
  }>({
    isOpen: false,
    entry: null,
    void_reason: '',
  });

  // Fetch functions
  const fetchRequests = async () => {
    try {
      const res = await api.funds.listExpenseRequests({
        status: requestsFilter ? (requestsFilter as any) : undefined,
      });
      setRequests(res);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const fetchLedger = async () => {
    try {
      const res = await api.funds.listLedgerEntries({
        type: ledgerTypeFilter || undefined,
        category: ledgerCategoryFilter || undefined,
        page_size: 100,
      });
      setLedgerEntries(res.items);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const fetchReport = async () => {
    try {
      const res = await api.funds.getReport();
      setReport(res);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  useEffect(() => {
    fetchRequests();
    if (isFinanceManager) {
      fetchLedger();
      fetchReport();
      api.departments.list({ page_size: 100 }).then((res) => setDepartments(res.items)).catch(() => {});
      api.events.list({ page_size: 50 }).then((res) => setEvents(res.items)).catch(() => {});
    }
  }, [isFinanceManager, requestsFilter, ledgerTypeFilter, ledgerCategoryFilter]);

  // Handlers
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(requestForm.amount_requested);
    if (!amt || amt <= 0) {
      setError('Số tiền đề xuất chi phải lớn hơn 0.');
      return;
    }

    try {
      await api.funds.createExpenseRequest({
        title: requestForm.title.trim(),
        description: requestForm.description.trim() || requestForm.title.trim(),
        amount_requested: amt,
        department_id: requestForm.department_id ? Number(requestForm.department_id) : undefined,
        event_id: requestForm.event_id ? Number(requestForm.event_id) : undefined,
      });
      setSuccess('Đã gửi đề xuất chi thành công! Đang chờ Ban Quản trị phê duyệt.');
      setIsCreateRequestOpen(false);
      fetchRequests();
      if (isFinanceManager) fetchReport();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleReviewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewRequestModal.request) return;

    try {
      await api.funds.reviewExpenseRequest(reviewRequestModal.request.id, {
        action: reviewRequestModal.action,
        review_note: reviewRequestModal.review_note.trim() || undefined,
      });
      setSuccess(`Đã ${reviewRequestModal.action === 'approved' ? 'phê duyệt' : 'từ chối'} đề xuất chi thành công!`);
      setReviewRequestModal({ isOpen: false, request: null, action: 'approved', review_note: '' });
      fetchRequests();
      if (isFinanceManager) fetchReport();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleRecordExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordExpenseModal.request) return;
    const amt = Number(recordExpenseModal.actual_amount);
    if (!amt || amt <= 0) {
      setError('Số tiền chi thực tế phải lớn hơn 0.');
      return;
    }

    try {
      let receiptPhotoPath: string | undefined = undefined;
      if (recordExpenseModal.receipt_file) {
        const uploadRes = await api.funds.uploadReceipt(recordExpenseModal.receipt_file);
        receiptPhotoPath = uploadRes.filename;
      }

      await api.funds.recordExpense({
        expense_request_id: recordExpenseModal.request.id,
        amount: amt,
        category: recordExpenseModal.category,
        description: recordExpenseModal.request.title,
        occurred_at: recordExpenseModal.occurred_at ? new Date(recordExpenseModal.occurred_at).toISOString() : undefined,
        receipt_photo_path: receiptPhotoPath,
      });

      setSuccess('Đã ghi nhận chi thực tế vào sổ quỹ thành công!');
      setRecordExpenseModal({
        isOpen: false,
        request: null,
        actual_amount: '',
        category: 'Vật tư',
        occurred_at: '',
        receipt_file: null,
        receipt_preview: '',
      });
      fetchRequests();
      fetchLedger();
      fetchReport();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleRecordIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(recordIncomeModal.amount);
    if (!amt || amt <= 0) {
      setError('Số tiền thu phải lớn hơn 0.');
      return;
    }

    try {
      let receiptPhotoPath: string | undefined = undefined;
      if (recordIncomeModal.receipt_file) {
        const uploadRes = await api.funds.uploadReceipt(recordIncomeModal.receipt_file);
        receiptPhotoPath = uploadRes.filename;
      }

      await api.funds.recordIncome({
        amount: amt,
        category: recordIncomeModal.category,
        description: recordIncomeModal.description.trim(),
        occurred_at: recordIncomeModal.occurred_at ? new Date(recordIncomeModal.occurred_at).toISOString() : undefined,
        receipt_photo_path: receiptPhotoPath,
      });

      setSuccess('Đã ghi nhận khoản thu vào sổ quỹ thành công!');
      setRecordIncomeModal({
        isOpen: false,
        amount: '',
        category: 'Tài trợ',
        description: '',
        occurred_at: '',
        receipt_file: null,
        receipt_preview: '',
      });
      fetchLedger();
      fetchReport();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleVoidEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidEntryModal.entry) return;
    if (!voidEntryModal.void_reason.trim()) {
      setError('Bắt buộc phải nhập lý do hủy bút toán.');
      return;
    }

    try {
      await api.funds.voidLedgerEntry(voidEntryModal.entry.id, voidEntryModal.void_reason.trim());
      setSuccess('Đã hủy bút toán thành công! Dữ liệu đã được điều chỉnh và ghi log kiểm toán.');
      setVoidEntryModal({ isOpen: false, entry: null, void_reason: '' });
      fetchLedger();
      fetchReport();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleExportCsv = async () => {
    try {
      const blob = await api.funds.exportCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `so_quy_clb_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const formatVND = (amt?: number | null) => {
    if (amt === null || amt === undefined) return '0 ₫';
    return Number(amt).toLocaleString('vi-VN') + ' ₫';
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

  const getRequestStatusBadge = (status: string) => {
    switch (status) {
      case 'requested':
        return <span className="badge badge-warning">Chờ duyệt</span>;
      case 'approved':
        return <span className="badge badge-primary">Đã duyệt chi</span>;
      case 'paid':
        return <span className="badge badge-success">Đã giải ngân</span>;
      case 'rejected':
        return <span className="badge badge-danger">Từ chối</span>;
      case 'cancelled':
        return <span className="badge badge-neutral">Đã hủy</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module="finance" />

      {/* HEADER */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-header-title">Quản Lý Thu Chi & Sổ Quỹ</h1>
            {isTreasurer && !isAdmin && (
              <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                Quyền Thủ Quỹ
              </span>
            )}
          </div>
          <p className="page-header-subtitle">
            Quy trình phê duyệt chi, giải ngân thực tế kèm chứng từ và kiểm soát an toàn số dư quỹ
          </p>
        </div>

        <div className="page-header-actions">
          {isFinanceManager && (
            <button onClick={handleExportCsv} className="btn btn-secondary btn-sm">
              <Download size={15} /> Xuất CSV Sổ quỹ
            </button>
          )}
          <button onClick={() => setIsCreateRequestOpen(true)} className="btn btn-primary btn-sm">
            <Plus size={16} /> Tạo đề xuất chi
          </button>
        </div>
      </div>

      {/* FEEDBACK ALERTS */}
      {error && (
        <Alert
          type="error"
          message={error}
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

      {/* SUMMARY BALANCE CARDS (FOR FINANCE MANAGERS) */}
      {report && isFinanceManager && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <div className="card" style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(99, 102, 241, 0.04))', border: '1px solid rgba(16, 185, 129, 0.25)', borderTop: '3px solid #059669' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Số Dư Quỹ Hiện Tại</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>
              {formatVND(report.current_balance)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Bất biến, tính toán từ các bút toán chưa hủy
            </div>
          </div>

          <div className="card" style={{ padding: '20px', borderTop: '3px solid #059669' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              <TrendingUp size={16} style={{ color: '#059669' }} /> Tổng Khoản Thu
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
              +{formatVND(report.total_income)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Hội phí thành viên & tài trợ
            </div>
          </div>

          <div className="card" style={{ padding: '20px', borderTop: '3px solid #dc2626' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              <TrendingDown size={16} style={{ color: '#dc2626' }} /> Tổng Khoản Chi
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
              -{formatVND(report.total_expense)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Chi sự kiện, vật tư, truyền thông
            </div>
          </div>
        </div>
      )}

      {/* UNIFIED SEGMENTED TABS */}
      <div className="segmented-tabs-wrapper">
        <div className="segmented-tabs">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`segmented-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
          >
            <FileText size={15} />
            <span>Đề xuất chi</span>
            <span className="segmented-tab-badge">{requests.length}</span>
          </button>
          {isFinanceManager && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`segmented-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
              >
                <Receipt size={15} />
                <span>Sổ quỹ</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`segmented-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
              >
                <BarChart3 size={15} />
                <span>Báo cáo</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* TAB 1: EXPENSE REQUESTS */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ width: '200px' }}>
              <select
                className="form-select"
                value={requestsFilter}
                onChange={(e) => setRequestsFilter(e.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="requested">Chờ phê duyệt</option>
                <option value="approved">Đã duyệt chi</option>
                <option value="paid">Đã giải ngân</option>
                <option value="rejected">Bị từ chối</option>
              </select>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Nội dung chi / Đề xuất</th>
                  <th>Số tiền</th>
                  <th>Người đề xuất</th>
                  <th>Ban / Sự kiện</th>
                  <th>Trạng thái</th>
                  <th>Người duyệt</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      Không có đề xuất chi nào.
                    </td>
                  </tr>
                ) : (
                  paginateArray(requests, requestsPage, requestsPageSize).map((req) => (
                    <tr key={req.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{req.title}</div>
                        {req.description && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{req.description}</div>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>{formatVND(req.amount_requested)}</td>
                      <td>
                        <div>{req.requested_by_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {formatDateTime(req.created_at)}
                        </div>
                      </td>
                      <td>
                        <div>{req.department_name || 'Toàn CLB'}</div>
                        {req.event_title && (
                          <div style={{ fontSize: '0.75rem', color: '#818cf8' }}>{req.event_title}</div>
                        )}
                      </td>
                      <td>{getRequestStatusBadge(req.status)}</td>
                      <td>
                        {(req.reviewer_name || req.reviewed_by_name) ? (
                          <div>
                            <div>{req.reviewer_name || req.reviewed_by_name}</div>
                            {req.review_note && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {req.review_note}
                              </div>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          {/* ADMIN APPROVE / REJECT BUTTONS */}
                          {isAdmin && req.status === 'requested' && (
                            <>
                              <button
                                onClick={() =>
                                  setReviewRequestModal({
                                    isOpen: true,
                                    request: req,
                                    action: 'approved',
                                    review_note: '',
                                  })
                                }
                                className="btn btn-primary btn-sm"
                                title="Phê duyệt khoản chi"
                              >
                                Duyệt
                              </button>
                              <button
                                onClick={() =>
                                  setReviewRequestModal({
                                    isOpen: true,
                                    request: req,
                                    action: 'rejected',
                                    review_note: '',
                                  })
                                }
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)' }}
                                title="Từ chối chi"
                              >
                                Từ chối
                              </button>
                            </>
                          )}

                          {/* FINANCE MANAGER RECORD ACTUAL EXPENSE */}
                          {isFinanceManager && req.status === 'approved' && (
                            <button
                              onClick={() =>
                                setRecordExpenseModal({
                                  isOpen: true,
                                  request: req,
                                  actual_amount: String(req.amount_requested),
                                  category: 'Vật tư',
                                  occurred_at: new Date().toISOString().slice(0, 16),
                                  receipt_file: null,
                                  receipt_preview: '',
                                })
                              }
                              className="btn btn-primary btn-sm"
                              title="Ghi nhận số tiền chi thực tế và biên lai"
                            >
                              <Receipt size={14} style={{ marginRight: '4px' }} /> Giải ngân chi
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {requests.length > 0 && (
            <Pagination
              currentPage={requestsPage}
              totalPages={Math.ceil(requests.length / requestsPageSize) || 1}
              totalItems={requests.length}
              pageSize={requestsPageSize}
              onPageChange={setRequestsPage}
              onPageSizeChange={(newSize) => {
                setRequestsPageSize(newSize);
                setRequestsPage(1);
              }}
              pageSizeOptions={[5, 10, 20]}
              itemName="đề xuất chi"
            />
          )}
        </div>
      )}

      {/* TAB 2: LEDGER (SỔ QUỸ) */}
      {activeTab === 'ledger' && isFinanceManager && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setLedgerTypeFilter('')}
                className={`btn btn-sm ${ledgerTypeFilter === '' ? 'btn-primary' : 'btn-ghost'}`}
              >
                Tất cả bút toán
              </button>
              <button
                onClick={() => setLedgerTypeFilter('income')}
                className={`btn btn-sm ${ledgerTypeFilter === 'income' ? 'btn-primary' : 'btn-ghost'}`}
              >
                Thu quỹ
              </button>
              <button
                onClick={() => setLedgerTypeFilter('expense')}
                className={`btn btn-sm ${ledgerTypeFilter === 'expense' ? 'btn-primary' : 'btn-ghost'}`}
              >
                Chi quỹ
              </button>
              <select
                className="form-select form-select-sm"
                style={{ width: '160px' }}
                value={ledgerCategoryFilter}
                onChange={(e) => setLedgerCategoryFilter(e.target.value)}
              >
                <option value="">Tất cả hạng mục</option>
                <option value="Hội phí">Hội phí</option>
                <option value="Tài trợ">Tài trợ</option>
                <option value="Vật tư">Vật tư</option>
                <option value="Truyền thông">Truyền thông</option>
                <option value="Tổ chức sự kiện">Tổ chức sự kiện</option>
                <option value="Khác">Khác</option>
              </select>
            </div>

            <button
              onClick={() =>
                setRecordIncomeModal({
                  isOpen: true,
                  amount: '',
                  category: 'Tài trợ',
                  description: '',
                  occurred_at: new Date().toISOString().slice(0, 16),
                  receipt_file: null,
                  receipt_preview: '',
                })
              }
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} /> Ghi nhận thu khác (Tài trợ / Bán vé)
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Phân loại</th>
                  <th>Hạng mục</th>
                  <th>Số tiền (VND)</th>
                  <th>Mô tả / Chứng từ</th>
                  <th>Người ghi</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      Không có bút toán nào trong sổ quỹ.
                    </td>
                  </tr>
                ) : (
                  paginateArray(ledgerEntries, ledgerPage, ledgerPageSize).map((entry) => (
                    <tr key={entry.id} style={{ opacity: entry.voided_at ? 0.6 : 1 }}>
                      <td>{formatDateTime(entry.occurred_at)}</td>
                      <td>
                        <span className={`badge ${entry.type === 'income' ? 'badge-success' : 'badge-danger'}`}>
                          {entry.type === 'income' ? 'THU' : 'CHI'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{entry.category}</td>
                      <td style={{ fontWeight: 700, color: entry.type === 'income' ? '#059669' : '#dc2626' }}>
                        {entry.type === 'income' ? '+' : '-'}{formatVND(entry.amount)}
                      </td>
                      <td>
                        <div>{entry.description}</div>
                        {entry.receipt_photo_path && (
                          <a
                            href={`http://localhost:8000/api/funds/receipt-photos/${entry.receipt_photo_path}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: 0, color: 'var(--primary)', fontSize: '0.78rem' }}
                          >
                            <ExternalLink size={12} style={{ marginRight: '3px' }} /> Hóa đơn / Chứng từ
                          </a>
                        )}
                      </td>
                      <td>{entry.recorded_by_name || 'Hệ thống'}</td>
                      <td>
                        {entry.voided_at ? (
                          <div>
                            <span className="badge badge-danger">ĐÃ HỦY</span>
                            <div style={{ fontSize: '0.72rem', color: '#dc2626' }}>{entry.void_reason}</div>
                          </div>
                        ) : (
                          <span className="badge badge-success">Hiệu lực</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!entry.voided_at && (
                          <button
                            onClick={() => setVoidEntryModal({ isOpen: true, entry, void_reason: '' })}
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            title="Hủy bút toán sai sót"
                          >
                            Hủy bút toán
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {ledgerEntries.length > 0 && (
            <Pagination
              currentPage={ledgerPage}
              totalPages={Math.ceil(ledgerEntries.length / ledgerPageSize) || 1}
              totalItems={ledgerEntries.length}
              pageSize={ledgerPageSize}
              onPageChange={setLedgerPage}
              onPageSizeChange={(newSize) => {
                setLedgerPageSize(newSize);
                setLedgerPage(1);
              }}
              pageSizeOptions={[10, 15, 30, 50]}
              itemName="bút toán"
            />
          )}
        </div>
      )}

      {/* TAB 3: REPORTS (BÁO CÁO TÀI CHÍNH) */}
      {activeTab === 'reports' && report && isFinanceManager && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* VISUAL CHARTS & PERIOD ANALYSIS (TUẦN, THÁNG, KỲ HỌC, NĂM) */}
          <FinancialReportVisuals
            weeklySummary={report.weekly_summary || []}
            monthlySummary={report.monthly_summary || []}
            semesterSummary={report.semester_summary || []}
            yearlySummary={report.yearly_summary || []}
            categorySummary={report.category_summary || report.by_category || []}
            departmentSummary={report.department_summary || []}
            totalIncome={report.total_income}
            totalExpense={report.total_expense}
            currentBalance={report.current_balance}
            showDonut={true}
            defaultPeriod="month"
          />


          {/* Fee periods collection report */}
          <div className="card" style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>
              Tiến Độ Thu Các Kỳ Hội Phí
            </h4>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Tên kỳ thu</th>
                    <th>Phải thu</th>
                    <th>Đã thu</th>
                    <th>Còn nợ</th>
                    <th>Tỷ lệ thu</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.fee_periods || []).map((fp) => (
                    <tr key={fp.period_id}>
                      <td style={{ fontWeight: 600 }}>{fp.period_name}</td>
                      <td>{formatVND(fp.total_expected)}</td>
                      <td style={{ color: '#059669', fontWeight: 600 }}>{formatVND(fp.total_collected)}</td>
                      <td style={{ color: '#dc2626', fontWeight: 600 }}>{formatVND(fp.total_debt)}</td>
                      <td>
                        <span className="badge badge-success">{fp.collection_rate_percent}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TẠO ĐỀ XUẤT CHI */}
      {isCreateRequestOpen && (
        <Modal
          isOpen={isCreateRequestOpen}
          onClose={() => setIsCreateRequestOpen(false)}
          title="Tạo đề xuất chi kinh phí"
        >
          <form onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Tiêu đề đề xuất chi *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="VD: Mua quà tặng và nước uống cho hội thảo..."
                value={requestForm.title}
                onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Mô tả lý do / Dự toán chi tiết</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Chi tiết các khoản mục cần mua sắm, chuẩn bị..."
                value={requestForm.description}
                onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Số tiền đề xuất (VND) *</label>
              <input
                type="number"
                className="form-input"
                required
                min={1000}
                step={1000}
                placeholder="VD: 300000"
                value={requestForm.amount_requested}
                onChange={(e) => setRequestForm({ ...requestForm, amount_requested: e.target.value })}
              />
            </div>

            {isAdmin && (
              <div>
                <label className="form-label">Ban chuyên môn liên quan</label>
                <select
                  className="form-select"
                  value={requestForm.department_id}
                  onChange={(e) => setRequestForm({ ...requestForm, department_id: e.target.value })}
                >
                  <option value="">Toàn CLB</option>
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
                value={requestForm.event_id}
                onChange={(e) => setRequestForm({ ...requestForm, event_id: e.target.value })}
              >
                <option value="">Không gắn sự kiện</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button type="button" onClick={() => setIsCreateRequestOpen(false)} className="btn btn-secondary">
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Gửi đề xuất
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL DUYỆT / TỪ CHỐI ĐỀ XUẤT (ADMIN ONLY) */}
      {reviewRequestModal.isOpen && reviewRequestModal.request && (
        <Modal
          isOpen={reviewRequestModal.isOpen}
          onClose={() => setReviewRequestModal({ isOpen: false, request: null, action: 'approved', review_note: '' })}
          title={`${reviewRequestModal.action === 'approved' ? 'Phê duyệt' : 'Từ chối'} đề xuất chi`}
        >
          <form onSubmit={handleReviewRequest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem' }}>
              <div>Khoản chi: <strong>{reviewRequestModal.request.title}</strong></div>
              <div>Số tiền đề xuất: <strong style={{ color: '#fbbf24' }}>{formatVND(reviewRequestModal.request.amount_requested)}</strong></div>
              <div>Người tạo: <strong>{reviewRequestModal.request.requested_by_name}</strong></div>
            </div>

            {reviewRequestModal.request.requested_by_id === currentUser?.id && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem' }}>
                ⚠️ Lưu ý: Theo nguyên tắc kiểm soát độc lập, người tạo đề xuất không được tự phê duyệt khoản chi của chính mình nếu CLB còn Quản trị viên khác đang hoạt động.
              </div>
            )}

            <div>
              <label className="form-label">
                {reviewRequestModal.action === 'approved' ? 'Ghi chú phê duyệt (tùy chọn)' : 'Lý do từ chối *'}
              </label>
              <textarea
                className="form-input"
                rows={3}
                required={reviewRequestModal.action === 'rejected'}
                placeholder={reviewRequestModal.action === 'approved' ? 'Ý kiến chỉ đạo...' : 'Nêu rõ lý do không đồng ý giải ngân...'}
                value={reviewRequestModal.review_note}
                onChange={(e) => setReviewRequestModal({ ...reviewRequestModal, review_note: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setReviewRequestModal({ isOpen: false, request: null, action: 'approved', review_note: '' })}
                className="btn btn-secondary"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={reviewRequestModal.action === 'rejected' ? { background: 'var(--danger)' } : {}}
              >
                {reviewRequestModal.action === 'approved' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL GHI NHẬN CHI THỰC TẾ & CHỨNG TỪ */}
      {recordExpenseModal.isOpen && recordExpenseModal.request && (
        <Modal
          isOpen={recordExpenseModal.isOpen}
          onClose={() => setRecordExpenseModal({ ...recordExpenseModal, isOpen: false, request: null })}
          title={`Giải ngân chi: ${recordExpenseModal.request.title}`}
        >
          <form onSubmit={handleRecordExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem' }}>
              <div>Số tiền đã duyệt: <strong>{formatVND(recordExpenseModal.request.amount_requested)}</strong></div>
              <div>Hạn mức tối đa được phép chi (vượt không quá 10%): <strong style={{ color: '#059669' }}>{formatVND(Math.floor(recordExpenseModal.request.amount_requested * 1.1))}</strong></div>
            </div>

            <div>
              <label className="form-label">Số tiền chi thực tế (VND) *</label>
              <input
                type="number"
                className="form-input"
                required
                min={1000}
                step={1000}
                value={recordExpenseModal.actual_amount}
                onChange={(e) => setRecordExpenseModal({ ...recordExpenseModal, actual_amount: e.target.value })}
              />
              {Number(recordExpenseModal.actual_amount) > recordExpenseModal.request.amount_requested * 1.1 && (
                <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '4px' }}>
                  ⚠️ Chi thực tế vượt quá 10% số tiền đã duyệt. Hệ thống sẽ từ chối và yêu cầu Admin duyệt lại!
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Hạng mục chi</label>
                <select
                  className="form-select"
                  value={recordExpenseModal.category}
                  onChange={(e) => setRecordExpenseModal({ ...recordExpenseModal, category: e.target.value })}
                >
                  <option value="Vật tư">Vật tư</option>
                  <option value="Tổ chức sự kiện">Tổ chức sự kiện</option>
                  <option value="Truyền thông">Truyền thông</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>

              <div>
                <label className="form-label">Thời điểm phát sinh</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={recordExpenseModal.occurred_at}
                  onChange={(e) => setRecordExpenseModal({ ...recordExpenseModal, occurred_at: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Ảnh hóa đơn / Biên lai chứng từ (Tối đa 2MB)</label>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const f = e.target.files[0];
                    setRecordExpenseModal({
                      ...recordExpenseModal,
                      receipt_file: f,
                      receipt_preview: URL.createObjectURL(f),
                    });
                  }
                }}
                className="form-input"
              />
              {recordExpenseModal.receipt_preview && (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                  <img
                    src={recordExpenseModal.receipt_preview}
                    alt="Chứng từ"
                    style={{ maxHeight: '160px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setRecordExpenseModal({ ...recordExpenseModal, isOpen: false, request: null })}
                className="btn btn-secondary"
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Ghi nhận giải ngân
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL GHI NHẬN THU KHÁC */}
      {recordIncomeModal.isOpen && (
        <Modal
          isOpen={recordIncomeModal.isOpen}
          onClose={() => setRecordIncomeModal({ ...recordIncomeModal, isOpen: false })}
          title="Ghi nhận khoản thu khác vào sổ quỹ"
        >
          <form onSubmit={handleRecordIncomeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Số tiền thu (VND) *</label>
              <input
                type="number"
                className="form-input"
                required
                min={1000}
                step={1000}
                placeholder="VD: 500000"
                value={recordIncomeModal.amount}
                onChange={(e) => setRecordIncomeModal({ ...recordIncomeModal, amount: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Hạng mục thu</label>
                <select
                  className="form-select"
                  value={recordIncomeModal.category}
                  onChange={(e) => setRecordIncomeModal({ ...recordIncomeModal, category: e.target.value })}
                >
                  <option value="Tài trợ">Tài trợ</option>
                  <option value="Bán vé">Bán vé sự kiện</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>

              <div>
                <label className="form-label">Thời điểm phát sinh</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={recordIncomeModal.occurred_at}
                  onChange={(e) => setRecordIncomeModal({ ...recordIncomeModal, occurred_at: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Mô tả chi tiết *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="VD: Nhận tài trợ từ Doanh nghiệp X..."
                value={recordIncomeModal.description}
                onChange={(e) => setRecordIncomeModal({ ...recordIncomeModal, description: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Ảnh chứng từ / Biên lai (tùy chọn, tối đa 2MB)</label>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const f = e.target.files[0];
                    setRecordIncomeModal({
                      ...recordIncomeModal,
                      receipt_file: f,
                      receipt_preview: URL.createObjectURL(f),
                    });
                  }
                }}
                className="form-input"
              />
              {recordIncomeModal.receipt_preview && (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                  <img
                    src={recordIncomeModal.receipt_preview}
                    alt="Chứng từ"
                    style={{ maxHeight: '160px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setRecordIncomeModal({ ...recordIncomeModal, isOpen: false })}
                className="btn btn-secondary"
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Ghi vào sổ quỹ
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL HỦY BÚT TOÁN (VOID) */}
      {voidEntryModal.isOpen && voidEntryModal.entry && (
        <Modal
          isOpen={voidEntryModal.isOpen}
          onClose={() => setVoidEntryModal({ isOpen: false, entry: null, void_reason: '' })}
          title="Hủy bút toán trong sổ quỹ"
        >
          <form onSubmit={handleVoidEntry} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', padding: '12px', borderRadius: '8px', fontSize: '0.85rem' }}>
              ⚠️ Theo nguyên tắc bất biến của hệ thống tài chính, bút toán sẽ không bị xóa khỏi cơ sở dữ liệu mà sẽ được đánh dấu ĐÃ HỦY (VOID) kèm lý do và ghi nhận kiểm toán tự động.
            </div>

            <div>
              <label className="form-label">Lý do hủy bút toán *</label>
              <textarea
                className="form-input"
                rows={3}
                required
                placeholder="VD: Nhập nhầm số tiền, ghi nhận trùng lặp..."
                value={voidEntryModal.void_reason}
                onChange={(e) => setVoidEntryModal({ ...voidEntryModal, void_reason: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setVoidEntryModal({ isOpen: false, entry: null, void_reason: '' })}
                className="btn btn-secondary"
              >
                Đóng
              </button>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--danger)' }}>
                Xác nhận hủy bút toán
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
