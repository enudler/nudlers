import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme, styled } from '@mui/material/styles';
import {
    Box,
    Typography,
    IconButton,
    TextField,
    CircularProgress,
    Paper,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider,
    Button,
    useMediaQuery,
    Tooltip,
    Skeleton,
} from '@mui/material';
import ForumIcon from '@mui/icons-material/Forum';
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChatIcon from '@mui/icons-material/Chat';
import { useScreenContext } from './Layout';

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

const Sidebar = styled(Box)(({ theme }) => ({
    width: 280,
    height: 'calc(100vh - 48px)',
    borderRight: `1px solid ${theme.palette.divider}`,
    display: 'flex',
    flexDirection: 'column',
    background: theme.palette.mode === 'dark'
        ? 'rgba(15, 23, 42, 0.4)'
        : 'rgba(248, 250, 252, 0.8)',
    transition: 'all 0.3s ease',
    [theme.breakpoints.down('md')]: {
        width: 0,
        overflow: 'hidden',
        borderRight: 'none',
    },
}));

const ChatContainer = styled(Box)({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 48px)',
    position: 'relative',
});

const MessagesArea = styled(Box)({
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    '&::-webkit-scrollbar': {
        width: '6px',
    },
    '&::-webkit-scrollbar-thumb': {
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: '10px',
    },
});

const InputContainer = styled(Box)(({ theme }) => ({
    padding: '24px',
    background: theme.palette.mode === 'dark' ? 'transparent' : 'white',
    borderTop: `1px solid ${theme.palette.divider}`,
}));

const ChatView: React.FC = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { screenContext } = useScreenContext();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [currentStatus, setCurrentStatus] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const fetchSessions = async () => {
        try {
            const response = await fetch('/api/chat/history');
            if (response.ok) {
                const data = await response.json();
                setSessions(data);
            }
        } catch (error) {
            console.error('Failed to fetch sessions:', error);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const fetchMessages = async (sessionId: number) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/chat/messages?sessionId=${sessionId}`);
            if (response.ok) {
                const data = await response.json();
                setMessages(data.map((m: any) => ({
                    ...m,
                    timestamp: new Date(m.timestamp),
                    status: 'complete'
                })));
            }
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const startNewChat = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setCurrentSessionId(null);
        setMessages([]);
        setInputValue('');
    };

    const selectSession = (sessionId: number) => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setCurrentSessionId(sessionId);
        fetchMessages(sessionId);
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
            console.error('Failed to delete session:', error);
        }
    };

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isLoading) return;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text.trim(),
            timestamp: new Date(),
            status: 'complete'
        };

        const assistantMsgId = (Date.now() + 1).toString();
        const assistantMsg: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            status: 'thinking'
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/ai_chat_stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    context: screenContext,
                    sessionId: currentSessionId
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to get response');
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No stream');

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

                            if (data.status === 'session_assigned' && !currentSessionId) {
                                setCurrentSessionId(data.sessionId);
                                fetchSessions(); // Refresh sessions to show the new one
                            }

                            if (data.error) {
                                setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: data.error, status: 'error' } : m));
                            } else if (data.status === 'thinking') {
                                setCurrentStatus('Thinking...');
                            } else if (data.status === 'fetching_data') {
                                setCurrentStatus(data.message || 'Fetching data...');
                            } else if (data.status === 'streaming' || data.status === 'complete') {
                                setCurrentStatus('');
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? { ...m, content: data.text, status: data.done ? 'complete' : 'streaming' }
                                        : m
                                ));
                                if (data.done) {
                                    // Session title might have been generated or session created
                                    fetchSessions();
                                }
                            }
                        } catch (e) { console.error(e); }
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: 'Error: ' + (err as Error).message, status: 'error' } : m));
            }
        } finally {
            setIsLoading(false);
            setCurrentStatus('');
        }
    }, [isLoading, currentSessionId, screenContext]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(inputValue);
    };

    const formatContent = (content: string) => {
        if (!content) return '';
        return content
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^### (.*?)$/gm, '<h4 style="margin: 16px 0 8px 0; font-weight: 700;">$1</h4>')
            .replace(/^## (.*?)$/gm, '<h3 style="margin: 16px 0 8px 0; font-weight: 700;">$1</h3>')
            .replace(/^# (.*?)$/gm, '<h2 style="margin: 16px 0 8px 0; font-weight: 700;">$1</h2>')
            .replace(/^- (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>')
            .replace(/^\d+\. (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 4px; list-style-type: decimal;">$1</li>')
            .replace(/\n\n/g, '<div style="height: 12px;"></div>')
            .replace(/\n/g, '<br/>');
    };

    return (
        <Box sx={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
            {/* Sidebar - Chat History */}
            <Sidebar>
                <Box sx={{ p: 2 }}>
                    <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={startNewChat}
                        sx={{
                            borderRadius: '12px',
                            textTransform: 'none',
                            fontWeight: 600,
                            py: 1,
                            borderColor: 'rgba(99, 102, 241, 0.3)',
                            color: '#6366f1',
                            '&:hover': {
                                borderColor: '#6366f1',
                                backgroundColor: 'rgba(99, 102, 241, 0.04)',
                            }
                        }}
                    >
                        New Chat
                    </Button>
                </Box>

                <Divider />

                <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
                    {isHistoryLoading ? (
                        <Box sx={{ p: 2 }}>
                            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} sx={{ mb: 1, height: 40, borderRadius: '8px' }} />)}
                        </Box>
                    ) : (
                        <List disablePadding>
                            {sessions.map((session) => (
                                <ListItem key={session.id} disablePadding sx={{ mb: 0.5 }}>
                                    <ListItemButton
                                        selected={currentSessionId === session.id}
                                        onClick={() => selectSession(session.id)}
                                        sx={{
                                            borderRadius: '10px',
                                            '&.Mui-selected': {
                                                backgroundColor: theme.palette.mode === 'dark'
                                                    ? 'rgba(99, 102, 241, 0.15)'
                                                    : 'rgba(99, 102, 241, 0.08)',
                                                '&:hover': {
                                                    backgroundColor: theme.palette.mode === 'dark'
                                                        ? 'rgba(99, 102, 241, 0.2)'
                                                        : 'rgba(99, 102, 241, 0.12)',
                                                }
                                            }
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 36, color: currentSessionId === session.id ? '#6366f1' : 'text.secondary' }}>
                                            <ChatIcon fontSize="small" />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={session.title || 'New Conversation'}
                                            sx={{
                                                '& .MuiTypography-root': {
                                                    fontSize: '0.875rem',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    fontWeight: currentSessionId === session.id ? 600 : 400
                                                }
                                            }}
                                        />
                                        <IconButton
                                            size="small"
                                            onClick={(e) => deleteSession(e, session.id)}
                                            sx={{ opacity: 0, '.MuiListItemButton-root:hover &': { opacity: 0.6 }, '&:hover': { opacity: 1, color: '#ef4444' } }}
                                        >
                                            <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Box>
            </Sidebar>

            {/* Main Chat Area */}
            <ChatContainer>
                <MessagesArea>
                    {messages.length === 0 ? (
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                            <Box sx={{
                                width: 80,
                                height: 80,
                                borderRadius: '24px',
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mb: 3,
                                boxShadow: '0 8px 24px rgba(99, 102, 241, 0.2)'
                            }}>
                                <ForumIcon sx={{ fontSize: 40, color: 'white' }} />
                            </Box>
                            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
                                Chat with Nudlers AI
                            </Typography>
                            <Typography variant="body1" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 400 }}>
                                Ask me anything about your expenses, budgets, or financial trends. I have full access to your transaction history.
                            </Typography>

                            <Box sx={{ mt: 4, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {["Summarize my spending this month", "What are my biggest expenses?", "How much did I spend on groceries in the last 3 months?"].map((q, i) => (
                                    <Button
                                        key={i}
                                        variant="outlined"
                                        onClick={() => sendMessage(q)}
                                        sx={{
                                            borderRadius: '20px',
                                            textTransform: 'none',
                                            borderColor: 'divider',
                                            color: 'text.secondary',
                                            '&:hover': { borderColor: '#6366f1', color: '#6366f1' }
                                        }}
                                    >
                                        {q}
                                    </Button>
                                ))}
                            </Box>
                        </Box>
                    ) : (
                        <>
                            {messages.map((msg) => (
                                <Box key={msg.id} sx={{
                                    display: 'flex',
                                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                    gap: 2,
                                    mb: 1
                                }}>
                                    <Box sx={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '10px',
                                        background: msg.role === 'user'
                                            ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)'
                                            : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        {msg.role === 'user' ? <PersonIcon sx={{ color: 'white', fontSize: 20 }} /> : <SmartToyIcon sx={{ color: 'white', fontSize: 20 }} />}
                                    </Box>
                                    <Paper sx={{
                                        p: 2,
                                        borderRadius: msg.role === 'user' ? '20px 4px 20px 20px' : '4px 20px 20px 20px',
                                        maxWidth: '80%',
                                        background: msg.role === 'user'
                                            ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)'
                                            : theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
                                        color: msg.role === 'user' ? 'white' : 'text.primary',
                                        border: msg.role === 'user' ? 'none' : `1px solid ${theme.palette.divider}`,
                                        boxShadow: 'none'
                                    }}>
                                        {msg.content ? (
                                            <Typography
                                                variant="body1"
                                                dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                                                sx={{
                                                    fontSize: '0.95rem',
                                                    lineHeight: 1.6,
                                                    color: msg.status === 'error' ? '#ef4444' : 'inherit',
                                                    fontWeight: msg.status === 'error' ? 600 : 400
                                                }}
                                            />
                                        ) : (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
                                                <CircularProgress size={16} sx={{ color: msg.role === 'user' ? 'white' : '#6366f1' }} />
                                                <Typography variant="body2" sx={{ opacity: 0.8 }}>{currentStatus || 'Thinking...'}</Typography>
                                            </Box>
                                        )}
                                    </Paper>
                                </Box>
                            ))}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </MessagesArea>

                <InputContainer>
                    <form onSubmit={handleSubmit}>
                        <Box sx={{ maxWidth: 800, mx: 'auto', display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                            <TextField
                                fullWidth
                                multiline
                                maxRows={6}
                                placeholder="Ask Nudlers Assistant..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }
                                }}
                                disabled={isLoading}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        borderRadius: '16px',
                                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8f9fa',
                                    },
                                }}
                            />
                            <IconButton
                                type="submit"
                                disabled={!inputValue.trim() || isLoading}
                                sx={{
                                    mb: 0.5,
                                    width: 48,
                                    height: 48,
                                    borderRadius: '14px',
                                    background: inputValue.trim() && !isLoading ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'rgba(0,0,0,0.05)',
                                    color: 'white',
                                    '&:hover': {
                                        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                        transform: 'translateY(-2px)'
                                    },
                                    '&.Mui-disabled': {
                                        color: 'rgba(0,0,0,0.2)',
                                    }
                                }}
                            >
                                {isLoading ? <CircularProgress size={24} color="inherit" /> : <SendIcon />}
                            </IconButton>
                        </Box>
                    </form>
                </InputContainer>
            </ChatContainer>
        </Box>
    );
};

export default ChatView;
