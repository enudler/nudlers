import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AIContextType {
    isOpen: boolean;
    toggleAI: () => void;
    openAI: () => void;
    closeAI: () => void;
    initialPrompt: string;
    setInitialPrompt: (prompt: string) => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [initialPrompt, setInitialPrompt] = useState('');

    const toggleAI = () => setIsOpen((prev) => !prev);
    const openAI = () => setIsOpen(true);
    const closeAI = () => setIsOpen(false);

    return (
        <AIContext.Provider value={{ isOpen, toggleAI, openAI, closeAI, initialPrompt, setInitialPrompt }}>
            {children}
        </AIContext.Provider>
    );
};

export const useAI = (): AIContextType => {
    const context = useContext(AIContext);
    if (!context) {
        throw new Error('useAI must be used within an AIProvider');
    }
    return context;
};
