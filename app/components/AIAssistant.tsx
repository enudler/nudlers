import React, { useState, useRef, useEffect, useCallback } from 'react';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Paper from '@mui/material/Paper';
import Fade from '@mui/material/Fade';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StorageIcon from '@mui/icons-material/Storage';
import CloseIcon from '@mui/icons-material/Close';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'thinking' | 'fetching' | 'streaming' | 'complete' | 'error';
}

interface ScreenContext {
  view: string;
  dateRange?: {
    startDate: string;
    endDate: string;
    mode: string;
  };
  summary?: {
    totalIncome: number;
    totalExpenses: number;
    creditCardExpenses: number;
    categories: Array<{ name: string; value: number }>;
  };
  transactions?: Array<{
    name: string;
    amount: number;
    category: string;
    date: string;
  }>;
}

interface AIAssistantProps {
  screenContext?: ScreenContext;
}

const QUICK_PROMPTS = [
  { label: "📊 Category breakdown", prompt: "Show my spending breakdown by category for this month with amounts and percentages" },
  { label: "💰 Top expenses", prompt: "List my 10 biggest transactions this month with amounts" },
  { label: "📈 Monthly comparison", prompt: "Compare this month vs last month spending - what changed the most?" },
  { label: "🔄 Recurring costs", prompt: "Show all my recurring subscriptions and installment plans with monthly costs" },
];

const AIAssistant: React.FC<AIAssistantProps> = ({ screenContext }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date(),
    };

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'thinking',
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInputValue('');
    setIsLoading(true);
    setCurrentStatus('Thinking...');

    // Set a timeout to abort the request if it takes too long
    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setMessages(prev => prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: 'Error: Request timed out after 45 seconds. The AI might be taking too long to analyze your data. Try a more specific question.', status: 'error' }
            : m
        ));
        setIsLoading(false);
        setCurrentStatus('');
      }
    }, 45000); // 45 second timeout

    try {
      const response = await fetch('/api/ai_chat_stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          context: screenContext,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.error) {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, content: `Error: ${data.error}`, status: 'error' }
                    : m
                ));
                setCurrentStatus('');
              } else if (data.status === 'thinking') {
                setCurrentStatus('Thinking...');
              } else if (data.status === 'fetching_data') {
                const statusMsg = data.message || `Fetching ${data.functions?.join(', ') || 'data'}...`;
                setCurrentStatus(statusMsg);
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, status: 'fetching', content: '' }
                    : m
                ));
              } else if (data.status === 'streaming' || data.status === 'complete') {
                setCurrentStatus(data.status === 'streaming' ? 'Writing...' : '');
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessageId
                    ? {
                      ...m,
                      content: data.text || '',
                      status: data.done ? 'complete' : 'streaming'
                    }
                    : m
                ));
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      clearTimeout(timeoutId);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? { ...m, content: `Error: ${(err as Error).message}`, status: 'error' }
          : m
      ));
    } finally {
      setIsLoading(false);
      setCurrentStatus('');
    }
  }, [isLoading, screenContext]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const clearChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setIsLoading(false);
    setCurrentStatus('');
  };

  const formatContent = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const getStatusIcon = (status?: string) => {
    if (status === 'fetching') {
      return <StorageIcon sx={{ fontSize: 16, color: 'white' }} />;
    }
    return <SmartToyIcon sx={{ fontSize: 16, color: 'white' }} />;
  };

  // Shared panel content
  const renderPanelContent = () => (
    <>
      {/* Header */}
      <Box
        sx={{
          padding: { xs: '12px 16px', md: '14px 16px' },
          background: theme.palette.mode === 'dark'
            ? 'rgba(99, 102, 241, 0.12)'
            : 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%)',
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, md: 1.25 },
        }}
      >
        <IconButton
          size="small"
          onClick={() => setIsOpen(false)}
          sx={{
            color: '#64748b',
            '&:hover': { background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' },
          }}
        >
          {isMobile ? <CloseIcon /> : <ChevronRightIcon />}
        </IconButton>

        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 18, color: 'white' }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.palette.text.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
            AI Assistant
            {currentStatus && (
              <span style={{
                fontSize: 11,
                color: '#6366f1',
                fontWeight: 500,
                background: 'rgba(99, 102, 241, 0.1)',
                padding: '2px 8px',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <CircularProgress size={10} sx={{ color: '#6366f1' }} />
                {currentStatus}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: theme.palette.text.secondary }}>
            Can fetch & analyze your transactions
          </div>
        </div>

        {messages.length > 0 && (
          <IconButton
            size="small"
            onClick={clearChat}
            sx={{
              color: '#94a3b8',
              '&:hover': { color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' },
            }}
            title="Clear chat"
          >
            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      {/* Messages Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Welcome State */}
        {messages.length === 0 && !isLoading && (
          <div style={{ padding: '16px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}
              >
                <SmartToyIcon sx={{ fontSize: 26, color: '#6366f1' }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.palette.text.primary, marginBottom: 4 }}>
                Smart Financial Assistant
              </div>
              <div style={{ fontSize: 12, color: theme.palette.text.secondary, lineHeight: 1.5 }}>
                I can access your transactions and do calculations.
                <br />Ask me anything about your spending!
              </div>
            </div>

            {/* Quick Prompts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {QUICK_PROMPTS.map((item, index) => (
                <button
                  key={index}
                  onClick={() => sendMessage(item.prompt)}
                  style={{
                    padding: '11px 14px',
                    background: 'rgba(248, 250, 252, 0.8)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: 10,
                    color: theme.palette.text.secondary,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                    e.currentTarget.style.color = '#6366f1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(248, 250, 252, 0.8)';
                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                    e.currentTarget.style.color = '#475569';
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              gap: 10,
              flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: message.role === 'user'
                  ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)'
                  : message.status === 'error'
                    ? 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {message.role === 'user' ? (
                <PersonIcon sx={{ fontSize: 16, color: 'white' }} />
              ) : (
                getStatusIcon(message.status)
              )}
            </div>
            <div
              style={{
                maxWidth: '85%',
                padding: '10px 12px',
                borderRadius: message.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: message.role === 'user'
                  ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)'
                  : message.status === 'error'
                    ? 'rgba(239, 68, 68, 0.1)'
                    : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9'),
                color: message.role === 'user'
                  ? 'white'
                  : message.status === 'error'
                    ? theme.palette.error.main
                    : theme.palette.text.primary,
                fontSize: 13,
                lineHeight: 1.5,
                minHeight: message.status === 'thinking' || message.status === 'fetching' ? 40 : 'auto',
                display: 'flex',
                alignItems: message.content ? 'flex-start' : 'center',
              }}
            >
              {message.content ? (
                <span dangerouslySetInnerHTML={{ __html: formatContent(message.content) }} />
              ) : message.status === 'thinking' || message.status === 'fetching' || message.status === 'streaming' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
                  <CircularProgress size={14} sx={{ color: '#6366f1' }} />
                  {message.status === 'fetching' ? 'Fetching data...' :
                    message.status === 'streaming' ? 'Writing...' : 'Thinking...'}
                </span>
              ) : null}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(148, 163, 184, 0.1)',
          background: 'rgba(248, 250, 252, 0.5)',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <TextField
            inputRef={inputRef}
            fullWidth
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your transactions..."
            disabled={isLoading}
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '10px',
                backgroundColor: 'white',
                fontSize: 13,
                '& fieldset': {
                  borderColor: 'rgba(148, 163, 184, 0.3)',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(99, 102, 241, 0.5)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#6366f1',
                  borderWidth: 1,
                },
              },
              '& .MuiInputBase-input': {
                padding: '10px 12px',
                '&::placeholder': {
                  color: '#94a3b8',
                  opacity: 1,
                },
              },
            }}
          />
          <IconButton
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            sx={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: inputValue.trim() && !isLoading
                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                : '#e2e8f0',
              color: 'white',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: inputValue.trim() && !isLoading ? 'scale(1.05)' : 'none',
                background: inputValue.trim() && !isLoading
                  ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                  : '#e2e8f0',
              },
              '&.Mui-disabled': {
                color: '#94a3b8',
                background: '#e2e8f0',
              },
            }}
          >
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </form>
      </div>
    </>
  );

  return (
    <>

      {/* Chat Window */}
      <Fade in={isOpen}>
        <Paper
          elevation={24}
          sx={{
            position: 'fixed',
            right: 24,
            bottom: 96,
            width: isMobile ? 'calc(100vw - 48px)' : 400,
            height: isMobile ? 'calc(100vh - 120px)' : 600,
            maxHeight: 'calc(100vh - 120px)',
            borderRadius: '24px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1999,
            background: theme.palette.mode === 'dark'
              ? 'rgba(15, 23, 42, 0.95)'
              : 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: theme.palette.mode === 'dark'
              ? '0 20px 50px rgba(0, 0, 0, 0.5)'
              : '0 20px 50px rgba(99, 102, 241, 0.15)',
          }}
        >
          {renderPanelContent()}
        </Paper>
      </Fade>
    </>
  );
};

export default AIAssistant;
