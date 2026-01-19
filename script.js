// Register the datalabels plugin for Chart.js
Chart.register(ChartDataLabels);

/**
 * RoutineApp - Main application class for Daily Routine Shifter
 * Refactored version (Local only)
 */
class RoutineApp {
    constructor() {
        // --- State Variables ---
        this.routines = [];
        this.shiftHours = 0;
        this.chart = null;
        this.audioCtx = null;
        this.syncId = "";
        this.ghToken = ""; // GitHub Personal Access Token
        this.gistId = "";  // Cached Gist ID for this session

        // --- Japanese Word Lists for IDs ---
        this.idWords = {
            adj: ['あおい', 'あかい', 'しろい', 'まるい', 'はやい', 'ひかる', 'ゆるい', 'ふしぎ', 'きいろ', 'みどり'],
            noun: ['ねこ', 'いぬ', 'うさぎ', 'ごはん', 'おもち', 'みかん', 'おすし', 'ゆき', 'ほし', 'つき']
        };

        // --- Configuration ---
        this.colors = [
            '#BB86FC', '#03DAC6', '#CF6679', '#FFB74D', '#4FC3F7',
            '#AED581', '#FFD54F', '#90CAF9', '#F48FB1', '#80CBC4'
        ];

        // Initializing UI and Data
        this._initElements();
        this._loadData();
        this._addEventListeners();

        // Initial render
        this._renderAll();

        // Start periodic sync (Once per minute, synced to 00s)
        this._startPeriodicTasks();
    }

    /**
     * Synced periodic update loop
     */
    _startPeriodicTasks() {
        this._updatePeriodicTasks();

        const now = new Date();
        const delay = (60 - now.getSeconds()) * 1000 + 100; // Small buffer

        setTimeout(() => {
            setInterval(() => this._updatePeriodicTasks(), 60000);
            this._updatePeriodicTasks();
        }, delay);
    }

    // ==========================================
    // 1. INITIALIZATION
    // ==========================================

    _initElements() {
        // Form Inputs
        this.activityInput = document.getElementById('activityName');
        this.startTimeInput = document.getElementById('startTime');
        this.endTimeInput = document.getElementById('endTime');
        this.bulkInput = document.getElementById('bulkInput');
        this.memoInput = document.getElementById('memoInput');
        this.baseWakeupTimeInput = document.getElementById('baseWakeupTime');

        // Controls
        this.addBtn = document.getElementById('addBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.importBtn = document.getElementById('importBtn');
        this.shiftInput = document.getElementById('shiftHours');
        this.shiftSlider = document.getElementById('shiftSlider');
        this.shiftMinus = document.getElementById('shiftMinus');
        this.shiftPlus = document.getElementById('shiftPlus');

        // Display Areas
        this.routineList = document.getElementById('routineList');
        this.statusDisplay = document.getElementById('shiftedActivity');
        this.shiftedScheduleList = document.getElementById('shiftedScheduleList');
        this.currentTimeDisplay = document.getElementById('currentTimeDisplay');
        this.dynamicTimeSpans = document.querySelectorAll('.dynamic-time');
        this.ctx = document.getElementById('routineChart').getContext('2d');

        // Chime Controls
        this.chimeSelect = document.getElementById('chimeSelect');
        this.testChimeBtn = document.getElementById('testChimeBtn');

        // Wake Checkboxes
        this.wakeCheckboxes = [
            document.getElementById('checkWake0'),
            document.getElementById('checkWake8'),
            document.getElementById('checkWake16')
        ];

        // Sync Elements
        this.syncIdInput = document.getElementById('syncIdInput');
        this.genSyncIdBtn = document.getElementById('genSyncIdBtn');
        this.loadSyncBtn = document.getElementById('loadSyncBtn');
        this.pushSyncBtn = document.getElementById('pushSyncBtn');
        this.lastSavedDisplay = document.getElementById('lastSavedDisplay');
        this.lastLoadDisplay = document.getElementById('lastLoadDisplay');
        this.ghTokenInput = document.getElementById('ghTokenInput');
        this.ghTokenWrapper = document.getElementById('ghTokenWrapper');
        this.syncStatus = document.getElementById('syncStatus');

        // Share Elements
        this.shareSettingsBtn = document.getElementById('shareSettingsBtn');
        this.shareModal = document.getElementById('shareModal');
        this.closeShareModal = document.getElementById('closeShareModal');
        this.copyLinkBtn = document.getElementById('copyLinkBtn');
        this.copyMsg = document.getElementById('copyMsg');
    }

    _addEventListeners() {
        // Routing Management
        if (this.addBtn) this.addBtn.addEventListener('click', () => this.addRoutine());
        if (this.clearBtn) this.clearBtn.addEventListener('click', () => this.clearRoutines());
        if (this.importBtn) this.importBtn.addEventListener('click', () => this.importFromText());

        // Shift Controls
        if (this.shiftInput) {
            this.shiftInput.addEventListener('change', (e) => this._applyShift(this._offsetStrToDecimal(e.target.value), 'input'));
        }
        if (this.shiftSlider) {
            this.shiftSlider.addEventListener('input', (e) => this._applyShift(e.target.value, 'slider'));
        }
        if (this.shiftMinus) {
            this.shiftMinus.addEventListener('click', () => this._applyShift(this.shiftHours - 0.5));
        }
        if (this.shiftPlus) {
            this.shiftPlus.addEventListener('click', () => this._applyShift(this.shiftHours + 0.5));
        }

        // Settings / Customization
        if (this.baseWakeupTimeInput) {
            this.baseWakeupTimeInput.addEventListener('input', () => {
                this._updateCheckboxTimes();
                this._saveData();
            });
        }
        if (this.memoInput) {
            this.memoInput.addEventListener('input', () => this._saveData());
        }

        // Chime Controls
        if (this.testChimeBtn) {
            this.testChimeBtn.addEventListener('click', () => this.playChime());
        }
        if (this.chimeSelect) {
            this.chimeSelect.addEventListener('change', () => {
                if (this.chimeSelect.value !== 'none') this._initAudio();
                this._saveData();
            });
        }

        // Wake Checkbox persistence
        if (this.wakeCheckboxes) {
            this.wakeCheckboxes.forEach(cb => {
                if (cb) {
                    cb.addEventListener('change', () => this._saveData());
                }
            });
        }

        // Sync Controls
        if (this.genSyncIdBtn) this.genSyncIdBtn.addEventListener('click', () => this._generateSyncId());
        if (this.loadSyncBtn) this.loadSyncBtn.addEventListener('click', () => this._loadFromCloud());
        if (this.pushSyncBtn) this.pushSyncBtn.addEventListener('click', () => this._saveToCloud(true));

        if (this.syncIdInput) {
            this.syncIdInput.addEventListener('change', () => {
                this.syncId = this.syncIdInput.value.trim();
                this._saveData();
                this._updateSyncStatus();
            });
        }

        if (this.ghTokenInput) {
            this.ghTokenInput.addEventListener('change', () => {
                this.ghToken = this.ghTokenInput.value.trim();
                this._saveData();
                this._updateSyncStatus();
            });
            // Visual feedback: Fade out when not focused and has a value
            this.ghTokenInput.addEventListener('focus', () => {
                if (this.ghTokenWrapper) {
                    this.ghTokenWrapper.style.opacity = "1";
                    this.ghTokenInput.style.color = "white";
                }
            });
            this.ghTokenInput.addEventListener('blur', () => {
                this._updateTokenVisibility();
            });
        }

        // --- SHARE SETTINGS (QR/Link) ---
        if (this.shareSettingsBtn) {
            this.shareSettingsBtn.addEventListener('click', () => this._openShareModal());
        }
        if (this.closeShareModal) {
            this.closeShareModal.addEventListener('click', () => this.shareModal.style.display = 'none');
        }
        if (this.shareModal) {
            this.shareModal.addEventListener('click', (e) => {
                if (e.target === this.shareModal) this.shareModal.style.display = 'none';
            });
        }
        if (this.copyLinkBtn) {
            this.copyLinkBtn.addEventListener('click', () => this._copyShareLink());
        }

        // --- URL Param Check (Auto Import) ---
        this._checkUrlParams();
    }

    // ==========================================
    // 1-B. SHARE & URL IMPORT
    // ==========================================

    _openShareModal() {
        if (!this.syncId || !this.ghToken) {
            return alert("まずは同期IDとトークンを設定してください。");
        }

        const url = new URL(window.location.href);
        url.searchParams.set('id', this.syncId);
        url.searchParams.set('token', this.ghToken);
        const shareUrl = url.toString();

        // Show Modal
        this.shareModal.style.display = 'flex';
        this.copyMsg.textContent = "";

        // Generate QR
        const qrContainer = document.getElementById('qrcode');
        qrContainer.innerHTML = ""; // clear previous
        new QRCode(qrContainer, {
            text: shareUrl,
            width: 180,
            height: 180
        });

        this.currentShareUrl = shareUrl;
    }

    _copyShareLink() {
        if (!this.currentShareUrl) return;
        navigator.clipboard.writeText(this.currentShareUrl).then(() => {
            this.copyMsg.textContent = "リンクをコピーしました！";
            setTimeout(() => this.copyMsg.textContent = "", 3000);
        });
    }

    _checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const importId = urlParams.get('id');
        const importToken = urlParams.get('token');

        if (importId && importToken) {
            // Clean URL bar immediately to hide token
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: newUrl }, '', newUrl);

            // Step 3: Apply Settings (Automatically, no confirmation)
            this.syncId = importId;
            this.ghToken = importToken;

            // Update UI
            if (this.syncIdInput) this.syncIdInput.value = this.syncId;
            if (this.ghTokenInput) {
                this.ghTokenInput.value = this.ghToken;
                this._updateTokenVisibility();
            }

            // Save credentials correctly
            localStorage.setItem('rs_gh_token', this.ghToken);
            this._saveData();

            // Step 4 Confirmation (Load Data)
            if (confirm(`Daily Routine Shifter：\n　ID: ${importId} のデータを読み込みますか？  （現在の内容は上書きされます）`)) {
                this._loadFromCloud(true); // true = suppress internal confirmation
            } else {
                alert("設定のみ適用しました。");
            }
        }
    }

    _updateTokenVisibility() {
        if (!this.ghTokenInput || !this.ghTokenWrapper) return;
        if (this.ghTokenInput.value) {
            this.ghTokenWrapper.style.opacity = "0.4"; // Muted but visible
            this.ghTokenInput.style.color = "rgba(255,255,255,0.4)";
        } else {
            this.ghTokenWrapper.style.opacity = "0.75"; // Ready to enter
            this.ghTokenInput.style.color = "white";
        }
    }

    // ==========================================
    // 2. DATA PERSISTENCE
    // ==========================================

    /**
     * Consolidates all app state into a single JSON object in LocalStorage
     */
    _saveData() {
        const data = {
            routines: this.routines,
            shiftHours: this.shiftHours,
            memo: this.memoInput ? this.memoInput.value : "",
            baseWakeupTime: this.baseWakeupTimeInput ? this.baseWakeupTimeInput.value : "05:00",
            chimeType: this.chimeSelect ? this.chimeSelect.value : "none",
            wakeChecks: this.wakeCheckboxes.map(cb => cb ? cb.checked : false),
            syncId: this.syncId
        };
        localStorage.setItem('routineData', JSON.stringify(data));

        // Save token separately so it doesn't get pushed to Gist (prevents auto-revocation)
        if (this.ghToken) {
            localStorage.setItem('rs_gh_token', this.ghToken);
        }

        // Auto-save to cloud if sync is active (with debounce to avoid rate limits)
        if (this.syncId && this.ghToken) {
            if (this.syncTimer) clearTimeout(this.syncTimer);
            this.syncTimer = setTimeout(() => this._saveToCloud(false), 5000); // 5 sec delay
        }
    }

    /**
     * Restores app state from LocalStorage
     */
    _loadData() {
        try {
            const saved = localStorage.getItem('routineData');
            if (!saved) return;

            const data = JSON.parse(saved);
            this.routines = data.routines || [];
            this.shiftHours = data.shiftHours || 0;

            if (this.memoInput && data.memo !== undefined) {
                this.memoInput.value = data.memo;
            }
            if (this.baseWakeupTimeInput && data.baseWakeupTime) {
                this.baseWakeupTimeInput.value = data.baseWakeupTime;
            }
            if (this.chimeSelect && data.chimeType) {
                this.chimeSelect.value = data.chimeType;
            }

            this.syncId = data.syncId || "";
            this.ghToken = localStorage.getItem('rs_gh_token') || ""; // Separate key
            if (this.syncIdInput) this.syncIdInput.value = this.syncId;
            if (this.ghTokenInput) {
                this.ghTokenInput.value = this.ghToken;
                this._updateTokenVisibility();
            }
            this._updateSyncStatus();

            if (data.wakeChecks) {
                this.wakeCheckboxes.forEach((cb, i) => {
                    if (cb && data.wakeChecks[i] !== undefined) {
                        cb.checked = data.wakeChecks[i];
                    }
                });
            }

            // Sync UI inputs with loaded state
            this.shiftInput.value = this._decimalToOffsetStr(this.shiftHours);
            if (this.shiftSlider) this.shiftSlider.value = this.shiftHours;

            // Restore Timestamps
            const ts = JSON.parse(localStorage.getItem('rs_sync_timestamps') || '{}');
            if (this.lastLoadDisplay) this.lastLoadDisplay.textContent = `最終更新: ${ts.lastPull || '--:--'}`;
            if (this.lastSavedDisplay) this.lastSavedDisplay.textContent = `最終更新: ${ts.lastPush || '--:--'}`;

        } catch (e) {
            console.error("Data load failed. Storage might be corrupted.", e);
        }
    }

    // ==========================================
    // 3. UI RENDERING & UPDATES
    // ==========================================

    _renderAll() {
        this.renderList();
        this.renderChart();
        this.updateShiftInfo();
        this._updateCheckboxTimes();
    }

    /**
     * Updates current time display and background logic
     */
    _updatePeriodicTasks() {
        // Redraw chart to update current time marker & central clock effectively
        if (this.chart) this.chart.update();

        // Background check for routine completion chime
        this.checkChime();
    }

    /**
     * Renders the vertical list of original routines (right panel)
     */
    renderList() {
        this.routineList.innerHTML = '';
        this.routines.sort((a, b) => a.start.localeCompare(b.start));

        this.routines.forEach(r => {
            const div = document.createElement('div');
            div.className = 'routine-item';
            div.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <div style="width:12px; height:12px; background:${r.color}; border-radius:50%; margin-right:8px;"></div>
                    <span>${r.start} - ${r.end}</span>
                    <strong>${r.name}</strong>
                </div>
                <button class="delete-btn" onclick="app.deleteRoutine(${r.id})">×</button>
            `;
            this.routineList.appendChild(div);
        });
    }

    /**
     * Main chart rendering logic using Chart.js
     */
    renderChart() {
        if (this.chart) this.chart.destroy();

        const timeline = new Array(1440).fill(null);

        // Map routines to minute-by-minute timeline
        this.routines.forEach(r => {
            let startMin = Math.round(this._timeToDecimal(r.start) * 60);
            let endMin = Math.round(this._timeToDecimal(r.end) * 60);

            if (startMin < endMin) {
                for (let i = startMin; i < endMin; i++) timeline[i] = r;
            } else {
                for (let i = startMin; i < 1440; i++) timeline[i] = r;
                for (let i = 0; i < endMin; i++) timeline[i] = r;
            }
        });

        // Convert timeline into Chart.js datasets (segments)
        const dataPoints = [];
        const bgColors = [];
        const labels = [];
        let currentRoutine = timeline[0];
        let currentDuration = 1;

        for (let i = 1; i < 1440; i++) {
            if (timeline[i] === currentRoutine) {
                currentDuration++;
            } else {
                dataPoints.push(currentDuration / 60);
                if (currentRoutine) {
                    bgColors.push(currentRoutine.color);
                    labels.push(currentRoutine.name);
                } else {
                    bgColors.push('rgba(255, 255, 255, 0.05)');
                    labels.push(null);
                }
                currentRoutine = timeline[i];
                currentDuration = 1;
            }
        }
        dataPoints.push(currentDuration / 60);
        if (currentRoutine) {
            bgColors.push(currentRoutine.color);
            labels.push(currentRoutine.name);
        } else {
            bgColors.push('rgba(255, 255, 255, 0.05)');
            labels.push(null);
        }

        // Clock Face Plugin (Draws numbers and central clock)
        const clockPlugin = {
            id: 'clockFace',
            afterDraw: (chart) => this._drawClockFace(chart)
        };

        this.chart = new Chart(this.ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataPoints,
                    borderWidth: 0,
                    backgroundColor: (ctx) => this._getSegmentGradient(ctx, bgColors)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                rotation: this.shiftHours * 15,
                layout: { padding: 35 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.raw;
                                const h = Math.floor(value);
                                const m = Math.round((value - h) * 60);
                                return `${context.chart.data.labels[context.dataIndex] || 'Free Time'}: ${h}h ${m}m`;
                            }
                        }
                    },
                    datalabels: {
                        color: '#fff',
                        font: { size: 15 },
                        formatter: (val, ctx) => (val < 1 ? null : ctx.chart.data.labels[ctx.dataIndex]),
                        display: 'auto',
                        anchor: 'center', align: 'center'
                    },
                }
            },
            plugins: [clockPlugin]
        });
    }

    /**
     * Helper to draw clock UI over the chart
     */
    _drawClockFace(chart) {
        const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        const outerRadius = Math.min(width, height) / 2;

        ctx.save();
        ctx.translate(centerX, centerY);

        // 1. Draw Hour Ticks and Numbers
        for (let i = 0; i < 24; i++) {
            const angle = (i * 15 - 90) * (Math.PI / 180);
            const isMajor = i % 3 === 0;
            const tickLength = isMajor ? 10 : 10;

            // Tick marks (staying at current rim)
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * (outerRadius - 5), Math.sin(angle) * (outerRadius - 5));
            ctx.lineTo(Math.cos(angle) * (outerRadius - 5 + tickLength), Math.sin(angle) * (outerRadius - 5 + tickLength));
            ctx.strokeStyle = isMajor ? '#bb86fc' : 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.stroke();

            // Hour numbers (MOVED OUTSIDE)
            const textRadius = outerRadius + 14; // Positive offset to go outside
            const textX = Math.cos(angle) * textRadius;
            const textY = Math.sin(angle) * textRadius;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (isMajor) {
                ctx.font = 'bold 16px Inter, sans-serif';
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#121212'; // Darker outline for contrast
                ctx.strokeText(i.toString(), textX, textY);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(i.toString(), textX, textY);
            } else {
                ctx.font = '12px Inter, sans-serif';
                ctx.fillStyle = '#aaaaaa';
                ctx.fillText(i.toString(), textX, textY);
            }
        }

        // 2. Draw Current Time Marker
        const now = new Date();
        const currentDec = now.getHours() + now.getMinutes() / 60;
        const currentAngle = (currentDec * 15 - 90) * (Math.PI / 180);

        ctx.beginPath();
        ctx.arc(Math.cos(currentAngle) * (outerRadius + 4), Math.sin(currentAngle) * (outerRadius + 4), 6, 0, Math.PI * 2);
        ctx.fillStyle = '#03DAC6';
        ctx.shadowColor = '#03DAC6';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // 3. Central Digital Clock (Shows Base Time)
        const timeFontSize = Math.min(width, height) / 5;
        const baseTime = new Date(now.getTime() - (this.shiftHours * 60 * 60 * 1000));
        const timeStr = baseTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        ctx.fillStyle = '#03DAC6';
        ctx.font = `${timeFontSize}px 'Quicksand', sans-serif`;
        ctx.fillText(timeStr, 0, 0);

        ctx.font = `${timeFontSize * 0.18}px 'Quicksand', sans-serif`;
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('基準時刻', 0, -timeFontSize * 0.6);

        ctx.restore();
    }

    /**
     * Unified Logic for applying shift changes
     */
    _applyShift(val, source = 'other') {
        let numVal = typeof val === 'string' ? parseFloat(val) : val;
        numVal = isNaN(numVal) ? 0 : numVal;
        numVal = Math.max(-24, Math.min(24, numVal)); // Clamp

        this.shiftHours = numVal;

        // Sync Inputs
        if (source !== 'input') {
            this.shiftInput.value = this._decimalToOffsetStr(this.shiftHours);
        }
        if (source !== 'slider' && this.shiftSlider) {
            this.shiftSlider.value = this.shiftHours;
        }

        this._renderAll();
        this._saveData();
    }

    /**
     * Updates the shifted schedule text list (left panel)
     */
    updateShiftInfo() {
        const now = new Date();
        const currentDecimal = now.getHours() + now.getMinutes() / 60;
        this.shiftedScheduleList.innerHTML = '';

        let activeActivity = "(Free Time)";
        let activeDuration = "";

        const sorted = [...this.routines].sort((a, b) => a.start.localeCompare(b.start));

        sorted.forEach(r => {
            const startDec = this._timeToDecimal(r.start);
            const endDec = this._timeToDecimal(r.end);

            // Calculate Duration
            let dur = endDec - startDec;
            if (dur < 0) dur += 24;
            const durStr = this._decimalToHHMM(dur);

            // Shifted Range
            const shiftedStart = this._normalizeHour(startDec + this.shiftHours);
            const shiftedEnd = this._normalizeHour(endDec + this.shiftHours);
            const timeRangeStr = `${this._decimalToHHMM(shiftedStart)} - ${this._decimalToHHMM(shiftedEnd)}`;

            // UI List Item
            const li = document.createElement('li');
            li.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
            li.innerHTML = `
                <div><span>${timeRangeStr}</span>: <strong>${r.name}</strong></div>
                <span style="opacity:0.7; font-size:0.9em;">(${durStr})</span>
            `;
            this.shiftedScheduleList.appendChild(li);

            // Active Check
            let isActive = false;
            if (shiftedStart < shiftedEnd) {
                if (currentDecimal >= shiftedStart && currentDecimal < shiftedEnd) isActive = true;
            } else {
                if (currentDecimal >= shiftedStart || currentDecimal < shiftedEnd) isActive = true;
            }

            if (isActive) {
                activeActivity = r.name;
                activeDuration = durStr;
            }
        });

        // Status Banner Update
        this.statusDisplay.textContent = activeActivity === "(Free Time)" ? activeActivity : `${activeActivity} (${activeDuration})`;
        this.statusDisplay.style.color = activeActivity === "(Free Time)" ? "#aaa" : "#bb86fc";
    }

    /**
     * Updates the live ticking times for checkboxes in the UI
     */
    _updateCheckboxTimes() {
        if (!this.baseWakeupTimeInput) return;

        const baseDec = this._timeToDecimal(this.baseWakeupTimeInput.value);

        this.dynamicTimeSpans.forEach(span => {
            const offset = parseFloat(span.getAttribute('data-offset'));
            // MODIFIED: Removed shiftHours to decouple from shift logic
            const targetDec = this._normalizeHour(baseDec + offset);
            span.textContent = this._decimalToHHMM(targetDec);
        });
    }

    // ==========================================
    // 4. ACTION HANDLERS
    // ==========================================

    importFromText() {
        const text = this.bulkInput.value.trim();
        if (!text) return alert('テキストを入力してください');
        if (!confirm('既存のデータは上書きされます。よろしいですか？')) return;

        const newRoutines = [];

        // Regex Patterns:
        // A. "Name 09:00 - 17:00" (Existing)
        const regexA = /(.+?)\s+(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/;
        // B. "09:00 - 17:00: Name" (From Shifted Schedule List copy)
        const regexB = /(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})\s*[:]\s*(.+)/;

        text.split('\n').forEach(line => {
            const str = line.trim();
            if (!str) return;

            let match = str.match(regexB);
            if (match) {
                // Handle Pattern B: Time first
                newRoutines.push({
                    id: Date.now() + Math.random(),
                    name: match[3].trim(),
                    start: match[1].padStart(5, '0'),
                    end: match[2].padStart(5, '0'),
                    color: this.colors[newRoutines.length % this.colors.length]
                });
            } else {
                match = str.match(regexA);
                if (match) {
                    // Handle Pattern A: Name first
                    newRoutines.push({
                        id: Date.now() + Math.random(),
                        name: match[1].trim(),
                        start: match[2].padStart(5, '0'),
                        end: match[3].padStart(5, '0'),
                        color: this.colors[newRoutines.length % this.colors.length]
                    });
                }
            }
        });

        if (newRoutines.length === 0) return alert('読み取り可能なデータが見つかりませんでした。');

        this.routines = newRoutines;
        this.bulkInput.value = '';
        this._renderAll();
        this._saveData();
    }

    addRoutine() {
        const name = this.activityInput.value;
        const start = this.startTimeInput.value;
        const end = this.endTimeInput.value;

        if (!name || !start || !end) return alert('全ての項目を入力してください。');

        this.routines.push({
            id: Date.now(),
            name, start, end,
            color: this.colors[this.routines.length % this.colors.length]
        });

        this.activityInput.value = '';
        this._renderAll();
        this._saveData();
    }

    clearRoutines() {
        if (!confirm('全てのデータを消去してもよろしいですか？')) return;
        this.routines = [];
        this.shiftHours = 0;
        this._renderAll();
        localStorage.removeItem('routineData'); // Clear storage
    }

    deleteRoutine(id) {
        this.routines = this.routines.filter(r => r.id !== id);
        this._renderAll();
        this._saveData();
    }

    // ==========================================
    // 5. AUDIO LOGIC
    // ==========================================

    _initAudio() {
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    }

    playChime() {
        const type = this.chimeSelect ? this.chimeSelect.value : 'none';
        if (type === 'none') return;

        this._initAudio();
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        const playOsc = (freq, type, gainVal, decay, delay = 0) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now + delay);
            g.gain.setValueAtTime(gainVal, now + delay);
            g.gain.exponentialRampToValueAtTime(0.001, now + delay + decay);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(now + delay);
            osc.stop(now + delay + decay + 0.1);
        };

        if (type === 'bell') {
            playOsc(880, 'sine', 0.1, 1.5, 0);
            playOsc(1760, 'sine', 0.05, 1.0, 0);
        } else if (type === 'ding') {
            playOsc(1200, 'triangle', 0.1, 0.5, 0);
        } else if (type === 'marimba') {
            playOsc(523.25, 'sine', 0.15, 0.3, 0);
            playOsc(659.25, 'sine', 0.15, 0.3, 0.15);
            playOsc(783.99, 'sine', 0.15, 0.3, 0.3);
        } else if (type === 'digital') {
            playOsc(440, 'square', 0.05, 0.1, 0);
            playOsc(880, 'square', 0.05, 0.1, 0.1);
        }
    }

    checkChime() {
        const type = this.chimeSelect ? this.chimeSelect.value : 'none';
        if (type === 'none') return;

        const now = new Date();
        const currentH = now.getHours();
        const currentM = now.getMinutes();
        const currentS = now.getSeconds();

        // Exact minute match (00 seconds)
        if (currentS !== 0) return;

        // Check if any shifted routine ends exactly now
        const currentDecimal = currentH + currentM / 60;
        const routines = this.routines;
        let shouldRing = false;

        routines.forEach(r => {
            const endDec = this._timeToDecimal(r.end);
            // Apply shift to the routine time to see if it matches "REAL world now"
            // Wait: Shift logic is "Virtual Time = Real Time + Shift".
            // So if Routine ends at 10:00 (Virtual), and Shift is +1, then Real time is 09:00.
            // ... Actually, the user wants the alarm when the *shifted* schedule hits the current time?
            // Usually alarms are based on the displayed time matching current time.

            // Logic: Compare "Current Decimal" with "Shifted End Time"
            const shiftedEnd = this._normalizeHour(endDec + this.shiftHours);

            // Allow precision error (check if close enough to current minute)
            const diff = Math.abs(currentDecimal - shiftedEnd);
            // Handle wrap-around diff (e.g. 23:59 vs 00:00)
            const diff2 = Math.abs((currentDecimal + 24) - shiftedEnd);
            const diff3 = Math.abs(currentDecimal - (shiftedEnd + 24));

            // Check if diff is less than 1 minute (1/60)
            if (diff < 0.001 || diff2 < 0.001 || diff3 < 0.001) {
                shouldRing = true;
            }
        });

        if (shouldRing) this.playChime();
    }

    // ==========================================
    // 6. GITHUB SYNC (Cloud) - Refactored
    // ==========================================

    /**
     * Helper for GitHub API calls
     */
    async _githubFetch(url, options = {}) {
        if (!this.ghToken) throw new Error("GitHub Token Missing");

        const headers = {
            'Authorization': `token ${this.ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            ...(options.headers || {})
        };

        // Cache-busting for GET requests to ensure fresh list
        let finalUrl = url;
        if (!options.method || options.method === 'GET') {
            finalUrl += `?t=${Date.now()}`;
        }

        const resp = await fetch(finalUrl, { ...options, headers });
        if (resp.status === 401) throw new Error("GitHubトークンが無効、または有効期限切れです");
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(`Status: ${resp.status} - ${errData.message || '不明なエラー'}`);
        }
        return resp;
    }

    async _saveToCloud(manual = false) {
        const idRaw = this.syncIdInput.value.trim();
        const token = this.ghTokenInput.value.trim();

        if (manual) {
            if (!token) return alert("GitHubトークンを入力してください");
            if (!idRaw) return alert("同期IDを入力してください");
        }
        if (!token || !idRaw) return;

        const id = this._sanitizeId(idRaw);
        this.syncId = id;
        this.ghToken = token;
        this._updateSyncStatus();

        // Explicitly clean the data before sending to GitHub to prevent auto-revocation
        let cleanData = {};
        try {
            const raw = localStorage.getItem('routineData');
            if (raw) {
                cleanData = JSON.parse(raw);
                delete cleanData.ghToken; // STRIP TOKEN BEFORE SENDING
            }
        } catch (e) {
            console.error("Failed to parse data for clean save", e);
        }
        const dataStr = JSON.stringify(cleanData);
        const filename = `rs-sync-${id}.json`;

        try {
            // 1. Fetch current gists and filter by filename (case-insensitive & normalized)
            const gistsResp = await this._githubFetch("https://api.github.com/gists");
            const gists = await gistsResp.json();

            const matches = gists.filter(g =>
                Object.keys(g.files).some(key => key.normalize() === filename.normalize())
            );

            // Sort matches by updated_at (newest first)
            if (matches.length > 0) {
                matches.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            }

            let resp;
            let targetGistId = (matches.length > 0) ? matches[0].id : null;

            if (targetGistId) {
                // 2. Update the NEWEST existing gist
                resp = await this._githubFetch(`https://api.github.com/gists/${targetGistId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        description: `RoutineShifter Sync: ${id} (Updated: ${new Date().toLocaleString()})`,
                        files: { [filename]: { content: dataStr } }
                    })
                });
            } else {
                // 3. Create new if none exist
                resp = await this._githubFetch("https://api.github.com/gists", {
                    method: 'POST',
                    body: JSON.stringify({
                        description: `RoutineShifter Sync: ${id} (Created: ${new Date().toLocaleString()})`,
                        public: false,
                        files: { [filename]: { content: dataStr } }
                    })
                });
                const newGist = await resp.json();
                targetGistId = newGist.id;
            }

            // 4. CLEANUP: Delete ALL OTHER redundant gists with the same sync ID
            if (matches.length > 1) {
                const clonesToDelete = matches.slice(1); // All except the one we updated (or newest)
                for (const gist of clonesToDelete) {
                    try {
                        await this._githubFetch(`https://api.github.com/gists/${gist.id}`, { method: 'DELETE' });
                        console.log(`Deleted redundant Gist: ${gist.id}`);
                    } catch (e) {
                        console.warn(`Failed to delete redundant Gist: ${gist.id}`, e);
                    }
                }
            }

            if (resp && resp.ok) {
                this.gistId = targetGistId;
                localStorage.setItem(`rs_gist_id_${id}`, targetGistId); // Persist ID

                // Update Last Saved Display
                const now = new Date();
                const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                this._saveTimestamp('lastPush', timeStr);
                if (this.lastSavedDisplay) {
                    this.lastSavedDisplay.textContent = `最終更新: ${timeStr}`;
                }

                // Removed alert as per user request
                // if (manual) alert(`GitHub Gist への保存に成功しました！\nID: ${id}`);
            }
        } catch (e) {
            console.error("GitHub sync save failed", e);
            if (manual) alert(`保存に失敗しました:\n${e.message}\nもし「Secondary Rate Limit」と出た場合は、数分待ってからお試しください。`);
        }
    }

    async _loadFromCloud(suppressConfirm = false) {
        const idRaw = this.syncIdInput.value.trim();
        const token = this.ghTokenInput.value.trim();

        if (!token) return alert("GitHubトークンを入力してください");
        if (!idRaw) return alert("同期IDを入力してください");

        const id = this._sanitizeId(idRaw);
        const filename = `rs-sync-${id}.json`;
        this.ghToken = token;

        try {
            // Search for Gist
            const gistsResp = await this._githubFetch("https://api.github.com/gists");
            const gists = await gistsResp.json();

            // Prioritize the most recently updated Gist for this ID
            const matches = gists.filter(g =>
                Object.keys(g.files).some(key => key.normalize() === filename.normalize())
            );

            let target = null;
            if (matches.length > 0) {
                matches.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
                target = matches[0];
            }

            if (target) {
                // Get content
                const detailsResp = await this._githubFetch(target.url);
                const details = await detailsResp.json();
                // Find correct key even if normalized
                const actualKey = Object.keys(details.files).find(key => key.normalize() === filename.normalize());
                const contentStr = details.files[actualKey].content;
                const data = JSON.parse(contentStr);

                // Confirm before loading (unless suppressed)
                if (!suppressConfirm) {
                    if (!confirm(`Daily Routine Shifter：\n　ID: ${id} のデータを読み込みますか？  （現在の内容は上書きされます）`)) return;
                }

                this.syncId = id;
                this.gistId = target.id;
                localStorage.setItem(`rs_gist_id_${id}`, target.id); // Remember ID
                localStorage.setItem('routineData', JSON.stringify(data));
                this._loadData();
                this._renderAll();
                this._updateSyncStatus();

                // Update Load Timestamp
                const now = new Date();
                const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                this._saveTimestamp('lastPull', timeStr);
                if (this.lastLoadDisplay) this.lastLoadDisplay.textContent = `最終更新: ${timeStr}`;
                // Success message removed as per user request
            } else {
                alert(`ID 「${id}」 のデータはGitHub上に見つかりませんでした。`);
            }
        } catch (e) {
            console.error("GitHub sync load failed", e);
            alert(`読み込みに失敗しました:\n${e.message}`);
        }
    }

    // ==========================================
    // 7. UTILITIES
    // ==========================================

    _timeToDecimal(str) {
        const [h, m] = str.split(':').map(Number);
        return h + m / 60;
    }

    _decimalToHHMM(dec) {
        const h = Math.floor(dec) % 24;
        const m = Math.round((dec - Math.floor(dec)) * 60) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * Normalizes hour value to 0-23 range
     */
    _normalizeHour(h) {
        let val = h % 24;
        return val < 0 ? val + 24 : val;
    }

    /**
     * Formats decimal hours to ±HH:MM format for display
     */
    _decimalToOffsetStr(dec) {
        const sign = dec >= 0 ? "+" : "-";
        const absDec = Math.abs(dec);
        const h = Math.floor(absDec);
        const m = Math.round((absDec - h) * 60);
        return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * Parses ±HH:MM or decimal format back to decimal hours
     */
    _offsetStrToDecimal(str) {
        if (!str) return 0;
        str = str.trim();

        // Handle HH:MM format (maybe with ± prefix)
        const timeMatch = str.match(/^([+-])?(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const isNegative = timeMatch[1] === "-";
            const h = parseInt(timeMatch[2], 10);
            const m = parseInt(timeMatch[3], 10);
            const dec = h + m / 60;
            return isNegative ? -dec : dec;
        }

        // Fallback to simple decimal parsing
        return parseFloat(str) || 0;
    }



    _getSegmentGradient(ctx, colors) {
        const { chart, dataIndex } = ctx;
        const color = colors[dataIndex];
        if (!color || color.startsWith('rgba')) return color;

        const { chartArea } = chart;
        if (!chartArea) return color;

        const cX = (chartArea.left + chartArea.right) / 2;
        const cY = (chartArea.top + chartArea.bottom) / 2;
        const r = Math.min(chartArea.width, chartArea.height) / 2;

        const gradient = chart.ctx.createRadialGradient(cX, cY, 0, cX, cY, r);

        const hexToRgba = (hex, a) => {
            const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return res ? `rgba(${parseInt(res[1], 16)}, ${parseInt(res[2], 16)}, ${parseInt(res[3], 16)}, ${a})` : hex;
        };

        gradient.addColorStop(0.5, hexToRgba(color, 0.4));
        gradient.addColorStop(1, hexToRgba(color, 1));
        return gradient;
    }

    _saveTimestamp(key, val) {
        const ts = JSON.parse(localStorage.getItem('rs_sync_timestamps') || '{}');
        ts[key] = val;
        localStorage.setItem('rs_sync_timestamps', JSON.stringify(ts));
    }

    /**
     * Sanitizes the ID (keep Japanese, remove dots/slashes)
     */
    _sanitizeId(input) {
        // Allow Japanese, letters, numbers, hyphens, underscores.
        // Gist filenames cannot contain slashes.
        return input.trim().replace(/[\\/:*?"<>|]/g, '-');
    }

    _generateSyncId() {
        const adjs = this.idWords.adj;
        const nouns = this.idWords.noun;
        const randomAdj = adjs[Math.floor(Math.random() * adjs.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

        let id = `${randomAdj}${randomNoun}`;

        // Add current sync ID input value if empty
        this.syncIdInput.value = id;
        this.syncId = id;
        this._saveData();
    }

    _updateSyncStatus() {
        if (this.syncId && this.ghToken) {
            this.syncStatus.classList.remove('inactive');
            this.syncStatus.classList.add('active');
            this.syncStatus.style.color = '#03DAC6'; // Teal for active
            this.syncStatus.title = "同期有効";
        } else {
            this.syncStatus.classList.remove('active');
            this.syncStatus.classList.add('inactive');
            this.syncStatus.style.color = '#555'; // Grey for inactive
            this.syncStatus.title = "同期オフ";
        }
    }
}

// Global initialization
const app = new RoutineApp();