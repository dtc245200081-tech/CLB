import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, AlertCircle, Check, ArrowLeft } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface CameraCaptureProps {
  onCapture: (blob: Blob, source: 'camera' | 'upload') => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  title?: string;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onCancel,
  isSubmitting = false,
  title = 'Điểm danh bằng ảnh',
}) => {
  const { showError } = useToast();
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Khởi động Camera
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    if (mode === 'camera' && !capturedBlob) {
      setCameraError(null);

      // Kiểm tra hỗ trợ getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Trình duyệt không hỗ trợ truy cập camera hoặc đang chạy trên kết nối không bảo mật (HTTP). Vui lòng dùng HTTPS/localhost hoặc chọn Tải ảnh.'
        );
        return;
      }

      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        .then((s) => {
          currentStream = s;
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});
          }
        })
        .catch((err) => {
          console.warn('Lỗi mở camera:', err);
          let msg = 'Không thể truy cập camera. ';
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            msg += 'Bạn chưa cấp quyền cho trang web sử dụng camera. Hãy bấm vào biểu tượng ổ khóa cạnh URL để cấp quyền, hoặc chuyển sang chế độ tải tệp.';
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            msg += 'Không tìm thấy thiết bị camera nào trên máy của bạn.';
          } else {
            msg += 'Trình duyệt chặn truy cập camera hoặc kết nối không an toàn.';
          }
          setCameraError(msg);
        });
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [mode, facingMode, capturedBlob]);

  // Giải phóng URL preview khi unmount hoặc đổi ảnh
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Tắt stream khi đóng component
  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  // Nén ảnh qua canvas trước khi gửi (giữ kích thước tối đa 1200px, dung lượng < 500KB)
  const compressImage = (imageSource: HTMLVideoElement | HTMLImageElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current || document.createElement('canvas');
      const maxDim = 1200;

      let srcWidth = 0;
      let srcHeight = 0;

      if (imageSource instanceof HTMLVideoElement) {
        srcWidth = imageSource.videoWidth || 640;
        srcHeight = imageSource.videoHeight || 480;
      } else {
        srcWidth = imageSource.naturalWidth || 640;
        srcHeight = imageSource.naturalHeight || 480;
      }

      let targetWidth = srcWidth;
      let targetHeight = srcHeight;

      if (srcWidth > maxDim || srcHeight > maxDim) {
        if (srcWidth > srcHeight) {
          targetWidth = maxDim;
          targetHeight = Math.round((srcHeight * maxDim) / srcWidth);
        } else {
          targetHeight = maxDim;
          targetWidth = Math.round((srcWidth * maxDim) / srcHeight);
        }
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Không thể khởi tạo canvas'));
        return;
      }

      // Xoay mirror nếu camera trước
      if (mode === 'camera' && facingMode === 'user' && imageSource instanceof HTMLVideoElement) {
        ctx.translate(targetWidth, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Nén ảnh thất bại'));
          }
        },
        'image/jpeg',
        0.85
      );
    });
  };

  // Bấm nút chụp ảnh
  const handleTakePhoto = async () => {
    if (!videoRef.current) return;
    try {
      const blob = await compressImage(videoRef.current);
      stopStream();
      setCapturedBlob(blob);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (e) {
      console.error(e);
      setCameraError('Chụp ảnh thất bại. Hãy thử lại.');
    }
  };

  // Chụp lại
  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCapturedBlob(null);
    setPreviewUrl(null);
  };

  // Xử lý tệp tải lên từ thiết bị
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      showError('Vui lòng chọn tệp ảnh có định dạng JPEG hoặc PNG.');
      setCameraError('Vui lòng chọn tệp ảnh có định dạng JPEG hoặc PNG.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showError('Dung lượng ảnh vượt quá 2 MB. Vui lòng chọn ảnh nhỏ hơn.');
      setCameraError('Dung lượng ảnh vượt quá 2 MB. Vui lòng chọn ảnh nhỏ hơn.');
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const compressedBlob = await compressImage(img);
        URL.revokeObjectURL(objectUrl);
        setCapturedBlob(compressedBlob);
        setPreviewUrl(URL.createObjectURL(compressedBlob));
      } catch {
        setCapturedBlob(file);
        setPreviewUrl(objectUrl);
      }
    };
    img.src = objectUrl;
  };

  // Gửi ảnh
  const handleSubmit = () => {
    if (!capturedBlob) return;
    stopStream();
    onCapture(capturedBlob, mode);
  };

  // Đóng modal
  const handleClose = () => {
    stopStream();
    onCancel();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Tiêu đề & Chọn chế độ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h4>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              handleRetake();
              setMode('camera');
            }}
            disabled={isSubmitting}
          >
            <Camera size={14} />
            <span>Camera trực tiếp</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              stopStream();
              handleRetake();
              setMode('upload');
            }}
            disabled={isSubmitting}
          >
            <Upload size={14} />
            <span>Tải ảnh dự phòng</span>
          </button>
        </div>
      </div>

      {/* Thông tin lưu ý */}
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.825rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <AlertCircle size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
        <span>
          {mode === 'camera'
            ? 'Ảnh chụp từ camera được hệ thống tự động duyệt ngay lập tức nếu trong khung giờ.'
            : 'Ảnh tải lên từ tệp sẽ ở trạng thái Chờ duyệt bởi người tổ chức sự kiện.'}
        </span>
      </div>

      {/* VÙNG HIỂN THỊ CAMERA HOẶC XEM TRƯỚC */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4/3',
          background: '#040711',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px dashed var(--border-strong)',
        }}
      >
        {/* Xem trước ảnh đã chụp */}
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Xem trước ảnh điểm danh"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : mode === 'camera' ? (
          cameraError ? (
            <div style={{ padding: '24px', textAlign: 'center', maxWidth: '420px' }}>
              <AlertCircle size={40} color="var(--danger)" style={{ marginBottom: '12px' }} />
              <div style={{ color: '#dc2626', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.5, fontWeight: 500 }}>
                {cameraError}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  stopStream();
                  setMode('upload');
                }}
              >
                <Upload size={16} />
                <span>Chuyển sang Tải ảnh có sẵn</span>
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                }}
                playsInline
                autoPlay
                muted
              />
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.5)' }}
                  onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
                  title="Đổi camera trước/sau"
                >
                  <RefreshCw size={14} />
                  <span>Đổi camera</span>
                </button>
              </div>
            </>
          )
        ) : (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Upload size={48} color="var(--primary)" style={{ marginBottom: '14px', opacity: 0.8 }} />
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Chọn tệp ảnh từ máy tính hoặc điện thoại</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Định dạng JPEG hoặc PNG, dung lượng tối đa 2 MB
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} />
              <span>Duyệt tệp ảnh</span>
            </button>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {/* CÁC NÚT ĐIỀU KHIỂN DƯỚI CÙNG */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleClose}
          disabled={isSubmitting}
        >
          <ArrowLeft size={16} />
          <span>Hủy bỏ</span>
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          {previewUrl ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRetake}
                disabled={isSubmitting}
              >
                <RefreshCw size={16} />
                <span>Chụp lại / Chọn lại</span>
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={16} className="spin-animate" />
                    <span>Đang gửi điểm danh...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Xác nhận gửi điểm danh</span>
                  </>
                )}
              </button>
            </>
          ) : mode === 'camera' && !cameraError ? (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleTakePhoto}
              style={{ padding: '12px 28px' }}
            >
              <Camera size={20} />
              <span>Chụp ảnh ngay</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
