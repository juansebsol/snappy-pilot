(() => {
    'use strict';
    const P = window.SnappyPilot;
    const protectedSelector = 'blockquote,.rl-signature';
    const ancestor = node => node.nodeType === 1 ? node : node.parentElement;

    P.Editor = class {
        constructor(ui, vm) {
            if (!ui?.squire?.getRoot || !ui?.squire?.insertPlainText || !ui?.plain) {
                throw new Error('The supported Squire editor is unavailable.');
            }
            this.ui = ui;
            this.vm = vm;
            this.root = ui.squire.getRoot();
        }

        active() {
            return this.root.isConnected && P.read(this.vm.modalVisible) && !this.vm.mailvelope
                && ['wysiwyg', 'plain'].includes(this.ui.mode);
        }

        value() { return this.ui.mode === 'plain' ? this.ui.plain.value : this.ui.squire.getHTML(); }

        /** True when the editable draft (excluding quotes/signatures) has no user text. */
        empty() {
            if (!this.active()) return false;
            if (this.ui.mode === 'plain') return !this.ui.plain.value.trim();
            try { return !P.plain(this.draftRange().cloneContents()).trim(); }
            catch { return false; }
        }

        selection() {
            if (this.ui.mode === 'plain') {
                return { start: this.ui.plain.selectionStart, end: this.ui.plain.selectionEnd };
            }
            const range = this.ui.squire.getSelection()?.cloneRange();
            if (!range || !this.root.contains(range.startContainer) || !this.root.contains(range.endContainer)) {
                return this.draftRange();
            }
            return range;
        }

        safe(range) {
            if (this.ui.mode === 'plain') return true; // Explicit selections only in plain mode.
            if (ancestor(range.startContainer)?.closest(protectedSelector)
                || ancestor(range.endContainer)?.closest(protectedSelector)) return false;
            return ![...this.root.querySelectorAll(protectedSelector)].some(node => range.intersectsNode(node));
        }

        draftRange() {
            const range = document.createRange();
            range.selectNodeContents(this.root);
            const stops = [...this.root.querySelectorAll(protectedSelector)].map(node => {
                while (node.parentNode !== this.root) node = node.parentNode;
                if (node.matches('blockquote') && node.previousElementSibling?.matches('p')) {
                    node = node.previousElementSibling;
                }
                return node;
            });
            if (stops.length) {
                const first = [...this.root.childNodes].find(node => stops.includes(node));
                if (first) range.setEndBefore(first);
            }
            return range;
        }

        capture(command) {
            if (!this.active()) throw new Error('Open a compose window with the Squire editor first.');
            let range = this.selection();
            const plain = this.ui.mode === 'plain';
            const selected = plain ? range.start !== range.end : !range.collapsed;
            let scope = 'Selected text';
            if (!selected) {
                if (plain) {
                    range = { start: 0, end: this.ui.plain.value.length };
                    scope = 'Current draft';
                } else {
                    range = this.draftRange();
                    scope = 'Current draft';
                }
            }
            if (!this.safe(range)) throw new Error('Choose draft text outside signatures and quoted history.');
            const text = plain ? this.ui.plain.value.slice(range.start, range.end) : P.plain(range.cloneContents());
            if (new TextEncoder().encode(text).length > 16000) throw new Error('The draft is too large. Select a shorter passage.');
            if (command.kind === 'transform' && !text) throw new Error('Write a draft first, then run this command.');
            return { range, text, scope, mode: this.ui.mode, value: this.value(), command };
        }

        apply(snapshot, text, below = false) {
            if (!this.active() || this.ui.mode !== snapshot.mode || this.value() !== snapshot.value) {
                throw new Error('Your draft changed or closed. Discard this result and run the command again.');
            }
            const range = snapshot.mode === 'plain' ? { ...snapshot.range } : snapshot.range.cloneRange();
            if (!this.safe(range)) throw new Error('The insertion point is no longer safe. Run the command again.');
            if (snapshot.mode === 'plain') {
                const input = this.ui.plain;
                input.focus();
                if (below) range.start = range.end;
                input.setRangeText((below ? '\n\n' : '') + text, range.start, range.end, 'end');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                if (below) range.collapse(false);
                this.ui.squire.focus();
                this.ui.squire.setSelection(range);
                this.ui.squire.saveUndoState();
                // Squire escapes plain text itself and handles deletion, formatting and undo.
                this.ui.squire.insertPlainText((below ? '\n\n' : '') + text);
            }
        }

        slash() {
            if (!this.active()) return null;
            const range = this.selection();
            if (this.ui.mode === 'plain') {
                if (range.start !== range.end) return null;
                const prefix = this.ui.plain.value.slice(0, range.start);
                if (!/(?:^|[\s\u00a0])\/$/.test(prefix)) return null;
                return { query: '', range: { start: range.start - 1, end: range.end } };
            }
            if (!range.collapsed || !this.safe(range)) return null;
            const prefix = this.linePrefix(range);
            if (!/(?:^|[\s\u00a0])\/$/.test(prefix)) return null;
            if (range.startContainer.nodeType === 3 && range.startOffset > 0) {
                range.setStart(range.startContainer, range.startOffset - 1);
            }
            return { query: '', range };
        }

        linePrefix(range) {
            const block = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)
                ?.closest('div,p,li,td,pre') || this.root;
            const prefix = range.cloneRange();
            prefix.selectNodeContents(block);
            prefix.setEnd(range.startContainer, range.startOffset);
            return prefix.toString();
        }

        commandStart() {
            if (!this.active()) return false;
            try {
                if (this.ui.mode === 'plain') {
                    const start = this.ui.plain.selectionStart, end = this.ui.plain.selectionEnd;
                    if (start !== end) return false;
                    return this.slashBoundary(this.ui.plain.value.slice(0, start));
                }
                const range = this.ui.squire.getSelection()?.cloneRange();
                if (!range) return !String(this.root.textContent || '').trim();
                if (!range.collapsed) return false;
                return this.slashBoundary(this.linePrefix(range));
            } catch { return false; }
        }

        slashBoundary(prefix) {
            return prefix === '' || /[\s\u00a0]$/.test(prefix);
        }

        removeSlash(token) {
            if (!token) return;
            const current = this.slash();
            if (!current || current.query !== token.query) throw new Error('The command location changed. Try again.');
            if (this.ui.mode === 'plain') {
                this.ui.plain.setRangeText('', current.range.start, current.range.end, 'end');
                this.ui.plain.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                this.ui.squire.setSelection(current.range);
                this.ui.squire.insertPlainText('');
            }
        }

        context(snapshot, messageView) {
            const vm = this.vm;
            const details = { subject: '', to: '', cc: '', context: '', truncated: false };
            if (snapshot.command.kind === 'transform') return details;
            for (const key of ['subject', 'to', 'cc']) {
                details[key] = P.limit(String(P.read(vm[key]) || ''), key === 'subject' ? 1000 : 2000).text;
            }
            let context = '';
            // Prefer the quoted email already inside this exact compose session.
            if (this.ui.mode === 'wysiwyg') {
                const quote = this.root.querySelector('blockquote');
                if (quote) context = P.plain(quote);
            }
            // Only use a displayed message if its folder+UID matches this reply/forward.
            const message = P.read(messageView?.message);
            const info = vm.aDraftInfo;
            if (!context && info && message && String(info[1]) === String(message.uid) && info[2] === message.folder) {
                context = String(P.read(message.plain) || '');
                if (!context && message.body) context = P.plain(message.body);
                if (context) context = 'From: ' + String(message.from || '') + '\n' + context;
            }
            const bounded = P.limit(context, 24000);
            details.context = bounded.text;
            details.truncated = bounded.truncated;
            return details;
        }
    };
})();
