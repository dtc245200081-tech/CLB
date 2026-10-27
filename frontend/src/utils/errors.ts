import { ApiError } from '../api/client';

/**
 * Từ điển ánh xạ các thông báo lỗi kỹ thuật tiếng Anh / mã lỗi FastAPI sang tiếng Việt thân thiện, trực quan.
 */
const ERROR_TRANSLATIONS: Record<string, string> = {
  // Authentication & Authorization
  'Incorrect email or password': 'Email hoặc mật khẩu không chính xác. Vui lòng thử lại.',
  'Invalid credentials': 'Thông tin đăng nhập không hợp lệ.',
  'Could not validate credentials': 'Không thể xác thực danh tính. Vui lòng đăng nhập lại.',
  'Not authenticated': 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
  'Inactive user': 'Tài khoản của bạn hiện đang bị khóa. Vui lòng liên hệ ban quản trị.',
  'The user is not active': 'Tài khoản này đang ở trạng thái bị tạm khóa.',
  'Forbidden': 'Bạn không có quyền thực hiện thao tác này.',
  'Permission denied': 'Bạn không có đủ quyền hạn để truy cập tài nguyên này.',
  'Token has expired': 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
  'Signature has expired': 'Mã xác thực đã hết hạn.',
  'Invalid token': 'Mã xác thực không hợp lệ.',

  // Common CRUD
  'Not Found': 'Không tìm thấy dữ liệu yêu cầu trong hệ thống.',
  'Item not found': 'Mục yêu cầu không tồn tại hoặc đã bị xóa.',
  'User not found': 'Không tìm thấy thông tin thành viên.',
  'Event not found': 'Không tìm thấy sự kiện.',
  'Department not found': 'Không tìm thấy ban chuyên môn này.',
  'Task not found': 'Không tìm thấy công việc yêu cầu.',
  'Announcement not found': 'Không tìm thấy bài thông báo.',
  'Fee period not found': 'Không tìm thấy kỳ thu hội phí này.',
  'Already exists': 'Dữ liệu này đã tồn tại trong hệ thống.',
  'Email already registered': 'Địa chỉ email này đã được sử dụng bởi một thành viên khác.',
  'Student ID already exists': 'Mã số sinh viên này đã được đăng ký trong hệ thống.',
  'Student id already registered': 'Mã số sinh viên này đã được sử dụng.',

  // Network & System
  'Failed to fetch': 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền mạng của bạn.',
  'NetworkError': 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet và thử lại.',
  'Load failed': 'Không thể tải dữ liệu từ máy chủ.',
  'Internal Server Error': 'Hệ thống máy chủ gặp sự cố nội bộ. Vui lòng thử lại sau ít phút.',
  'Bad Gateway': 'Máy chủ trung gian không thể phản hồi. Vui lòng thử lại sau.',
  'Service Unavailable': 'Hệ thống đang bảo trì hoặc quá tải. Vui lòng thử lại sau giây lát.',
  'Gateway Timeout': 'Quá thời gian chờ phản hồi từ máy chủ.',

  // Validation
  'Field required': 'Vui lòng điền đầy đủ trường thông tin bắt buộc này.',
  'value is not a valid email address': 'Địa chỉ email không đúng định dạng chuẩn (ví dụ: ten@clb.edu.vn).',
  'Input should be a valid string': 'Dữ liệu nhập vào phải là văn bản hợp lệ.',
  'Input should be a valid integer': 'Dữ liệu nhập vào phải là một chữ số nguyên hợp lệ.',
  'Input should be a valid number': 'Dữ liệu nhập vào phải là một số hợp lệ.',
  'Input should be a valid boolean': 'Giá trị nhập vào phải là đúng hoặc sai.',
  'JSON decode error': 'Định dạng dữ liệu gửi lên không đúng định dạng JSON.',
};

/**
 * Chuyển đổi chuỗi lỗi tiếng Anh hoặc validation lỗi của FastAPI/Pydantic sang tiếng Việt rõ ràng.
 */
export function formatVietnameseError(rawError: unknown): string {
  if (!rawError) {
    return 'Đã có lỗi không xác định xảy ra. Vui lòng thử lại.';
  }

  // Nếu là chuỗi trực tiếp
  if (typeof rawError === 'string') {
    return translateSingleMessage(rawError);
  }

  // Nếu là ApiError
  if (rawError instanceof ApiError) {
    if (rawError.message) {
      return translateSingleMessage(rawError.message);
    }
    return getStatusMessage(rawError.status);
  }

  // Nếu là Error thông thường
  if (rawError instanceof Error) {
    return translateSingleMessage(rawError.message);
  }

  // Nếu là object có thuộc tính message hoặc detail
  if (typeof rawError === 'object') {
    const errObj = rawError as any;
    if (errObj.detail) {
      if (typeof errObj.detail === 'string') {
        return translateSingleMessage(errObj.detail);
      }
      if (Array.isArray(errObj.detail)) {
        // FastAPI validation errors format: [{ loc: ['body', 'field'], msg: 'Field required' }]
        return errObj.detail
          .map((item: any) => {
            const field = item.loc ? item.loc[item.loc.length - 1] : '';
            const msg = item.msg || item.message || '';
            const translatedMsg = translateSingleMessage(msg);
            if (field && field !== '__root__' && field !== 'body') {
              return `Trường "${translateFieldName(field)}": ${translatedMsg}`;
            }
            return translatedMsg;
          })
          .join('\n');
      }
    }
    if (errObj.message && typeof errObj.message === 'string') {
      return translateSingleMessage(errObj.message);
    }
  }

  return 'Đã có lỗi xảy ra. Vui lòng kiểm tra lại thao tác hoặc liên hệ quản trị viên.';
}

/**
 * Dịch từng thông báo cụ thể
 */
function translateSingleMessage(msg: string): string {
  const trimmed = msg.trim();
  if (!trimmed) return 'Đã có lỗi xảy ra.';

  // Kiểm tra bảng ánh xạ trực tiếp
  for (const [key, val] of Object.entries(ERROR_TRANSLATIONS)) {
    if (trimmed.toLowerCase() === key.toLowerCase()) {
      return val;
    }
  }

  // Kiểm tra một số tiền tố / mẫu câu phổ biến
  if (/field required/i.test(trimmed)) {
    return 'Vui lòng điền đầy đủ trường thông tin này.';
  }
  if (/value is not a valid email/i.test(trimmed)) {
    return 'Địa chỉ email không đúng định dạng.';
  }
  if (/string should have at least (\d+) characters/i.test(trimmed)) {
    const match = trimmed.match(/at least (\d+) characters/i);
    return `Độ dài tối thiểu là ${match ? match[1] : ''} ký tự.`;
  }
  if (/string should have at most (\d+) characters/i.test(trimmed)) {
    const match = trimmed.match(/at most (\d+) characters/i);
    return `Độ dài không được vượt quá ${match ? match[1] : ''} ký tự.`;
  }
  if (/failed to fetch/i.test(trimmed) || /network request failed/i.test(trimmed)) {
    return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng internet.';
  }
  if (/cannot read propert/i.test(trimmed) || /undefined is not an object/i.test(trimmed)) {
    return 'Đã xảy ra lỗi giao diện hiển thị dữ liệu.';
  }

  // Nếu thông báo đã là tiếng Việt (chứa ký tự tiếng Việt hoặc dấu tiếng Việt) thì giữ nguyên
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Chuyển tên trường kỹ thuật sang tiếng Việt thân thiện
 */
function translateFieldName(fieldName: string): string {
  const map: Record<string, string> = {
    email: 'Email',
    password: 'Mật khẩu',
    old_password: 'Mật khẩu hiện tại',
    new_password: 'Mật khẩu mới',
    student_id: 'Mã số sinh viên',
    full_name: 'Họ và tên',
    phone: 'Số điện thoại',
    faculty: 'Khoa / Viện',
    class_name: 'Lớp sinh hoạt',
    title: 'Chức danh / Tiêu đề',
    description: 'Mô tả',
    name: 'Tên',
    amount: 'Số tiền',
    due_date: 'Hạn chót',
    start_time: 'Thời gian bắt đầu',
    end_time: 'Thời gian kết thúc',
    location: 'Địa điểm',
    capacity: 'Số lượng tối đa',
    reason: 'Lý do',
    content: 'Nội dung',
  };
  return map[fieldName] || fieldName;
}

/**
 * Trả về thông điệp mặc định theo mã trạng thái HTTP
 */
function getStatusMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại dữ liệu đã nhập.';
    case 401:
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 403:
      return 'Bạn không có quyền thực hiện thao tác này.';
    case 404:
      return 'Không tìm thấy thông tin hoặc tài nguyên yêu cầu.';
    case 409:
      return 'Dữ liệu bị trùng lặp hoặc xung đột với trạng thái hiện tại.';
    case 422:
      return 'Thông tin cung cấp không hợp lệ. Vui lòng kiểm tra lại các trường nhập liệu.';
    case 500:
      return 'Máy chủ gặp sự cố nội bộ. Vui lòng thử lại sau ít phút.';
    case 502:
    case 503:
    case 504:
      return 'Hệ thống máy chủ tạm thời không thể phản hồi. Vui lòng thử lại sau.';
    default:
      return `Đã có lỗi xảy ra (Mã lỗi HTTP ${status}).`;
  }
}
