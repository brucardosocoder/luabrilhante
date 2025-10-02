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
        this.isLooping = false; // Novo estado para o loop
        
        // Track configurations
        this.trackConfigs = [
            { name: 'Violino 1', file: 'audio/Violino 1.mp3', color: '#ff6b6b' },
            { name: 'Violino 2', file: 'audio/Violino 2.mp3', color: '#4ecdc4' },
            { name: 'Violino 3', file: 'audio/Violino 3.mp3', color: '#45b7d1' },
            { name: 'Clarinete', file: 'audio/Clarinete.mp3', color: '#96ceb4' },
            { name: 'Cello', file: 'audio/Cello.mp3', color: '#feca57' },
            { name: 'Piano', file: 'audio/Piano.mp3', color: '#ff9ff3' },
            { name: 'Guitarra', file: 'audio/Guitarra.mp3', color: '#54a0ff' },
            { name: 'Baixo', file: 'audio/Baixo.mp3', color: '#5f27cd' },
            { name: 'Bateria', file: 'audio/Bateria.mp3', color: '#00d2d3' },
            //{ name: 'Percussion', file: 'audio/track10.wav', color: '#ff9f43' },
            //{ name: 'Synth', file: 'audio/track11.wav', color: '#ee5a24' },
            //{ name: 'Other', file: 'audio/track12.wav', color: '#0abde3' }
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
        const tracksContainer = document.getElementById('tracksContainer');
        
        this.trackConfigs.forEach((config, index) => {
            const trackNumber = index + 1;
            
            // Create combined track row
            const trackRow = document.createElement('div');
            trackRow.className = 'track-row';
            trackRow.dataset.track = trackNumber;
            trackRow.innerHTML = `
                <div class="track-controls-section">
                    <div class="track-header">
                        <span class="track-name">${config.name}</span>
                        <div class="track-controls">
                            <button class="track-btn mute-btn" data-track="${trackNumber}" data-action="mute">M</button>
                            <button class="track-btn solo-btn" data-track="${trackNumber}" data-action="solo">S</button>
                        </div>
                    </div>
                    <div class="track-sliders">
                        <div class="slider-group">
                            <span class="slider-label">Vol</span>
                            <input type="range" class="track-slider volume-slider" 
                                   data-track="${trackNumber}" data-control="volume"
                                   min="0" max="100" value="70">
                            <span class="slider-value">70%</span>
                        </div>
                        <div class="slider-group">
                            <span class="slider-label">Pan</span>
                            <input type="range" class="track-slider pan-slider" 
                                   data-track="${trackNumber}" data-control="pan"
                                   min="-100" max="100" value="0">
                            <span class="slider-value">C</span>
                        </div>
                    </div>
                </div>
                <div class="waveform-section">
                    <canvas class="waveform-canvas" data-track="${trackNumber}"></canvas>
                    <div class="track-playhead" data-track="${trackNumber}"></div>
                </div>
            `;
            
            tracksContainer.appendChild(trackRow);
            
            // Initialize track data
            this.tracks.set(trackNumber, {
                name: config.name,
                file: config.file,
                color: config.color,
                audioBuffer: null,
                source: null,
                gainNode: null,
                panNode: null,
                isPlaying: false,
                isMuted: false,
                isSolo: false,
                volume: 0.7,
                pan: 0,
                element: trackRow,
                canvas: trackRow.querySelector('.waveform-canvas')
            });
            
            // Add event listeners
            this.addTrackEventListeners(trackNumber);
        });
    }

    addTrackEventListeners(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const element = track.element;
        
        // Mute button
        const muteBtn = element.querySelector('.mute-btn');
        muteBtn.addEventListener('click', () => this.toggleMute(trackNumber));
        
        // Solo button
        const soloBtn = element.querySelector('.solo-btn');
        soloBtn.addEventListener('click', () => this.toggleSolo(trackNumber));
        
        // Volume slider
        const volumeSlider = element.querySelector('.volume-slider');
        volumeSlider.addEventListener('input', (e) => {
            this.setTrackVolume(trackNumber, e.target.value / 100);
            element.querySelector('.volume-slider + .slider-value').textContent = e.target.value + '%';
        });
        
        // Pan slider
        const panSlider = element.querySelector('.pan-slider');
        panSlider.addEventListener('input', (e) => {
            this.setTrackPan(trackNumber, e.target.value / 100);
            const value = parseInt(e.target.value);
            const display = value === 0 ? 'C' : (value > 0 ? `R${value}` : `L${Math.abs(value)}`);
            element.querySelector('.pan-slider + .slider-value').textContent = display;
        });
        
        // Waveform click — CORREÇÃO: usar e.currentTarget
        track.canvas.addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            this.seekTo(percentage * this.duration);
        });
    }

    async loadAllAudioFiles() {
        console.log('Loading audio files...');
        const loadPromises = [];
        
        for (const [trackNumber, track] of this.tracks) {
            loadPromises.push(this.loadAudioFile(trackNumber));
        }
        
        await Promise.all(loadPromises);
        this.calculateDuration();
        console.log('All audio files loaded');
    }

    async loadAudioFile(trackNumber) {
        const track = this.tracks.get(trackNumber);
        
        try {
            console.log(`Loading ${track.file}...`);
            const response = await fetch(track.file);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            track.audioBuffer = audioBuffer;
            
            // Create audio nodes
            track.gainNode = this.audioContext.createGain();
            track.panNode = this.audioContext.createStereoPanner();
            
            track.gainNode.connect(track.panNode);
            track.panNode.connect(this.masterGainNode);
            
            track.gainNode.gain.value = track.volume;
            track.panNode.pan.value = track.pan;
            
            console.log(`Loaded ${track.name} successfully`);
        } catch (error) {
            console.error(`Failed to load ${track.file}:`, error);
        }
    }

    calculateDuration() {
        let maxDuration = 0;
        for (const [trackNumber, track] of this.tracks) {
            if (track.audioBuffer) {
                maxDuration = Math.max(maxDuration, track.audioBuffer.duration);
            }
        }
        this.duration = maxDuration;
        document.getElementById('totalTime').textContent = this.formatTime(this.duration);
    }

    drawAllWaveforms() {
        console.log('Drawing waveforms...');
        for (const [trackNumber, track] of this.tracks) {
            if (track.audioBuffer) {
                this.drawWaveform(trackNumber);
            }
        }
    }

    drawWaveform(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const canvas = track.canvas;
        
        if (!track.audioBuffer || !canvas) {
            console.log(`Cannot draw waveform for track ${trackNumber}: missing audioBuffer or canvas`);
            return;
        }
        
        // Wait for canvas to be ready
        setTimeout(() => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                console.log(`Canvas not ready for track ${trackNumber}, retrying...`);
                setTimeout(() => this.drawWaveform(trackNumber), 100);
                return;
            }
            
            const ctx = canvas.getContext('2d');
            
            // Set canvas size
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            
            const width = rect.width;
            const height = rect.height;
            
            const audioData = track.audioBuffer.getChannelData(0);
            const step = Math.ceil(audioData.length / width);
            const amp = height / 2;
            
            // Clear canvas
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, width, height);
            
            // Draw waveform
            ctx.strokeStyle = track.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            for (let i = 0; i < width; i++) {
                let min = 1.0;
                let max = -1.0;
                
                for (let j = 0; j < step; j++) {
                    const datum = audioData[(i * step) + j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
                
                const y1 = (1 + min) * amp;
                const y2 = (1 + max) * amp;
                
                ctx.moveTo(i, y1);
                ctx.lineTo(i, y2);
            }
            
            ctx.stroke();
            console.log(`Waveform drawn for ${track.name}`);
        }, 50);
    }

    setupEventListeners() {
        // Play/Pause button
        document.getElementById('playBtn').addEventListener('click', () => {
            this.togglePlayback();
        });
        
        // Master volume
        const masterVolumeSlider = document.getElementById('masterVolumeSlider');
        masterVolumeSlider.addEventListener('input', (e) => {
            this.setMasterVolume(e.target.value / 100);
            document.getElementById('masterVolumeValue').textContent = e.target.value + '%';
        });
        
        // Master volume button click to toggle mute only
        const volumeBtn = document.getElementById('volumeBtn');
        const masterVolumeControl = document.querySelector('.master-volume-control');
        
        volumeBtn.addEventListener('click', () => {
            // Toggle mute/unmute only
            this.toggleMasterMute();
        });
        
        // Master volume button hover to show/hide volume slider
        volumeBtn.addEventListener('mouseenter', () => {
            masterVolumeControl.style.display = 'flex';
            masterVolumeControl.classList.add('active');
        });
        
        // Create a virtual container that includes both the button and the slider
        const hideVolumeSlider = () => {
            masterVolumeControl.style.display = 'none';
            masterVolumeControl.classList.remove('active');
        };
        
        volumeBtn.addEventListener('mouseleave', (e) => {
            // Delay hiding to allow mouse to move to slider
            setTimeout(() => {
                if (!masterVolumeControl.matches(':hover') && !volumeBtn.matches(':hover')) {
                    hideVolumeSlider();
                }
            }, 100);
        });
        
        masterVolumeControl.addEventListener('mouseleave', (e) => {
            // Delay hiding to allow mouse to move back to button
            setTimeout(() => {
                if (!masterVolumeControl.matches(':hover') && !volumeBtn.matches(':hover')) {
                    hideVolumeSlider();
                }
            }, 100);
        });
        
        // Speed controls
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.textContent);
                this.setPlaybackRate(speed);
                
                // Update active state
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // Reset button
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.reset();
        });
        
        // Progress bar — CORREÇÃO: usar e.currentTarget
        document.getElementById('progressBar').addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            this.seekTo(percentage * this.duration);
        });

        // Retroceder 10s
        document.getElementById('prevBtn').addEventListener('click', () => {
            this.seekTo(this.currentTime - 10);
        });

        // Avançar 10s
        document.getElementById('nextBtn').addEventListener('click', () => {
            this.seekTo(this.currentTime + 10);
        });

        // Loop button
        document.getElementById('loopBtn').addEventListener('click', () => {
            this.toggleLoop();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent default spacebar action (e.g., scrolling)
                this.togglePlayback();
            } else if (e.code === 'ArrowLeft') {
                this.seekTo(this.currentTime - 10);
            } else if (e.code === 'ArrowRight') {
                this.seekTo(this.currentTime + 10);
            } else if (e.code === 'KeyR') {
                this.reset();
            }
        });
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    async play() {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - this.pauseTime;
        
        // Start all tracks
        for (const [trackNumber, track] of this.tracks) {
            if (track.audioBuffer && !track.isMuted && (this.soloedTracks.size === 0 || track.isSolo)) {
                this.startTrack(trackNumber);
            }
        }
        
        // Update UI
        const playBtn = document.getElementById('playBtn');
        playBtn.textContent = '⏸';
        playBtn.classList.add('playing');
        
        // Start progress update
        this.updateProgress();
        
        console.log('Playback started');
    }

    pause(stopSources = true) {
        this.isPlaying = false;
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        
        // Stop all tracks only if requested
        if (stopSources) {
            for (const [trackNumber, track] of this.tracks) {
                this.stopTrack(trackNumber);
            }
        }
        
        // Update UI
        const playBtn = document.getElementById('playBtn');
        playBtn.textContent = '▶';
        playBtn.classList.remove('playing');
        
        console.log('Playback paused');
    }

    startTrack(trackNumber) {
        const track = this.tracks.get(trackNumber);
        
        if (track.source) {
            track.source.stop();
            track.source.disconnect();
            track.source = null;
        }

        track.source = this.audioContext.createBufferSource();
        track.source.buffer = track.audioBuffer;
        track.source.connect(track.gainNode);
        track.source.playbackRate.value = this.playbackRate; // Apply current playback rate
        track.source.start(0, this.pauseTime);
        track.isPlaying = true;
        
        // Handle track ending
        track.source.onended = () => {
            if (!this.isPlaying) return; // Only process if global playback is active

            track.isPlaying = false;
            const allTracksEnded = Array.from(this.tracks.values()).every(t => !t.isPlaying);

            if (allTracksEnded) {
                if (this.isLooping) {
                    console.log('Looping all tracks...');
                    this.pauseTime = 0; // Reset pauseTime for seamless loop
                    this.play();
                } else {
                    console.log('All tracks ended, stopping playback.');
                    this.pause();
                    this.seekTo(0); // Reset to beginning if not looping
                }
            }
        };
    }

    stopTrack(trackNumber) {
        const track = this.tracks.get(trackNumber);
        
        if (track.source) {
            track.source.stop();
            track.source.disconnect();
            track.source = null;
        }
        
        track.isPlaying = false;
    }

    seekTo(time) {
    // Clamp time to valid range
    time = Math.max(0, Math.min(time, this.duration));
    
    // Update time variables
    this.pauseTime = time;
    this.currentTime = time;
    
    // Update UI immediately
    const percentage = (time / this.duration) * 100;
    document.getElementById("progressFill").style.width = percentage + "%";
    document.getElementById("currentTime").textContent = this.formatTime(time);
    
    // Update all track playheads
    for (const [trackNumber, track] of this.tracks) {
        this.updateTrackPlayhead(trackNumber);
    }
    
    // If playing, restart tracks from new position
    if (this.isPlaying) {
        // Store the current playing state
        const wasPlaying = this.isPlaying;
        
        // Temporarily set to false to prevent updateProgress conflicts
        this.isPlaying = false;
        
        // Stop all current sources
        for (const [trackNumber, track] of this.tracks) {
            if (track.source) {
                try {
                    track.source.stop();
                } catch (e) {
                    // Ignore errors if source was already stopped
                }
                track.source = null;
                track.isPlaying = false;
            }
        }
        
        // Restore playing state
        this.isPlaying = wasPlaying;
        
        // Update start time for new position
        this.startTime = this.audioContext.currentTime - this.pauseTime;
        
        // Start all tracks from new position
        for (const [trackNumber, track] of this.tracks) {
            if (track.audioBuffer && !track.isMuted && (this.soloedTracks.size === 0 || track.isSolo)) {
                this.startTrack(trackNumber);
            }
        }
        
        // Continue progress updates
        this.updateProgress();
    }
    
    console.log(`Seeked to ${this.formatTime(time)}`);
}

    updateProgress() {
        if (this.isPlaying) {
            this.currentTime = this.audioContext.currentTime - this.startTime;
            if (this.currentTime >= this.duration) {
                // Handle end of track, loop or stop
                if (this.isLooping) {
                    this.pauseTime = 0; // Reset for seamless loop
                    this.play();
                } else {
                    this.pause();
                    this.seekTo(0); // Reset to beginning if not looping
                }
                return;
            }

            const percentage = (this.currentTime / this.duration) * 100;
            document.getElementById("progressFill").style.width = percentage + "%";
            document.getElementById("currentTime").textContent = this.formatTime(this.currentTime);
            
            // Update all track playheads
            for (const [trackNumber, track] of this.tracks) {
                this.updateTrackPlayhead(trackNumber);
            }
            
            requestAnimationFrame(() => this.updateProgress());
        }
    }

    updateTrackPlayhead(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const playhead = track.element.querySelector('.track-playhead');
        
        if (playhead && this.duration > 0) {
            const percentage = (this.currentTime / this.duration) * 100;
            playhead.style.left = percentage + '%';
        }
    }

    setMasterVolume(volume) {
        this.masterVolume = volume;
        if (!this.isMasterMuted) {
            this.masterGainNode.gain.value = volume;
        }
    }

    toggleMasterMute() {
        this.isMasterMuted = !this.isMasterMuted;
        
        if (this.isMasterMuted) {
            this.masterGainNode.gain.value = 0;
            document.getElementById('volumeBtn').textContent = '🔇';
        } else {
            this.masterGainNode.gain.value = this.masterVolume;
            document.getElementById('volumeBtn').textContent = '🔊';
        }
        
        console.log(`Master ${this.isMasterMuted ? 'muted' : 'unmuted'}`);
    }

    setTrackVolume(trackNumber, volume) {
        const track = this.tracks.get(trackNumber);
        track.volume = volume;
        
        if (track.gainNode && !track.isMuted) {
            track.gainNode.gain.value = volume;
        }
    }

    setTrackPan(trackNumber, pan) {
        const track = this.tracks.get(trackNumber);
        track.pan = pan;
        
        if (track.panNode) {
            track.panNode.pan.value = pan;
        }
    }

    toggleMute(trackNumber) {
        const track = this.tracks.get(trackNumber);
        track.isMuted = !track.isMuted;
        
        if (track.gainNode) {
            track.gainNode.gain.value = track.isMuted ? 0 : track.volume;
        }
        
        // Update UI
        const muteBtn = track.element.querySelector('.mute-btn');
        muteBtn.classList.toggle('active', track.isMuted);
        
        console.log(`Track ${trackNumber} ${track.isMuted ? 'muted' : 'unmuted'}`);
    }

    toggleSolo(trackNumber) {
        const track = this.tracks.get(trackNumber);
        
        if (track.isSolo) {
            // Remove from solo
            track.isSolo = false;
            this.soloedTracks.delete(trackNumber);
        } else {
            // Add to solo
            track.isSolo = true;
            this.soloedTracks.add(trackNumber);
        }
        
        // Update UI
        const soloBtn = track.element.querySelector('.solo-btn');
        soloBtn.classList.toggle('active', track.isSolo);
        
        // If playing, restart tracks with new solo state
        if (this.isPlaying) {
            for (const [tNum, t] of this.tracks) {
                this.stopTrack(tNum);
                if (t.audioBuffer && !t.isMuted && (this.soloedTracks.size === 0 || t.isSolo)) {
                    this.startTrack(tNum);
                }
            }
        }
        
        console.log(`Track ${trackNumber} solo ${track.isSolo ? 'enabled' : 'disabled'}`);
    }

    setPlaybackRate(rate) {
        this.playbackRate = rate;
        
        // Update all playing tracks
        for (const [trackNumber, track] of this.tracks) {
            if (track.source && track.isPlaying) {
                track.source.playbackRate.value = rate;
            }
        }
        
        console.log(`Playback rate set to ${rate}x`);
    }

    toggleLoop() {
        this.isLooping = !this.isLooping;
        
        // Update UI
        const loopBtn = document.getElementById('loopBtn');
        loopBtn.classList.toggle('active', this.isLooping);
        
        console.log(`Loop ${this.isLooping ? 'enabled' : 'disabled'}`);
    }

    reset() {
        this.pause();
        this.seekTo(0);
        console.log('Reset to beginning');
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize the WebDAW when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.webDAW = new WebDAW();
});


