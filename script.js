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
        this.audioFiles = [
            'audio/Violino 1.mp3',
            'audio/Violino 2.mp3',
            'audio/Violino 3.mp3',
            'audio/Clarinete.mp3',
            'audio/Cello.mp3',
            'audio/Piano.mp3',
            'audio/Guitarra.mp3',
            'audio/Baixo.mp3',
            'audio/Bateria.mp3',
            //'audio/track10.mp3',
            //'audio/track11.mp3',
            //'audio/track12.mp3'
        ];
        
        this.initializeAudioContext();
        this.createTrackElements();
        this.setupEventListeners();
        this.setupTimelineUpdate();
        this.loadAllAudioFiles();
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
            this.masterGainNode.gain.value = 0.7; // 70% volume
            
            console.log("Audio Context initialized successfully");
        } catch (error) {
            console.error("Failed to initialize Audio Context:", error);
            alert("Seu navegador não suporta Web Audio API. Por favor, use um navegador mais recente.");
        }
    }

    createTrackElements() {
        const tracksContainer = document.querySelector(".tracks-container");
        this.audioFiles.forEach((filePath, index) => {
            const trackNumber = index + 1;
            const trackName = filePath.split('/').pop().split('.')[0]; // Extract name from path
            const trackElement = document.createElement("div");
            trackElement.classList.add("track");
            trackElement.dataset.track = trackNumber;
            trackElement.innerHTML = `
                <div class="track-info">
                    <h3>${trackName.replace("track", "Trilha ")}</h3>
                    <div class="track-status">Loading...</div>
                </div>
                <div class="track-controls">
                    <button class="btn-mute" data-track="${trackNumber}">M</button>
                    <button class="btn-solo" data-track="${trackNumber}">S</button>
                    <button class="btn-play" data-track="${trackNumber}">▶</button>
                </div>
                <div class="track-volume-control">
                    <input type="range" class="volume-slider" min="0" max="100" value="70" data-track="${trackNumber}">
                    <span class="volume-value">70%</span>
                </div>
                <div class="waveform-container">
                    <canvas class="waveform" data-track="${trackNumber}"></canvas>
                </div>
            `;
            tracksContainer.appendChild(trackElement);
        });
    }

    setupEventListeners() {
        // Master controls
        document.getElementById("playAll").addEventListener("click", () => this.playAll());
        document.getElementById("pauseAll").addEventListener("click", () => this.pauseAll());
        document.getElementById("stopAll").addEventListener("click", () => this.stopAll());
        
        // Master volume
        const masterVolumeSlider = document.getElementById("masterVolume");
        const masterVolumeValue = document.getElementById("masterVolumeValue");
        
        masterVolumeSlider.addEventListener("input", (e) => {
            const volume = e.target.value / 100;
            this.masterGainNode.gain.value = volume;
            masterVolumeValue.textContent = e.target.value + "%";
        });

        // Timeline seek functionality
        const timeline = document.querySelector(".timeline");
        timeline.addEventListener("click", (e) => {
            this.seekToPosition(e);
        });

        // Track controls (delegated to document as elements are created dynamically)
        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("btn-mute")) {
                const trackNumber = parseInt(e.target.dataset.track);
                this.toggleMute(trackNumber);
            } else if (e.target.classList.contains("btn-solo")) {
                const trackNumber = parseInt(e.target.dataset.track);
                this.toggleSolo(trackNumber);
            } else if (e.target.classList.contains("btn-play")) {
                const trackNumber = parseInt(e.target.dataset.track);
                this.toggleTrackPlay(trackNumber);
            }
        });

        document.addEventListener("input", (e) => {
            if (e.target.classList.contains("volume-slider") && e.target.closest(".track")) {
                const trackNumber = parseInt(e.target.dataset.track);
                const volume = e.target.value / 100;
                this.setTrackVolume(trackNumber, volume);
                
                // Update volume display
                const volumeValue = e.target.parentElement.querySelector(".volume-value");
                volumeValue.textContent = e.target.value + "%";
            }
        });
    }

    async loadAllAudioFiles() {
        const loadPromises = this.audioFiles.map(async (filePath, index) => {
            const trackNumber = index + 1;
            const trackName = filePath.split('/').pop().split('.')[0];
            this.updateTrackStatus(trackNumber, `Loading ${trackName}...`);
            try {
                const response = await fetch(filePath);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                
                const track = {
                    buffer: audioBuffer,
                    source: null,
                    gainNode: this.audioContext.createGain(),
                    isMuted: false,
                    isSolo: false,
                    isPlaying: false,
                    volume: 0.7,
                    fileName: trackName
                };

                track.gainNode.connect(this.masterGainNode);
                track.gainNode.gain.value = track.volume;

                this.tracks.set(trackNumber, track);

                this.updateTrackStatus(trackNumber, `Loaded: ${trackName}`);
                this.drawWaveform(trackNumber, audioBuffer);
                
                if (audioBuffer.duration > this.duration) {
                    this.duration = audioBuffer.duration;
                    this.updateTimeDisplay();
                }
                console.log(`Track ${trackNumber} loaded: ${trackName}`);
            } catch (error) {
                console.error(`Error loading audio file for track ${trackNumber} (${filePath}):`, error);
                this.updateTrackStatus(trackNumber, `Error loading ${trackName}`);
            }
        });
        await Promise.all(loadPromises);
        this.updateTrackStatus(0, "All tracks loaded. Ready to play!"); // Update a general status if needed
    }

    updateTrackStatus(trackNumber, status) {
        let statusElement;
        if (trackNumber === 0) { // For a general status message
            // You might want a dedicated element for general status, e.g., in the header
            // For now, let's just log it.
            console.log(status);
        } else {
            statusElement = document.querySelector(`.track[data-track="${trackNumber}"] .track-status`);
            if (statusElement) {
                statusElement.textContent = status;
            }
        }
    }

    drawWaveform(trackNumber, audioBuffer) {
        const canvas = document.querySelector(`.waveform[data-track="${trackNumber}"]`);
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;

        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.fillStyle = "rgba(78, 205, 196, 0.3)";
        ctx.strokeStyle = "#4ecdc4";
        ctx.lineWidth = 1;

        ctx.beginPath();
        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            
            const x = i;
            const yMin = (1 + min) * amp;
            const yMax = (1 + max) * amp;
            
            ctx.fillRect(x, yMin, 1, yMax - yMin);
        }
    }

    async playAll() {
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - this.pauseTime;

        for (const [trackNumber, track] of this.tracks) {
            if (!track.isMuted && (this.soloedTracks.size === 0 || track.isSolo)) {
                await this.playTrack(trackNumber);
            }
        }

        this.updatePlayButtonStates();
    }

    pauseAll() {
        this.isPlaying = false;
        this.pauseTime = this.currentTime;

        for (const [trackNumber, track] of this.tracks) {
            this.stopTrack(trackNumber);
        }

        this.updatePlayButtonStates();
    }

    stopAll() {
        this.isPlaying = false;
        this.pauseTime = 0;
        this.currentTime = 0;

        for (const [trackNumber, track] of this.tracks) {
            this.stopTrack(trackNumber);
        }

        this.updatePlayButtonStates();
        this.updateTimeDisplay();
        this.updatePlayhead();
    }

    async playTrack(trackNumber) {
        const track = this.tracks.get(trackNumber);
        if (!track || !track.buffer) return;

        // Stop existing source if playing
        if (track.source) {
            track.source.stop();
        }

        // Create new source
        track.source = this.audioContext.createBufferSource();
        track.source.buffer = track.buffer;
        track.source.connect(track.gainNode);

        // Start playback from current position
        const offset = this.pauseTime || 0;
        track.source.start(0, offset);
        track.isPlaying = true;

        // Handle track end
        track.source.onended = () => {
            track.isPlaying = false;
            this.updateTrackPlayButton(trackNumber);
        };

        this.updateTrackPlayButton(trackNumber);
    }

    stopTrack(trackNumber) {
        const track = this.tracks.get(trackNumber);
        if (!track || !track.source) return;

        track.source.stop();
        track.source = null;
        track.isPlaying = false;
        this.updateTrackPlayButton(trackNumber);
    }

    async toggleTrackPlay(trackNumber) {
        const track = this.tracks.get(trackNumber);
        if (!track) return;

        if (track.isPlaying) {
            this.stopTrack(trackNumber);
        } else {
            await this.playTrack(trackNumber);
        }
    }

    toggleMute(trackNumber) {
        const track = this.tracks.get(trackNumber);
        if (!track) return;

        track.isMuted = !track.isMuted;
        track.gainNode.gain.value = track.isMuted ? 0 : track.volume;

        // Update UI
        const muteBtn = document.querySelector(`.btn-mute[data-track="${trackNumber}"]`);
        const trackElement = document.querySelector(`.track[data-track="${trackNumber}"]`);
        
        if (track.isMuted) {
            muteBtn.classList.add("active");
            trackElement.classList.add("muted");
        } else {
            muteBtn.classList.remove("active");
            trackElement.classList.remove("muted");
        }
    }

    toggleSolo(trackNumber) {
        const track = this.tracks.get(trackNumber);
        if (!track) return;

        track.isSolo = !track.isSolo;
        
        if (track.isSolo) {
            this.soloedTracks.add(trackNumber);
        } else {
            this.soloedTracks.delete(trackNumber);
        }

        // Update all tracks based on solo state
        for (const [num, t] of this.tracks) {
            const soloBtn = document.querySelector(`.btn-solo[data-track="${num}"]`);
            const trackElement = document.querySelector(`.track[data-track="${num}"]`);
            
            if (t.isSolo) {
                soloBtn.classList.add("active");
                trackElement.classList.add("solo");
            } else {
                soloBtn.classList.remove("active");
                trackElement.classList.remove("solo");
            }

            // Adjust volume based on solo state
            if (this.soloedTracks.size > 0) {
                t.gainNode.gain.value = (t.isSolo && !t.isMuted) ? t.volume : 0;
            } else {
                t.gainNode.gain.value = t.isMuted ? 0 : t.volume;
            }
        }
    }

    setTrackVolume(trackNumber, volume) {
        const track = this.tracks.get(trackNumber);
        if (!track) return;

        track.volume = volume;
        if (!track.isMuted && (this.soloedTracks.size === 0 || track.isSolo)) {
            track.gainNode.gain.value = volume;
        }
    }

    updatePlayButtonStates() {
        const playAllBtn = document.getElementById("playAll");
        
        if (this.isPlaying) {
            playAllBtn.textContent = "⏸ Pause All";
            playAllBtn.className = "btn btn-secondary";
        } else {
            playAllBtn.textContent = "▶ Play All";
            playAllBtn.className = "btn btn-primary";
        }
    }

    updateTrackPlayButton(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const playBtn = document.querySelector(`.btn-play[data-track="${trackNumber}"]`);
        const trackElement = document.querySelector(`.track[data-track="${trackNumber}"]`);
        
        if (!track || !playBtn) return;

        if (track.isPlaying) {
            playBtn.textContent = "⏸";
            playBtn.classList.add("playing");
            trackElement.classList.add("playing");
        } else {
            playBtn.textContent = "▶";
            playBtn.classList.remove("playing");
            trackElement.classList.remove("playing");
        }
    }

    setupTimelineUpdate() {
        const updateTimeline = () => {
            if (this.isPlaying && this.audioContext) {
                this.currentTime = this.audioContext.currentTime - this.startTime;
                
                if (this.currentTime >= this.duration) {
                    this.stopAll();
                    return;
                }
                
                this.updateTimeDisplay();
                this.updatePlayhead();
            }
            
            requestAnimationFrame(updateTimeline);
        };
        
        updateTimeline();
    }

    updateTimeDisplay() {
        const currentTimeElement = document.getElementById("currentTime");
        const totalTimeElement = document.getElementById("totalTime");
        
        if (currentTimeElement) {
            currentTimeElement.textContent = this.formatTime(this.currentTime);
        }
        
        if (totalTimeElement) {
            totalTimeElement.textContent = this.formatTime(this.duration);
        }
    }

    updatePlayhead() {
        const playhead = document.getElementById("playhead");
        const timeline = document.querySelector(".timeline");
        
        if (playhead && timeline && this.duration > 0) {
            const percentage = (this.currentTime / this.duration) * 100;
            playhead.style.left = `${Math.min(percentage, 100)}%`;
        }
    }

    seekToPosition(event) {
        if (this.duration === 0) return; // No audio loaded
        
        const timeline = event.currentTarget;
        const rect = timeline.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const timelineWidth = rect.width;
        
        // Calculate the percentage of the timeline clicked
        const percentage = Math.max(0, Math.min(1, clickX / timelineWidth));
        const seekTime = percentage * this.duration;
        
        // Update current time and pause time
        this.pauseTime = seekTime;
        this.currentTime = seekTime;
        
        // If currently playing, restart all tracks from the new position
        if (this.isPlaying) {
            this.stopAllTracks();
            this.startTime = this.audioContext.currentTime - seekTime;
            
            // Restart playing tracks from new position
            for (const [trackNumber, track] of this.tracks) {
                if (!track.isMuted && (this.soloedTracks.size === 0 || track.isSolo)) {
                    this.playTrack(trackNumber);
                }
            }
        }
        
        // Update UI
        this.updateTimeDisplay();
        this.updatePlayhead();
        
        console.log(`Seeked to: ${this.formatTime(seekTime)} (${(percentage * 100).toFixed(1)}%)`);
    }

    stopAllTracks() {
        for (const [trackNumber, track] of this.tracks) {
            if (track.source) {
                track.source.stop();
                track.source = null;
                track.isPlaying = false;
            }
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
}

// Initialize the DAW when the page loads
document.addEventListener("DOMContentLoaded", () => {
    window.webDAW = new WebDAW();
    
    // Handle browser audio context restrictions
    document.addEventListener("click", async () => {
        if (window.webDAW.audioContext && window.webDAW.audioContext.state === "suspended") {
            await window.webDAW.audioContext.resume();
        }
    }, { once: true });
});
