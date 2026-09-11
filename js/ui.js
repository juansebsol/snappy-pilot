(() => {
    'use strict';
    const P = window.SnappyPilot;
    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    P.UI = class {
        constructor(host, onClose) {
            this.host = host;
            this.onClose = onClose;
        }
        clear() { this.node?.remove(); this.node = null; }
        shell(title, role = 'dialog') {
            this.clear();
            this.node = el('section', 'sp-pilot');
            this.node.setAttribute('role', role);
            this.node.setAttribute('aria-label', 'SnappyPilot · ' + title);
            const head = el('header', 'sp-pilot-head');
            head.append(el('span', 'sp-pilot-brand', '✦ SnappyPilot'), el('span', 'sp-pilot-title', title));
            this.node.append(head);
            this.host.append(this.node);
            return this.node;
        }
        button(text, action, primary = false) {
            const button = el('button', primary ? 'sp-pilot-button sp-pilot-primary' : 'sp-pilot-button', text);
            button.type = 'button';
            button.addEventListener('click', action);
            return button;
        }
        menu(query, choose, toolbar = false) {
            const panel = this.shell('Write with a little help');
            const search = el('input', 'sp-pilot-search');
            search.placeholder = 'Find a command…';
            search.setAttribute('aria-label', 'Find a SnappyPilot command');
            search.value = query;
            this.list = el('div', 'sp-pilot-menu');
            this.list.setAttribute('role', 'listbox');
            this.list.setAttribute('aria-label', 'Writing commands');
            const render = value => {
                this.items = P.filter(value);
                this.index = 0;
                this.list.replaceChildren();
                this.items.forEach(command => {
                    const button = this.button(command.icon + '   ' + command.label, () => choose(command));
                    button.className = 'sp-pilot-command';
                    button.setAttribute('role', 'option');
                    // Preserve Squire/plain selection when choosing with a pointer.
                    button.addEventListener('mousedown', event => event.preventDefault());
                    this.list.append(button);
                });
                if (!this.items.length) this.list.append(el('p', 'sp-pilot-note', 'No matching commands'));
                this.highlight();
            };
            this.choose = choose;
            search.addEventListener('input', () => render(search.value));
            search.addEventListener('keydown', event => this.menuKey(event));
            if (toolbar) panel.append(search);
            panel.append(this.list, el('footer', 'sp-pilot-note', '↑ ↓ Navigate · Enter Select · Esc Close'));
            render(query);
            if (toolbar) search.focus();
        }
        highlight() {
            [...this.list.children].forEach((node, index) => {
                node.setAttribute('aria-selected', String(index === this.index));
                node.classList.toggle('sp-pilot-active', index === this.index);
            });
            this.list.children[this.index]?.scrollIntoView({ block: 'nearest' });
        }
        menuKey(event) {
            if (event.isComposing) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.onClose(); }
            else if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
                event.preventDefault(); event.stopImmediatePropagation();
                if (!this.items.length) return;
                if (event.key === 'Enter') this.choose(this.items[this.index]);
                else {
                    this.index = (this.index + (event.key === 'ArrowDown' ? 1 : -1) + this.items.length) % this.items.length;
                    this.highlight();
                }
            }
        }
        form(snapshot, context, language, generate) {
            const panel = this.shell(snapshot.command.label);
            panel.append(el('p', 'sp-pilot-scope', snapshot.scope));
            if (snapshot.text) {
                const original = el('details', 'sp-pilot-original');
                original.append(el('summary', '', 'Original text'), el('pre', 'sp-pilot-text', snapshot.text));
                panel.append(original);
            }
            const instruction = el('textarea', 'sp-pilot-instruction');
            const needs = ['ask', 'custom'].includes(snapshot.command.id);
            instruction.placeholder = needs ? 'What would you like to say or ask?' : 'Additional instructions (optional)';
            instruction.setAttribute('aria-label', 'Your instruction');
            instruction.maxLength = 4000;
            const target = el('input', 'sp-pilot-search');
            target.value = language || 'English';
            target.maxLength = 100;
            target.setAttribute('aria-label', 'Translate into');
            if (snapshot.command.id === 'translate') panel.append(el('label', 'sp-pilot-note', 'Translate into'), target);
            panel.append(instruction);
            const disclosure = context.context
                ? 'Sends this text and the available reply context to your configured AI provider. Attachments are excluded.'
                : 'Sends this text and your instruction to your configured AI provider. Attachments are excluded.';
            panel.append(el('p', 'sp-pilot-note', disclosure));
            if (snapshot.command.kind === 'info') panel.append(el('p', 'sp-pilot-note', 'Uses available quoted/displayed context only; other thread messages are not fetched.'));
            if (context.truncated) panel.append(el('p', 'sp-pilot-note', 'Long email context has been shortened.'));
            const actions = el('div', 'sp-pilot-actions');
            const button = this.button('Generate', () => {
                if (needs && !instruction.value.trim()) { instruction.focus(); return; }
                if (snapshot.command.id === 'translate' && !target.value.trim()) { target.focus(); return; }
                generate(instruction.value.trim(), target.value.trim());
            }, true);
            actions.append(button, this.button('Cancel', this.onClose));
            panel.append(actions);
            instruction.focus();
        }
        loading() {
            const panel = this.shell('Working on your draft');
            panel.setAttribute('aria-busy', 'true');
            const status = el('p', 'sp-pilot-status', 'Generating a suggestion…');
            status.setAttribute('role', 'status');
            panel.append(status, this.button('Cancel', this.onClose));
        }
        result(snapshot, text, apply, retry) {
            const panel = this.shell(snapshot.command.label);
            panel.append(el('p', 'sp-pilot-scope', 'Review before applying · ' + snapshot.scope));
            const output = el('pre', 'sp-pilot-text', text);
            output.setAttribute('aria-live', 'polite');
            panel.append(output);
            const actions = el('div', 'sp-pilot-actions');
            if (snapshot.command.kind !== 'info') actions.append(this.button(snapshot.text ? 'Replace' : 'Insert', () => apply(false), true));
            actions.append(this.button('Insert below', () => apply(true)), this.button('Try again', retry), this.button('Discard', this.onClose));
            panel.append(actions);
            actions.querySelector('button').focus();
        }
        error(message, retry) {
            const panel = this.shell('Couldn’t complete that');
            const error = el('p', 'sp-pilot-error', message);
            error.setAttribute('role', 'alert');
            panel.append(error);
            if (retry) panel.append(this.button('Try again', retry, true));
            panel.append(this.button('Close', this.onClose));
            panel.querySelector('button').focus();
        }
    };
})();
