(() => {
    'use strict';
    const P = window.SnappyPilot;
    const editors = new WeakMap();
    let compose, messageView, controller;
    const enabled = () => !!rl.pluginSettingsGet('snappy-pilot', 'enabled');

    class Controller {
        constructor(editor) {
            this.editor = editor;
            this.generation = 0;
            this.ui = new P.UI(editor.ui.container, () => this.close());
            const container = editor.ui.container;
            container.classList.add('sp-pilot-host');
            container.addEventListener('input', event => {
                if (event.isComposing || (event.target !== editor.root && event.target !== editor.ui.plain)) return;
                if (this.state && this.state !== 'menu') return;
                try {
                    const token = editor.slash();
                    if (token) this.open(token);
                    else if (this.state === 'menu') this.close(false);
                } catch { this.close(false); }
            });
            container.addEventListener('keydown', event => {
                if (this.state === 'menu') this.ui.menuKey(event);
                else if (this.state && event.key === 'Escape') {
                    event.preventDefault(); event.stopImmediatePropagation(); this.close();
                }
            }, true);
            container.addEventListener('change', event => {
                if (event.target === editor.ui.modeSelect) this.close(false);
            });
            document.addEventListener('mousedown', event => {
                if (this.state === 'menu' && !container.contains(event.target)) this.close(false);
            });
            editor.vm.modalVisible.subscribe(visible => { if (!visible) this.close(false); });
        }
        open(token = null) {
            if (!enabled() || !this.editor.active()) return;
            if (this.state && this.state !== 'menu') this.close(false);
            this.state = 'menu';
            this.token = token;
            this.ui.menu(token?.query || '', command => this.select(command), !token);
        }
        close(focus = true) {
            ++this.generation;
            if (this.state === 'loading') rl.app.Remote.abort('PluginSnappyPilotGenerate');
            this.state = null;
            this.token = null;
            this.ui.clear();
            if (focus && this.editor.active()) {
                if (this.editor.ui.mode === 'plain') this.editor.ui.plain.focus();
                else this.editor.ui.squire.focus();
            }
        }
        select(command) {
            try {
                this.editor.removeSlash(this.token);
                this.token = null;
                const snapshot = this.editor.capture(command);
                const context = this.editor.context(snapshot, messageView);
                this.state = 'form';
                this.ui.form(snapshot, context, rl.pluginSettingsGet('snappy-pilot', 'language'), (instruction, language) => {
                    const payload = { action: command.id, text: snapshot.text, ...context, instruction, language };
                    delete payload.truncated;
                    this.generate(snapshot, payload);
                });
            } catch (error) { this.state = 'error'; this.ui.error(error.message); }
        }
        generate(snapshot, payload) {
            if (!this.editor.active() || this.editor.value() !== snapshot.value || this.editor.ui.mode !== snapshot.mode) {
                this.state = 'error';
                this.ui.error('Your draft changed or closed. Close this panel and run the command again.');
                return;
            }
            const request = ++this.generation;
            this.state = 'loading';
            this.ui.loading();
            const retry = () => this.generate(snapshot, payload);
            try {
                rl.pluginRemoteRequest((error, response) => {
                    if (request !== this.generation || !this.editor.active()) return;
                    const result = response?.Result;
                    if (error || !result?.ok || typeof result.text !== 'string') {
                        this.state = 'error';
                        this.ui.error(error ? 'The request failed or timed out. Check your connection and sign-in, then retry.'
                            : (result?.error || 'SnappyPilot returned an invalid response.'), retry);
                        return;
                    }
                    this.state = 'result';
                    this.ui.result(snapshot, result.text, below => {
                        try { this.editor.apply(snapshot, result.text, below); this.close(); }
                        catch (failure) { this.state = 'error'; this.ui.error(failure.message); }
                    }, retry);
                }, 'SnappyPilotGenerate', { Payload: JSON.stringify(payload) }, 100000);
            } catch {
                this.state = 'error';
                this.ui.error('SnappyMail’s request service is unavailable. Reload and try again.', retry);
            }
        }
    }

    function connect(ui) {
        if (!compose || !ui || !compose.viewModelDom?.contains(ui.container)) return null;
        if (!editors.has(ui)) {
            try { editors.set(ui, new Controller(new P.Editor(ui, compose))); }
            catch { return null; }
        }
        return (controller = editors.get(ui));
    }

    addEventListener('squire-toolbar', event => {
        const { squire: ui, actions } = event.detail || {};
        if (!enabled() || !compose?.viewModelDom?.contains(ui?.container)) return;
        actions.snappyPilot = { pilot: { html: '✦ Pilot', cmd: () => connect(ui)?.open() } };
        // SquireUI fires the event before appending the editor and toolbar DOM.
        queueMicrotask(() => connect(ui));
    });
    const lifecycle = event => {
        const vm = event.detail;
        if (vm?.viewModelTemplateID === 'Compose') {
            compose = vm;
            if (vm.oEditor?.editor && enabled()) connect(vm.oEditor.editor);
        } else if (vm?.viewModelTemplateID === 'MailMessageView') messageView = vm;
    };
    addEventListener('rl-view-model.create', lifecycle);
    addEventListener('rl-view-model', lifecycle);
    addEventListener('rl-vm-visible', lifecycle);
    addEventListener('pagehide', () => controller?.close(false));
})();
