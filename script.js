class WebDAW {
    constructor() {
        this.audioContext = null;
        this.tracks = new Map();
        this.masterGainNode = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.currentTime = 0;
        this.duration = 0;
        this.soloedTracks = new Set();
        this.selectedTrack = null;
        this.playbackRate = 1;
        this.isMasterMuted = false;
        this.masterVolume = 0.7;
        this.isLooping = false;


        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.pdfScale = 1.5;

        this.trackConfigs = [
            { name: 'Violino 1', file: 'audio/Violino 1.mp3', color: '#ff6b6b' },
            { name: 'Violino 2', file: 'audio/Violino 2.mp3', color: '#4ecdc4' },
            { name: 'Violino 3', file: 'audio/Violino 3.mp3', color: '#45b7d1' },
            { name: 'Clarinete', file: 'audio/Clarinete.mp3', color: '#96ceb4' },
            { name: 'Cello', file: 'audio/Cello.mp3', color: '#feca57' },
            { name: 'Piano', file: 'audio/Piano.mp3', color: '#ff9ff3' },
            { name: 'Guitarra', file: 'audio/Guitarra.mp3', color: '#54a0ff' },
            { name: 'Baixo', file: 'audio/Baixo.mp3', color: '#5f27cd' },
            { name: 'Bateria', file: 'audio/Bateria.mp3', color: '#00d2d3' }
        ];
        
        this.init();
    }
    
    async init() {
        console.log('Initializing WebDAW...');
        await this.initializeAudioContext();
        this.createTrackElements();
        this.setupEventListeners();
        await this.loadAllAudioFiles();
        this.drawAllWaveforms();
        console.log('WebDAW initialization complete');
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
            this.masterGainNode.gain.value = this.masterVolume;
            console.log("Audio Context initialized successfully");
        } catch (error) {
            console.error("Failed to initialize Audio Context:", error);
            alert("Seu navegador não suporta Web Audio API. Por favor, use um navegador mais recente.");
        }
    }

    createTrackElements() {
        const tracksContainer = document.querySelector('.track-list');
        this.trackConfigs.forEach((config, index) => {
            const trackNumber = index + 1;
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            trackItem.dataset.track = trackNumber;
            trackItem.innerHTML = `
                <div class="track-info">
                    <h3>${config.name}</h3>
                    <div class="track-controls">
                        <button class="score-btn" data-track="${trackNumber}" title="Ver Partitura"><img class="fit-picture" src="partitura.png"/></button>
                        <button class="mute-btn" data-track="${trackNumber}" title="Mute">M</button>
                        <button class="solo-btn" data-track="${trackNumber}" title="Solo">S</button>
                    </div>
                </div>
                <div class="track-sliders">
                    <div class="slider-group">
                        <label>Vol</label>
                        <input type="range" class="volume-slider" data-track="${trackNumber}" min="0" max="100" value="70">
                        <span class="volume-value">70%</span>
                    </div>
                    <div class="slider-group">
                        <label>Pan</label>
                        <input type="range" class="pan-slider" data-track="${trackNumber}" min="-100" max="100" value="0">
                        <span class="pan-value">C</span>
                    </div>
                </div>
                <div class="waveform-container">
                    <canvas class="waveform" data-track="${trackNumber}"></canvas>
                    <div class="playhead" id="playhead"></div>
                </div>`;
            tracksContainer.appendChild(trackItem);
            this.tracks.set(trackNumber, {
                name: config.name, file: config.file, color: config.color, audioBuffer: null, source: null,
                gainNode: null, panNode: null, isPlaying: false, isMuted: false, isSolo: false,
                volume: 0.7, pan: 0, element: trackItem, canvas: trackItem.querySelector('.waveform')
            });
            this.addTrackEventListeners(trackNumber);
        });
    }

    addTrackEventListeners(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const element = track.element;
        element.querySelector('.mute-btn').addEventListener('click', () => this.toggleMute(trackNumber));
        element.querySelector('.solo-btn').addEventListener('click', () => this.toggleSolo(trackNumber));
        element.querySelector('.score-btn').addEventListener('click', () => this.openScore(trackNumber));
        const volumeSlider = element.querySelector('.volume-slider');
        volumeSlider.addEventListener('input', (e) => {
            this.setTrackVolume(trackNumber, e.target.value / 100);
            element.querySelector('.volume-value').textContent = e.target.value + '%';
        });
        const panSlider = element.querySelector('.pan-slider');
        panSlider.addEventListener('input', (e) => {
            this.setTrackPan(trackNumber, e.target.value / 100);
            const value = parseInt(e.target.value);
            element.querySelector('.pan-value').textContent = value === 0 ? 'C' : (value > 0 ? `R${value}` : `L${Math.abs(value)}`);
        });
        track.canvas.addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            this.seekTo((x / rect.width) * this.duration);
        });
    }

    async loadAllAudioFiles() {
        console.log('Loading audio files...');
        const loadPromises = Array.from(this.tracks.keys()).map(trackNumber => this.loadAudioFile(trackNumber));
        await Promise.all(loadPromises);
        this.calculateDuration();
        console.log('All audio files loaded');
    }

    async loadAudioFile(trackNumber) {
        const track = this.tracks.get(trackNumber);
        try {
            const response = await fetch(track.file);
            const arrayBuffer = await response.arrayBuffer();
            track.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            track.gainNode = this.audioContext.createGain();
            track.panNode = this.audioContext.createStereoPanner();
            track.gainNode.connect(track.panNode);
            track.panNode.connect(this.masterGainNode);
            track.gainNode.gain.value = track.volume;
            track.panNode.pan.value = track.pan;
        } catch (error) {
            console.error(`Failed to load ${track.file}:`, error);
        }
    }

    calculateDuration() {
        let maxDuration = 0;
        for (const track of this.tracks.values()) {
            if (track.audioBuffer) maxDuration = Math.max(maxDuration, track.audioBuffer.duration);
        }
        this.duration = maxDuration;
        document.getElementById('totalTime').textContent = this.formatTime(this.duration);
    }

    drawAllWaveforms() {
        for (const trackNumber of this.tracks.keys()) {
            if (this.tracks.get(trackNumber).audioBuffer) this.drawWaveform(trackNumber);
        }
    }

    drawWaveform(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const canvas = track.canvas;
        if (!track.audioBuffer || !canvas) return;
        setTimeout(() => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                setTimeout(() => this.drawWaveform(trackNumber), 100);
                return;
            }
            const ctx = canvas.getContext('2d');
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            const width = rect.width, height = rect.height;
            const audioData = track.audioBuffer.getChannelData(0);
            const step = Math.ceil(audioData.length / width);
            const amp = height / 2;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = track.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < width; i++) {
                let min = 1.0, max = -1.0;
                for (let j = 0; j < step; j++) {
                    const datum = audioData[(i * step) + j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
                ctx.moveTo(i, (1 + min) * amp);
                ctx.lineTo(i, (1 + max) * amp);
            }
            ctx.stroke();
        }, 50);
    }

    setupEventListeners() {
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlayback());
        document.getElementById('masterVolumeSlider').addEventListener('input', (e) => {
            this.setMasterVolume(e.target.value / 100);
            document.getElementById('masterVolumeValue').textContent = e.target.value + '%';
        });
        const volumeBtn = document.getElementById('volumeBtn');
        const masterVolumeControl = document.querySelector('.master-volume-control');
        volumeBtn.addEventListener('click', () => this.toggleMasterMute());
        volumeBtn.addEventListener('mouseenter', () => {
            masterVolumeControl.style.display = 'flex';
            masterVolumeControl.classList.add('active');
        });
        const hideVolumeSlider = () => {
            if (!masterVolumeControl.matches(':hover') && !volumeBtn.matches(':hover')) {
                masterVolumeControl.style.display = 'none';
                masterVolumeControl.classList.remove('active');
            }
        };
        volumeBtn.addEventListener('mouseleave', () => setTimeout(hideVolumeSlider, 100));
        masterVolumeControl.addEventListener('mouseleave', () => setTimeout(hideVolumeSlider, 100));
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.dataset.speed);
                this.setPlaybackRate(speed);
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('progressBar').addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            this.seekTo(((e.clientX - rect.left) / rect.width) * this.duration);
        });
        document.getElementById('prevBtn').addEventListener('click', () => this.seekTo(this.currentTime - 10));
        document.getElementById('nextBtn').addEventListener('click', () => this.seekTo(this.currentTime + 10));
        document.getElementById('loopBtn').addEventListener('click', () => this.toggleLoop());
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.code === 'Space') { e.preventDefault(); this.togglePlayback(); }
            else if (e.code === 'ArrowLeft') this.seekTo(this.currentTime - 10);
            else if (e.code === 'ArrowRight') this.seekTo(this.currentTime + 10);
            else if (e.code === 'KeyR') this.reset();
        });
    }

    togglePlayback() { this.isPlaying ? this.pause() : this.play(); }

    play() {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - this.pauseTime;
        for (const [trackNumber, track] of this.tracks) {
            if (track.audioBuffer && !track.isMuted && (this.soloedTracks.size === 0 || track.isSolo)) {
                this.startTrack(trackNumber, this.pauseTime);
            }
        }
        document.getElementById('playBtn').textContent = '⏸';
        document.getElementById('playBtn').classList.add('playing');
        this.updateProgress();
    }

    pause() {
        this.isPlaying = false;
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        for (const track of this.tracks.values()) this.stopTrack(track);
        document.getElementById('playBtn').textContent = '▶';
        document.getElementById('playBtn').classList.remove('playing');
    }

    startTrack(trackNumber, offset = 0) {
        const track = this.tracks.get(trackNumber);
        if (!track.audioBuffer) return;
        track.source = this.audioContext.createBufferSource();
        track.source.buffer = track.audioBuffer;
        track.source.playbackRate.value = this.playbackRate;
        track.source.connect(track.gainNode);
        track.source.onended = () => { if (!this.isSeeking) { track.isPlaying = false; track.source = null; } };
        const duration = track.audioBuffer.duration - offset;
        if (duration > 0) {
            track.source.start(this.audioContext.currentTime, offset, duration);
            track.isPlaying = true;
        }
    }

    stopTrack(track) {
        if (track.source) {
            try { track.source.stop(); } catch (e) {}
            track.source = null;
            track.isPlaying = false;
        }
    }

    seekTo(time) {
        time = Math.max(0, Math.min(time, this.duration));
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.pause();
        this.pauseTime = time;
        this.currentTime = time;
        this.updateAllPlayheads();
        document.getElementById("progressFill").style.width = `${(time / this.duration) * 100}%`;
        document.getElementById("currentTime").textContent = this.formatTime(time);
        if (wasPlaying) this.play();
    }

    updateProgress() {
        if (!this.isPlaying) return;
        this.currentTime = this.audioContext.currentTime - this.startTime;
        if (this.currentTime >= this.duration) {
            if (this.isLooping) { this.seekTo(0); this.play(); }
            else { this.pause(); this.seekTo(0); }
            return;
        }
        document.getElementById("progressFill").style.width = `${(this.currentTime / this.duration) * 100}%`;
        document.getElementById("currentTime").textContent = this.formatTime(this.currentTime);
        this.updateAllPlayheads();
        requestAnimationFrame(() => this.updateProgress());
    }

    updateAllPlayheads() {
        const percentage = (this.currentTime / this.duration) * 100;
        document.querySelectorAll('.playhead').forEach(p => p.style.left = `${percentage}%`);
    }

    setMasterVolume(volume) {
        this.masterVolume = volume;
        if (!this.isMasterMuted) this.masterGainNode.gain.value = volume;
    }

    toggleMasterMute() {
        this.isMasterMuted = !this.isMasterMuted;
        this.masterGainNode.gain.value = this.isMasterMuted ? 0 : this.masterVolume;
        const btn = document.getElementById('volumeBtn');
        btn.textContent = this.isMasterMuted ? '🔇' : '🔊';
        btn.classList.toggle('muted', this.isMasterMuted);
    }

    setTrackVolume(trackNumber, volume) {
        const track = this.tracks.get(trackNumber);
        track.volume = volume;
        if (track.gainNode && !track.isMuted) track.gainNode.gain.value = volume;
    }

    setTrackPan(trackNumber, pan) {
        const track = this.tracks.get(trackNumber);
        track.pan = pan;
        if (track.panNode) track.panNode.pan.value = pan;
    }

    toggleMute(trackNumber) {
        const track = this.tracks.get(trackNumber);
        track.isMuted = !track.isMuted;
        this.updateTrackGains();
        track.element.querySelector('.mute-btn').classList.toggle('active', track.isMuted);
    }

    toggleSolo(trackNumber) {
        const track = this.tracks.get(trackNumber);
        track.isSolo = !track.isSolo;
        if (track.isSolo) this.soloedTracks.add(trackNumber);
        else this.soloedTracks.delete(trackNumber);
        this.updateTrackGains();
        track.element.querySelector('.solo-btn').classList.toggle('active', track.isSolo);
    }

    updateTrackGains() {
        const hasSolo = this.soloedTracks.size > 0;
        for (const [tNum, t] of this.tracks) {
            if (t.gainNode) {
                const shouldPlay = !t.isMuted && (!hasSolo || t.isSolo);
                t.gainNode.gain.value = shouldPlay ? t.volume : 0;
            }
        }
    }

    setPlaybackRate(rate) {
        this.playbackRate = rate;
        for (const track of this.tracks.values()) {
            if (track.source) track.source.playbackRate.value = rate;
        }
    }

    toggleLoop() {
        this.isLooping = !this.isLooping;
        document.getElementById('loopBtn').classList.toggle('active', this.isLooping);
    }

    renderPage(num) {
        this.pageRendering = true;
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');
        this.pdfDoc.getPage(num).then((page) => {
            const viewport = page.getViewport({ scale: this.pdfScale });
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            const renderTask = page.render({ canvasContext: ctx, viewport: viewport });
            renderTask.promise.then(() => {
                this.pageRendering = false;
                if (this.pageNumPending !== null) {
                    this.renderPage(this.pageNumPending);
                    this.pageNumPending = null;
                }
            });
        });
        document.getElementById('pdf-page-num').textContent = num;
    }

    queueRenderPage(num) {
        if (this.pageRendering) this.pageNumPending = num;
        else this.renderPage(num);
    }

    onPrevPage() {
        if (this.pageNum <= 1) return;
        this.pageNum--;
        this.queueRenderPage(this.pageNum);
    }

    onNextPage() {
        if (this.pageNum >= this.pdfDoc.numPages) return;
        this.pageNum++;
        this.queueRenderPage(this.pageNum);
    }

    openScore(trackNumber) {
        const track = this.tracks.get(trackNumber);
        if (!track) return;
        const modal = document.getElementById('scoreModal');
        const scorePath = `partituras/${track.name}.pdf`;
        document.getElementById('scoreModalTitle').textContent = `Partitura - ${track.name}`;
        document.getElementById('pdf-loading').style.display = 'block';
        document.getElementById('pdf-error').style.display = 'none';
        document.getElementById('pdf-navigation').style.display = 'none';
        document.getElementById('pdf-viewer-container').style.display = 'none';
        modal.dataset.pdfPath = scorePath;
        modal.style.display = 'flex';
        const loadingTask = pdfjsLib.getDocument(scorePath);
        loadingTask.promise.then((pdfDoc_) => {
            document.getElementById('pdf-loading').style.display = 'none';
            document.getElementById('pdf-viewer-container').style.display = 'block';
            this.pdfDoc = pdfDoc_;
            document.getElementById('pdf-page-count').textContent = this.pdfDoc.numPages;
            this.pageNum = 1;
            this.fitToWidth();
            if (this.pdfDoc.numPages > 1) document.getElementById('pdf-navigation').style.display = 'flex';
        }, (reason) => {
            console.error(reason);
            document.getElementById('pdf-loading').style.display = 'none';
            document.getElementById('pdf-error').style.display = 'block';
            document.getElementById('pdf-error').querySelector('p').textContent = `Partitura não encontrada para ${track.name}`;
        });
    }

    closeScoreModal() {
        const modal = document.getElementById('scoreModal');
        modal.style.display = 'none';
        this.pdfDoc = null;
        const canvas = document.getElementById('pdf-canvas');
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    downloadScore() {
        const pdfPath = document.getElementById('scoreModal').dataset.pdfPath;
        if (pdfPath) {
            const link = document.createElement('a');
            link.href = pdfPath;
            link.download = pdfPath.split('/').pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    printScore() {
        const pdfPath = document.getElementById('scoreModal').dataset.pdfPath;
        if (pdfPath) {
            const printWindow = window.open(pdfPath, '_blank');
            if (printWindow) printWindow.onload = () => printWindow.print();
        }
    }

    toggleFullscreen() {
        const modal = document.getElementById('scoreModal');
        if (!document.fullscreenElement) modal.requestFullscreen().catch(err => console.error(err));
        else document.exitFullscreen();
    }

    zoomIn() {
        if (this.pdfScale >= 3.0) return;
        this.pdfScale += 0.25;
        this.queueRenderPage(this.pageNum);
    }

    zoomOut() {
        if (this.pdfScale <= 0.5) return;
        this.pdfScale -= 0.25;
        this.queueRenderPage(this.pageNum);
    }

    fitToWidth() {
        if (!this.pdfDoc) return;
        const container = document.getElementById('pdf-viewer-container');
        this.pdfDoc.getPage(this.pageNum).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            this.pdfScale = (container.clientWidth / viewport.width) * 0.98;
            this.queueRenderPage(this.pageNum);
        });
    }

    reset() {
        for (const [trackNumber, track] of this.tracks) {
            if (track.isMuted) this.toggleMute(trackNumber);
            if (track.isSolo) this.toggleSolo(trackNumber);
            this.setTrackVolume(trackNumber, 0.7);
            track.element.querySelector(".volume-slider").value = 70;
            track.element.querySelector(".volume-value").textContent = "70%";
            this.setTrackPan(trackNumber, 0);
            track.element.querySelector(".pan-slider").value = 0;
            track.element.querySelector(".pan-value").textContent = "C";
        }
        if (this.isMasterMuted) this.toggleMasterMute();
        this.setMasterVolume(0.7);
        document.getElementById("masterVolumeSlider").value = 70;
        document.getElementById("masterVolumeValue").textContent = "70%";
        this.setPlaybackRate(1);
        document.querySelectorAll(".speed-btn").forEach(btn => btn.classList.remove("active"));
        document.querySelector(".speed-btn[data-speed='1']").classList.add("active");
        if (this.isLooping) this.toggleLoop();
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}


document.addEventListener('DOMContentLoaded', () => {
    window.webDAW = new WebDAW();
    
    const modal = document.getElementById('scoreModal');
 
    document.getElementById('closeScoreModal').addEventListener('click', () => window.webDAW.closeScoreModal());
    modal.addEventListener('click', (e) => { if (e.target === modal) window.webDAW.closeScoreModal(); });
    document.getElementById('scoreDownload').addEventListener('click', () => window.webDAW.downloadScore());
    document.getElementById('scorePrint').addEventListener('click', () => window.webDAW.printScore());
    document.getElementById('scoreFullscreen').addEventListener('click', () => window.webDAW.toggleFullscreen());
    

    document.getElementById('pdf-prev').addEventListener('click', () => window.webDAW.onPrevPage());
    document.getElementById('pdf-next').addEventListener('click', () => window.webDAW.onNextPage());
    document.getElementById('zoomInBtn').addEventListener('click', () => window.webDAW.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => window.webDAW.zoomOut());
    document.getElementById('fitToWidthBtn').addEventListener('click', () => window.webDAW.fitToWidth());


    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            window.webDAW.closeScoreModal();
        }
    });
});
