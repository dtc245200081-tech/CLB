import React, { useState, useEffect } from 'react';
import {
  Building2,
  Clock,
  Copy,
  Check,
  Upload,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { MyFeesResponse, MemberFee, FeePayment, BankTransferInstructions } from '../types';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/Modal';
import { ModuleSubTabs } from '../components/ModuleSubTabs';

export const MyFeesPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<MyFeesResponse | null>(null);
  const [instructions, setInstructions] = useState<BankTransferInstructions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Claim modal state
  const [claimModal, setClaimModal] = useState<{
    isOpen: boolean;
    memberFee: MemberFee | null;
  }>({
    isOpen: false,
    memberFee: null,
  });

  const [claimForm, setClaimForm] = useState({
    amount: '',
    transfer_time: '',
    note: '',
    proof_file: null as File | null,
    proof_preview: '',
  });

  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  // Receipt view modal
  const [receiptModal, setReceiptModal] = useState<{
    isOpen: boolean;
    payment: FeePayment | null;
    periodName: string;
  }>({
    isOpen: false,
    payment: null,
    periodName: '',
  });

  // Copy helpers
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [feesRes, bankRes] = await Promise.all([
        api.fees.getMyFees(),
        api.fees.getBankInstructions(),
      ]);
      setData(feesRes);
      setInstructions(bankRes);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleOpenClaim = (fee: MemberFee) => {
    setClaimModal({
      isOpen: true,
      memberFee: fee,
    });
    setClaimForm({
      amount: String(fee.remaining_balance ?? fee.remaining_due ?? fee.net_amount_due),
      transfer_time: new Date().toISOString().slice(0, 16),
      note: '',
      proof_file: null,
      proof_preview: '',
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        setError('Ảnh biên lai không được vượt quá 2MB.');
        return;
      }
      setClaimForm({
        ...claimForm,
        proof_file: file,
        proof_preview: URL.createObjectURL(file),
      });
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimModal.memberFee || !claimForm.proof_file) {
      setError('Vui lòng chọn ảnh chụp biên lai chuyển khoản.');
      return;
    }

    const amt = Number(claimForm.amount);
    if (!amt || amt <= 0) {
      setError('Số tiền chuyển khoản phải lớn hơn 0.');
      return;
    }

    setIsSubmittingClaim(true);
    try {
      await api.fees.submitClaim(
        claimModal.memberFee.id,
        amt,
        new Date(claimForm.transfer_time).toISOString(),
        claimForm.note || undefined,
        claimForm.proof_file
      );
      setSuccess('Đã gửi thông tin chuyển khoản thành công! Ban Quản trị sẽ đối soát và xác nhận sớm nhất.');
      setClaimModal({ isOpen: false, memberFee: null });
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 500 ? 'Hệ thống đang gặp sự cố khi lưu ảnh biên lai. Vui lòng thử lại sau giây lát.' : err.message);
      } else {
        setError('Có lỗi xảy ra khi gửi thông tin chuyển khoản. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmittingClaim(false);
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
        return <span className="badge badge-warning">Đã đóng một phần</span>;
      case 'unpaid':
        return <span className="badge badge-danger">Chưa đóng</span>;
    }
  };

  const getClaimStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="badge badge-success">Đã duyệt & Ghi nhận</span>;
      case 'rejected':
        return <span className="badge badge-danger">Đã từ chối</span>;
      case 'pending':
      default:
        return <span className="badge badge-warning">Chờ đối soát</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ModuleSubTabs module="finance" />

      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Hội Phí Của Tôi</h1>
          <p className="page-header-subtitle">
            Theo dõi các kỳ thu hội phí, lịch sử đóng tiền và gửi biên lai chuyển khoản ngân hàng
          </p>
        </div>
      </div>

      {/* FEEDBACK ALERTS */}
      {error && (
        <div style={{ background: 'var(--danger-light)', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', fontWeight: 600 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'var(--success-light)', color: '#047857', padding: '12px 16px', borderRadius: '8px', fontWeight: 600 }}>
          {success}
        </div>
      )}

      {/* BANK TRANSFER INSTRUCTIONS CARD */}
      {instructions && (
        <div
          className="card"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#ea580c', fontWeight: 700 }}>
            <Building2 size={18} /> HƯỚNG DẪN NỘP HỘI PHÍ QUA CHUYỂN KHOẢN NGÂN HÀNG
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Ngân hàng thụ hưởng:</span>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{instructions.bank_name}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Chủ tài khoản:</span>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{instructions.account_name}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Số tài khoản:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '1.05rem', fontFamily: 'monospace', color: '#047857' }}>
                  {instructions.account_number}
                </span>
                <button
                  onClick={() => handleCopy(instructions.account_number, 'account_number')}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px' }}
                  title="Sao chép số tài khoản"
                >
                  {copiedField === 'account_number' ? <Check size={14} style={{ color: '#059669' }} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Cú pháp nội dung chuyển khoản:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', fontFamily: 'monospace', color: '#d97706' }}>
                  {user?.student_id ? `${user.student_id} HOIPHI` : instructions.syntax_guide}
                </span>
                <button
                  onClick={() => handleCopy(user?.student_id ? `${user.student_id} HOIPHI` : instructions.syntax_guide, 'syntax')}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px' }}
                  title="Sao chép nội dung chuyển khoản"
                >
                  {copiedField === 'syntax' ? <Check size={14} style={{ color: '#059669' }} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER FEES LIST */}
      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>Các Kỳ Thu Hội Phí Của Bạn</h3>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Đang tải dữ liệu hội phí...
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Receipt size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <div>Bạn chưa có khoản hội phí nào cần đóng.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {data.items.map((fee) => (
              <div
                key={fee.id}
                className="card"
                style={{
                  padding: '20px',
                  border: fee.is_overdue ? '1px solid rgba(239, 68, 68, 0.5)' : undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {getStatusBadge(fee)}
                  {fee.is_overdue && (
                    <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                      ⚠️ Đã quá hạn
                    </span>
                  )}
                </div>

                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>
                    {fee.period_name}
                  </h4>
                  {fee.period_description && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {fee.period_description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'var(--bg-glass-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Mức thu gốc:</span>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatVND(fee.amount_due)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Miễn giảm:</span>
                    <div style={{ fontWeight: 700, color: fee.discount_amount > 0 ? '#10b981' : 'var(--text-muted)' }}>
                      {fee.discount_amount > 0 ? `-${formatVND(fee.discount_amount)}` : '0 ₫'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Đã thanh toán:</span>
                    <div style={{ fontWeight: 700, color: '#047857' }}>{formatVND(fee.total_paid)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Còn phải nộp:</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: (fee.remaining_balance ?? fee.remaining_due) > 0 ? '#dc2626' : '#059669' }}>
                      {formatVND(fee.remaining_balance ?? fee.remaining_due)}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={13} /> Hạn chót: <strong style={{ color: 'var(--text-primary)' }}>{formatDateTime(fee.due_date ?? fee.period_due_date)}</strong>
                </div>

                {fee.discount_reason && (
                  <div style={{ fontSize: '0.78rem', color: '#047857', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '6px 10px', borderRadius: '4px', fontWeight: 600 }}>
                    Lý do miễn giảm: {fee.discount_reason}
                  </div>
                )}

                {/* ACTION BUTTON */}
                {(fee.remaining_balance ?? fee.remaining_due) > 0 && fee.period_status === 'open' && (
                  <button
                    onClick={() => handleOpenClaim(fee)}
                    className="btn btn-primary"
                    style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                  >
                    <Upload size={16} /> Báo đã chuyển khoản (Gửi Claim)
                  </button>
                )}
                {fee.period_status === 'closed' && (
                  <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Kỳ thu này đã đóng sổ
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PAYMENT CLAIMS HISTORY */}
      {data && data.claims.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '14px' }}>
            Lịch Sử Báo Cáo Chuyển Khoản (Claims)
          </h3>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Thời gian chuyển</th>
                  <th>Số tiền</th>
                  <th>Ảnh chứng từ</th>
                  <th>Ghi chú của bạn</th>
                  <th>Trạng thái</th>
                  <th>Phản hồi đối soát</th>
                </tr>
              </thead>
              <tbody>
                {data.claims.map((claim) => (
                  <tr key={claim.id}>
                    <td>{formatDateTime(claim.transfer_time)}</td>
                    <td style={{ fontWeight: 700 }}>{formatVND(claim.amount)}</td>
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
                    <td>{getClaimStatusBadge(claim.status)}</td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {claim.review_note ? (
                        <span style={{ color: claim.status === 'rejected' ? '#dc2626' : 'var(--text-primary)' }}>
                          {claim.review_note}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONFIRMED PAYMENTS & RECEIPTS */}
      {data && data.payments.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '14px' }}>
            Lịch Sử Thanh Toán Đã Ghi Nhận & Phiếu Thu
          </h3>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Mã phiếu thu</th>
                  <th>Số tiền</th>
                  <th>Phương thức</th>
                  <th>Ngày ghi nhận</th>
                  <th>Người thu</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5' }}>
                        {p.receipt_code}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatVND(p.amount)}</td>
                    <td>
                      <span className="badge badge-neutral">
                        {p.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                      </span>
                    </td>
                    <td>{formatDateTime(p.paid_at)}</td>
                    <td>{p.received_by_name || p.receiver_name || 'Thủ quỹ'}</td>
                    <td>
                      {p.voided_at ? (
                        <span className="badge badge-danger">Đã hủy ({p.void_reason})</span>
                      ) : (
                        <span className="badge badge-success">Hợp lệ</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() =>
                          setReceiptModal({
                            isOpen: true,
                            payment: p,
                            periodName: 'Hội phí CLB',
                          })
                        }
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--primary)' }}
                      >
                        <Receipt size={14} style={{ marginRight: '4px' }} /> Phiếu thu
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL GỬI CLAIM CHUYỂN KHOẢN */}
      {claimModal.isOpen && claimModal.memberFee && (
        <Modal
          isOpen={claimModal.isOpen}
          onClose={() => setClaimModal({ isOpen: false, memberFee: null })}
          title={`Gửi biên lai: ${claimModal.memberFee.period_name}`}
        >
          <form onSubmit={handleClaimSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.08)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem' }}>
              Số tiền còn nợ: <strong style={{ color: '#dc2626' }}>{formatVND(claimModal.memberFee.remaining_balance ?? claimModal.memberFee.remaining_due)}</strong>.
              Vui lòng chuyển khoản đúng số tiền và tải lên ảnh chụp giao dịch thành công.
            </div>

            <div>
              <label className="form-label">Số tiền đã chuyển (VND) *</label>
              <input
                type="number"
                className="form-input"
                required
                min={1000}
                max={claimModal.memberFee.remaining_balance ?? claimModal.memberFee.remaining_due}
                value={claimForm.amount}
                onChange={(e) => setClaimForm({ ...claimForm, amount: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Thời điểm chuyển khoản *</label>
              <input
                type="datetime-local"
                className="form-input"
                required
                value={claimForm.transfer_time}
                onChange={(e) => setClaimForm({ ...claimForm, transfer_time: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Ảnh chụp biên lai / Màn hình chuyển khoản * (Tối đa 2MB)</label>
              <input
                type="file"
                accept="image/jpeg,image/png"
                required
                onChange={handleFileChange}
                className="form-input"
              />
              {claimForm.proof_preview && (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                  <img
                    src={claimForm.proof_preview}
                    alt="Biên lai"
                    style={{ maxHeight: '180px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Ghi chú bổ sung</label>
              <input
                type="text"
                className="form-input"
                placeholder="VD: Chuyển qua app Vietcombank, mã GD..."
                value={claimForm.note}
                onChange={(e) => setClaimForm({ ...claimForm, note: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setClaimModal({ isOpen: false, memberFee: null })}
                className="btn btn-secondary"
                disabled={isSubmittingClaim}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmittingClaim}
              >
                {isSubmittingClaim ? 'Đang gửi...' : 'Gửi xác nhận'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL PHIẾU THU CHUẨN IN */}
      {receiptModal.isOpen && receiptModal.payment && (
        <Modal
          isOpen={receiptModal.isOpen}
          onClose={() => setReceiptModal({ isOpen: false, payment: null, periodName: '' })}
          title={`Phiếu Thu ${receiptModal.payment.receipt_code}`}
        >
          <div
            id="printable-receipt"
            style={{
              padding: '24px',
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: '8px',
              border: '2px dashed #94a3b8',
              fontFamily: 'sans-serif',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>CÂU LẠC BỘ SINH VIÊN</h3>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>PHIẾU THU HỘI PHÍ ĐIỆN TỬ</div>
              <div style={{ fontWeight: 700, color: '#4f46e5', marginTop: '4px' }}>
                Số: {receiptModal.payment.receipt_code}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
              <div>Họ tên người nộp: <strong>{user?.full_name}</strong></div>
              <div>Mã số sinh viên: <strong>{user?.student_id}</strong></div>
              <div>Khoản thu: <strong>{receiptModal.periodName}</strong></div>
              <div>
                Số tiền: <strong style={{ fontSize: '1.1rem', color: '#059669' }}>{formatVND(receiptModal.payment.amount)}</strong>
              </div>
              <div>Hình thức: <strong>{receiptModal.payment.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</strong></div>
              <div>Thời gian thu: <strong>{formatDateTime(receiptModal.payment.paid_at)}</strong></div>
              <div>Người lập phiếu: <strong>{receiptModal.payment.received_by_name || receiptModal.payment.receiver_name || 'Thủ quỹ CLB'}</strong></div>
              {receiptModal.payment.voided_at && (
                <div style={{ color: '#dc2626', fontWeight: 700, marginTop: '8px' }}>
                  PHIẾU THU ĐÃ HỦY: {receiptModal.payment.void_reason}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', textAlign: 'center', fontSize: '0.85rem' }}>
              <div>
                <div>Người nộp tiền</div>
                <div style={{ height: '40px' }} />
                <div>{user?.full_name}</div>
              </div>
              <div>
                <div>Người thu tiền</div>
                <div style={{ height: '40px' }} />
                <div>{receiptModal.payment.received_by_name || receiptModal.payment.receiver_name || 'Thủ quỹ CLB'}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn btn-primary"
            >
              In phiếu thu
            </button>
            <button
              type="button"
              onClick={() => setReceiptModal({ isOpen: false, payment: null, periodName: '' })}
              className="btn btn-secondary"
            >
              Đóng
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
