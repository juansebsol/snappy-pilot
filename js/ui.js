(() => {
    'use strict';
    const P = window.SnappyPilot;
    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    P.Hint = class {
        constructor(host) {
            this.node = el('div', 'sp-pilot-hint');
            this.node.append(el('span', 'sp-pilot-icon', '✦'), el('span', '', 'Type / for writing help'));
            host.append(this.node);
            this.timer = 0;
        }
        seen() {
            try { return localStorage.getItem('sp-pilot-hint') === 'off'; } catch { return false; }
        }
        show() {
            if (this.seen()) return;
            clearTimeout(this.timer);
            this.node.classList.add('sp-pilot-show');
            this.timer = setTimeout(() => this.hide(), 7000);
        }
        hide() {
            clearTimeout(this.timer);
            this.node.classList.remove('sp-pilot-show');
        }
        dismiss() {
            this.hide();
            try { localStorage.setItem('sp-pilot-hint', 'off'); } catch { /* private mode */ }
        }
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
        menu(query, choose) {
            const panel = this.shell('Commands');
            const search = el('input', 'sp-pilot-search');
            search.placeholder = 'Search commands';
            search.setAttribute('aria-label', 'Search commands');
            search.value = query;
            this.list = el('div', 'sp-pilot-menu');
            this.list.setAttribute('role', 'listbox');
            this.list.setAttribute('aria-label', 'Writing commands');
            const render = value => {
                this.items = P.filter(value);
                this.index = 0;
                this.list.replaceChildren();
                this.items.forEach(command => {
                    const button = this.button('', () => choose(command));
                    button.className = 'sp-pilot-command';
                    button.setAttribute('role', 'option');
                    button.append(el('span', 'sp-pilot-icon', command.icon), el('span', '', command.label));
                    button.addEventListener('mousedown', event => event.preventDefault());
                    this.list.append(button);
                });
                if (!this.items.length) this.list.append(el('p', 'sp-pilot-note', 'No matching commands'));
                this.highlight();
            };
            this.choose = choose;
            search.addEventListener('input', () => render(search.value));
            search.addEventListener('keydown', event => this.menuKey(event));
            panel.append(search, this.list);
            render(query);
            search.focus();
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
            const instruction = el('textarea', 'sp-pilot-instruction');
            const needs = ['ask', 'custom'].includes(snapshot.command.id);
            instruction.placeholder = needs ? 'What should it say?' : 'Optional note';
            instruction.setAttribute('aria-label', 'Your instruction');
            instruction.maxLength = 4000;
            const target = el('input', 'sp-pilot-search');
            target.value = language || 'English';
            target.maxLength = 100;
            target.setAttribute('aria-label', 'Translate into');
            if (snapshot.command.id === 'translate') panel.append(el('label', 'sp-pilot-note', 'Translate into'), target);
            panel.append(instruction);
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
            const panel = this.shell('Writing');
            panel.setAttribute('aria-busy', 'true');
            const status = el('p', 'sp-pilot-status', 'Working…');
            status.setAttribute('role', 'status');
            panel.append(status, this.button('Cancel', this.onClose));
        }
        result(snapshot, text, apply, retry) {
            const panel = this.shell(snapshot.command.label);
            const output = el('pre', 'sp-pilot-text', text);
            output.setAttribute('aria-live', 'polite');
            panel.append(output);
            const actions = el('div', 'sp-pilot-actions');
            if (snapshot.command.kind !== 'info') actions.append(this.button(snapshot.text ? 'Replace' : 'Insert', () => apply(false), true));
            actions.append(this.button('Insert below', () => apply(true)), this.button('Retry', retry), this.button('Discard', this.onClose));
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
