class JungleGenerator {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create analyzers
        this.oscilloscopeAnalyser = this.audioContext.createAnalyser();
        this.oscilloscopeAnalyser.fftSize = 2048;
        this.oscilloscopeBufferLength = this.oscilloscopeAnalyser.frequencyBinCount;
        this.oscilloscopeDataArray = new Uint8Array(this.oscilloscopeBufferLength);

        this.equalizerAnalyser = this.audioContext.createAnalyser();
        this.equalizerAnalyser.fftSize = 2048;
        this.equalizerBufferLength = this.equalizerAnalyser.frequencyBinCount;
        this.equalizerDataArray = new Uint8Array(this.equalizerBufferLength);
        
        // Create master effects chain
        this.masterFilter = this.audioContext.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 20000;
        this.masterFilter.Q.value = 0;

        this.masterDrive = this.audioContext.createWaveShaper();
        this.masterDrive.curve = this.makeDistortionCurve(0);

        // Create delay and echo effects
        this.delay = this.audioContext.createDelay(1.0);
        this.delay.delayTime.value = 0;
        
        this.delayFeedback = this.audioContext.createGain();
        this.delayFeedback.gain.value = 0;
        
        this.echoMix = this.audioContext.createGain();
        this.echoMix.gain.value = 0;
        
        this.dryGain = this.audioContext.createGain();
        this.dryGain.gain.value = 1;

        this.modulator = this.audioContext.createOscillator();
        this.modulatorGain = this.audioContext.createGain();
        this.modulator.connect(this.modulatorGain);
        this.modulator.start();
        this.modulatorGain.gain.value = 0;
        
        // Create and connect master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5;
        
        // Connect master effects chain
        this.masterGain.connect(this.masterFilter);
        this.masterFilter.connect(this.masterDrive);
        
        // Connect delay chain
        this.masterDrive.connect(this.delay);
        this.delay.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delay);
        this.delay.connect(this.echoMix);
        
        // Mix dry and wet signals
        this.masterDrive.connect(this.dryGain);
        this.dryGain.connect(this.oscilloscopeAnalyser);
        this.dryGain.connect(this.equalizerAnalyser);
        
        this.echoMix.connect(this.oscilloscopeAnalyser);
        this.echoMix.connect(this.equalizerAnalyser);
        
        this.oscilloscopeAnalyser.connect(this.audioContext.destination);
        this.equalizerAnalyser.connect(this.audioContext.destination);
        this.modulatorGain.connect(this.masterFilter.frequency);
        
        // Initialize keyboard control
        this.initKeyboardControls();
        
        // Initialize other properties
        this.tempo = 160;
        this.isPlaying = false;
        this.currentStep = 0;
        this.stepsPerPattern = 16;
        
        this.patterns = {
            kick: new Array(this.stepsPerPattern).fill(false),
            snare: new Array(this.stepsPerPattern).fill(false),
            hihat: new Array(this.stepsPerPattern).fill(false),
            bass: new Array(this.stepsPerPattern).fill(false),
            overdrive: new Array(this.stepsPerPattern).fill(false),
            vocal: new Array(this.stepsPerPattern).fill(false)
        };
        
        this.initUI();
        this.initVisualizations();
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
        document.getElementById('amen').addEventListener('click', () => this.loadAmenBreak());
        
        // Tempo control
        const tempoSlider = document.getElementById('tempo');
        const tempoValue = document.getElementById('tempo-value');
        tempoSlider.addEventListener('input', (e) => {
            this.tempo = parseInt(e.target.value);
            tempoValue.textContent = `${this.tempo} BPM`;
        });

        // Effects controls
        document.getElementById('filter-freq').addEventListener('input', (e) => {
            this.updateFilterFreq(parseFloat(e.target.value));
        });

        document.getElementById('resonance').addEventListener('input', (e) => {
            this.updateResonance(parseFloat(e.target.value));
        });

        document.getElementById('drive').addEventListener('input', (e) => {
            this.updateDrive(parseFloat(e.target.value));
        });

        document.getElementById('mod-rate').addEventListener('input', (e) => {
            this.updateModRate(parseFloat(e.target.value));
        });

        document.getElementById('mod-depth').addEventListener('input', (e) => {
            this.updateModDepth(parseFloat(e.target.value));
        });

        document.getElementById('delay-time').addEventListener('input', (e) => {
            this.updateDelayTime(parseFloat(e.target.value));
        });

        document.getElementById('delay-feedback').addEventListener('input', (e) => {
            this.updateDelayFeedback(parseFloat(e.target.value));
        });

        document.getElementById('echo-amount').addEventListener('input', (e) => {
            this.updateEchoAmount(parseFloat(e.target.value));
        });

        // Reset button
        document.getElementById('reset-effects').addEventListener('click', () => this.resetEffects());
    }
    
    initVisualizations() {
        // Set up oscilloscope
        this.oscilloscopeCanvas = document.getElementById('oscilloscope');
        this.oscilloscopeCtx = this.oscilloscopeCanvas.getContext('2d');
        
        // Set up equalizer
        this.equalizerCanvas = document.getElementById('equalizer');
        this.equalizerCtx = this.equalizerCanvas.getContext('2d');
        
        // Set initial canvas sizes
        this.resizeCanvases();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvases());
    }

    resizeCanvases() {
        const dpr = window.devicePixelRatio || 1;
        
        // Resize oscilloscope
        const oscContainer = this.oscilloscopeCanvas.parentElement;
        this.oscilloscopeCanvas.style.width = oscContainer.offsetWidth + 'px';
        this.oscilloscopeCanvas.style.height = oscContainer.offsetHeight + 'px';
        this.oscilloscopeCanvas.width = oscContainer.offsetWidth * dpr;
        this.oscilloscopeCanvas.height = oscContainer.offsetHeight * dpr;
        this.oscilloscopeCtx.scale(dpr, dpr);
        
        // Resize equalizer
        const eqContainer = this.equalizerCanvas.parentElement;
        this.equalizerCanvas.style.width = eqContainer.offsetWidth + 'px';
        this.equalizerCanvas.style.height = eqContainer.offsetHeight + 'px';
        this.equalizerCanvas.width = eqContainer.offsetWidth * dpr;
        this.equalizerCanvas.height = eqContainer.offsetHeight * dpr;
        this.equalizerCtx.scale(dpr, dpr);
    }

    drawVisualizations() {
        // Draw oscilloscope
        this.oscilloscopeAnalyser.getByteTimeDomainData(this.oscilloscopeDataArray);
        
        this.oscilloscopeCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.oscilloscopeCtx.fillRect(0, 0, this.oscilloscopeCanvas.width / window.devicePixelRatio, 
            this.oscilloscopeCanvas.height / window.devicePixelRatio);
        
        this.oscilloscopeCtx.lineWidth = 2;
        this.oscilloscopeCtx.strokeStyle = 'rgb(76, 175, 80)';
        this.oscilloscopeCtx.beginPath();
        
        const oscWidth = this.oscilloscopeCanvas.width / window.devicePixelRatio;
        const oscHeight = this.oscilloscopeCanvas.height / window.devicePixelRatio;
        const oscSliceWidth = oscWidth / this.oscilloscopeBufferLength;
        let oscX = 0;
        
        for (let i = 0; i < this.oscilloscopeBufferLength; i++) {
            const v = this.oscilloscopeDataArray[i] / 128.0;
            const y = v * oscHeight / 2;
            
            if (i === 0) {
                this.oscilloscopeCtx.moveTo(oscX, y);
            } else {
                this.oscilloscopeCtx.lineTo(oscX, y);
            }
            
            oscX += oscSliceWidth;
        }
        
        this.oscilloscopeCtx.lineTo(oscWidth, oscHeight / 2);
        this.oscilloscopeCtx.stroke();
        
        // Draw equalizer
        this.equalizerAnalyser.getByteFrequencyData(this.equalizerDataArray);
        
        this.equalizerCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.equalizerCtx.fillRect(0, 0, this.equalizerCanvas.width / window.devicePixelRatio, 
            this.equalizerCanvas.height / window.devicePixelRatio);
        
        const eqWidth = this.equalizerCanvas.width / window.devicePixelRatio;
        const eqHeight = this.equalizerCanvas.height / window.devicePixelRatio - 20; // Account for labels
        const barWidth = eqWidth / this.equalizerBufferLength;
        const barGap = 1;
        
        for (let i = 0; i < this.equalizerBufferLength; i++) {
            const barHeight = (this.equalizerDataArray[i] / 255.0) * eqHeight;
            
            const hue = (i / this.equalizerBufferLength) * 120; // Green gradient
            this.equalizerCtx.fillStyle = `hsla(${hue}, 70%, 50%, 0.8)`;
            
            this.equalizerCtx.fillRect(
                i * barWidth + barGap,
                eqHeight - barHeight,
                barWidth - barGap,
                barHeight
            );
        }
        
        requestAnimationFrame(() => this.drawVisualizations());
    }
    
    setupAudioNodes() {
        // Create audio nodes for each instrument
        this.instruments = {
            kick: this.createKick(),
            snare: this.createSnare(),
            hihat: this.createHiHat(),
            bass: this.createBass(),
            overdrive: this.createOverdrive(),
            vocal: this.createVocal()
        };
        
        // Connect all instruments to the analyser through master gain
        Object.values(this.instruments).forEach(instrument => {
            instrument.connect(this.masterGain);
        });
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
    
    createVocal() {
        const vocal = this.audioContext.createGain();
        vocal.gain.value = 0.8; // Increased base volume
        
        // Create oscillator for the vocal sound
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 220; // A3 note
        
        // Create filter for vocal characteristics
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 2;
        
        // Create vibrato effect
        const vibrato = this.audioContext.createOscillator();
        vibrato.type = 'sine';
        vibrato.frequency.value = 5; // 5 Hz vibrato
        
        const vibratoGain = this.audioContext.createGain();
        vibratoGain.gain.value = 5; // 5 Hz depth
        
        // Add 90's style effects
        // Distortion
        const distortion = this.audioContext.createWaveShaper();
        distortion.curve = this.makeDistortionCurve(200);
        distortion.oversample = '4x';
        
        // Reverb
        const reverb = this.audioContext.createConvolver();
        const reverbTime = 2.0;
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * reverbTime;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
            const n = length - i;
            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
        reverb.buffer = impulse;
        
        // EQ
        const lowShelf = this.audioContext.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 500;
        lowShelf.gain.value = 3;
        
        const highShelf = this.audioContext.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3000;
        highShelf.gain.value = 2;
        
        // Connect nodes
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        osc.connect(filter);
        filter.connect(distortion);
        distortion.connect(lowShelf);
        lowShelf.connect(highShelf);
        highShelf.connect(reverb);
        reverb.connect(vocal);
        
        // Store oscillators for later use
        vocal.osc = osc;
        vocal.vibrato = vibrato;
        
        return vocal;
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
        this.drawVisualizations();
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
            case 'vocal':
                // Start oscillators only when playing a note
                if (!gain.osc.started) {
                    gain.osc.start();
                    gain.vibrato.start();
                    gain.osc.started = true;
                }
                gain.gain.linearRampToValueAtTime(0.8, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
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
        this.oscilloscopeAnalyser.getByteTimeDomainData(this.oscilloscopeDataArray);
        
        // Clear the canvas with a semi-transparent black to create a fade effect
        this.oscilloscopeCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.oscilloscopeCtx.fillRect(0, 0, this.oscilloscopeCanvas.width / window.devicePixelRatio, this.oscilloscopeCanvas.height / window.devicePixelRatio);
        
        // Style for the waveform
        this.oscilloscopeCtx.lineWidth = 2;
        this.oscilloscopeCtx.strokeStyle = 'rgb(76, 175, 80)';
        this.oscilloscopeCtx.beginPath();
        
        const width = this.oscilloscopeCanvas.width / window.devicePixelRatio;
        const height = this.oscilloscopeCanvas.height / window.devicePixelRatio;
        const bufferLength = this.oscilloscopeBufferLength;
        const sliceWidth = width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = this.oscilloscopeDataArray[i] / 128.0;
            const y = v * height / 2;
            
            if (i === 0) {
                this.oscilloscopeCtx.moveTo(x, y);
            } else {
                this.oscilloscopeCtx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        // Draw center line
        this.oscilloscopeCtx.lineTo(width, height / 2);
        this.oscilloscopeCtx.stroke();
        
        // Draw a dim center line for reference
        this.oscilloscopeCtx.beginPath();
        this.oscilloscopeCtx.lineWidth = 1;
        this.oscilloscopeCtx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
        this.oscilloscopeCtx.moveTo(0, height / 2);
        this.oscilloscopeCtx.lineTo(width, height / 2);
        this.oscilloscopeCtx.stroke();
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
            overdrive: 0.2,  // 20% chance for overdrive
            vocal: 0.15      // 15% chance for vocal
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
    
    loadAmenBreak() {
        const amenButton = document.getElementById('amen');
        const isActive = amenButton.classList.contains('active');
        
        if (!isActive) {
            // Store current patterns before applying Amen Break
            this.previousPatterns = {};
            Object.keys(this.patterns).forEach(instrument => {
                this.previousPatterns[instrument] = [...this.patterns[instrument]];
            });
            
            // Classic Amen Break pattern
            const amenPatterns = {
                kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                snare: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
                hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                bass: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                overdrive: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                vocal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
            };

            // Update patterns
            Object.keys(amenPatterns).forEach(instrument => {
                this.patterns[instrument] = [...amenPatterns[instrument]];
            });
            
            amenButton.classList.add('active');
        } else {
            // Restore previous patterns
            Object.keys(this.previousPatterns).forEach(instrument => {
                this.patterns[instrument] = [...this.previousPatterns[instrument]];
            });
            
            amenButton.classList.remove('active');
        }

        // Update UI
        this.updateStepVisualization();
    }

    initKeyboardControls() {
        // Keep track of which keys are currently pressed
        this.pressedKeys = new Set();
        this.lastKeyTime = 0;
        
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return; // Don't handle if user is typing in an input
            
            const key = e.key.toLowerCase();
            const currentTime = Date.now();
            
            // Add key to pressed keys
            this.pressedKeys.add(key);
            this.lastKeyTime = currentTime;

            // Handle help key
            if (key === 'h') {
                this.toggleHelp();
                return;
            }

            // Handle reset key
            if (key === 'r') {
                this.resetEffects();
                return;
            }

            // Check if we have an arrow key and an effect key pressed
            const hasLeftArrow = this.pressedKeys.has('arrowleft');
            const hasRightArrow = this.pressedKeys.has('arrowright');
            
            if (!hasLeftArrow && !hasRightArrow) return;

            const effectKey = {
                'f': 'filter-freq',
                'q': 'resonance',
                'd': 'drive',
                'm': 'mod-rate',
                'n': 'mod-depth',
                't': 'delay-time',
                'b': 'delay-feedback',
                'e': 'echo-amount'
            };

            // Find which effect key is pressed (if any)
            let activeEffect = null;
            for (const [k, v] of Object.entries(effectKey)) {
                if (this.pressedKeys.has(k)) {
                    activeEffect = v;
                    break;
                }
            }

            if (!activeEffect) return;

            const input = document.getElementById(activeEffect);
            const currentValue = parseFloat(input.value);
            const min = parseFloat(input.min);
            const max = parseFloat(input.max);
            
            // Special larger step for frequency
            let step;
            if (activeEffect === 'filter-freq') {
                step = e.shiftKey ? 1000 : 100;
            } else {
                step = e.shiftKey ? 10 : 1;
            }

            if (hasRightArrow) {
                input.value = Math.min(max, currentValue + step);
                input.dispatchEvent(new Event('input'));
            } else if (hasLeftArrow) {
                input.value = Math.max(min, currentValue - step);
                input.dispatchEvent(new Event('input'));
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.pressedKeys.delete(key);
            
            // Clear all pressed keys if we haven't had a keydown in a while
            if (Date.now() - this.lastKeyTime > 1000) {
                this.pressedKeys.clear();
            }
        });

        // Cleanup handler for when window loses focus
        window.addEventListener('blur', () => {
            this.pressedKeys.clear();
        });
    }

    toggleHelp() {
        const helpOverlay = document.getElementById('help-overlay');
        if (helpOverlay) {
            helpOverlay.style.display = helpOverlay.style.display === 'none' ? 'flex' : 'none';
        }
    }

    updateFilterFreq(value) {
        this.masterFilter.frequency.value = value;
        document.getElementById('filter-freq-value').textContent = `${value} Hz`;
    }

    updateResonance(value) {
        this.masterFilter.Q.value = value;
        document.getElementById('resonance-value').textContent = value.toFixed(1);
    }

    updateDrive(value) {
        this.masterDrive.curve = this.makeDistortionCurve(value * 4);
        document.getElementById('drive-value').textContent = `${value}%`;
    }

    updateModRate(value) {
        this.modulator.frequency.value = value;
        document.getElementById('mod-rate-value').textContent = `${value} Hz`;
    }

    updateModDepth(value) {
        this.modulatorGain.gain.value = value * 100;
        document.getElementById('mod-depth-value').textContent = `${value}%`;
    }

    updateDelayTime(value) {
        this.delay.delayTime.value = value / 1000;
        document.getElementById('delay-time-value').textContent = `${value} ms`;
    }

    updateDelayFeedback(value) {
        this.delayFeedback.gain.value = value / 100;
        document.getElementById('delay-feedback-value').textContent = `${value}%`;
    }

    updateEchoAmount(value) {
        const mix = value / 100;
        this.echoMix.gain.value = mix;
        this.dryGain.gain.value = 1 - (mix * 0.5);
        document.getElementById('echo-amount-value').textContent = `${value}%`;
    }

    resetEffects() {
        // Reset filter
        this.updateFilterFreq(20000);
        this.updateResonance(0);
        document.getElementById('filter-freq').value = 20000;
        document.getElementById('resonance').value = 0;

        // Reset drive
        this.updateDrive(0);
        document.getElementById('drive').value = 0;

        // Reset modulation
        this.updateModRate(0);
        this.updateModDepth(0);
        document.getElementById('mod-rate').value = 0;
        document.getElementById('mod-depth').value = 0;

        // Reset delay and echo
        this.updateDelayTime(0);
        this.updateDelayFeedback(0);
        this.updateEchoAmount(0);
        document.getElementById('delay-time').value = 0;
        document.getElementById('delay-feedback').value = 0;
        document.getElementById('echo-amount').value = 0;
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