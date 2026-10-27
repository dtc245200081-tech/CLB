import React, { useState, useEffect } from 'react';
import {
  Coins,
  CreditCard,
  Plus,
  Download,
  UserCheck,
  ExternalLink,
  Lock,
  Unlock,
  Check,
  Clock,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import {
  FeePeriod,
  MemberFee,
  PaymentClaim,
  Department,
  User,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { ModuleSubTabs } from '../../components/ModuleSubTabs';
import { Pagination, paginateArray } from '../../components/Pagination';
import { Alert } from '../../components/Alert';

export const FeeManagementPage: React.FC = () => {
  const { isAdmin, isTreasurer } = useAuth();
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const isFinanceManager = isAdmin || isTreasurer;

  const [activeTab, setActiveTab] = useState<'fees' | 'claims' | 'periods'>('fees');

  const [periods, setPeriods] = useState<FeePeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | ''>('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [candidateMembers, setCandidateMembers] = useState<User[]>([]);

  // Member fees list & pagination state
  const [memberFees, setMemberFees] = useState<MemberFee[]>([]);
  const [feePage, setFeePage] = useState<number>(1);
  const [feePageSize, setFeePageSize] = useState<number>(15);
  const [feeTotal, setFeeTotal] = useState<number>(0);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [isOverdueOnly, setIsOverdueOnly] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Claims queue state & pagination
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [claimsFilter, setClaimsFilter] = useState<'pending' | 'confirmed' | 'rejected' | ''>('pending');
  const [claimsPage, setClaimsPage] = useState<number>(1);
  const [claimsPageSize, setClaimsPageSize] = useState<number>(10);

  // Periods tab pagination
  const [periodsPage, setPeriodsPage] = useState<number>(1);

  // Modals
  const [isCreatePeriodOpen, setIsCreatePeriodOpen] = useState(false);
  const [newPeriodForm, setNewPeriodForm] = useState({
    name: '',
    amount: '',
    due_date: '',
    description: '',
  });

  const [cashPaymentModal, setCashPaymentModal] = useState<{
    isOpen: boolean;
    memberFee: MemberFee | null;
    amount: string;
    note: string;
  }>({
    isOpen: false,
    memberFee: null,
    amount: '',
    note: '',
  });

  const [discountModal, setDiscountModal] = useState<{
    isOpen: boolean;
    memberFee: MemberFee | null;
    discount_amount: string;
    discount_reason: string;
  }>({
    isOpen: false,
    memberFee: null,
    discount_amount: '',
    discount_reason: '',
  });

  const [rejectClaimModal, setRejectClaimModal] = useState<{
    isOpen: boolean;
    claim: PaymentClaim | null;
    review_note: string;
  }>({
    isOpen: false,
    claim: null,
    review_note: '',
  });

  const [addMemberModal, setAddMemberModal] = useState<{
    isOpen: boolean;
    userId: number | '';
    amountDue: string;
    discountAmount: string;
    discountReason: string;
  }>({
    isOpen: false,
    userId: '',
    amountDue: '',
    discountAmount: '0',
    discountReason: '',
  });

  // Fetch initial data
  const fetchPeriods = async () => {
    try {
      const res = await api.fees.listPeriods();
      setPeriods(res);
      if (res.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(res[0].id);
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const fetchMemberFees = async () => {
    if (!selectedPeriodId) return;
    setIsLoading(true);
    try {
      const res = await api.fees.listMemberFees(Number(selectedPeriodId), {
        status: statusFilter ? (statusFilter as any) : undefined,
        department_id: deptFilter ? Number(deptFilter) : undefined,
        is_overdue: isOverdueOnly ? true : undefined,
        page: feePage,
        page_size: feePageSize,
      });
      setMemberFees(res.items);
      setFeeTotal(res.total);
    } catch (err: any) {
      const msg = err?.message || 'Không thể tải danh sách nộp hội phí.';
      setError(msg);
      showError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClaims = async () => {
    try {
      const res = await api.fees.listClaims({
        status: claimsFilter ? (claimsFilter as any) : undefined,
        period_id: selectedPeriodId ? Number(selectedPeriodId) : undefined,
      });
      setClaims(res);
    } catch (err: any) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  useEffect(() => {
    fetchPeriods();
    if (isFinanceManager) {
      api.departments.list({ page_size: 100 }).then((res) => setDepartments(res.items)).catch(() => {});
      api.users.list({ page_size: 300 }).then((res) => setCandidateMembers(res.items)).catch(() => {});
    }
  }, [isFinanceManager]);

  useEffect(() => {
    if (selectedPeriodId) {
      fetchMemberFees();
      fetchClaims();
    }
  }, [selectedPeriodId, statusFilter, deptFilter, isOverdueOnly, feePage, feePageSize, claimsFilter]);

  // Reset page when filter changes
  useEffect(() => {
    setFeePage(1);
  }, [statusFilter, deptFilter, isOverdueOnly, selectedPeriodId]);

  // Form Handlers
  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(newPeriodForm.amount);
    if (!amt || amt <= 0) {
      setError('Số tiền hội phí phải lớn hơn 0.');
      showError('Số tiền hội phí phải lớn hơn 0.');
      return;
    }

    try {
      const created = await api.fees.createPeriod({
        name: newPeriodForm.name.trim(),
        amount: amt,
        due_date: new Date(newPeriodForm.due_date).toISOString(),
        description: newPeriodForm.description.trim() || undefined,
      });
      const msg = `Đã tạo kỳ thu "${created.name}" và tự động sinh khoản thu cho toàn bộ thành viên đang hoạt động!`;
      setSuccess(msg);
      showSuccess(msg);
      setIsCreatePeriodOpen(false);
      fetchPeriods();
      setSelectedPeriodId(created.id);
    } catch (err: any) {
      const msg = err?.message || 'Không thể tạo kỳ thu mới.';
      setError(msg);
      showError(err);
    }
  };

  const handleClosePeriod = async (period: FeePeriod) => {
    const nextStatus = period.status === 'open' ? 'closed' : 'open';
    const confirmed = await confirm({
      title: nextStatus === 'closed' ? 'Đóng kỳ thu hội phí' : 'Mở lại kỳ thu hội phí',
      message: nextStatus === 'closed'
        ? `Bạn có chắc chắn muốn đóng kỳ thu "${period.name}"? Kỳ thu đã đóng sẽ không thể ghi nhận thêm thanh toán mới.`
        : `Bạn có chắc chắn muốn mở lại kỳ thu "${period.name}" để tiếp tục ghi nhận thu phí?`,
      confirmText: nextStatus === 'closed' ? 'Đóng kỳ thu' : 'Mở lại kỳ thu',
      type: nextStatus === 'closed' ? 'warning' : 'info',
    });
    if (!confirmed) return;

    try {
      await api.fees.updatePeriod(period.id, { status: nextStatus });
      const msg = `Đã ${nextStatus === 'closed' ? 'đóng' : 'mở lại'} kỳ thu thành công.`;
      setSuccess(msg);
      showSuccess(msg);
      fetchPeriods();
    } catch (err: any) {
      const msg = err?.message || 'Không thể cập nhật trạng thái kỳ thu.';
      setError(msg);
      showError(err);
    }
  };

  const handleRecordCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashPaymentModal.memberFee) return;

    const amt = Number(cashPaymentModal.amount);
    if (!amt || amt <= 0) {
      setError('Số tiền thanh toán phải lớn hơn 0.');
      showError('Số tiền thanh toán phải lớn hơn 0.');
      return;
    }

    try {
      const res = await api.fees.recordPayment({
        member_fee_id: cashPaymentModal.memberFee.id,
        amount: amt,
        method: 'cash',
        note: cashPaymentModal.note.trim() || undefined,
      });
      const msg = `Ghi nhận thanh toán thành công! Mã phiếu thu: ${res.receipt_code}`;
      setSuccess(msg);
      showSuccess(msg);
      setCashPaymentModal({ isOpen: false, memberFee: null, amount: '', note: '' });
      fetchMemberFees();
    } catch (err: any) {
      const msg = err?.message || 'Lỗi khi ghi nhận thanh toán tiền mặt.';
      setError(msg);
      showError(err);
    }
  };

  const handleUpdateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountModal.memberFee) return;

    const amt = Number(discountModal.discount_amount);
    if (amt < 0) {
      setError('Số tiền miễn giảm không được âm.');
      showError('Số tiền miễn giảm không được âm.');
      return;
    }
    if (amt > 0 && !discountModal.discount_reason.trim()) {
      setError('Bắt buộc phải nhập lý do miễn giảm.');
      showError('Vui lòng nhập lý do miễn giảm hội phí.');
      return;
    }

    try {
      await api.fees.updateDiscount(discountModal.memberFee.id, {
        discount_amount: amt,
        discount_reason: discountModal.discount_reason.trim(),
      });
      const msg = 'Đã cập nhật mức miễn giảm hội phí thành công!';
      setSuccess(msg);
      showSuccess(msg);
      setDiscountModal({ isOpen: false, memberFee: null, discount_amount: '', discount_reason: '' });
      fetchMemberFees();
    } catch (err: any) {
      const msg = err?.message || 'Lỗi khi cập nhật miễn giảm.';
      setError(msg);
      showError(err);
    }
  };

  const handleConfirmClaim = async (claim: PaymentClaim) => {
    const confirmed = await confirm({
      title: 'Duyệt chuyển khoản hội phí',
      message: `Xác nhận duyệt chuyển khoản ${formatVND(claim.amount)} cho thành viên "${claim.user_name}"? Thao tác này sẽ tự động tạo phiếu thu và cập nhật sổ quỹ.`,
      confirmText: 'Duyệt thanh toán',
      type: 'success',
    });
    if (!confirmed) return;

    try {
      await api.fees.reviewClaim(claim.id, 'confirmed');
      const msg = `Đã duyệt và ghi nhận thanh toán cho ${claim.user_name}!`;
      setSuccess(msg);
      showSuccess(msg);
      fetchClaims();
      fetchMemberFees();
    } catch (err: any) {
      const msg = err?.message || 'Không thể duyệt chuyển khoản này.';
      setError(msg);
      showError(err);
    }
  };

  const handleRejectClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectClaimModal.claim) return;
    if (!rejectClaimModal.review_note.trim()) {
      setError('Vui lòng nhập lý do từ chối biên lai chuyển khoản.');
      return;
    }

    try {
      await api.fees.reviewClaim(rejectClaimModal.claim.id, 'rejected', rejectClaimModal.review_note.trim());
      setSuccess(`Đã từ chối báo cáo chuyển khoản của ${rejectClaimModal.claim.user_name}.`);
      setRejectClaimModal({ isOpen: false, claim: null, review_note: '' });
      fetchClaims();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleAddMemberToPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriodId || !addMemberModal.userId) return;

    try {
      await api.fees.addMemberToPeriod(Number(selectedPeriodId), {
        user_id: Number(addMemberModal.userId),
        amount_due: addMemberModal.amountDue ? Number(addMemberModal.amountDue) : undefined,
        discount_amount: addMemberModal.discountAmount ? Number(addMemberModal.discountAmount) : 0,
        discount_reason: addMemberModal.discountReason ? addMemberModal.discountReason : undefined,
      });
      setSuccess('Đã thêm thành viên vào kỳ thu hội phí!');
      setAddMemberModal({ isOpen: false, userId: '', amountDue: '', discountAmount: '0', discountReason: '' });
      fetchMemberFees();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleExportCsv = async () => {
    if (!selectedPeriodId) return;
    try {
      const blob = await api.fees.exportCsv(Number(selectedPeriodId));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `danh_sach_hoi_phi_ky_${selectedPeriodId}.csv`;
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

  const getStatusBadge = (fee: MemberFee) => {
    switch (fee.status) {
      case 'paid':
        return <span className="badge badge-success">Đã hoàn thành</span>;
      case 'waived':
        return <span className="badge badge-primary">Được miễn đóng</span>;
      case 'partial':
        return <span className="badge badge-warning">Đã đóng 1 phần</span>;
      case 'unpaid':
        return <span className="badge badge-danger">Chưa đóng</span>;
    }
  };

  const selectedPeriod = periods.find((p) => p.id === Number(selectedPeriodId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module="finance" />

      {/* HEADER */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-header-title">Quản Lý Hội Phí</h1>
            {isTreasurer && !isAdmin && (
              <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                Quyền Thủ Quỹ
              </span>
            )}
          </div>
          <p className="page-header-subtitle">
            {isFinanceManager
              ? 'Tạo kỳ thu, theo dõi tiến độ nộp quỹ, ghi nhận tiền mặt và đối soát biên lai chuyển khoản'
              : 'Theo dõi tình trạng nộp hội phí của các thành viên trong ban chuyên môn'}
          </p>
        </div>

        {isFinanceManager && (
          <div className="page-header-actions">
            <button onClick={handleExportCsv} className="btn btn-secondary btn-sm" disabled={!selectedPeriodId}>
              <Download size={15} /> Xuất CSV
            </button>
            {isAdmin && (
              <button onClick={() => setIsCreatePeriodOpen(true)} className="btn btn-primary btn-sm">
                <Plus size={16} /> Tạo kỳ thu mới
              </button>
            )}
          </div>
        )}
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

      {/* UNIFIED SEGMENTED TABS & PERIOD SELECTOR */}
      <div className="segmented-tabs-wrapper">
        <div className="segmented-tabs">
          <button
            type="button"
            onClick={() => setActiveTab('fees')}
            className={`segmented-tab-btn ${activeTab === 'fees' ? 'active' : ''}`}
          >
            <UserCheck size={15} />
            <span>Danh sách đóng</span>
          </button>
          {isFinanceManager && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('claims')}
                className={`segmented-tab-btn ${activeTab === 'claims' ? 'active' : ''}`}
              >
                <Clock size={15} />
                <span>Duyệt nộp</span>
                {claims.filter((c) => c.status === 'pending').length > 0 && (
                  <span className="segmented-tab-badge">
                    {claims.filter((c) => c.status === 'pending').length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('periods')}
                className={`segmented-tab-btn ${activeTab === 'periods' ? 'active' : ''}`}
              >
                <CreditCard size={15} />
                <span>Kỳ thu</span>
              </button>
            </>
          )}
        </div>

        {/* PERIOD SELECTOR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Kỳ thu đang chọn:</span>
          <select
            className="form-select form-select-sm"
            style={{ width: '240px' }}
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.status === 'open' ? 'Mở' : 'Đóng'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: DANH SÁCH NỘP PHÍ */}
      {activeTab === 'fees' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary Banner */}
          {selectedPeriod && (
            <div
              className="card"
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{selectedPeriod.name}</h4>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Mức thu: <strong>{formatVND(selectedPeriod.amount)}</strong> | Hạn chót: <strong>{formatDateTime(selectedPeriod.due_date)}</strong> | Trạng thái: <strong style={{ color: selectedPeriod.status === 'open' ? '#059669' : '#dc2626' }}>{selectedPeriod.status === 'open' ? 'Đang mở' : 'Đã đóng sổ'}</strong>
                </div>
              </div>

              {isFinanceManager && selectedPeriod.status === 'open' && (
                <button
                  onClick={() => setAddMemberModal({ isOpen: true, userId: '', amountDue: String(selectedPeriod.amount), discountAmount: '0', discountReason: '' })}
                  className="btn btn-secondary btn-sm"
                >
                  <Plus size={14} /> Thêm thành viên vào kỳ này
                </button>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="card" style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
            <div style={{ width: '180px' }}>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="unpaid">Chưa đóng</option>
                <option value="partial">Đã đóng 1 phần</option>
                <option value="paid">Đã hoàn thành</option>
                <option value="waived">Được miễn đóng</option>
              </select>
            </div>

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
                ⚠️ Chỉ hiện thành viên quá hạn
              </span>
            </label>
          </div>

          {/* Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Thành viên / MSSV</th>
                  <th>Ban chuyên môn</th>
                  {isFinanceManager && <th>Phải nộp</th>}
                  {isFinanceManager && <th>Miễn giảm</th>}
                  {isFinanceManager && <th>Đã nộp</th>}
                  {isFinanceManager && <th>Còn nợ</th>}
                  <th>Trạng thái</th>
                  <th>Hạn nộp</th>
                  {isFinanceManager && <th style={{ textAlign: 'right' }}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={isFinanceManager ? 9 : 5} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      Đang tải danh sách nộp phí...
                    </td>
                  </tr>
                ) : memberFees.length === 0 ? (
                  <tr>
                    <td colSpan={isFinanceManager ? 9 : 5} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      Không có thành viên nào phù hợp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  memberFees.map((fee) => (
                    <tr key={fee.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{fee.user_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {fee.student_id}
                        </div>
                      </td>
                      <td>{fee.department_name || 'Toàn CLB'}</td>
                      {isFinanceManager && <td style={{ fontWeight: 600 }}>{formatVND(fee.amount_due)}</td>}
                      {isFinanceManager && (
                        <td style={{ color: fee.discount_amount > 0 ? '#10b981' : 'var(--text-muted)' }}>
                          {fee.discount_amount > 0 ? `-${formatVND(fee.discount_amount)}` : '0 ₫'}
                          {fee.discount_reason && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {fee.discount_reason}
                            </div>
                          )}
                        </td>
                      )}
                      {isFinanceManager && <td style={{ fontWeight: 600, color: '#059669' }}>{formatVND(fee.total_paid)}</td>}
                      {isFinanceManager && (
                        <td style={{ fontWeight: 700, color: (fee.remaining_balance ?? fee.remaining_due ?? 0) > 0 ? '#dc2626' : '#059669' }}>
                          {formatVND(fee.remaining_balance ?? fee.remaining_due ?? 0)}
                        </td>
                      )}
                      <td>{getStatusBadge(fee)}</td>
                      <td>
                        <span style={{ color: fee.is_overdue ? '#dc2626' : 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {formatDateTime(fee.due_date)}
                        </span>
                        {fee.is_overdue && <div style={{ fontSize: '0.7rem', color: '#dc2626' }}>Quá hạn</div>}
                      </td>
                      {isFinanceManager && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            {(fee.remaining_balance ?? fee.remaining_due ?? 0) > 0 && selectedPeriod?.status === 'open' && (
                              <button
                                onClick={() =>
                                  setCashPaymentModal({
                                    isOpen: true,
                                    memberFee: fee,
                                    amount: String(fee.remaining_balance ?? fee.remaining_due ?? 0),
                                    note: '',
                                  })
                                }
                                className="btn btn-primary btn-sm"
                                title="Thu tiền mặt trực tiếp"
                              >
                                <Coins size={14} style={{ marginRight: '4px' }} /> Thu tiền mặt
                              </button>
                            )}

                            {isAdmin && (
                              <button
                                onClick={() =>
                                  setDiscountModal({
                                    isOpen: true,
                                    memberFee: fee,
                                    discount_amount: String(fee.discount_amount),
                                    discount_reason: fee.discount_reason || '',
                                  })
                                }
                                className="btn btn-ghost btn-sm"
                                title="Miễn giảm hội phí"
                              >
                                Miễn giảm
                              </button>
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

          {feeTotal > 0 && (
            <Pagination
              currentPage={feePage}
              totalPages={Math.ceil(feeTotal / feePageSize) || 1}
              totalItems={feeTotal}
              pageSize={feePageSize}
              onPageChange={setFeePage}
              onPageSizeChange={(newSize) => {
                setFeePageSize(newSize);
                setFeePage(1);
              }}
              pageSizeOptions={[10, 15, 25, 50]}
              itemName="thành viên"
            />
          )}
        </div>
      )}

      {/* TAB 2: HÀNG ĐỢI DUYỆT CHUYỂN KHOẢN */}
      {activeTab === 'claims' && isFinanceManager && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { setClaimsFilter('pending'); setClaimsPage(1); }}
              className={`btn btn-sm ${claimsFilter === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Chờ duyệt
            </button>
            <button
              onClick={() => { setClaimsFilter('confirmed'); setClaimsPage(1); }}
              className={`btn btn-sm ${claimsFilter === 'confirmed' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Đã xác nhận
            </button>
            <button
              onClick={() => { setClaimsFilter('rejected'); setClaimsPage(1); }}
              className={`btn btn-sm ${claimsFilter === 'rejected' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Đã từ chối
            </button>
            <button
              onClick={() => { setClaimsFilter(''); setClaimsPage(1); }}
              className={`btn btn-sm ${claimsFilter === '' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Tất cả
            </button>
          </div>

          {(() => {
            const { pagedItems: pagedClaims, totalPages: claimsTotalPages } = paginateArray(claims, claimsPage, claimsPageSize);
            return (
              <>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table className="table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Thành viên / MSSV</th>
                        <th>Số tiền</th>
                        <th>Thời gian chuyển</th>
                        <th>Ảnh biên lai</th>
                        <th>Ghi chú</th>
                        <th>Trạng thái</th>
                        <th style={{ textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claims.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                            Không có báo cáo chuyển khoản nào.
                          </td>
                        </tr>
                      ) : (
                        pagedClaims.map((claim) => (
                          <tr key={claim.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{claim.user_name}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{claim.student_id}</div>
                            </td>
                            <td style={{ fontWeight: 700, color: '#059669' }}>{formatVND(claim.amount)}</td>
                            <td>{formatDateTime(claim.transfer_time)}</td>
                            <td>
                              <a
                                href={`http://localhost:8000/api/funds/receipt-photos/${claim.proof_photo_path}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--primary)' }}
                              >
                                <ExternalLink size={14} style={{ marginRight: '4px' }} /> Xem ảnh
                              </a>
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>{claim.note || '—'}</td>
                            <td>
                              <span className={`badge ${claim.status === 'confirmed' ? 'badge-success' : claim.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                                {claim.status === 'confirmed' ? 'Đã duyệt' : claim.status === 'rejected' ? 'Đã từ chối' : 'Chờ đối soát'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {claim.status === 'pending' && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                  <button
                                    onClick={() => handleConfirmClaim(claim)}
                                    className="btn btn-primary btn-sm"
                                    title="Xác nhận đúng sao kê"
                                  >
                                    <Check size={14} /> Duyệt
                                  </button>
                                  <button
                                    onClick={() => setRejectClaimModal({ isOpen: true, claim, review_note: '' })}
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--danger)' }}
                                    title="Từ chối"
                                  >
                                    Từ chối
                                  </button>
                                </div>
                              )}
                              {claim.status !== 'pending' && (
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                  Duyệt bởi: {claim.reviewed_by_name}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {claims.length > 0 && (
                  <Pagination
                    currentPage={claimsPage}
                    totalPages={claimsTotalPages}
                    totalItems={claims.length}
                    pageSize={claimsPageSize}
                    onPageChange={setClaimsPage}
                    onPageSizeChange={(newSize) => {
                      setClaimsPageSize(newSize);
                      setClaimsPage(1);
                    }}
                    pageSizeOptions={[5, 10, 20]}
                    itemName="yêu cầu chuyển khoản"
                  />
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* TAB 3: DANH SÁCH KỲ THU */}
      {activeTab === 'periods' && isFinanceManager && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(() => {
            const { pagedItems: pagedPeriods, totalPages: periodsTotalPages } = paginateArray(periods, periodsPage, 10);
            return (
              <>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table className="table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Tên kỳ thu</th>
                        <th>Mức thu chuẩn</th>
                        <th>Hạn chót</th>
                        <th>Trạng thái</th>
                        <th>Ngày tạo</th>
                        <th style={{ textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periods.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                            Chưa có kỳ thu phí nào.
                          </td>
                        </tr>
                      ) : (
                        pagedPeriods.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{p.name}</div>
                              {p.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.description}</div>}
                            </td>
                            <td style={{ fontWeight: 700 }}>{formatVND(p.amount)}</td>
                            <td>{formatDateTime(p.due_date)}</td>
                            <td>
                              <span className={`badge ${p.status === 'open' ? 'badge-success' : 'badge-neutral'}`}>
                                {p.status === 'open' ? 'Đang mở thu' : 'Đã đóng sổ'}
                              </span>
                            </td>
                            <td>{formatDateTime(p.created_at)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {isAdmin && (
                                <button
                                  onClick={() => handleClosePeriod(p)}
                                  className={`btn btn-sm ${p.status === 'open' ? 'btn-secondary' : 'btn-primary'}`}
                                >
                                  {p.status === 'open' ? (
                                    <>
                                      <Lock size={14} style={{ marginRight: '4px' }} /> Đóng kỳ thu
                                    </>
                                  ) : (
                                    <>
                                      <Unlock size={14} style={{ marginRight: '4px' }} /> Mở lại
                                    </>
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {periods.length > 10 && (
                  <Pagination
                    currentPage={periodsPage}
                    totalPages={periodsTotalPages}
                    totalItems={periods.length}
                    pageSize={10}
                    onPageChange={setPeriodsPage}
                    itemName="kỳ thu phí"
                  />
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* MODAL TẠO KỲ THU */}
      {isCreatePeriodOpen && (
        <Modal
          isOpen={isCreatePeriodOpen}
          onClose={() => setIsCreatePeriodOpen(false)}
          title="Tạo kỳ thu hội phí mới"
        >
          <form onSubmit={handleCreatePeriod} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Tên kỳ thu *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="VD: Hội phí Học kỳ 1 Năm học 2026-2027"
                value={newPeriodForm.name}
                onChange={(e) => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Mức thu chuẩn mỗi thành viên (VND) *</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min={1000}
                  step={1000}
                  placeholder="VD: 50000"
                  value={newPeriodForm.amount}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, amount: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label">Hạn chót đóng tiền *</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  required
                  value={newPeriodForm.due_date}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, due_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Mô tả / Mục đích sử dụng quỹ</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="VD: Kinh phí sinh hoạt thường niên, tổ chức teambuilding..."
                value={newPeriodForm.description}
                onChange={(e) => setNewPeriodForm({ ...newPeriodForm, description: e.target.value })}
              />
            </div>

            <div style={{ fontSize: '0.8rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '10px 14px', borderRadius: '6px' }}>
              💡 Hệ thống sẽ tự động khởi tạo khoản thu tương ứng cho toàn bộ thành viên đang hoạt động trong CLB tại thời điểm tạo.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button type="button" onClick={() => setIsCreatePeriodOpen(false)} className="btn btn-secondary">
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Tạo kỳ thu
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL GHI NHẬN TIỀN MẶT */}
      {cashPaymentModal.isOpen && cashPaymentModal.memberFee && (
        <Modal
          isOpen={cashPaymentModal.isOpen}
          onClose={() => setCashPaymentModal({ isOpen: false, memberFee: null, amount: '', note: '' })}
          title={`Thu tiền mặt: ${cashPaymentModal.memberFee.user_name}`}
        >
          <form onSubmit={handleRecordCash} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem' }}>
              <div>Thành viên: <strong>{cashPaymentModal.memberFee.user_name}</strong> ({cashPaymentModal.memberFee.student_id})</div>
              <div>Số tiền còn nợ: <strong style={{ color: '#dc2626' }}>{formatVND(cashPaymentModal.memberFee.remaining_balance)}</strong></div>
            </div>

            <div>
              <label className="form-label">Số tiền thực nhận (VND) *</label>
              <input
                type="number"
                className="form-input"
                required
                min={1000}
                max={cashPaymentModal.memberFee.remaining_balance}
                step={1000}
                value={cashPaymentModal.amount}
                onChange={(e) => setCashPaymentModal({ ...cashPaymentModal, amount: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Ghi chú (tùy chọn)</label>
              <input
                type="text"
                className="form-input"
                placeholder="VD: Nộp trực tiếp tại phòng sinh hoạt CLB..."
                value={cashPaymentModal.note}
                onChange={(e) => setCashPaymentModal({ ...cashPaymentModal, note: e.target.value })}
              />
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              * Hệ thống sẽ tự động phát hành Mã Phiếu Thu liên tục (PT-YYYYMM-XXXX) và cập nhật số dư quỹ.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setCashPaymentModal({ isOpen: false, memberFee: null, amount: '', note: '' })}
                className="btn btn-secondary"
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Xác nhận thu tiền
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL MIỄN GIẢM HỘI PHÍ (ADMIN ONLY) */}
      {discountModal.isOpen && discountModal.memberFee && (
        <Modal
          isOpen={discountModal.isOpen}
          onClose={() => setDiscountModal({ isOpen: false, memberFee: null, discount_amount: '', discount_reason: '' })}
          title={`Miễn giảm hội phí: ${discountModal.memberFee.user_name}`}
        >
          <form onSubmit={handleUpdateDiscount} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Số tiền miễn giảm (VND) *</label>
              <input
                type="number"
                className="form-input"
                required
                min={0}
                max={discountModal.memberFee.amount_due}
                value={discountModal.discount_amount}
                onChange={(e) => setDiscountModal({ ...discountModal, discount_amount: e.target.value })}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Nhập bằng mức thu gốc ({formatVND(discountModal.memberFee.amount_due)}) để miễn đóng hoàn toàn.
              </span>
            </div>

            <div>
              <label className="form-label">Lý do miễn giảm *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="VD: Ban Chủ nhiệm CLB, Hoàn cảnh khó khăn..."
                value={discountModal.discount_reason}
                onChange={(e) => setDiscountModal({ ...discountModal, discount_reason: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setDiscountModal({ isOpen: false, memberFee: null, discount_amount: '', discount_reason: '' })}
                className="btn btn-secondary"
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Lưu miễn giảm
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL TỪ CHỐI CLAIM */}
      {rejectClaimModal.isOpen && rejectClaimModal.claim && (
        <Modal
          isOpen={rejectClaimModal.isOpen}
          onClose={() => setRejectClaimModal({ isOpen: false, claim: null, review_note: '' })}
          title="Từ chối báo cáo chuyển khoản"
        >
          <form onSubmit={handleRejectClaim} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Lý do từ chối *</label>
              <textarea
                className="form-input"
                rows={3}
                required
                placeholder="VD: Không tìm thấy giao dịch trên sao kê tài khoản ngân hàng..."
                value={rejectClaimModal.review_note}
                onChange={(e) => setRejectClaimModal({ ...rejectClaimModal, review_note: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setRejectClaimModal({ isOpen: false, claim: null, review_note: '' })}
                className="btn btn-secondary"
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--danger)' }}>
                Xác nhận từ chối
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL THÊM THÀNH VIÊN VÀO KỲ ĐÃ TẠO */}
      {addMemberModal.isOpen && (
        <Modal
          isOpen={addMemberModal.isOpen}
          onClose={() => setAddMemberModal({ isOpen: false, userId: '', amountDue: '', discountAmount: '0', discountReason: '' })}
          title="Thêm thành viên vào kỳ thu này"
        >
          <form onSubmit={handleAddMemberToPeriod} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Chọn thành viên *</label>
              <select
                className="form-select"
                required
                value={addMemberModal.userId}
                onChange={(e) => setAddMemberModal({ ...addMemberModal, userId: Number(e.target.value) })}
              >
                <option value="">-- Chọn thành viên --</option>
                {candidateMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.student_id}) {m.department_name ? `- ${m.department_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Mức thu (VND)</label>
                <input
                  type="number"
                  className="form-input"
                  value={addMemberModal.amountDue}
                  onChange={(e) => setAddMemberModal({ ...addMemberModal, amountDue: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label">Miễn giảm (VND)</label>
                <input
                  type="number"
                  className="form-input"
                  value={addMemberModal.discountAmount}
                  onChange={(e) => setAddMemberModal({ ...addMemberModal, discountAmount: e.target.value })}
                />
              </div>
            </div>

            {Number(addMemberModal.discountAmount) > 0 && (
              <div>
                <label className="form-label">Lý do miễn giảm</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="VD: Vào muộn giữa kỳ..."
                  value={addMemberModal.discountReason}
                  onChange={(e) => setAddMemberModal({ ...addMemberModal, discountReason: e.target.value })}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setAddMemberModal({ isOpen: false, userId: '', amountDue: '', discountAmount: '0', discountReason: '' })}
                className="btn btn-secondary"
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Thêm vào kỳ thu
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
