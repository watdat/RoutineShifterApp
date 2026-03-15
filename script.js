// Register the datalabels plugin for Chart.js
Chart.register(ChartDataLabels);

/**
 * Constants & Utilities
 */
const CONFIG = {
    THEMES: {
        modern_british: {
            name: 'Modern British',
            colors: ['#34495E', '#7F8C8D', '#5D6D7E', '#4A235A', '#1B4F72', '#2E4053', '#212F3D', '#546E7A']
        },
        heritage_woods: {
            name: 'Heritage Woods',
            colors: ['#4E342E', '#33691E', '#5D4037', '#3E4E50', '#BF360C', '#424242', '#5D4632', '#2E3B3E']
        },
        titanium_precision: {
            name: 'Titanium Precision',
            colors: ['#424242', '#37474F', '#455A64', '#283747', '#515A5A', '#78909C', '#546E7A', '#455A64']
        },
        midnight_luxury: {
            name: 'Midnight Luxury',
            colors: ['#58434bf9', '#C5A059', '#E0E0E0', '#424242', '#B8860B', '#8f8d8dff', '#473a63ff', '#D4AF37']
        },
        racing_heritage: {
            name: 'Racing Heritage',
            colors: ['#425068ff', '#800020', '#004225', '#4A412A', '#2F4F4F', '#5E0B15', '#013220', '#767575ff']
        }
    },
    STORAGE_KEYS: {
        DATA: 'routineData',
        TOKEN: 'rs_gh_token',
        TIMESTAMPS: 'rs_sync_timestamps',
        COLOR_THEME: 'routineColorTheme'
    }
};

const Utils = {
    timeToDecimal(str) {
        if (!str || typeof str !== 'string') return NaN;
        const [h, m] = str.split(':').map(n => parseInt(n, 10));
        return h + (m || 0) / 60;
    },

    decimalToHHMM(dec) {
        if (isNaN(dec)) return "--:--";
        const h = Math.floor(dec) % 24;
        const m = Math.round((dec - Math.floor(dec)) * 60) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    normalizeHour(h) {
        const val = h % 24;
        return val < 0 ? val + 24 : val;
    },

    decimalToOffsetStr(dec) {
        const sign = dec >= 0 ? "+" : "-";
        const absDec = Math.abs(dec);
        const h = Math.floor(absDec);
        const m = Math.round((absDec - h) * 60);
        return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    offsetStrToDecimal(str) {
        if (!str) return 0;
        str = str.trim();
        const timeMatch = str.match(/^([+-])?(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const isNegative = timeMatch[1] === "-";
            const h = parseInt(timeMatch[2], 10);
            const m = parseInt(timeMatch[3], 10);
            const dec = h + m / 60;
            return isNegative ? -dec : dec;
        }
        return parseFloat(str) || 0;
    },

    sanitizeId(input) {
        return input.trim().replace(/[\\/:*?"<>|]/g, '-');
    }
};

/**
 * DataManager - Handles persistence and cloud sync
 */
class DataManager {
    constructor() {
        this.routines = [];
        this.shiftHours = 0;
        this.syncId = "";
        this.ghToken = "";
        this.idWords = {
            adj: ['あおい', 'あかい', 'しろい', 'まるい', 'はやい', 'ひかる', 'ゆるい', 'ふしぎ', 'きいろ', 'みどり'],
            noun: ['ねこ', 'いぬ', 'うさぎ', 'ごはん', 'おもち', 'みかん', 'おすすし', 'ゆき', 'ほし', 'つき']
        };
    }

    saveLocal(extraData = {}) {
        const data = {
            routines: this.routines,
            shiftHours: this.shiftHours,
            syncId: this.syncId,
            ...extraData
        };
        localStorage.setItem(CONFIG.STORAGE_KEYS.DATA, JSON.stringify(data));
        if (this.ghToken) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, this.ghToken);
        }
    }

    saveColorTheme(themeId) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.COLOR_THEME, themeId);
    }

    loadColorTheme() {
        const id = localStorage.getItem(CONFIG.STORAGE_KEYS.COLOR_THEME);
        return (id && CONFIG.THEMES[id]) ? id : 'modern_british';
    }

    loadLocal() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.DATA);
            if (!saved) return null;

            const data = JSON.parse(saved);
            this.routines = data.routines || [];
            this.shiftHours = data.shiftHours || 0;
            this.syncId = data.syncId || "";
            this.ghToken = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN) || "";
            return data;
        } catch (e) {
            console.error("Data load failed:", e);
            return null;
        }
    }

    saveTimestamp(key, val) {
        const ts = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TIMESTAMPS) || '{}');
        ts[key] = val;
        localStorage.setItem(CONFIG.STORAGE_KEYS.TIMESTAMPS, JSON.stringify(ts));
    }

    getTimestamps() {
        return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TIMESTAMPS) || '{}');
    }

    generateSyncId() {
        const randomAdj = this.idWords.adj[Math.floor(Math.random() * this.idWords.adj.length)];
        const randomNoun = this.idWords.noun[Math.floor(Math.random() * this.idWords.noun.length)];
        return `${randomAdj}${randomNoun}`;
    }

    async githubFetch(url, options = {}) {
        if (!this.ghToken) throw new Error("GitHub Token Missing");
        const headers = {
            'Authorization': `token ${this.ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            ...(options.headers || {})
        };
        let finalUrl = url;
        if (!options.method || options.method === 'GET') {
            finalUrl += (url.includes('?') ? '&' : '?') + `t=${Date.now()}`;
        }
        const resp = await fetch(finalUrl, { ...options, headers });
        if (resp.status === 401) throw new Error("GitHubトークンが無効、または有効期限切れです");
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(`Status: ${resp.status} - ${errData.message || '不明なエラー'}`);
        }
        return resp;
    }

    async saveToCloud() {
        if (!this.ghToken || !this.syncId) throw new Error("IDまたはトークンが不足しています");
        const id = Utils.sanitizeId(this.syncId);
        const filename = `rs-sync-${id}.json`;

        let cleanData = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.DATA) || '{}');
        delete cleanData.ghToken; // Security: Strip token

        const dataStr = JSON.stringify(cleanData);

        const gistsResp = await this.githubFetch("https://api.github.com/gists");
        const gists = await gistsResp.json();
        const matches = gists.filter(g => Object.keys(g.files).some(key => key.normalize() === filename.normalize()));

        if (matches.length > 0) {
            matches.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        }

        let targetGistId = (matches.length > 0) ? matches[0].id : null;
        let resp;

        if (targetGistId) {
            resp = await this.githubFetch(`https://api.github.com/gists/${targetGistId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    description: `RoutineShifter Sync: ${id} (Updated: ${new Date().toLocaleString()})`,
                    files: { [filename]: { content: dataStr } }
                })
            });
        } else {
            resp = await this.githubFetch("https://api.github.com/gists", {
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

        // Cleanup clones
        if (matches.length > 1) {
            for (const gist of matches.slice(1)) {
                await this.githubFetch(`https://api.github.com/gists/${gist.id}`, { method: 'DELETE' }).catch(e => console.warn(e));
            }
        }

        if (resp && resp.ok) {
            const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            this.saveTimestamp('lastPush', nowTime);
            return nowTime;
        }
        throw new Error("保存に失敗しました");
    }

    async loadFromCloud() {
        if (!this.ghToken || !this.syncId) throw new Error("IDまたはトークンが不足しています");
        const id = Utils.sanitizeId(this.syncId);
        const filename = `rs-sync-${id}.json`;

        const gistsResp = await this.githubFetch("https://api.github.com/gists");
        const gists = await gistsResp.json();
        const matches = gists.filter(g => Object.keys(g.files).some(key => key.normalize() === filename.normalize()));

        if (matches.length === 0) throw new Error("データが見つかりませんでした");

        matches.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        const detailsResp = await this.githubFetch(matches[0].url);
        const details = await detailsResp.json();
        const actualKey = Object.keys(details.files).find(key => key.normalize() === filename.normalize());
        const data = JSON.parse(details.files[actualKey].content);

        localStorage.setItem(CONFIG.STORAGE_KEYS.DATA, JSON.stringify(data));
        const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        this.saveTimestamp('lastPull', nowTime);
        return { data, time: nowTime };
    }
}

/**
 * ChartManager - Handles Chart.js visualization
 */
class ChartManager {
    constructor(canvasId, app) {
        this.ctx = document.getElementById(canvasId).getContext('2d');
        this.app = app;
        this.chart = null;
        this.colors = [];
    }

    updateColors(newColors) {
        this.colors = newColors;
    }

    render(routines, shiftHours) {
        if (this.chart) this.chart.destroy();

        const timeline = new Array(1440).fill(null);
        routines.forEach(r => {
            let startMin = Math.round(Utils.timeToDecimal(r.start) * 60);
            let endMin = Math.round(Utils.timeToDecimal(r.end) * 60);
            if (startMin < endMin) {
                for (let i = startMin; i < endMin; i++) timeline[i] = r;
            } else {
                for (let i = startMin; i < 1440; i++) timeline[i] = r;
                for (let i = 0; i < endMin; i++) timeline[i] = r;
            }
        });

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
                bgColors.push(currentRoutine ? currentRoutine.color : 'rgba(255, 255, 255, 0.05)');
                labels.push(currentRoutine ? currentRoutine.name : null);
                currentRoutine = timeline[i];
                currentDuration = 1;
            }
        }
        dataPoints.push(currentDuration / 60);
        bgColors.push(currentRoutine ? currentRoutine.color : 'rgba(255, 255, 255, 0.05)');
        labels.push(currentRoutine ? currentRoutine.name : null);

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
                rotation: shiftHours * 15,
                layout: { padding: 35 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const val = context.raw;
                                return `${context.chart.data.labels[context.dataIndex] || 'Free Time'}: ${Math.floor(val)}h ${Math.round((val % 1) * 60)}m`;
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
            plugins: [{
                id: 'clockFace',
                afterDraw: (chart) => this._drawClockFace(chart, shiftHours)
            }]
        });
    }

    _drawClockFace(chart, shiftHours) {
        const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        const outerRadius = Math.min(width, height) / 2;

        ctx.save();
        ctx.translate(centerX, centerY);

        for (let i = 0; i < 24; i++) {
            const angle = (i * 15 - 90) * (Math.PI / 180);
            const isMajor = i % 3 === 0;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * (outerRadius - 5), Math.sin(angle) * (outerRadius - 5));
            ctx.lineTo(Math.cos(angle) * (outerRadius + 5), Math.sin(angle) * (outerRadius + 5));
            ctx.strokeStyle = isMajor ? '#bb86fc' : 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.stroke();

            const textRadius = outerRadius + 18;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (isMajor) {
                ctx.font = 'bold 16px Inter, sans-serif';
                ctx.strokeStyle = '#121212';
                ctx.lineWidth = 3;
                ctx.strokeText(i.toString(), Math.cos(angle) * textRadius, Math.sin(angle) * textRadius);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(i.toString(), Math.cos(angle) * textRadius, Math.sin(angle) * textRadius);
            } else {
                ctx.font = '12px Inter, sans-serif';
                ctx.fillStyle = '#aaaaaa';
                ctx.fillText(i.toString(), Math.cos(angle) * textRadius, Math.sin(angle) * textRadius);
            }
        }

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

        const timeFontSize = Math.min(width, height) / 5;
        const baseTime = new Date(now.getTime() - (shiftHours * 3600000));
        const timeStr = baseTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        ctx.fillStyle = '#03DAC6';
        ctx.font = `${timeFontSize}px 'Quicksand', sans-serif`;
        ctx.fillText(timeStr, 0, 0);
        ctx.font = `${timeFontSize * 0.18}px 'Quicksand', sans-serif`;
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('基準時刻', 0, -timeFontSize * 0.6);

        ctx.restore();
    }

    _getSegmentGradient(ctx, colors) {
        const { chart, dataIndex } = ctx;
        const color = colors[dataIndex];
        const chartArea = chart.chartArea;
        if (!color || color.startsWith('rgba') || !chartArea) return color;
        const cX = (chartArea.left + chartArea.right) / 2;
        const cY = (chartArea.top + chartArea.bottom) / 2;
        const r = Math.min(chartArea.width, chartArea.height) / 2;
        const grad = chart.ctx.createRadialGradient(cX, cY, 0, cX, cY, r);
        const hexToRgba = (hex, a) => {
            const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return res ? `rgba(${parseInt(res[1], 16)}, ${parseInt(res[2], 16)}, ${parseInt(res[3], 16)}, ${a})` : hex;
        };
        grad.addColorStop(0.8, hexToRgba(color, 0.7));
        grad.addColorStop(0.6, hexToRgba(color, 1));
        return grad;
    }
}

/**
 * AudioManager - Handles sound effects
 */
class AudioManager {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    play(type) {
        if (!type || type === 'none') return;
        this.init();
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const playOsc = (freq, t, gVal, decay, delay = 0) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = t;
            osc.frequency.setValueAtTime(freq, now + delay);
            g.gain.setValueAtTime(gVal, now + delay);
            g.gain.exponentialRampToValueAtTime(0.001, now + delay + decay);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(now + delay);
            osc.stop(now + delay + decay + 0.1);
        };

        switch (type) {
            case 'bell': playOsc(880, 'sine', 0.1, 1.5, 0); playOsc(1760, 'sine', 0.05, 1.0, 0); break;
            case 'ding': playOsc(1200, 'triangle', 0.1, 0.5, 0); break;
            case 'marimba': playOsc(523, 'sine', 0.15, 0.3, 0); playOsc(659, 'sine', 0.15, 0.3, 0.15); playOsc(784, 'sine', 0.15, 0.3, 0.3); break;
            case 'digital': playOsc(440, 'square', 0.05, 0.1, 0); playOsc(880, 'square', 0.05, 0.1, 0.1); break;
        }
    }
}

/**
 * RoutineApp - Main Orchestrator
 */
class RoutineApp {
    constructor() {
        this.data = new DataManager();
        this.chart = new ChartManager('routineChart', this);
        this.audio = new AudioManager();
        this.init();
    }

    init() {
        this.currentThemeId = this.data.loadColorTheme();
        this.currentColors = CONFIG.THEMES[this.currentThemeId].colors;
        this.chart.updateColors(this.currentColors);

        this._initElements();
        const savedData = this.data.loadLocal();
        this._applyLoadedData(savedData);
        this._addEventListeners();
        this._renderAll();
        this._startClock();
    }

    _initElements() {
        this.els = {
            themeSelect: document.getElementById('themeSelect'),
            activity: document.getElementById('activityName'),
            start: document.getElementById('startTime'),
            end: document.getElementById('endTime'),
            bulk: document.getElementById('bulkInput'),
            memo: document.getElementById('memoInput'),
            wake: document.getElementById('baseWakeupTime'),
            shift: document.getElementById('shiftHours'),
            slider: document.getElementById('shiftSlider'),
            minus: document.getElementById('shiftMinus'),
            plus: document.getElementById('shiftPlus'),
            reset: document.getElementById('resetShift'),
            list: document.getElementById('shiftedScheduleList'),
            add: document.getElementById('addBtn'),
            import: document.getElementById('importBtn'),
            chime: document.getElementById('chimeSelect'),
            testSound: document.getElementById('testChimeBtn'),
            syncId: document.getElementById('syncIdInput'),
            genId: document.getElementById('genSyncIdBtn'),
            load: document.getElementById('loadSyncBtn'),
            save: document.getElementById('pushSyncBtn'),
            savedDisplay: document.getElementById('lastSavedDisplay'),
            loadDisplay: document.getElementById('lastLoadDisplay'),
            token: document.getElementById('ghTokenInput'),
            tokenWrapper: document.getElementById('ghTokenWrapper'),
            status: document.getElementById('syncStatus'),
            shareBtn: document.getElementById('shareSettingsBtn'),
            modal: document.getElementById('shareModal'),
            closeModal: document.getElementById('closeShareModal'),
            copyBtn: document.getElementById('copyLinkBtn'),
            copyMsg: document.getElementById('copyMsg'),
            dynamicTimes: document.querySelectorAll('.dynamic-time'),
            wakeChecks: [
                document.getElementById('checkWake0'),
                document.getElementById('checkWake8'),
                document.getElementById('checkWake16')
            ]
        };
    }

    _applyLoadedData(data) {
        if (this.els.themeSelect) this.els.themeSelect.value = this.currentThemeId;
        if (!data) return;
        if (this.els.memo) this.els.memo.value = data.memo || "";
        if (this.els.wake) this.els.wake.value = data.baseWakeupTime || "05:00";
        if (this.els.chime) this.els.chime.value = data.chimeType || "none";
        if (this.els.syncId) this.els.syncId.value = this.data.syncId;
        if (this.els.token) {
            this.els.token.value = this.data.ghToken;
            this._updateTokenVisibility();
        }
        if (data.wakeChecks) {
            this.els.wakeChecks.forEach((cb, i) => { if (cb) cb.checked = data.wakeChecks[i]; });
        }
        this.els.shift.value = Utils.decimalToOffsetStr(this.data.shiftHours);
        if (this.els.slider) this.els.slider.value = this.data.shiftHours;

        const ts = this.data.getTimestamps();
        if (this.els.loadDisplay) this.els.loadDisplay.textContent = `最終更新: ${ts.lastPull || '--:--'}`;
        if (this.els.savedDisplay) this.els.savedDisplay.textContent = `最終更新: ${ts.lastPush || '--:--'}`;
        this._updateSyncStatusUI();
    }

    _addEventListeners() {
        this.els.themeSelect?.addEventListener('change', (e) => this._handleThemeChange(e.target.value));
        this.els.add?.addEventListener('click', () => this.addRoutine());
        this.els.import?.addEventListener('click', () => this.importFromText());
        this.els.shift?.addEventListener('change', (e) => this._applyShift(Utils.offsetStrToDecimal(e.target.value), 'input'));
        this.els.slider?.addEventListener('input', (e) => this._applyShift(e.target.value, 'slider'));
        this.els.minus?.addEventListener('click', () => this._applyShift(this.data.shiftHours - 0.25));
        this.els.plus?.addEventListener('click', () => this._applyShift(this.data.shiftHours + 0.25));
        this.els.reset?.addEventListener('click', () => this._applyShift(0));
        this.els.wake?.addEventListener('change', () => this._handleWakeTimeChange());
        this.els.memo?.addEventListener('input', () => this._saveAll());
        this.els.testSound?.addEventListener('click', () => this.audio.play(this.els.chime.value));
        this.els.chime?.addEventListener('change', () => { this.audio.init(); this._saveAll(); });
        this.els.wakeChecks.forEach(cb => cb?.addEventListener('change', () => this._saveAll()));
        this.els.genId?.addEventListener('click', () => this._handleGenId());
        this.els.load?.addEventListener('click', () => this._handleLoadCloud());
        this.els.save?.addEventListener('click', () => this._handleSaveCloud());
        this.els.syncId?.addEventListener('change', () => { this.data.syncId = this.els.syncId.value; this._saveAll(); this._updateSyncStatusUI(); });
        this.els.token?.addEventListener('change', () => { this.data.ghToken = this.els.token.value; this._saveAll(); this._updateSyncStatusUI(); });
        this.els.token?.addEventListener('focus', () => { if (this.els.tokenWrapper) this.els.tokenWrapper.style.opacity = "1"; });
        this.els.token?.addEventListener('blur', () => this._updateTokenVisibility());
        this.els.shareBtn?.addEventListener('click', () => this._openShareModal());
        this.els.closeModal?.addEventListener('click', () => this.els.modal.style.display = 'none');
        this.els.modal?.addEventListener('click', (e) => { if (e.target === this.els.modal) this.els.modal.style.display = 'none'; });
        this.els.copyBtn?.addEventListener('click', () => this._copyLink());

        this._checkUrlParams();
    }

    _startClock() {
        const update = () => {
            if (this.chart.chart) this.chart.chart.update();
            this._checkChime();
        };
        const now = new Date();
        setTimeout(() => { setInterval(update, 60000); update(); }, (60 - now.getSeconds()) * 1000 + 100);
    }

    _saveAll() {
        this.data.saveLocal({
            memo: this.els.memo?.value,
            baseWakeupTime: this.els.wake?.value,
            chimeType: this.els.chime?.value,
            wakeChecks: this.els.wakeChecks.map(cb => cb?.checked)
        });
    }

    _renderAll() {
        this._syncWakeWithSleep();
        this.chart.render(this.data.routines, this.data.shiftHours);
        this._updateScheduleList();
        this._updateCheckboxTimes();
    }

    _applyShift(val, source = 'other') {
        let numVal = Math.max(-24, Math.min(24, parseFloat(val) || 0));
        this.data.shiftHours = numVal;
        if (source !== 'input') this.els.shift.value = Utils.decimalToOffsetStr(numVal);
        if (source !== 'slider' && this.els.slider) this.els.slider.value = numVal;
        this._renderAll();
        this._saveAll();
    }

    _handleWakeTimeChange() {
        const val = this.els.wake.value;
        const sleep = this.data.routines.find(r => r.name === "睡眠");
        if (!val || !sleep) return this._renderAll();
        let newShift = Utils.timeToDecimal(val) - Utils.timeToDecimal(sleep.end);
        if (newShift > 12) newShift -= 24;
        if (newShift < -12) newShift += 24;
        this._applyShift(newShift);
    }

    _syncWakeWithSleep() {
        const sleep = this.data.routines.find(r => r.name === "睡眠");
        if (sleep && this.els.wake) {
            const newValue = Utils.decimalToHHMM(Utils.normalizeHour(Utils.timeToDecimal(sleep.end) + this.data.shiftHours));
            if (this.els.wake.value !== newValue) this.els.wake.value = newValue;
        }
    }

    _updateScheduleList() {
        this.els.list.innerHTML = '';
        const sorted = [...this.data.routines].sort((a, b) => a.start.localeCompare(b.start));
        sorted.forEach(r => {
            const s = Utils.normalizeHour(Utils.timeToDecimal(r.start) + this.data.shiftHours);
            const e = Utils.normalizeHour(Utils.timeToDecimal(r.end) + this.data.shiftHours);
            const li = document.createElement('li');
            li.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
            li.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <div style="width:10px; height:10px; background:${r.color}; border-radius:50%; margin-right:8px;"></div>
                    <span>${Utils.decimalToHHMM(s)} - ${Utils.decimalToHHMM(e)}</span>: <strong>${r.name}</strong>
                </div>
                <button class="delete-shifted-btn" onclick="app.deleteRoutine('${r.id}')">×</button>
            `;
            this.els.list.appendChild(li);
        });
    }

    _updateCheckboxTimes() {
        const baseDec = Utils.timeToDecimal(this.els.wake.value);
        this.els.dynamicTimes.forEach(span => {
            const offset = parseFloat(span.getAttribute('data-offset'));
            span.textContent = isNaN(baseDec) ? "--:--" : Utils.decimalToHHMM(Utils.normalizeHour(baseDec + offset));
        });
    }

    _checkChime() {
        const type = this.els.chime.value;
        if (type === 'none' || new Date().getSeconds() !== 0) return;
        const nowDec = new Date().getHours() + new Date().getMinutes() / 60;
        const ring = this.data.routines.some(r => {
            const shiftedEnd = Utils.normalizeHour(Utils.timeToDecimal(r.end) + this.data.shiftHours);
            return Math.abs(nowDec - shiftedEnd) < 0.001 || Math.abs(nowDec + 24 - shiftedEnd) < 0.001 || Math.abs(nowDec - (shiftedEnd + 24)) < 0.001;
        });
        if (ring) this.audio.play(type);
    }

    addRoutine() {
        const name = this.els.activity.value, s = this.els.start.value, e = this.els.end.value;
        if (!name || !s || !e) return alert('入力してください');
        const rev = (t) => Utils.decimalToHHMM(Utils.normalizeHour(Utils.timeToDecimal(t) - this.data.shiftHours));
        this.data.routines.push({ id: Date.now(), name, start: rev(s), end: rev(e), color: this.currentColors[this.data.routines.length % this.currentColors.length] });
        this.els.activity.value = ''; this._renderAll(); this._saveAll();
    }

    deleteRoutine(id) {
        this.data.routines = this.data.routines.filter(r => String(r.id) !== String(id));
        this._renderAll(); this._saveAll();
    }

    importFromText() {
        const text = this.els.bulk.value.trim();
        if (!text || !confirm('既存のデータは上書きされます。よろしいですか？')) return;
        this._applyShift(0);
        const newRoutines = [], regA = /(.+?)\s+(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/, regB = /(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})\s*[:]\s*(.+)/;
        text.split('\n').forEach(line => {
            const str = line.trim(); if (!str) return;
            let m = str.match(regB) || str.match(regA);
            if (m) {
                const isB = !!str.match(regB);
                newRoutines.push({ id: Date.now() + Math.random(), name: (isB ? m[3] : m[1]).trim(), start: (isB ? m[1] : m[2]).padStart(5, '0'), end: (isB ? m[2] : m[3]).padStart(5, '0'), color: this.currentColors[newRoutines.length % this.currentColors.length] });
            }
        });
        if (newRoutines.length === 0) return alert('不備があります');
        this.data.routines = newRoutines; this.els.bulk.value = ''; this._renderAll(); this._saveAll();
    }

    _handleGenId() {
        const id = this.data.generateSyncId();
        this.els.syncId.value = id; this.data.syncId = id; this._saveAll();
    }

    async _handleSaveCloud() {
        if (!this.els.token.value || !this.els.syncId.value) return alert("入力不足です");
        try {
            const time = await this.data.saveToCloud();
            this.els.savedDisplay.textContent = `最終更新: ${time}`;
        } catch (e) { alert(e.message); }
    }

    async _handleLoadCloud() {
        if (!this.els.token.value || !this.els.syncId.value) return alert("入力不足です");
        if (!confirm("データを読み込みますか？")) return;
        try {
            const res = await this.data.loadFromCloud();
            this._applyLoadedData(res.data); this._renderAll();
            this.els.loadDisplay.textContent = `最終更新: ${res.time}`;
        } catch (e) { alert(e.message); }
    }

    _updateSyncStatusUI() {
        const active = !!(this.data.syncId && this.data.ghToken);
        this.els.status.className = `sync-status sync-status-dot ${active ? 'active' : 'inactive'}`;
        this.els.status.style.color = active ? '#03DAC6' : '#555';
    }

    _updateTokenVisibility() {
        const hasVal = !!this.els.token.value;
        if (this.els.tokenWrapper) this.els.tokenWrapper.style.opacity = hasVal ? "0.4" : "0.75";
        this.els.token.style.color = hasVal ? "rgba(255,255,255,0.4)" : "white";
    }

    _openShareModal() {
        if (!this.data.syncId || !this.data.ghToken) return alert("IDとトークンが必要です");
        const url = new URL(window.location.href);
        url.searchParams.set('id', this.data.syncId); url.searchParams.set('token', this.data.ghToken);
        this.els.modal.style.display = 'flex'; this.els.copyMsg.textContent = "";
        const qrEl = document.getElementById('qrcode'); qrEl.innerHTML = "";
        new QRCode(qrEl, { text: url.toString(), width: 180, height: 180 });
        this.currentShareUrl = url.toString();
    }

    _copyLink() {
        navigator.clipboard.writeText(this.currentShareUrl).then(() => {
            this.els.copyMsg.textContent = "コピーしました！";
            setTimeout(() => this.els.copyMsg.textContent = "", 3000);
        });
    }

    _handleThemeChange(themeId) {
        this.currentThemeId = themeId;
        const newTheme = CONFIG.THEMES[this.currentThemeId];
        this.currentColors = newTheme.colors;
        
        // Update colors for all existing routines
        this.data.routines.forEach((r, i) => {
            r.color = this.currentColors[i % this.currentColors.length];
        });

        this.data.saveColorTheme(this.currentThemeId);
        this.chart.updateColors(this.currentColors);
        this._renderAll();
        this._saveAll();
    }

    _checkUrlParams() {
        const p = new URLSearchParams(window.location.search);
        const id = p.get('id'), token = p.get('token');
        if (id && token) {
            window.history.replaceState({}, '', window.location.pathname);
            this.data.syncId = id; this.data.ghToken = token;
            this.els.syncId.value = id; this.els.token.value = token;
            this._updateTokenVisibility(); this._saveAll();
            if (confirm(`ID: ${id} のデータを読み込みますか？`)) this._handleLoadCloud();
        }
    }
}

// Start App
const app = new RoutineApp();
window.app = app;