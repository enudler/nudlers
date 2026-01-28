import React, { useState, useRef, useEffect, useCallback } from 'react';
import { logger } from '../utils/client-logger';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StorageIcon from '@mui/icons-material/Storage';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import ChatIcon from '@mui/icons-material/Chat';
import { useAI } from '../context/AIContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'thinking' | 'fetching' | 'streaming' | 'complete' | 'error';
}

interface ChatSession {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
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

export const DRAWER_WIDTH = 400;

const AIAssistant: React.FC<AIAssistantProps> = ({ screenContext }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isOpen, closeAI, initialPrompt, setInitialPrompt } = useAI();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
    if (isOpen && !isMobile && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMobile]);

  // Load sessions when drawer opens
  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  // Handle initial prompt from context (context-aware triggers)
  useEffect(() => {
    if (isOpen && initialPrompt) {
      // If we are already mid-generation, wait? No, just replace or append.
      // Usually triggers start a new context.
      // We will clear existing state if needed or append.
      // Let's verify if we should start a new chat?
      if (!isLoading) {
        // If message list is empty, just send.
        // If not empty, maybe we want to continue conversation?
        // For now, let's just send it.
        sendMessage(initialPrompt);
        setInitialPrompt('');
      }
    }
  }, [initialPrompt, isOpen]); // removed dependency on sendMessage to avoid loop, it's useCallback anyway

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/chat/history');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      logger.error('Failed to fetch sessions', error as Error);
    }
  };

  const fetchMessages = async (sessionId: number) => {
    setIsLoading(true);
    setMessages([]); // Clear current view while loading
    try {
      const response = await fetch(`/api/chat/messages?sessionId=${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
          status: 'complete'
        })));
        setCurrentSessionId(sessionId);
        setShowHistory(false); // Go back to chat
      }
    } catch (error) {
      logger.error('Failed to fetch messages', error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setCurrentSessionId(null);
    setMessages([]);
    setInputValue('');
    setShowHistory(false);
    setIsLoading(false);
    setCurrentStatus('');
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    try {
      const response = await fetch('/api/chat/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId })
      });
      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          startNewChat();
        }
      }
    } catch (error) {
      logger.error('Failed to delete session', error as Error);
    }
  };

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

    // Set a timeout
    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setMessages(prev => prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: 'Error: Request timed out. The AI might be taking too long to analyze.', status: 'error' }
            : m
        ));
        setIsLoading(false);
        setCurrentStatus('');
      }
    }, 45000);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          context: screenContext,
          sessionId: currentSessionId
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

              // Handle session assignment
              if (data.status === 'session_assigned' && !currentSessionId) {
                setCurrentSessionId(data.sessionId);
                // We don't need to refetch full sessions list immediately visibly,
                // but good to update it in background
                fetchSessions();
              }

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
              logger.error('Failed to parse SSE data', e as Error);
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
      // If session was created, ensure title is updated
      fetchSessions();
    }
  }, [isLoading, screenContext, currentSessionId]);

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

  // Helper to detect Hebrew text
  const isHebrew = (text: string) => {
    return /[\u0590-\u05FF]/.test(text);
  };

  const getStatusIcon = (status?: string) => {
    if (status === 'fetching') {
      return <StorageIcon sx={{ fontSize: 16, color: 'white' }} />;
    }
    return <SmartToyIcon sx={{ fontSize: 16, color: 'white' }} />;
  };

  // Render content
  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={closeAI}
      variant={isMobile ? 'temporary' : 'persistent'}
      ModalProps={{
        keepMounted: true, // Better open performance
        hideBackdrop: !isMobile, // No backdrop on desktop to allow interaction
      }}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 400,
          background: theme.palette.mode === 'dark'
            ? 'rgba(15, 23, 42, 0.95)'
            : 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(12px)',
          borderLeft: `1px solid ${theme.palette.divider}`,
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)'
        }
      }}
      transitionDuration={300}
    >
      {/* Header */}
      <Box
        sx={{
          padding: '16px',
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          background: theme.palette.mode === 'dark'
            ? 'rgba(99, 102, 241, 0.1)'
            : 'rgba(99, 102, 241, 0.05)',
        }}
      >
        <Box sx={{
          width: 40,
          height: 40,
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
        }}>
          <AutoAwesomeIcon sx={{ color: 'white', fontSize: 24 }} />
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            AI Assistant
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {currentSessionId
              ? sessions.find(s => s.id === currentSessionId)?.title || 'Current Session'
              : 'New Conversation'}
          </Typography>
        </Box>

        <IconButton onClick={() => setShowHistory(!showHistory)} color={showHistory ? 'primary' : 'default'} title="History">
          <HistoryIcon />
        </IconButton>
        <IconButton onClick={closeAI} edge="end" title="Close">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content Area */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {showHistory ? (
          // HISTORY VIEW
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <Box sx={{ p: 2 }}>
              <ListItemButton
                onClick={startNewChat}
                sx={{
                  borderRadius: '12px',
                  border: '1px dashed',
                  borderColor: theme.palette.divider,
                  mb: 2,
                  justifyContent: 'center',
                  py: 1.5,
                  color: theme.palette.primary.main
                }}
              >
                <AddIcon sx={{ mr: 1 }} />
                <Typography fontWeight={600}>New Chat</Typography>
              </ListItemButton>

              <Typography variant="overline" sx={{ px: 1, color: 'text.secondary', fontWeight: 700 }}>
                Recent Conversations
              </Typography>

              <List>
                {sessions.map(session => (
                  <ListItem
                    key={session.id}
                    disablePadding
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={(e) => deleteSession(e, session.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    }
                    sx={{
                      mb: 1,
                      '&:hover .MuiIconButton-root': { opacity: 1 }
                    }}
                  >
                    <ListItemButton
                      onClick={() => fetchMessages(session.id)}
                      selected={currentSessionId === session.id}
                      sx={{ borderRadius: '10px' }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <ChatIcon fontSize="small" color={currentSessionId === session.id ? 'primary' : 'inherit'} />
                      </ListItemIcon>
                      <ListItemText
                        primary={session.title || 'Untitled Conversation'}
                        secondary={new Date(session.updated_at).toLocaleDateString()}
                        primaryTypographyProps={{
                          noWrap: true,
                          fontSize: '0.9rem',
                          fontWeight: currentSessionId === session.id ? 600 : 400
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>

              {sessions.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <Typography variant="body2">No history yet</Typography>
                </Box>
              )}
            </Box>
          </Box>
        ) : (
          // CHAT VIEW
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Messages */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {messages.length === 0 && !isLoading ? (
                <Box sx={{ mt: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    I can help you analyze your finances.<br />Try asking something like:
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {QUICK_PROMPTS.map((q, i) => (
                      <Box
                        key={i}
                        onClick={() => sendMessage(q.prompt)}
                        sx={{
                          p: 1.5,
                          borderRadius: '10px',
                          background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                          border: `1px solid ${theme.palette.divider}`,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: '0.85rem',
                          transition: 'all 0.2s',
                          '&:hover': {
                            borderColor: theme.palette.primary.main,
                            background: theme.palette.mode === 'dark' ? 'rgba(99, 102, 241, 0.1)' : '#eff6ff',
                            color: theme.palette.primary.main
                          }
                        }}
                      >
                        {q.label}
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : (
                messages.map((message) => (
                  <Box
                    key={message.id}
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '90%',
                      flexDirection: message.role === 'user' ? 'row-reverse' : 'row'
                    }}
                  >
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '8px',
                        background: message.role === 'user'
                          ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)'
                          : message.status === 'error'
                            ? 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'
                            : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mt: 0.5
                      }}
                    >
                      {message.role === 'user' ? (
                        <PersonIcon sx={{ fontSize: 16, color: 'white' }} />
                      ) : (
                        getStatusIcon(message.status)
                      )}
                    </Box>
                    <Box
                      sx={{
                        padding: '10px 14px',
                        borderRadius: message.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
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
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                      }}
                    >
                      {message.content ? (
                        <Box sx={{
                          '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
                          '& ul, & ol': { m: 0, pl: 2, mb: 1 },
                          '& li': { mb: 0.5 },
                          direction: isHebrew(message.content) ? 'rtl' : 'ltr',
                          textAlign: isHebrew(message.content) ? 'right' : 'left',
                        }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </Box>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.palette.text.secondary, fontSize: '0.8rem' }}>
                          <CircularProgress size={12} color="inherit" />
                          {currentStatus || 'Thinking...'}
                        </span>
                      )}
                    </Box>
                  </Box>
                ))
              )}
              <div ref={messagesEndRef} />
            </Box>

            {/* Input */}
            <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10 }}>
                <TextField
                  inputRef={inputRef}
                  fullWidth
                  multiline
                  maxRows={4}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask anything..."
                  disabled={isLoading}
                  variant="outlined"
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px',
                      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'white'
                    }
                  }}
                />
                <IconButton
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '12px',
                    flexShrink: 0,
                    background: inputValue.trim() && !isLoading
                      ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                      : theme.palette.action.disabledBackground,
                    color: 'white',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    }
                  }}
                >
                  <SendIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </form>
            </Box>

          </Box>
        )}

      </Box>
    </Drawer>
  );
};

export default AIAssistant;
