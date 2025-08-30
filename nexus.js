class NexusAI {
    constructor() {
        this.version = '3.0.0';
        this.initialized = false;
        this.state = new Proxy({
            conversations: new Map(),
            currentConversationId: null,
            isProcessing: false,
            settings: this.getDefaultSettings(),
        }, {
            set: (target, property, value) => {
                target[property] = value; return true;
            }
        });

        this.tools = this.initializeTools();
        this.speechRecognition = null;
        this.performanceObserver = null;
        this.memoryMonitor = null;
        this.debouncedUpdateModelOptions = this.debounce(() => this.updateModelOptions(), 500);
        this.init();
    }

    async init() {
        try {
            await this.showLoadingScreen();
            this.initializeUI();
            await Promise.all([this.loadSettings(), this.loadConversationHistory()]);
            this.initializeVoice();
            this.initializePerformanceMonitoring();
            this.setupEventListeners();
            this.setupDragAndDrop();
            this.setupContextMenu();
            this.applySettings();
            this.initialized = true;
            this.hideLoadingScreen();
            this.showWelcomeMessage();
            console.log(`NexusAI v${this.version} initialized successfully`);
        } catch (error) {
            console.error('Failed to initialize NexusAI:', error);
            this.showToast('error', 'Initialization Error', `Failed to start the application: ${error.message || error}`);
        }
    }

    getDefaultSettings() {
        return {
            llm: { provider: 'aipipe', apiKey: '', model: 'openai/gpt-4o-mini', maxTokens: 4000, temperature: 0.7 },
            search: { apiKey: '' },
            ui: { theme: 'auto', animationsEnabled: true, fontSize: 'medium' },
            voice: { enabled: false, outputEnabled: false, language: 'en-US', speechRate: 1.0 },
            advanced: { autoSave: true }
        };
    }

    initializeTools() {
        return [
            { type: "function", function: { name: "web_search", description: "Search the web for current information, news, or facts.", parameters: { type: "object", properties: { query: { type: "string", description: "The search query." } }, required: ["query"] } } },
            { type: "function", function: { name: "execute_code", description: "Execute JavaScript code in a secure, sandboxed environment. Use for calculations, data manipulation, or testing algorithms. Use console.log() to see output.", parameters: { type: "object", properties: { code: { type: "string", description: "The JavaScript code to execute." } }, required: ["code"] } } },
        ];
    }

    initializeUI() {
        this.elements = {
            messagesContainer: document.getElementById('messages-container'), messages: document.getElementById('messages'),
            welcomeScreen: document.getElementById('welcome-screen'), userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-message'), settingsModal: document.getElementById('settings-modal'),
            conversationList: document.getElementById('conversation-list'), typingIndicator: document.getElementById('typing-indicator'),
            performanceMonitor: document.getElementById('performance-monitor'), contextMenu: document.getElementById('context-menu'),
            fileDropZone: document.getElementById('file-drop-zone'),
        };
        if (window.marked && window.hljs) {
            marked.setOptions({
                highlight: (code, lang) => { const language = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language }).value; },
                breaks: true, gfm: true
            });
        }
    }
    
    setupEventListeners() {
        this.elements.sendButton?.addEventListener('click', () => this.sendMessage());
        this.elements.userInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }});
        document.getElementById('new-chat')?.addEventListener('click', () => this.createNewConversation());
        document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('settings-toggle')?.addEventListener('click', () => this.openSettings());
        document.getElementById('clear-chat')?.addEventListener('click', () => this.clearConversationMessages());
        document.getElementById('export-chat')?.addEventListener('click', () => this.exportConversation());
        document.getElementById('close-settings')?.addEventListener('click', () => this.closeSettings());
        document.getElementById('save-settings')?.addEventListener('click', () => this.saveAndApplySettings());
        document.querySelectorAll('.toggle-visibility').forEach(btn => btn.addEventListener('click', (e) => this.toggleApiKeyVisibility(e)));
        document.getElementById('api-key')?.addEventListener('input', this.debouncedUpdateModelOptions);
        document.getElementById('clear-all-data')?.addEventListener('click', () => this.clearAllData());
        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', e => this.switchSettingsTab(e.target.dataset.tab)));
        document.getElementById('voice-toggle')?.addEventListener('click', () => this.toggleVoiceInput());
        document.getElementById('voice-input')?.addEventListener('click', () => this.toggleVoiceInput());
        document.getElementById('toggle-perf')?.addEventListener('click', () => this.togglePerformanceMonitor());
        this.elements.contextMenu?.querySelectorAll('.context-item').forEach(item => item.addEventListener('click', () => this.handleContextAction(item.dataset.action)));
    }

    async sendMessage() {
        const input = this.elements.userInput.value.trim();
        if (!input || this.state.isProcessing) return;
        this.state.isProcessing = true;
        this.updateUIState();
        const convId = this.state.currentConversationId || this.createNewConversation();
        this.addMessage('user', input, convId);
        this.elements.userInput.value = '';
        this.hideWelcomeScreen();
        this.elements.typingIndicator.classList.add('active');

        try { await this.agentLoop(convId); } 
        catch (error) { this.addMessage('system', `An error occurred: ${error.message || error}`, convId); } 
        finally {
            this.state.isProcessing = false;
            this.updateUIState();
            this.elements.typingIndicator.classList.remove('active');
            this.saveCurrentConversation();
        }
    }

    async agentLoop(conversationId) {
        const conversation = this.state.conversations.get(conversationId);
        if (!conversation) return;
        let maxTurns = 5;
        while (maxTurns-- > 0) {
            try {
                const responseData = await this.callLLM(conversation);
                const responseMessage = responseData.choices[0].message;
                if (responseMessage.content) { this.addMessage('assistant', responseMessage.content, conversationId); }
                if (responseMessage.tool_calls) {
                    conversation.messages.push(responseMessage);
                    const toolResults = await Promise.all(responseMessage.tool_calls.map(tc => this.executeTool(tc)));
                    toolResults.forEach((result, index) => {
                        const toolCall = responseMessage.tool_calls[index];
                        conversation.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
                        this.addMessage('system', `Tool Result for ${toolCall.function.name}:\n${result}`, conversationId);
                    });
                } else { break; }
            } catch (err) {
                this.showToast('error', 'Agent Error', err.message); console.error('Agent loop error:', err); break;
            }
        }
    }

    async callLLM(conversation) {
        const { apiKey, model, maxTokens, temperature } = this.state.settings.llm;
        if (!apiKey) throw new Error("API key is not configured in settings.");
        const apiUrl = 'https://aipipe.org/v1/chat/completions';
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        const body = { model, messages: conversation.messages, tools: this.tools, tool_choice: "auto", max_tokens: maxTokens, temperature };
        const resp = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!resp.ok) { throw new Error(`API Error (${resp.status}): ${await resp.text()}`); }
        return await resp.json();
    }
    
    async executeTool(toolCall) {
        const func = toolCall.function;
        const args = JSON.parse(func.arguments || '{}');
        switch (func.name) {
            case 'web_search': return await this.executeWebSearch(args);
            case 'execute_code': return await this.executeCode(args);
            default: return JSON.stringify({ error: `Unknown tool: ${func.name}` });
        }
    }

    async executeWebSearch({ query }) {
        const apiKey = this.state.settings.search?.apiKey;
        if (!apiKey) { this.showToast('warning', 'API Key Missing', 'Web Search API key not configured.'); return JSON.stringify({ error: "Web Search API key is not configured." }); }
        try {
            const response = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query }) });
            if (!response.ok) throw new Error((await response.json()).message || 'Failed to fetch search results.');
            const data = await response.json();
            const results = data.organic?.slice(0, 5).map(item => ({ title: item.title, link: item.link, snippet: item.snippet })) || [];
            return JSON.stringify(results.length > 0 ? results : { message: "No results found." });
        } catch (error) { this.showToast('error', 'Search Failed', error.message); return JSON.stringify({ error: error.message }); }
    }

    async executeCode({ code }) {
        return new Promise((resolve) => {
            if (!window.Worker) return resolve(JSON.stringify({ error: 'Web Workers not supported.' }));
            const worker = new Worker('code-runner.js');
            const timeout = setTimeout(() => { worker.terminate(); resolve(JSON.stringify({ error: 'Code execution timed out after 5 seconds.' })); }, 5000);
            worker.onmessage = e => { clearTimeout(timeout); worker.terminate(); resolve(JSON.stringify(e.data)); };
            worker.onerror = e => { clearTimeout(timeout); worker.terminate(); resolve(JSON.stringify({ error: e.message })); };
            worker.postMessage({ code });
        });
    }

    addMessage(role, content, conversationId) {
        const conv = this.state.conversations.get(conversationId);
        if (!conv || content === null) return;
        const message = { role, content };
        if (role !== 'tool') conv.messages.push(message);
        if (role === 'user' || (role === 'assistant' && content)) {
            const previewText = (content || '').substring(0, 100);
            if (previewText) conv.preview = previewText;
            if (conv.title === 'New Conversation') conv.title = previewText.substring(0, 30) || 'Conversation';
            conv.updatedAt = Date.now();
            this.updateConversationList();
        }
        this.displayMessage(message);
        this.scrollToBottom();
    }

    displayMessage(message) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.role}`;
        messageEl.dataset.messageId = `msg_${Date.now()}`;
        const senderName = { user: 'You', assistant: 'NexusAI', system: 'System', tool: 'Tool' }[message.role] || message.role;
        const avatarIcon = { user: 'fa-user', assistant: 'fa-robot', system: 'fa-cog', tool: 'fa-wrench' }[message.role] || 'fa-comment';
        let processedContent;
        try { processedContent = `<pre><code>${this.escapeHtml(JSON.stringify(JSON.parse(message.content), null, 2))}</code></pre>`; } 
        catch (e) { processedContent = marked.parse(message.content); }
        messageEl.innerHTML = `<div class="message-header"><div class="message-avatar ${message.role}"><i class="fas ${avatarIcon}"></i></div><div class="message-info"><span class="message-sender">${senderName}</span></div></div><div class="message-content">${processedContent}</div>`;
        this.elements.messages.appendChild(messageEl);
        messageEl.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    }

    createNewConversation() {
        const id = `conv_${Date.now()}`;
        const convObj = { id, title: 'New Conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now(), preview: '...' };
        this.state.conversations.set(id, convObj);
        this.loadConversation(id);
        return id;
    }

    loadConversation(id) {
        this.state.currentConversationId = id;
        const conv = this.state.conversations.get(id);
        this.elements.messages.innerHTML = '';
        if (conv && conv.messages?.length) {
            this.hideWelcomeScreen();
            conv.messages.filter(m => m.role !== 'tool').forEach(msg => this.displayMessage(msg));
        } else { this.showWelcomeScreen(); }
        this.updateConversationList();
        this.updateChatHeader();
    }
    
    // Settings, UI, and Helper functions
    openSettings() { this.populateSettingsForm(); this.elements.settingsModal.classList.add('active'); }
    closeSettings() { this.elements.settingsModal.classList.remove('active'); }
    populateSettingsForm() { const s = this.state.settings; document.getElementById('api-key').value = s.llm.apiKey; document.getElementById('search-api-key').value = s.search.apiKey; document.getElementById('model-name').value = s.llm.model; document.getElementById('max-tokens').value = s.llm.maxTokens; document.getElementById('temperature').value = s.llm.temperature; document.querySelector(`input[name="theme"][value="${s.ui.theme}"]`).checked = true; document.getElementById('font-size').value = s.ui.fontSize; document.getElementById('animations-enabled').checked = s.ui.animationsEnabled; document.getElementById('voice-enabled').checked = s.voice.enabled; document.getElementById('voice-output-enabled').checked = s.voice.outputEnabled; document.getElementById('voice-language').value = s.voice.language; document.getElementById('speech-rate').value = s.voice.speechRate; document.getElementById('auto-save').checked = s.advanced.autoSave; this.updateModelOptions(); }
    updateSettingsFromForm() { const s = this.state.settings; s.llm.apiKey = document.getElementById('api-key').value; s.search.apiKey = document.getElementById('search-api-key').value; s.llm.model = document.getElementById('model-name').value; s.llm.maxTokens = parseInt(document.getElementById('max-tokens').value); s.llm.temperature = parseFloat(document.getElementById('temperature').value); s.ui.theme = document.querySelector('input[name="theme"]:checked').value; s.ui.fontSize = document.getElementById('font-size').value; s.ui.animationsEnabled = document.getElementById('animations-enabled').checked; s.voice.enabled = document.getElementById('voice-enabled').checked; s.voice.outputEnabled = document.getElementById('voice-output-enabled').checked; s.voice.language = document.getElementById('voice-language').value; s.voice.speechRate = parseFloat(document.getElementById('speech-rate').value); s.advanced.autoSave = document.getElementById('auto-save').checked; }
    saveAndApplySettings() { this.updateSettingsFromForm(); localStorage.setItem('nexusai_settings', JSON.stringify(this.state.settings)); this.showToast('success', 'Settings Saved'); this.closeSettings(); this.applySettings(); }
    applySettings() { this.updateTheme(); document.documentElement.style.fontSize = { small: '14px', medium: '16px', large: '18px' }[this.state.settings.ui.fontSize] || '16px'; }
    async loadSettings() { const stored = localStorage.getItem('nexusai_settings'); if(stored) { const loaded = JSON.parse(stored); this.state.settings = {...this.getDefaultSettings(), ...loaded, llm: {...this.getDefaultSettings().llm, ...loaded.llm}, search: {...this.getDefaultSettings().search, ...loaded.search}, ui: {...this.getDefaultSettings().ui, ...loaded.ui}, voice: {...this.getDefaultSettings().voice, ...loaded.voice}, advanced: {...this.getDefaultSettings().advanced, ...loaded.advanced}}; } }
    async loadConversationHistory() { const stored = localStorage.getItem('nexusai_conversations'); if (stored) { this.state.conversations = new Map(JSON.parse(stored)); const recent = Array.from(this.state.conversations.values()).sort((a,b) => b.updatedAt - a.updatedAt)[0]; if(recent) this.loadConversation(recent.id); else this.createNewConversation(); } else { this.createNewConversation(); } }
    saveCurrentConversation() { if (this.state.settings.advanced.autoSave) localStorage.setItem('nexusai_conversations', JSON.stringify(Array.from(this.state.conversations.entries()))); }
    async updateModelOptions() { const modelSelect = document.getElementById('model-name'); const apiKey = document.getElementById('api-key')?.value; if(!apiKey) { modelSelect.innerHTML = `<option value="">API key required</option>`; return; } const models = ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-1.5-flash', 'mistralai/mistral-large']; modelSelect.innerHTML = models.map(m => `<option value="${m}" ${this.state.settings.llm.model === m ? 'selected' : ''}>${m}</option>`).join(''); }

    // Voice Functions
    initializeVoice() { try { const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition; if (SpeechRecognition) { this.speechRecognition = new SpeechRecognition(); this.speechRecognition.continuous = false; this.speechRecognition.interimResults = true; this.speechRecognition.onresult = (event) => { const last = event.results[event.results.length - 1]; if (last.isFinal) { this.elements.userInput.value = last[0].transcript; this.stopVoiceInput(); } }; this.speechRecognition.onerror = (event) => { this.showToast('error', 'Voice Error', event.error); this.stopVoiceInput(); }; } } catch(e) { console.warn("Speech recognition not supported."); } }
    toggleVoiceInput() { if (!this.speechRecognition) return this.showToast('error', 'Voice Not Supported'); this.isVoiceActive ? this.stopVoiceInput() : this.startVoiceInput(); }
    startVoiceInput() { this.isVoiceActive = true; this.speechRecognition.lang = this.state.settings.voice.language; this.speechRecognition.start(); document.querySelectorAll('#voice-toggle, #voice-input').forEach(btn => btn.classList.add('active')); }
    stopVoiceInput() { this.isVoiceActive = false; this.speechRecognition.stop(); document.querySelectorAll('#voice-toggle, #voice-input').forEach(btn => btn.classList.remove('active')); }
    
    // Performance Monitoring Functions
    initializePerformanceMonitoring() { if ('PerformanceObserver' in window) { this.performanceObserver = new PerformanceObserver((list) => { for (const entry of list.getEntriesByName('llm-response')) { this.state.performance.responseTime = Math.round(entry.duration); this.updatePerformanceDisplay(); } }); this.performanceObserver.observe({ type: 'measure', buffered: true }); } if (performance && performance.memory) { this.memoryMonitor = setInterval(() => { this.state.performance.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1048576); this.updatePerformanceDisplay(); }, 5000); } }
    togglePerformanceMonitor() { this.elements.performanceMonitor?.classList.toggle('active'); }
    updatePerformanceDisplay() { document.getElementById('response-time').textContent = `${this.state.performance.responseTime || 0}ms`; document.getElementById('memory-usage').textContent = `${this.state.performance.memoryUsage || 0}MB`; document.getElementById('api-calls').textContent = this.state.performance.apiCalls || 0; }

    // Other UI and Helper Functions
    async showLoadingScreen() { document.getElementById('loading-screen').classList.remove('hidden'); }
    hideLoadingScreen() { document.getElementById('loading-screen').classList.add('hidden'); }
    showWelcomeMessage() { const conv = this.state.conversations.get(this.state.currentConversationId); if (conv && conv.messages.length === 0) { this.addMessage('assistant', 'Welcome to NexusAI! How can I assist you today?'); } }
    hideWelcomeScreen() { this.elements.welcomeScreen.style.display = 'none'; }
    showWelcomeScreen() { this.elements.welcomeScreen.style.display = 'flex'; }
    updateConversationList() { const convs = Array.from(this.state.conversations.values()).sort((a,b) => b.updatedAt - a.updatedAt); this.elements.conversationList.innerHTML = convs.map(c => `<div class="conversation-item ${c.id === this.state.currentConversationId ? 'active' : ''}" data-conversation-id="${c.id}"><div class="conversation-title">${this.escapeHtml(c.title)}</div><div class="conversation-preview">${this.escapeHtml(c.preview)}</div></div>`).join(''); this.elements.conversationList.querySelectorAll('.conversation-item').forEach(item => item.addEventListener('click', () => this.loadConversation(item.dataset.conversationId))); document.getElementById('total-conversations').textContent = this.state.conversations.size; document.getElementById('total-messages').textContent = Array.from(this.state.conversations.values()).reduce((sum, conv) => sum + conv.messages.length, 0); }
    updateChatHeader() { const conv = this.state.conversations.get(this.state.currentConversationId); if (conv) { document.getElementById('chat-title').textContent = this.escapeHtml(conv.title); document.getElementById('chat-description').textContent = `Created on ${new Date(conv.createdAt).toLocaleDateString()}`; } }
    updateUIState() { this.elements.sendButton.disabled = this.state.isProcessing; this.elements.sendButton.innerHTML = this.state.isProcessing ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-paper-plane"></i>'; }
    toggleTheme() { const current = document.documentElement.getAttribute('data-theme') || 'light'; const newTheme = current === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', newTheme); this.state.settings.ui.theme = newTheme; }
    updateTheme() { document.documentElement.setAttribute('data-theme', this.state.settings.ui.theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : this.state.settings.ui.theme); }
    toggleApiKeyVisibility(event) { const input = event.currentTarget.previousElementSibling; input.type = input.type === 'password' ? 'text' : 'password'; }
    debounce(func, delay) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    scrollToBottom() { this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight; }
    escapeHtml(text = '') { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    showToast(type, title, message = '') { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-message">${message}</div><button class="toast-close">&times;</button>`; toast.querySelector('.toast-close').onclick = () => toast.remove(); container.appendChild(toast); setTimeout(() => toast.remove(), 5000); }
    clearConversationMessages() { const conv = this.state.conversations.get(this.state.currentConversationId); if (conv && confirm('Clear all messages in this conversation?')) { conv.messages = []; this.loadConversation(this.state.currentConversationId); this.saveCurrentConversation(); } }
    clearAllData() { if (confirm('DANGER: This will delete all data. Are you sure?')) { localStorage.clear(); window.location.reload(); } }
    exportConversation() { const conv = this.state.conversations.get(this.state.currentConversationId); if(!conv) return; let content = `# ${conv.title}\n\n`; conv.messages.forEach(msg => { if(msg.role !== 'tool') content += `**${msg.role}**: ${msg.content}\n\n`; }); const blob = new Blob([content], { type: 'text/markdown' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${conv.title.replace(/\s+/g, '_')}.md`; a.click(); URL.revokeObjectURL(a.href); }
    switchSettingsTab(tabId) { document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId)); document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === `${tabId}-tab`)); }
    setupDragAndDrop() { const zone = this.elements.fileDropZone; ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => zone.addEventListener(e, (evt) => {evt.preventDefault(); evt.stopPropagation();})); ['dragenter', 'dragover'].forEach(e => zone.addEventListener(e, () => zone.classList.add('active'))); ['dragleave', 'drop'].forEach(e => zone.addEventListener(e, () => zone.classList.remove('active'))); zone.addEventListener('drop', (e) => this.handleFiles(e.dataTransfer.files)); }
    handleFiles(files) { this.showToast('info', 'File Upload', `File upload is a demo. Found ${files.length} file(s).`); }
    setupContextMenu() { this.elements.messages.addEventListener('contextmenu', e => { e.preventDefault(); const msgEl = e.target.closest('.message'); if(msgEl) this.showContextMenu(e.clientX, e.clientY, msgEl); }); document.addEventListener('click', () => this.hideContextMenu()); }
    showContextMenu(x, y, el) { const menu = this.elements.contextMenu; menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.classList.add('active'); menu.dataset.messageId = el.dataset.messageId; }
    hideContextMenu() { this.elements.contextMenu?.classList.remove('active'); }
    handleContextAction(action) { const msgId = this.elements.contextMenu.dataset.messageId; this.showToast('info', 'Context Action', `${action} on ${msgId}`); this.hideContextMenu(); }
}

document.addEventListener('DOMContentLoaded', () => { window.nexusApp = new NexusAI(); });
