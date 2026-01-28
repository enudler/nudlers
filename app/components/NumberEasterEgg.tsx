import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';

/**
 * GlobalEasterEggManager - A truly encapsulated "One Place" implementation.
 * It detects "67" in any text node and celebrates!
 */
const GlobalEasterEggManager: React.FC = () => {
    useEffect(() => {
        // Track elements to avoid duplicate handling in one hover cycle
        const activeElements = new WeakSet();

        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target || activeElements.has(target)) return;

            // Avoid UI chrome and system elements
            if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'CANVAS') return;
            if (target.closest('.nudler-egg-digit')) return;

            // Search for the specific text node that contains "67"
            // We use a walker to be precise even in nested structures
            const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
            let textNode = walker.nextNode();
            let found = false;

            while (textNode) {
                const content = textNode.textContent || '';
                if (content.includes('67') && content.length < 50 && /\d/.test(content)) {
                    found = true;
                    break;
                }
                textNode = walker.nextNode();
            }

            if (found && textNode && textNode.parentElement) {
                const parent = textNode.parentElement;
                const matchIndex = (textNode.textContent || '').indexOf('67');

                // Add to active set to prevent re-triggering while hovered
                activeElements.add(parent);

                // 1. Trigger Confetti
                const rect = parent.getBoundingClientRect();
                const x = (rect.left + rect.width / 2) / window.innerWidth;
                const y = (rect.top + rect.height / 2) / window.innerHeight;

                confetti({
                    particleCount: 80,
                    spread: 60,
                    origin: { x, y },
                    colors: ['#ff4081', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
                    gravity: 1.1,
                    zIndex: 9999,
                });

                // 2. Surgical Highlight (Safe DOM manipulation)
                const textNodeAsText = textNode as Text;
                const middle = textNodeAsText.splitText(matchIndex);
                middle.splitText(2); // Split off the part after "67"


                const span = document.createElement('span');
                span.className = 'nudler-egg-digit';
                span.textContent = '67';

                parent.insertBefore(span, middle);
                parent.removeChild(middle);

                parent.classList.add('nudler-row-active');

                // 3. Cleanup on Leave
                const handleLeave = (le: MouseEvent) => {
                    const linkedTarget = le.relatedTarget as HTMLElement;
                    if (parent.contains(linkedTarget)) return;

                    // Revert: Replace span back with text node
                    if (parent.contains(span)) {
                        const newText = document.createTextNode('67');
                        parent.replaceChild(newText, span);
                        // Normalize to merge adjacent text nodes
                        parent.normalize();
                    }

                    parent.classList.remove('nudler-row-active');
                    activeElements.delete(parent);
                    parent.removeEventListener('mouseout', handleLeave);
                };
                parent.addEventListener('mouseout', handleLeave);
            }
        };


        document.addEventListener('mouseover', handleMouseOver);

        // Inject global CSS for the effects
        const style = document.createElement('style');
        style.textContent = `
            .nudler-row-active {
                /* Container level effect if needed */
                transition: all 0.3s ease;
            }
            .nudler-egg-digit {
                display: inline-block;
                color: #ff4081 !important;
                font-weight: 900 !important;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                text-shadow: 0 0 10px rgba(255, 64, 129, 0.5);
                transform: scale(1.4) translateY(-1px);
                margin: 0 1px;
                /* Clicks pass through */
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);

        return () => {
            document.removeEventListener('mouseover', handleMouseOver);
            if (document.head.contains(style)) {
                document.head.removeChild(style);
            }
        };
    }, []);

    return null;
};

export default GlobalEasterEggManager;
