import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Calendar,
  CreditCard,
  DollarSign,
  Megaphone,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api/client';
import { Notification } from '../types';

export const NotificationDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchUnreadCount = async () => {
    try {
      const res = await api.notifications.getUnreadCount();
      setUnreadCount(res.unread_count);
    } catch {
      // Ignore background error
    }
  };

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await api.notifications.list({ page_size: 15 });
      setNotifications(res.items);
      fetchUnreadCount();
    } catch {
      // Ignore background error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000); // 1 minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemClick = async (notif: Notification) => {
    if (!notif.is_read) {
      try {
        await api.notifications.markAsRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error(err);
      }
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'task_assigned':
      case 'task_status_changed':
        return <CheckCircle2 size={16} style={{ color: '#818cf8' }} />;
      case 'task_deadline':
      case 'task_overdue':
        return <Clock size={16} style={{ color: '#f59e0b' }} />;
      case 'announcement_new':
        return <Megaphone size={16} style={{ color: '#ec4899' }} />;
      case 'event_reminder':
        return <Calendar size={16} style={{ color: '#3b82f6' }} />;
      case 'fee_reminder':
      case 'fee_overdue':
        return <CreditCard size={16} style={{ color: '#eab308' }} />;
      case 'expense_reviewed':
      case 'claim_reviewed':
        return <DollarSign size={16} style={{ color: '#10b981' }} />;
      default:
        return <Bell size={16} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN');
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-ghost"
        style={{
          position: 'relative',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Thông báo"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              borderRadius: '9999px',
              fontSize: '0.65rem',
              fontWeight: 800,
              padding: '2px 5px',
              lineHeight: 1,
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: '380px',
            maxHeight: '480px',
            background: 'var(--bg-surface, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-subtle, #334155)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Thông báo</span>
              {unreadCount > 0 && (
                <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                  {unreadCount} mới
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.75rem', padding: '4px 8px', color: 'var(--primary)' }}
                title="Đánh dấu tất cả là đã đọc"
              >
                <CheckCheck size={14} style={{ marginRight: '4px' }} />
                Đọc tất cả
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
            {isLoading && notifications.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Đang tải thông báo...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Bell size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <div>Bạn không có thông báo nào</div>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: item.is_read ? 'transparent' : 'rgba(99, 102, 241, 0.08)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = item.is_read
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(99, 102, 241, 0.14)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = item.is_read
                      ? 'transparent'
                      : 'rgba(99, 102, 241, 0.08)';
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getIconForType(item.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: item.is_read ? 500 : 700,
                        fontSize: '0.85rem',
                        color: item.is_read ? 'var(--text-primary)' : '#ffffff',
                        marginBottom: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </span>
                      {!item.is_read && (
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: '#6366f1',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                        marginBottom: '4px',
                      }}
                    >
                      {item.body}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>{formatTime(item.created_at)}</span>
                      {item.link && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--primary)' }}>
                          Xem <ExternalLink size={10} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
