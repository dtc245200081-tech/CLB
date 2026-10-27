/**
 * Date & Time utilities with Asia/Ho_Chi_Minh (UTC+7) formatting
 * and Attendance Window calculation.
 */

export function toVNDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

export function toVNDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function toVNTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

export interface WindowStatus {
  isOpen: boolean;
  isPast: boolean;
  isUpcoming: boolean;
  openAt: Date;
  closeAt: Date;
  message: string;
  badgeType: 'success' | 'warning' | 'danger' | 'neutral';
}

export interface EventWindows {
  checkIn: WindowStatus;
  checkOut: WindowStatus;
  isLate: boolean;
  lateThreshold: Date;
}

export function computeAttendanceWindows(event: {
  start_time: string;
  end_time: string;
  checkin_open_minutes_before: number;
  late_after_minutes: number;
  checkin_close_minutes_after_start: number | null;
  checkout_open_after_minutes: number | null;
  checkout_close_minutes_after_end: number;
}): EventWindows {
  const now = new Date();
  const startTime = new Date(event.start_time);
  const endTime = new Date(event.end_time);

  // Check-in window
  const checkinOpenAt = new Date(startTime.getTime() - event.checkin_open_minutes_before * 60 * 1000);
  let checkinCloseAt: Date;
  if (event.checkin_close_minutes_after_start !== null && event.checkin_close_minutes_after_start !== undefined) {
    checkinCloseAt = new Date(startTime.getTime() + event.checkin_close_minutes_after_start * 60 * 1000);
  } else {
    checkinCloseAt = new Date(endTime.getTime());
  }

  // Late threshold
  const lateThreshold = new Date(startTime.getTime() + event.late_after_minutes * 60 * 1000);
  const isCurrentlyLate = now > lateThreshold;

  // Check-out window
  let checkoutOpenAt: Date;
  if (event.checkout_open_after_minutes !== null && event.checkout_open_after_minutes !== undefined) {
    checkoutOpenAt = new Date(startTime.getTime() + event.checkout_open_after_minutes * 60 * 1000);
  } else {
    const duration = endTime.getTime() - startTime.getTime();
    checkoutOpenAt = new Date(startTime.getTime() + Math.floor(duration / 2));
  }
  const checkoutCloseAt = new Date(endTime.getTime() + event.checkout_close_minutes_after_end * 60 * 1000);

  // Status computation for check-in
  let checkInStatus: WindowStatus;
  if (now < checkinOpenAt) {
    const diffMins = Math.ceil((checkinOpenAt.getTime() - now.getTime()) / (60 * 1000));
    checkInStatus = {
      isOpen: false,
      isUpcoming: true,
      isPast: false,
      openAt: checkinOpenAt,
      closeAt: checkinCloseAt,
      message: `Mở sau ${diffMins} phút (${toVNTime(checkinOpenAt.toISOString())})`,
      badgeType: 'neutral',
    };
  } else if (now > checkinCloseAt) {
    checkInStatus = {
      isOpen: false,
      isUpcoming: false,
      isPast: true,
      openAt: checkinOpenAt,
      closeAt: checkinCloseAt,
      message: `Đã đóng (${toVNTime(checkinCloseAt.toISOString())})`,
      badgeType: 'danger',
    };
  } else {
    const diffMins = Math.ceil((checkinCloseAt.getTime() - now.getTime()) / (60 * 1000));
    checkInStatus = {
      isOpen: true,
      isUpcoming: false,
      isPast: false,
      openAt: checkinOpenAt,
      closeAt: checkinCloseAt,
      message: `Đang mở (còn ${diffMins} phút)`,
      badgeType: 'success',
    };
  }

  // Status computation for check-out
  let checkOutStatus: WindowStatus;
  if (now < checkoutOpenAt) {
    const diffMins = Math.ceil((checkoutOpenAt.getTime() - now.getTime()) / (60 * 1000));
    checkOutStatus = {
      isOpen: false,
      isUpcoming: true,
      isPast: false,
      openAt: checkoutOpenAt,
      closeAt: checkoutCloseAt,
      message: `Mở sau ${diffMins} phút (${toVNTime(checkoutOpenAt.toISOString())})`,
      badgeType: 'neutral',
    };
  } else if (now > checkoutCloseAt) {
    checkOutStatus = {
      isOpen: false,
      isUpcoming: false,
      isPast: true,
      openAt: checkoutOpenAt,
      closeAt: checkoutCloseAt,
      message: `Đã đóng (${toVNTime(checkoutCloseAt.toISOString())})`,
      badgeType: 'danger',
    };
  } else {
    const diffMins = Math.ceil((checkoutCloseAt.getTime() - now.getTime()) / (60 * 1000));
    checkOutStatus = {
      isOpen: true,
      isUpcoming: false,
      isPast: false,
      openAt: checkoutOpenAt,
      closeAt: checkoutCloseAt,
      message: `Đang mở (còn ${diffMins} phút)`,
      badgeType: 'success',
    };
  }

  return {
    checkIn: checkInStatus,
    checkOut: checkOutStatus,
    isLate: isCurrentlyLate,
    lateThreshold,
  };
}

/**
 * Chuyển đổi Date sang chuỗi YYYY-MM-DDTHH:mm tương thích với input type="datetime-local"
 */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

/**
 * Cộng thêm số giờ vào chuỗi datetime-local
 */
export function addHoursToLocal(localStr: string, hours: number): string {
  if (!localStr) return '';
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() + Math.round(hours * 60));
  return toDateTimeLocalValue(d);
}

/**
 * Đặt giờ và phút cụ thể cho ngày hiện đang chọn trong chuỗi datetime-local
 */
export function setTimeOnLocal(localStr: string | null | undefined, hours: number, minutes: number = 0): string {
  const d = localStr ? new Date(localStr) : new Date();
  if (isNaN(d.getTime())) return '';
  d.setHours(hours, minutes, 0, 0);
  return toDateTimeLocalValue(d);
}

/**
 * Định dạng thân thiện hiển thị ngày giờ tiếng Việt
 */
export function formatFriendlyDate(localOrIsoStr: string | null | undefined): string {
  if (!localOrIsoStr) return '';
  const d = new Date(localOrIsoStr);
  if (isNaN(d.getTime())) return '';
  const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dayName = dayNames[d.getDay()];
  const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dayName}, ${dateStr} lúc ${timeStr}`;
}

/**
 * Định dạng khoảng thời gian còn lại (đếm ngược thân thiện tiếng Việt)
 */
export function formatTimeRemaining(diffMs: number): string {
  if (diffMs <= 0) return '0 phút';
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days} ngày${hours > 0 ? ` ${hours} giờ` : ''}`;
  }
  if (hours > 0) {
    return `${hours} giờ${minutes > 0 ? ` ${minutes} phút` : ''}`;
  }
  return `${Math.max(1, minutes)} phút`;
}

export interface TimingWindowInfo {
  state: 'done' | 'open' | 'waiting' | 'closed';
  text: string;
  badgeType: 'success' | 'warning' | 'info' | 'neutral' | 'danger';
  openAt: Date;
  closeAt: Date;
  isAvailableNow: boolean;
}

export interface EventTimingDetails {
  startCountdown: {
    status: 'upcoming' | 'ongoing' | 'ended';
    text: string;
    shortCountdown: string;
    badgeType: 'info' | 'success' | 'neutral';
    isUpcoming: boolean;
    isOngoing: boolean;
    isEnded: boolean;
  };
  checkIn: TimingWindowInfo;
  checkOut: TimingWindowInfo;
  canCheckInNow: boolean;
  canCheckOutNow: boolean;
}

/**
 * Tính toán toàn bộ thông tin tiến độ thời gian sự kiện:
 * - Sau bao lâu thì bắt đầu (hoặc đang diễn ra / đã kết thúc)
 * - Sau bao lâu thì mở/đóng điểm danh ĐẾN (hoặc đã điểm danh / đang mở)
 * - Sau bao lâu thì mở/đóng điểm danh VỀ (hoặc đã điểm danh / đang mở)
 */
export function getEventTimingDetails(
  event: {
    start_time: string;
    end_time: string;
    checkin_open_minutes_before?: number;
    late_after_minutes?: number;
    checkin_close_minutes_after_start?: number | null;
    checkout_open_after_minutes?: number | null;
    checkout_close_minutes_after_end?: number;
    is_registered?: boolean;
    my_registration?: any;
  },
  registration?: any,
  now: Date = new Date()
): EventTimingDetails {
  const startTime = new Date(event.start_time);
  const endTime = new Date(event.end_time);

  // 1. Đếm ngược bắt đầu sự kiện
  let startStatus: 'upcoming' | 'ongoing' | 'ended' = 'upcoming';
  let startText = '';
  let shortCountdown = '';
  let startBadge: 'info' | 'success' | 'neutral' = 'info';

  if (now < startTime) {
    startStatus = 'upcoming';
    const diff = startTime.getTime() - now.getTime();
    shortCountdown = formatTimeRemaining(diff);
    startText = `Bắt đầu sau: ${shortCountdown}`;
    startBadge = 'info';
  } else if (now <= endTime) {
    startStatus = 'ongoing';
    const diff = endTime.getTime() - now.getTime();
    shortCountdown = `Còn ${formatTimeRemaining(diff)}`;
    startText = `Đang diễn ra (còn ${formatTimeRemaining(diff)})`;
    startBadge = 'success';
  } else {
    startStatus = 'ended';
    shortCountdown = 'Đã kết thúc';
    startText = 'Đã kết thúc';
    startBadge = 'neutral';
  }

  // Thông tin đăng ký và điểm danh hiện tại của thành viên
  const myReg = registration || event.my_registration;
  const isRegistered = Boolean(event.is_registered || (myReg && myReg.status === 'registered'));
  const checkInRecord = myReg?.check_in;
  const checkOutRecord = myReg?.check_out;

  // 2. Khung giờ điểm danh ĐẾN
  const openBefore = event.checkin_open_minutes_before ?? 30;
  const checkinOpenAt = new Date(startTime.getTime() - openBefore * 60 * 1000);
  const checkinCloseAt =
    event.checkin_close_minutes_after_start !== null && event.checkin_close_minutes_after_start !== undefined
      ? new Date(startTime.getTime() + event.checkin_close_minutes_after_start * 60 * 1000)
      : new Date(endTime.getTime());

  let checkInInfo: TimingWindowInfo;
  if (checkInRecord) {
    checkInInfo = {
      state: 'done',
      text: `Đã điểm danh đến (${toVNTime(checkInRecord.taken_at)})`,
      badgeType: 'success',
      openAt: checkinOpenAt,
      closeAt: checkinCloseAt,
      isAvailableNow: false,
    };
  } else if (now < checkinOpenAt) {
    const diff = checkinOpenAt.getTime() - now.getTime();
    checkInInfo = {
      state: 'waiting',
      text: `Mở sau: ${formatTimeRemaining(diff)} (${toVNTime(checkinOpenAt.toISOString())})`,
      badgeType: 'neutral',
      openAt: checkinOpenAt,
      closeAt: checkinCloseAt,
      isAvailableNow: false,
    };
  } else if (now <= checkinCloseAt) {
    const diff = checkinCloseAt.getTime() - now.getTime();
    checkInInfo = {
      state: 'open',
      text: `Đang mở (còn ${formatTimeRemaining(diff)})`,
      badgeType: 'success',
      openAt: checkinOpenAt,
      closeAt: checkinCloseAt,
      isAvailableNow: true,
    };
  } else {
    checkInInfo = {
      state: 'closed',
      text: 'Đã đóng điểm danh đến',
      badgeType: 'danger',
      openAt: checkinOpenAt,
      closeAt: checkinCloseAt,
      isAvailableNow: false,
    };
  }

  // 3. Khung giờ điểm danh VỀ
  const duration = Math.max(0, endTime.getTime() - startTime.getTime());
  const checkoutOpenAt =
    event.checkout_open_after_minutes !== null && event.checkout_open_after_minutes !== undefined
      ? new Date(startTime.getTime() + event.checkout_open_after_minutes * 60 * 1000)
      : new Date(startTime.getTime() + Math.floor(duration / 2));
  const closeAfterEnd = event.checkout_close_minutes_after_end ?? 60;
  const checkoutCloseAt = new Date(endTime.getTime() + closeAfterEnd * 60 * 1000);

  let checkOutInfo: TimingWindowInfo;
  if (checkOutRecord) {
    checkOutInfo = {
      state: 'done',
      text: `Đã điểm danh về (${toVNTime(checkOutRecord.taken_at)})`,
      badgeType: 'success',
      openAt: checkoutOpenAt,
      closeAt: checkoutCloseAt,
      isAvailableNow: false,
    };
  } else if (now < checkoutOpenAt) {
    const diff = checkoutOpenAt.getTime() - now.getTime();
    checkOutInfo = {
      state: 'waiting',
      text: `Mở sau: ${formatTimeRemaining(diff)} (${toVNTime(checkoutOpenAt.toISOString())})`,
      badgeType: 'neutral',
      openAt: checkoutOpenAt,
      closeAt: checkoutCloseAt,
      isAvailableNow: false,
    };
  } else if (now <= checkoutCloseAt) {
    const diff = checkoutCloseAt.getTime() - now.getTime();
    checkOutInfo = {
      state: 'open',
      text: `Đang mở (còn ${formatTimeRemaining(diff)})`,
      badgeType: 'success',
      openAt: checkoutOpenAt,
      closeAt: checkoutCloseAt,
      isAvailableNow: true,
    };
  } else {
    checkOutInfo = {
      state: 'closed',
      text: 'Đã đóng điểm danh về',
      badgeType: 'danger',
      openAt: checkoutOpenAt,
      closeAt: checkoutCloseAt,
      isAvailableNow: false,
    };
  }

  const canCheckInNow = isRegistered && checkInInfo.state === 'open' && !checkInRecord;
  const canCheckOutNow = isRegistered && checkOutInfo.state === 'open' && !checkOutRecord;

  return {
    startCountdown: {
      status: startStatus,
      text: startText,
      shortCountdown,
      badgeType: startBadge,
      isUpcoming: startStatus === 'upcoming',
      isOngoing: startStatus === 'ongoing',
      isEnded: startStatus === 'ended',
    },
    checkIn: checkInInfo,
    checkOut: checkOutInfo,
    canCheckInNow,
    canCheckOutNow,
  };
}

