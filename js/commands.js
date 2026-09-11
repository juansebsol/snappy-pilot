/* Loaded in order by SnappyMail's plugin compiler; no build step required. */
(() => {
    'use strict';
    const pilot = window.SnappyPilot = {};
    pilot.commands = [
        ['draft_reply', 'Draft reply', '↗', 'reply'],
        ['reply_positive', 'Reply positively', '↪', 'reply'],
        ['decline', 'Decline politely', '↪', 'reply'],
        ['improve', 'Improve writing', '✎', 'transform'],
        ['shorter', 'Make shorter', '−', 'transform'],
        ['longer', 'Make longer', '+', 'transform'],
        ['professional', 'Make professional', '◇', 'transform'],
        ['friendly', 'Make friendlier', '☺', 'transform'],
        ['grammar', 'Fix grammar', '✓', 'transform'],
        ['translate', 'Translate', '◎', 'transform'],
        ['summarize', 'Summarize thread', '≡', 'info'],
        ['ask', 'Ask about this email', '?', 'info'],
        ['custom', 'Custom instruction', '✦', 'custom']
    ].map(([id, label, icon, kind]) => ({ id, label, icon, kind }));
    pilot.filter = query => {
        const needle = query.trim().toLowerCase().replace(/\s+/g, '');
        if (!needle) return pilot.commands;
        return pilot.commands.filter(command =>
            command.label.toLowerCase().replace(/\s+/g, '').includes(needle)
            || command.id.replace(/_/g, '').includes(needle));
    };
    pilot.read = value => typeof value === 'function' ? value() : value;
    pilot.limit = (text, bytes) => {
        const encoder = new TextEncoder();
        if (encoder.encode(text).length <= bytes) return { text, truncated: false };
        let result = '', count = 0;
        for (const char of text) {
            const size = encoder.encode(char).length;
            if (count + size > bytes - 25) break;
            result += char;
            count += size;
        }
        return { text: result + '\n[Context truncated]', truncated: true };
    };
    pilot.plain = fragment => {
        const copy = fragment.cloneNode(true);
        copy.querySelectorAll?.('script,style,iframe,object,img,svg,canvas').forEach(node => node.remove());
        copy.querySelectorAll?.('br').forEach(node => node.replaceWith('\n'));
        copy.querySelectorAll?.('div,p,li,tr,blockquote,h1,h2,h3').forEach(node => node.append('\n'));
        return (copy.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    };
})();
