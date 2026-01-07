// Register the datalabels plugin
Chart.register(ChartDataLabels);

class RoutineApp {
    constructor() {
        this.routines = [];
        this.chart = null;
        this.shiftHours = 0;

        // Colors for chart segments
        this.colors = [
            '#BB86FC', '#03DAC6', '#CF6679', '#FFB74D', '#4FC3F7',
            '#AED581', '#FFD54F', '#90CAF9', '#F48FB1', '#80CBC4'
        ];

        // --- 初期化処理 ---
        this.initElements();
        this.loadData(); // 保存データの読み込み
        this.addEventListeners();
        this.renderChart();
        this.updateTimeDisplay();
        this.updateShiftInfo();

        // Update current time display (and chart marker) every minute
        setInterval(() => {
            this.updateTimeDisplay();
            if (this.chart) this.chart.update(); // Update chart to move time marker
        }, 60000);
    }

    // --- UI要素の取得 ---
    initElements() {
        this.activityInput = document.getElementById('activityName');
        this.startTimeInput = document.getElementById('startTime');
        this.endTimeInput = document.getElementById('endTime');
        this.addBtn = document.getElementById('addBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.routineList = document.getElementById('routineList');
        this.ctx = document.getElementById('routineChart').getContext('2d');
        this.shiftInput = document.getElementById('shiftHours');
        this.statusDisplay = document.getElementById('shiftedActivity');
        this.shiftedScheduleList = document.getElementById('shiftedScheduleList');
        this.currentTimeDisplay = document.getElementById('currentTimeDisplay');
        this.bulkInput = document.getElementById('bulkInput');
        this.importBtn = document.getElementById('importBtn');
        this.shiftSlider = document.getElementById('shiftSlider');
        this.shiftMinus = document.getElementById('shiftMinus');
        this.shiftPlus = document.getElementById('shiftPlus');
    }

    // --- イベントリスナーの登録 ---
    addEventListeners() {
        this.addBtn.addEventListener('click', () => this.addRoutine());
        this.clearBtn.addEventListener('click', () => this.clearRoutines());
        this.importBtn.addEventListener('click', () => this.importFromText());

        // Sync Helper
        const applyShift = (val) => {
            let numVal = parseFloat(val) || 0;
            // Limit range to -24 to 24
            if (numVal < -24) numVal = -24;
            if (numVal > 24) numVal = 24;

            this.shiftHours = numVal;
            // Update UI
            this.shiftInput.value = this.shiftHours;
            this.shiftSlider.value = this.shiftHours;

            // Logic
            this.updateShiftInfo();
            this.renderChart();
            this.saveData();
        };

        // Input
        this.shiftInput.addEventListener('input', (e) => applyShift(e.target.value));

        // Slider
        this.shiftSlider.addEventListener('input', (e) => applyShift(e.target.value));

        // Buttons
        this.shiftMinus.addEventListener('click', () => {
            let val = parseFloat(this.shiftInput.value) || 0;
            applyShift(val - 1);
        });

        this.shiftPlus.addEventListener('click', () => {
            let val = parseFloat(this.shiftInput.value) || 0;
            applyShift(val + 1);
        });
    }

    // --- 一括登録ロジック ---
    // "活動名 HH:MM-HH:MM" 形式のテキストを解析
    importFromText() {
        const text = this.bulkInput.value;
        if (!text.trim()) {
            alert('テキストを入力してください');
            return;
        }

        if (!confirm('現在入力されているルーティンは全て上書きされますが、よろしいですか？')) {
            return;
        }

        const lines = text.split('\n');
        const newRoutines = [];

        // Regex to capture: Activity Name (group 1), Start Time (group 2), End Time (group 3)
        const regex = /(.+?)\s+(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/;

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            const match = line.match(regex);
            if (match) {
                const name = match[1].trim();
                let start = match[2];
                let end = match[3];

                // Normalize single digit hours (e.g. 5:00 -> 05:00)
                if (start.length === 4) start = '0' + start;
                if (end.length === 4) end = '0' + end;

                newRoutines.push({
                    id: Date.now() + Math.random(), // Unique ID
                    name,
                    start,
                    end,
                    color: this.colors[newRoutines.length % this.colors.length]
                });
            }
        });

        if (newRoutines.length === 0) {
            alert('読み取り可能なデータが見つかりませんでした。\n形式: 活動名 開始時間-終了時間\n(例: 睡眠 22:00-05:00)');
            return;
        }

        this.routines = newRoutines;
        this.renderList();
        this.renderChart();
        this.updateShiftInfo();
        this.saveData();

        alert(`${newRoutines.length}件のルーティンを読み込みました。`);
        this.bulkInput.value = ''; // Clear input if successful
    }

    // --- 個別ルーティン管理 ---
    addRoutine() {
        const name = this.activityInput.value;
        const start = this.startTimeInput.value;
        const end = this.endTimeInput.value;

        if (!name || !start || !end) {
            alert('全ての項目を入力してください。');
            return;
        }

        const routine = {
            id: Date.now(),
            name,
            start,
            end,
            color: this.colors[this.routines.length % this.colors.length]
        };

        this.routines.push(routine);
        this.renderList();
        this.renderChart();
        this.updateShiftInfo();
        this.saveData(); // Save new routine

        // Clear inputs
        this.activityInput.value = '';
    }

    clearRoutines() {
        if (!confirm('全てのデータを消去してもよろしいですか？')) return;
        this.routines = [];
        this.shiftHours = 0;
        this.shiftInput.value = 0;
        if (this.shiftSlider) this.shiftSlider.value = 0;

        localStorage.removeItem('routineApp_data'); // Clear local storage

        this.renderList();
        this.renderChart();
        this.updateShiftInfo();
    }

    deleteRoutine(id) {
        this.routines = this.routines.filter(r => r.id !== id);
        this.renderList();
        this.renderChart();
        this.updateShiftInfo();
        this.saveData(); // Save after delete
    }

    // --- UI描画: スケジュールリスト ---
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

    timeToDecimal(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h + m / 60;
    }

    // --- グラフ描画ロジック (Chart.js) ---
    renderChart() {
        if (this.chart) {
            this.chart.destroy();
        }

        const timeline = new Array(1440).fill(null);

        this.routines.forEach(r => {
            const startDec = this.timeToDecimal(r.start);
            const endDec = this.timeToDecimal(r.end);

            let startMin = Math.round(startDec * 60);
            let endMin = Math.round(endDec * 60);

            if (startMin < endMin) {
                for (let i = startMin; i < endMin; i++) {
                    timeline[i] = r;
                }
            } else {
                for (let i = startMin; i < 1440; i++) {
                    timeline[i] = r;
                }
                for (let i = 0; i < endMin; i++) {
                    timeline[i] = r;
                }
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

        // Custom Plugin for Clock Face and Current Time
        const clockPlugin = {
            id: 'clockFace',
            afterDraw: (chart) => {
                const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
                const centerX = (left + right) / 2;
                const centerY = (top + bottom) / 2;
                const outerRadius = Math.min(width, height) / 2;

                ctx.save();
                ctx.translate(centerX, centerY);

                // 1. Draw Hour Ticks and Numbers
                ctx.font = 'bold 14px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#e0e0e0';

                // We want to draw numbers every 3 hours: 0, 3, 6, 9...
                for (let i = 0; i < 24; i++) {
                    const angle = (i * 15 - 90) * (Math.PI / 180);
                    const isMajor = i % 3 === 0; // Show number every 3 hours
                    const isMinor = i % 1 === 0;

                    const tickLength = isMajor ? 10 : 5;
                    // const textRadius = outerRadius + 15;

                    ctx.beginPath();
                    // Draw ticks just inside/outside rim
                    ctx.moveTo(Math.cos(angle) * (outerRadius - 25), Math.sin(angle) * (outerRadius - 25));
                    ctx.lineTo(Math.cos(angle) * (outerRadius - 25 + tickLength), Math.sin(angle) * (outerRadius - 25 + tickLength));
                    ctx.strokeStyle = isMajor ? '#bb86fc' : 'rgba(255, 255, 255, 0.3)';
                    ctx.lineWidth = isMajor ? 2 : 1;
                    ctx.stroke();

                    // Draw Number
                    if (isMajor) {
                        ctx.fillText(i.toString(), Math.cos(angle) * (outerRadius - 10), Math.sin(angle) * (outerRadius - 10));
                    }
                }

                // 2. Draw Current Time Marker
                const now = new Date();
                const h = now.getHours();
                const m = now.getMinutes();
                const currentDec = h + m / 60;

                const currentAngle = (currentDec * 15 - 90) * (Math.PI / 180);
                const markerRadius = outerRadius - 40;

                ctx.beginPath();
                ctx.arc(Math.cos(currentAngle) * markerRadius, Math.sin(currentAngle) * markerRadius, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#03DAC6';
                ctx.shadowColor = '#03DAC6';
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.restore();
            }
        };

        const rotationVal = (this.shiftHours * 15);

        // Capture colors for the scriptable option
        const simpleBgColors = bgColors;

        this.chart = new Chart(this.ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataPoints,
                    borderWidth: 0,
                    // Use scriptable background color for radial gradients
                    backgroundColor: (context) => {
                        const idx = context.dataIndex;
                        const color = simpleBgColors[idx];

                        // Handle Free Time (rgba) or missing color
                        if (!color || color.startsWith('rgba')) {
                            return color || 'rgba(0,0,0,0)';
                        }

                        const chart = context.chart;
                        const { ctx, chartArea } = chart;
                        if (!chartArea) return color;

                        const centerX = (chartArea.left + chartArea.right) / 2;
                        const centerY = (chartArea.top + chartArea.bottom) / 2;
                        const outerRadius = Math.min(chartArea.width, chartArea.height) / 2;

                        // Create gradient from center to outer edge
                        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius);

                        // Helper: Hex to RGBA
                        const hex2rgba = (hex, alpha) => {
                            if (!hex || hex.length < 7) return hex;
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                        };

                        try {
                            // Gradient: Inner side darker, Outer side bright
                            // 50% (Inner Edge): Darker/Transparent
                            gradient.addColorStop(0.5, hex2rgba(color, 0.4));
                            // 100% (Outer Edge): Full Color
                            gradient.addColorStop(1, hex2rgba(color, 1));
                            return gradient;
                        } catch (e) {
                            return color;
                        }
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // Turn off animation 
                rotation: rotationVal,
                layout: {
                    padding: 5
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const value = context.raw;
                                const hours = Math.floor(value);
                                const minutes = Math.round((value - hours) * 60);
                                return `${context.chart.data.labels[context.dataIndex] || 'Free Time'}: ${hours}h ${minutes}m`;
                            }
                        }
                    },
                    datalabels: {
                        color: '#fff',
                        font: {
                            weight: 'bold',
                            size: 14
                        },
                        formatter: (value, ctx) => {
                            if (value < 1) return null;
                            return ctx.chart.data.labels[ctx.dataIndex];
                        },
                        display: 'auto',
                        anchor: 'center',
                        align: 'center'
                    },
                }
            },
            plugins: [clockPlugin]
        });
    }

    // --- 状態更新: シフト計算とステータス表示 ---
    updateShiftInfo() {
        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentDecimal = currentHours + currentMinutes / 60;

        this.shiftedScheduleList.innerHTML = '';

        let currentActivityName = "(Free Time)";
        let currentActivityDuration = "";

        const sortedRoutines = [...this.routines].sort((a, b) => a.start.localeCompare(b.start));

        sortedRoutines.forEach(r => {
            let startDec = this.timeToDecimal(r.start);
            let endDec = this.timeToDecimal(r.end);

            // Calculate Duration
            let durationDec = endDec - startDec;
            if (durationDec < 0) durationDec += 24;
            const durH = Math.floor(durationDec);
            const durM = Math.round((durationDec - durH) * 60);
            const durationStr = `${durH}:${String(durM).padStart(2, '0')}`;

            // Calculate Shifted Times
            let shiftedStart = (startDec + this.shiftHours) % 24;
            let shiftedEnd = (endDec + this.shiftHours) % 24;

            if (shiftedStart < 0) shiftedStart += 24;
            if (shiftedEnd < 0) shiftedEnd += 24;

            const formatTime = (val) => {
                const h = Math.floor(val);
                const m = Math.round((val - h) * 60);
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            };

            const timeStr = `${formatTime(shiftedStart)} - ${formatTime(shiftedEnd)}`;
            const li = document.createElement('li');

            // Apply flex styling for right alignment of duration
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';

            li.innerHTML = `
                <div><span>${timeStr}</span>: <strong>${r.name}</strong></div>
                <span style="opacity:0.7; font-size:0.9em;">(${durationStr})</span>
            `;
            this.shiftedScheduleList.appendChild(li);

            let isActive = false;

            if (shiftedStart < shiftedEnd) {
                if (currentDecimal >= shiftedStart && currentDecimal < shiftedEnd) isActive = true;
            } else {
                if (currentDecimal >= shiftedStart || currentDecimal < shiftedEnd) isActive = true;
            }

            if (isActive) {
                currentActivityName = r.name;
                currentActivityDuration = durationStr;
            }
        });

        if (currentActivityName.includes("Free Time")) {
            this.statusDisplay.textContent = currentActivityName;
            this.statusDisplay.style.color = "#aaa";
        } else {
            this.statusDisplay.textContent = `${currentActivityName} (${currentActivityDuration})`;
            this.statusDisplay.style.color = "#bb86fc";
        }
    }

    updateTimeDisplay() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        if (this.currentTimeDisplay) {
            this.currentTimeDisplay.textContent = timeString;
        }
    }

    // --- データ保存 (LocalStorage) ---
    saveData() {
        try {
            const data = {
                routines: this.routines,
                shiftHours: this.shiftHours
            };
            localStorage.setItem('routineApp_data', JSON.stringify(data));
        } catch (e) {
            console.error("Save failed", e);
        }
    }

    loadData() {
        try {
            const saved = localStorage.getItem('routineApp_data');
            if (saved) {
                const data = JSON.parse(saved);
                this.routines = data.routines || [];
                this.shiftHours = data.shiftHours || 0;

                if (this.shiftInput) {
                    this.shiftInput.value = this.shiftHours;
                }
                if (this.shiftSlider) {
                    this.shiftSlider.value = this.shiftHours;
                }
            }
        } catch (e) {
            console.error("Load failed", e);
        }
    }
}

const app = new RoutineApp();
