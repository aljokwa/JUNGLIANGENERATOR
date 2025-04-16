class JungleGenerator {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        
        this.tempo = 160;
        this.isPlaying = false;
        this.currentStep = 0;
        this.stepsPerPattern = 16;
        
        this.patterns = {
            kick: new Array(this.stepsPerPattern).fill(false),
            snare: new Array(this.stepsPerPattern).fill(false),
            hihat: new Array(this.stepsPerPattern).fill(false),
            bass: new Array(this.stepsPerPattern).fill(false),
            overdrive: new Array(this.stepsPerPattern).fill(false)
        };
        
        this.initUI();
        this.initOscilloscope();
        this.setupAudioNodes();
        this.startOscilloscope();
    }
    
    initUI() {
        // Create step buttons for each pattern
        Object.keys(this.patterns).forEach(pattern => {
            const container = document.getElementById(`${pattern}-pattern`);
            for (let i = 0; i < this.stepsPerPattern; i++) {
                const step = document.createElement('div');
                step.className = 'step';
                step.dataset.index = i;
                step.addEventListener('click', () => this.toggleStep(pattern, i));
                container.appendChild(step);
            }
        });
        
        // Transport controls
        document.getElementById('play').addEventListener('click', () => this.start());
        document.getElementById('stop').addEventListener('click', () => this.stop());
        document.getElementById('clear').addEventListener('click', () => this.clearAll());
        document.getElementById('randomize').addEventListener('click', () => this.randomizePattern());
        
        // Tempo control
        const tempoSlider = document.getElementById('tempo');
        const tempoValue = document.getElementById('tempo-value');
        tempoSlider.addEventListener('input', (e) => {
            this.tempo = parseInt(e.target.value);
            tempoValue.textContent = `${this.tempo} BPM`;
        });
    }
    
    initOscilloscope() {
        this.canvas = document.getElementById('oscilloscope');
        this.canvasCtx = this.canvas.getContext('2d');
        
        // Set initial canvas size
        this.resizeCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        
        // Set display size
        this.canvas.style.width = container.offsetWidth + 'px';
        this.canvas.style.height = container.offsetHeight + 'px';
        
        // Set actual size in memory
        this.canvas.width = container.offsetWidth * dpr;
        this.canvas.height = container.offsetHeight * dpr;
        
        // Scale context to ensure correct drawing operations
        this.canvasCtx.scale(dpr, dpr);
    }
    
    startOscilloscope() {
        const draw = () => {
            this.drawOscilloscope();
            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    }
    
    setupAudioNodes() {
        // Create a master gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5; // Set master volume
        
        // Create audio nodes for each instrument
        this.instruments = {
            kick: this.createKick(),
            snare: this.createSnare(),
            hihat: this.createHiHat(),
            bass: this.createBass(),
            overdrive: this.createOverdrive()
        };
        
        // Connect all instruments to the analyser through master gain
        Object.values(this.instruments).forEach(instrument => {
            instrument.connect(this.masterGain);
        });
        
        // Connect master gain to analyser and destination
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
    }
    
    createKick() {
        const kick = this.audioContext.createGain();
        kick.gain.value = 0;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 150;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        
        osc.connect(filter);
        filter.connect(kick);
        osc.start();
        
        return kick;
    }
    
    createSnare() {
        const snare = this.audioContext.createGain();
        snare.gain.value = 0;
        
        // Create noise buffer
        const noiseBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.1, this.audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < noiseBuffer.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }
        
        // Create noise source
        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        
        // Create filter for snare body
        const bodyFilter = this.audioContext.createBiquadFilter();
        bodyFilter.type = 'bandpass';
        bodyFilter.frequency.value = 200;
        bodyFilter.Q.value = 0.5;
        
        // Create filter for snare buzz
        const buzzFilter = this.audioContext.createBiquadFilter();
        buzzFilter.type = 'bandpass';
        buzzFilter.frequency.value = 1000;
        buzzFilter.Q.value = 1;
        
        // Create gain for buzz
        const buzzGain = this.audioContext.createGain();
        buzzGain.gain.value = 0.5;
        
        // Connect nodes
        noise.connect(bodyFilter);
        noise.connect(buzzFilter);
        buzzFilter.connect(buzzGain);
        bodyFilter.connect(snare);
        buzzGain.connect(snare);
        
        // Start noise
        noise.start();
        
        return snare;
    }
    
    createHiHat() {
        const hihat = this.audioContext.createGain();
        hihat.gain.value = 0;
        
        // Create noise buffer
        const noiseBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.1, this.audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < noiseBuffer.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }
        
        // Create noise source
        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        
        // Create high-pass filter
        const highPass = this.audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 7000;
        highPass.Q.value = 0.5;
        
        // Create resonance filter
        const resonance = this.audioContext.createBiquadFilter();
        resonance.type = 'bandpass';
        resonance.frequency.value = 10000;
        resonance.Q.value = 2;
        
        // Connect nodes
        noise.connect(highPass);
        highPass.connect(resonance);
        resonance.connect(hihat);
        
        // Start noise
        noise.start();
        
        return hihat;
    }
    
    createBass() {
        const bass = this.audioContext.createGain();
        bass.gain.value = 0;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 55;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        
        osc.connect(filter);
        filter.connect(bass);
        osc.start();
        
        return bass;
    }
    
    createOverdrive() {
        const overdrive = this.audioContext.createGain();
        overdrive.gain.value = 0;
        
        // Create oscillator
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 55;
        
        // Create distortion
        const distortion = this.audioContext.createWaveShaper();
        distortion.curve = this.makeDistortionCurve(400);
        distortion.oversample = '4x';
        
        // Create filter
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 1;
        
        // Create compressor
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        
        // Connect nodes
        osc.connect(distortion);
        distortion.connect(filter);
        filter.connect(compressor);
        compressor.connect(overdrive);
        
        // Start oscillator
        osc.start();
        
        return overdrive;
    }
    
    makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        
        return curve;
    }
    
    toggleStep(pattern, index) {
        this.patterns[pattern][index] = !this.patterns[pattern][index];
        const step = document.querySelector(`#${pattern}-pattern .step[data-index="${index}"]`);
        step.classList.toggle('active');
    }
    
    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.currentStep = 0;
        this.scheduleNextStep();
    }
    
    stop() {
        this.isPlaying = false;
    }
    
    scheduleNextStep() {
        if (!this.isPlaying) return;
        
        const stepTime = 60 / this.tempo / 4; // 16th note duration
        
        // Play current step
        Object.entries(this.patterns).forEach(([pattern, steps]) => {
            if (steps[this.currentStep]) {
                this.playInstrument(pattern);
            }
        });
        
        // Update UI
        this.updateStepVisualization();
        
        // Schedule next step
        this.currentStep = (this.currentStep + 1) % this.stepsPerPattern;
        setTimeout(() => this.scheduleNextStep(), stepTime * 1000);
    }
    
    playInstrument(instrument) {
        const now = this.audioContext.currentTime;
        const gain = this.instruments[instrument];
        
        // Create a new gain envelope for each note
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        
        switch(instrument) {
            case 'kick':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                break;
            case 'snare':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                break;
            case 'hihat':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                break;
            case 'bass':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                break;
            case 'overdrive':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                break;
        }
    }
    
    updateStepVisualization() {
        // Update step visualization
        Object.keys(this.patterns).forEach(pattern => {
            const steps = document.querySelectorAll(`#${pattern}-pattern .step`);
            steps.forEach((step, index) => {
                step.classList.toggle('current', index === this.currentStep);
            });
        });
    }
    
    drawOscilloscope() {
        // Get the time domain data
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        // Clear the canvas with a semi-transparent black to create a fade effect
        this.canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.canvasCtx.fillRect(0, 0, this.canvas.width / window.devicePixelRatio, this.canvas.height / window.devicePixelRatio);
        
        // Style for the waveform
        this.canvasCtx.lineWidth = 2;
        this.canvasCtx.strokeStyle = 'rgb(76, 175, 80)';
        this.canvasCtx.beginPath();
        
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;
        const bufferLength = this.analyser.frequencyBinCount;
        const sliceWidth = width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * height / 2;
            
            if (i === 0) {
                this.canvasCtx.moveTo(x, y);
            } else {
                this.canvasCtx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        // Draw center line
        this.canvasCtx.lineTo(width, height / 2);
        this.canvasCtx.stroke();
        
        // Draw a dim center line for reference
        this.canvasCtx.beginPath();
        this.canvasCtx.lineWidth = 1;
        this.canvasCtx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
        this.canvasCtx.moveTo(0, height / 2);
        this.canvasCtx.lineTo(width, height / 2);
        this.canvasCtx.stroke();
    }
    
    clearAll() {
        // Clear all patterns
        Object.keys(this.patterns).forEach(pattern => {
            this.patterns[pattern] = new Array(this.stepsPerPattern).fill(false);
            const steps = document.querySelectorAll(`#${pattern}-pattern .step`);
            steps.forEach(step => step.classList.remove('active'));
        });
    }
    
    randomizePattern() {
        // Different probabilities for different instruments
        const probabilities = {
            kick: 0.3,      // 30% chance for kick
            snare: 0.2,     // 20% chance for snare
            hihat: 0.4,     // 40% chance for hi-hat
            bass: 0.25,     // 25% chance for bass
            overdrive: 0.2  // 20% chance for overdrive
        };
        
        // Randomize each pattern
        Object.keys(this.patterns).forEach(pattern => {
            this.patterns[pattern] = new Array(this.stepsPerPattern).fill(false).map(() => 
                Math.random() < probabilities[pattern]
            );
            
            // Update UI
            const steps = document.querySelectorAll(`#${pattern}-pattern .step`);
            steps.forEach((step, index) => {
                if (this.patterns[pattern][index]) {
                    step.classList.add('active');
                } else {
                    step.classList.remove('active');
                }
            });
        });
    }
}

// Initialize the generator when the page loads
window.addEventListener('load', () => {
    const generator = new JungleGenerator();
    generator.drawOscilloscope();
    
    // Add click handler to start audio context
    document.addEventListener('click', () => {
        if (generator.audioContext.state === 'suspended') {
            generator.audioContext.resume();
        }
    }, { once: true });
}); 