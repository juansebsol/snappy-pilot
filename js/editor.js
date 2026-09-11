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

        selection() {
            if (this.ui.mode === 'plain') {
                return { start: this.ui.plain.selectionStart, end: this.ui.plain.selectionEnd };
            }
            const range = this.ui.squire.getSelection()?.cloneRange();
            if (!range || !this.root.contains(range.startContainer) || !this.root.contains(range.endContainer)) {
                throw new Error('Place the cursor inside your draft first.');
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
            // Forwarded bodies and imported drafts have no trustworthy draft boundary.
            if (this.vm.aDraftInfo?.[0] === 'forward' || this.vm.bFromDraft || P.read(this.vm.draftUid)) return null;
            const stops = [...this.root.querySelectorAll(protectedSelector)].map(node => {
                while (node.parentNode !== this.root) node = node.parentNode;
                // SnappyMail generates a reply attribution paragraph immediately before the quote.
                if (node.matches('blockquote') && node.previousElementSibling?.matches('p')) {
                    node = node.previousElementSibling;
                }
                return node;
            });
            if (stops.length) {
                const first = [...this.root.childNodes].find(node => stops.includes(node));
                range.setEndBefore(first);
            }
            return range;
        }

        capture(command) {
            if (!this.active()) throw new Error('Open a compose window with the Squire editor first.');
            let range = this.selection();
            const plain = this.ui.mode === 'plain';
            const selected = plain ? range.start !== range.end : !range.collapsed;
            if (!this.safe(range)) throw new Error('Choose draft text outside signatures and quoted history.');
            let scope = 'Selected text';
            if (!selected) {
                const draft = plain ? null : this.draftRange();
                if (draft) { range = draft; scope = 'Editable draft above signature and quoted history'; }
                else if (command.kind === 'transform') {
                    throw new Error('Select the exact draft text to change. This editor has no reliable whole-draft boundary.');
                } else { scope = 'Cursor position · no existing text will be replaced'; }
            }
            const text = plain ? this.ui.plain.value.slice(range.start, range.end) : P.plain(range.cloneContents());
            if (new TextEncoder().encode(text).length > 16000) throw new Error('The draft is too large. Select a shorter passage.');
            if (command.kind === 'transform' && !text) throw new Error('Write or select some draft text first.');
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
                const match = prefix.match(/(?:^|\n)[ \t]*\/([a-z ]{0,35})$/i);
                if (!match) return null;
                return { query: match[1], range: { start: range.start - match[1].length - 1, end: range.end } };
            }
            if (!range.collapsed || range.startContainer.nodeType !== 3 || !this.safe(range)) return null;
            const node = range.startContainer;
            const block = node.parentElement.closest('div,p,li,td,pre') || this.root;
            const prefix = range.cloneRange();
            prefix.selectNodeContents(block);
            prefix.setEnd(node, range.startOffset);
            const match = prefix.toString().match(/^\s*\/([a-z ]{0,35})$/i);
            if (!match || range.startOffset < match[1].length + 1) return null;
            range.setStart(node, range.startOffset - match[1].length - 1);
            return { query: match[1], range };
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
