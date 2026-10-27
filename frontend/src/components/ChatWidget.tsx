import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  MessageSquare,
  X,
  Send,
  Plus,
  History,
  ThumbsUp,
  ThumbsDown,
  Square,
  ChevronRight,
  BookOpen,
  Trash2,
  AlertCircle,
  Clock,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { ChatMessage, ConversationSummary } from '../types';

export const ChatWidget: React.FC = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackModalMsgId, setFeedbackModalMsgId] = useState<number | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackType, setFeedbackType] = useState<'up' | 'down'>('up');

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cuộn xuống tin nhắn mới nhất
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, statusText]);

  // Nạp danh sách cuộc hội thoại khi đăng nhập
  const loadConversations = async () => {
    if (!user) return;
    try {
      const data = await api.chat.listConversations();
      setConversations(data);
    } catch (_) {}
  };

  useEffect(() => {
    if (isOpen && user) {
      loadConversations();
    }
  }, [isOpen, user]);

  // Chuyển sang cuộc trò chuyện khác
  const selectConversation = async (id: number) => {
    try {
      const detail = await api.chat.getConversation(id);
      setCurrentConversationId(detail.id);
      setMessages(detail.messages);
      setIsHistoryOpen(false);
      setErrorMessage(null);
    } catch (_) {
      setErrorMessage('Không thể tải cuộc trò chuyện.');
    }
  };

  // Tạo cuộc trò chuyện mới
  const handleNewChat = () => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setCurrentConversationId(undefined);
    setMessages([]);
    setErrorMessage(null);
    setStatusText(null);
    setIsHistoryOpen(false);
  };

  // Xóa cuộc trò chuyện
  const handleDeleteConversation = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Xóa cuộc trò chuyện',
      message: 'Bạn có chắc chắn muốn xóa cuộc trò chuyện này? Toàn bộ lịch sử trao đổi trong phiên chat này sẽ bị xóa vĩnh viễn.',
      variant: 'danger',
      confirmText: 'Xác nhận xóa',
    });
    if (!ok) return;

    try {
      await api.chat.deleteConversation(id);
      if (currentConversationId === id) {
        handleNewChat();
      }
      loadConversations();
      showSuccess('Đã xóa cuộc trò chuyện thành công!');
    } catch (_) {
      showError('Không thể xóa cuộc trò chuyện.');
      setErrorMessage('Không thể xóa cuộc trò chuyện.');
    }
  };

  // Xóa toàn bộ lịch sử trò chuyện (tất cả tác nhân)
  const handleClearAllConversations = async () => {
    const ok = await confirm({
      title: 'Xóa toàn bộ lịch sử trò chuyện',
      message: 'Bạn có chắc chắn muốn xóa toàn bộ các cuộc trò chuyện của mình không? Toàn bộ lịch sử trao đổi sẽ bị xóa vĩnh viễn.',
      variant: 'danger',
      confirmText: 'Xác nhận xóa tất cả',
    });
    if (!ok) return;

    try {
      await api.chat.clearConversations();
      handleNewChat();
      loadConversations();
      showSuccess('Đã xóa toàn bộ lịch sử trò chuyện thành công!');
    } catch (_) {
      showError('Không thể xóa toàn bộ lịch sử trò chuyện.');
      setErrorMessage('Không thể xóa toàn bộ lịch sử trò chuyện.');
    }
  };


  // Dừng quá trình sinh phản hồi
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setStatusText(null);
  };

  // Gửi tin nhắn
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputValue).trim();
    if (!textToSend || isGenerating) return;

    setInputValue('');
    setErrorMessage(null);
    setStatusText('Đang kết nối tới AI...');

    // Tạo ID tạm cho tin nhắn user & assistant
    const userMsgId = Date.now();
    const assistantMsgId = userMsgId + 1;

    const userMessage: ChatMessage = {
      id: userMsgId,
      conversation_id: currentConversationId || 0,
      role: 'user',
      content: textToSend,
      created_at: new Date().toISOString(),
    };

    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      conversation_id: currentConversationId || 0,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      tool_calls: [],
      sources: [],
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (user) {
        // Luồng người dùng đã đăng nhập (SSE có xác thực)
        await api.chat.streamChat(
          {
            conversation_id: currentConversationId,
            message: textToSend,
          },
          {
            onStatus: (status) => {
              setStatusText(status);
            },
            onToolCall: (toolCall) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        tool_calls: [...(msg.tool_calls || []), toolCall],
                      }
                    : msg
                )
              );
            },
            onDelta: (chunk) => {
              setStatusText(null);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: msg.content + chunk }
                    : msg
                )
              );
            },
            onDone: (data) => {
              setIsGenerating(false);
              setStatusText(null);
              if (data.conversation_id) {
                setCurrentConversationId(data.conversation_id);
                loadConversations();
              }
              if (data.sources) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, sources: data.sources }
                      : msg
                  )
                );
              }
            },
            onError: (err) => {
              setIsGenerating(false);
              setStatusText(null);
              setErrorMessage(err.message || 'Lỗi kết nối khi gửi tin nhắn.');
              setMessages((prev) =>
                prev.filter((msg) => msg.id !== assistantMsgId || msg.content.trim().length > 0)
              );
            },
          },
          controller.signal
        );
      } else {
        // Luồng khách vãng lai (Public Chat SSE)
        await api.chat.streamPublicChat(
          textToSend,
          {
            onStatus: (status) => {
              setStatusText(status);
            },
            onDelta: (chunk) => {
              setStatusText(null);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: msg.content + chunk }
                    : msg
                )
              );
            },
            onDone: (data) => {
              setIsGenerating(false);
              setStatusText(null);
              if (data.sources) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, sources: data.sources }
                      : msg
                  )
                );
              }
            },
            onError: (err) => {
              setIsGenerating(false);
              setStatusText(null);
              setErrorMessage(err.message || 'Lỗi khi gửi câu hỏi.');
              setMessages((prev) =>
                prev.filter((msg) => msg.id !== assistantMsgId || msg.content.trim().length > 0)
              );
            },
          },
          controller.signal
        );
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setIsGenerating(false);
        setStatusText(null);
        setErrorMessage(err.message || 'Không thể gửi tin nhắn.');
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== assistantMsgId || msg.content.trim().length > 0)
        );
      }
    }
  };

  // Mở modal feedback
  const openFeedbackModal = (messageId: number, type: 'up' | 'down') => {
    setFeedbackModalMsgId(messageId);
    setFeedbackType(type);
    setFeedbackNote('');
  };

  // Gửi feedback
  const submitFeedback = async () => {
    if (!feedbackModalMsgId) return;
    try {
      await api.chat.sendFeedback(feedbackModalMsgId, feedbackType, feedbackNote);
      setMessages((prev) =>
        prev.map((m) => (m.id === feedbackModalMsgId ? { ...m, feedback: feedbackType } : m))
      );
      setFeedbackModalMsgId(null);
      setFeedbackNote('');
      showSuccess('Cảm ơn bạn đã đóng góp phản hồi chất lượng câu trả lời!');
    } catch (_) {
      showError('Không thể gửi đánh giá vào lúc này.');
    }
  };

  // Gợi ý câu hỏi nhanh theo vai trò
  const getPromptSuggestions = () => {
    if (!user) {
      return [
        'Câu lạc bộ có những ban chuyên môn nào?',
        'Điều kiện và quy trình gia nhập CLB?',
        'Các sự kiện công khai sắp tới là gì?',
        'Thông tin liên hệ Ban Chủ nhiệm',
      ];
    }
    if (user.role === 'admin') {
      return [
        'Thống kê tổng thể toàn CLB',
        'Có đơn gia nhập nào đang chờ duyệt?',
        'Các công việc bị quá hạn deadline',
        'Số dư và thu chi sổ quỹ',
      ];
    }
    if (user.is_treasurer) {
      return [
        'Số dư tồn quỹ và báo cáo thu chi',
        'Có đề xuất chi nào đang chờ duyệt?',
        'Tỷ lệ thu hội phí kỳ này',
        'Danh sách thành viên quá hạn nộp phí',
      ];
    }
    if (user.role === 'department_head') {
      return [
        'Công việc trong ban của tôi',
        'Tình hình nộp phí của các thành viên ban',
        'Soạn nháp kế hoạch sự kiện mới',
        'Thành viên ban chuyên môn',
      ];
    }
    // Member
    return [
      'Hội phí của tôi còn nợ bao nhiêu?',
      'Tôi có công việc nào sắp đến hạn không?',
      'Sự kiện sắp tới của CLB',
      'Quy định điểm danh bằng ảnh selfie',
    ];
  };

  return (
    <>
      {/* Nút nổi mở Chatbot với phong cách đồng bộ hệ thống */}
      {!isOpen && (
        <button
          id="btn-open-chatbot"
          onClick={() => setIsOpen(true)}
          className="chat-floating-btn"
          title="Mở Trợ lý AI Câu lạc bộ"
        >
          <div className="chat-floating-icon">
            <Bot size={20} />
          </div>
          <div className="chat-floating-text">
            <span className="chat-floating-title">Trợ lý AI</span>
            <span className="chat-floating-status">
              <span className="chat-status-dot" /> Trực tuyến
            </span>
          </div>
        </button>
      )}

      {/* Cửa sổ Chatbot phong cách hiện đại, tinh gọn */}
      {isOpen && (
        <div id="chatbot-window" className={`chat-window ${isExpanded ? 'expanded' : ''}`}>
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="chat-header-avatar">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="chat-header-title">Trợ Lý AI CLB</h3>
                <div className="chat-header-subtitle">
                  <span className="chat-status-dot" /> Sẵn sàng hỗ trợ 24/7
                </div>
              </div>
            </div>

            <div className="chat-header-actions">
              {user && (
                <>
                  <button
                    onClick={handleNewChat}
                    title="Cuộc trò chuyện mới"
                    className="chat-btn-icon"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                    title="Lịch sử hội thoại"
                    className={`chat-btn-icon ${isHistoryOpen ? 'active' : ''}`}
                  >
                    <History size={16} />
                  </button>
                </>
              )}
              <button
                id="chatbot-toggle-expand"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Thu nhỏ giao diện' : 'Mở rộng toàn màn hình'}
                className={`chat-btn-icon ${isExpanded ? 'active' : ''}`}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Đóng chat"
                className="chat-btn-icon"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Drawer Lịch sử hội thoại */}
          {isHistoryOpen && user && (
            <div className="chat-history-drawer">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '10px',
                  borderBottom: '1px solid var(--border-subtle)',
                  marginBottom: '12px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Clock size={14} style={{ color: '#ea580c' }} /> Lịch sử trò chuyện
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {conversations.length > 0 && (
                    <button
                      onClick={handleClearAllConversations}
                      title="Xóa toàn bộ lịch sử trò chuyện"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.725rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 4px',
                      }}
                    >
                      <Trash2 size={12} />
                      <span>Xóa tất cả</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsHistoryOpen(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                    }}
                  >
                    Đóng
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {conversations.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                    Chưa có cuộc trò chuyện nào trước đó.
                  </p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => selectConversation(c.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: currentConversationId === c.id ? '#fff7ed' : '#f8fafc',
                        border: currentConversationId === c.id ? '1px solid #fdba74' : '1px solid #e2e8f0',
                        color: currentConversationId === c.id ? '#ea580c' : '#334155',
                        fontWeight: currentConversationId === c.id ? 600 : 500,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <MessageSquare size={14} style={{ color: currentConversationId === c.id ? '#ea580c' : '#94a3b8', flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c.title}
                        </span>
                      </div>
                      <button
                        onClick={(e) => handleDeleteConversation(e, c.id)}
                        title="Xóa cuộc trò chuyện này"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: '3px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Nội dung danh sách tin nhắn */}
          <div className="chat-messages-container">
            {messages.length === 0 && (
              <div style={{ padding: '24px 8px', textAlign: 'center' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    margin: '0 auto 12px',
                    borderRadius: '11px',
                    background: '#ea580c',
                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                  }}
                >
                  <Bot size={22} />
                </div>
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 6px', color: '#0f172a' }}>
                  Xin chào {user ? user.full_name : 'bạn'}!
                </h4>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: '#64748b',
                    maxWidth: '300px',
                    margin: '0 auto 18px',
                    lineHeight: 1.5,
                  }}
                >
                  Tôi có thể tra cứu sự kiện, điểm danh, hội phí, công việc và quy định CLB giúp bạn.
                </p>

                {/* Gợi ý câu hỏi nhanh */}
                <div style={{ textAlign: 'left', marginTop: '14px' }}>
                  <div
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '8px',
                    }}
                  >
                    Gợi ý câu hỏi:
                  </div>
                  {getPromptSuggestions().map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(prompt)}
                      className="chat-suggestion-chip"
                    >
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {prompt}
                      </span>
                      <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Render các tin nhắn */}
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="chat-bubble-user">
                    {msg.content}
                  </div>
                );
              }

              return (
                <div key={msg.id} className="chat-assistant-row">
                  <div className="chat-assistant-avatar">
                    <Bot size={15} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: 'calc(100% - 34px)', flex: 1 }}>
                    <div className="chat-bubble-assistant">
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{msg.content}</div>

                      {/* Nguồn tài liệu tham khảo tinh gọn (ẩn chi tiết kỹ thuật/điểm số thô) */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div
                          style={{
                            marginTop: '8px',
                            paddingTop: '8px',
                            borderTop: '1px solid #f1f5f9',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              color: '#64748b',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              marginBottom: '4px',
                            }}
                          >
                            <BookOpen size={12} style={{ color: '#ea580c' }} /> Nguồn tham khảo:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {msg.sources.map((src, i) => (
                              <div key={i} className="chat-source-card">
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{src.title}</div>
                                {src.heading && (
                                  <div style={{ color: '#64748b', fontSize: '0.6875rem', marginTop: '1px' }}>
                                    Mục: {src.heading}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Thumbs Up / Down cho tin nhắn assistant */}
                    {msg.content && user && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          paddingLeft: '4px',
                          fontSize: '0.6875rem',
                          color: '#94a3b8',
                        }}
                      >
                        <button
                          onClick={() => openFeedbackModal(msg.id, 'up')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: msg.feedback === 'up' ? '#10b981' : '#94a3b8',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Câu trả lời hữu ích"
                        >
                          <ThumbsUp size={12} />
                        </button>
                        <button
                          onClick={() => openFeedbackModal(msg.id, 'down')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: msg.feedback === 'down' ? '#ef4444' : '#94a3b8',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Câu trả lời chưa tốt"
                        >
                          <ThumbsDown size={12} />
                        </button>
                        {msg.feedback && (
                          <span style={{ fontSize: '0.625rem', color: '#64748b', marginLeft: '2px' }}>
                            Đã ghi nhận
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Trạng thái sinh phản hồi / tra cứu */}
            {statusText && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  background: '#fff7ed',
                  border: '1px solid #fdba74',
                  color: '#ea580c',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  alignSelf: 'flex-start',
                }}
              >
                <Bot size={13} />
                <span>{statusText}</span>
              </div>
            )}

            {/* Banner Lỗi Thật */}
            {errorMessage && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>Thông báo:</div>
                  <div style={{ marginTop: '2px', lineHeight: 1.4 }}>{errorMessage}</div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Thanh nhập tin nhắn và nút dừng */}
          <div className="chat-footer">
            {isGenerating && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                <button
                  onClick={handleStopGeneration}
                  style={{
                    padding: '4px 12px',
                    background: '#ffffff',
                    border: '1px solid #fecaca',
                    borderRadius: '9999px',
                    color: '#ef4444',
                    fontSize: '0.725rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <Square size={11} style={{ fill: '#ef4444', color: '#ef4444' }} />
                  Dừng tạo câu trả lời
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <input
                id="chatbot-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  user
                    ? 'Hỏi về sự kiện, hội phí, công việc...'
                    : 'Hỏi về cách gia nhập, sự kiện mở...'
                }
                disabled={isGenerating}
                className="form-input"
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  fontSize: '0.8125rem',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#0f172a',
                }}
              />
              <button
                id="chatbot-send-btn"
                type="submit"
                disabled={!inputValue.trim() || isGenerating}
                className="btn btn-primary"
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  flexShrink: 0,
                  opacity: !inputValue.trim() || isGenerating ? 0.5 : 1,
                }}
              >
                <Send size={15} />
              </button>
            </form>
          </div>

          {/* Modal nhập lý do Feedback */}
          {feedbackModalMsgId && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 30,
                background: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
              }}
            >
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px',
                  width: '100%',
                  maxWidth: '320px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                }}
              >
                <h4
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    margin: '0 0 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {feedbackType === 'up' ? (
                    <ThumbsUp size={15} style={{ color: '#10b981' }} />
                  ) : (
                    <ThumbsDown size={15} style={{ color: '#ef4444' }} />
                  )}
                  {feedbackType === 'up' ? 'Đánh giá hữu ích' : 'Góp ý câu trả lời'}
                </h4>
                <textarea
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  placeholder="Nhập lý do hoặc góp ý thêm (tùy chọn)..."
                  className="form-input"
                  style={{
                    width: '100%',
                    height: '80px',
                    fontSize: '0.75rem',
                    borderRadius: '8px',
                    resize: 'none',
                    marginBottom: '12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    color: '#0f172a',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    onClick={() => setFeedbackModalMsgId(null)}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  >
                    Bỏ qua
                  </button>
                  <button
                    onClick={submitFeedback}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  >
                    Gửi phản hồi
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
