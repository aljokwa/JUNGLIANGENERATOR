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
            // Pattern Maker 1
            kick: new Array(this.stepsPerPattern).fill(false),
            snare: new Array(this.stepsPerPattern).fill(false),
            hihat: new Array(this.stepsPerPattern).fill(false),
            bass: new Array(this.stepsPerPattern).fill(false),
            overdrive: new Array(this.stepsPerPattern).fill(false),
            vocal: new Array(this.stepsPerPattern).fill(false),
            // Pattern Maker 2
            subkick: new Array(this.stepsPerPattern).fill(false),
            clap: new Array(this.stepsPerPattern).fill(false),
            ride: new Array(this.stepsPerPattern).fill(false),
            reese: new Array(this.stepsPerPattern).fill(false),
            wobble: new Array(this.stepsPerPattern).fill(false),
            vox: new Array(this.stepsPerPattern).fill(false)
        };
        
        // Create EQ nodes with more precise frequency bands
        this.eqNodes = {
            '20hz': this.createEQNode(20, 'lowshelf'),
            '5k': this.createEQNode(5000, 'peaking'),
            '10k': this.createEQNode(10000, 'peaking'),
            '15k': this.createEQNode(15000, 'peaking'),
            '20k': this.createEQNode(20000, 'highshelf')
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

        // Add event listeners for EQ controls
        document.getElementById('eq-20hz').addEventListener('input', (e) => this.updateEQ('20hz', parseFloat(e.target.value)));
        document.getElementById('eq-5k').addEventListener('input', (e) => this.updateEQ('5k', parseFloat(e.target.value)));
        document.getElementById('eq-10k').addEventListener('input', (e) => this.updateEQ('10k', parseFloat(e.target.value)));
        document.getElementById('eq-15k').addEventListener('input', (e) => this.updateEQ('15k', parseFloat(e.target.value)));
        document.getElementById('eq-20k').addEventListener('input', (e) => this.updateEQ('20k', parseFloat(e.target.value)));
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
            // Pattern Maker 1
            kick: this.createKick(),
            snare: this.createSnare(),
            hihat: this.createHiHat(),
            bass: this.createBass(),
            overdrive: this.createOverdrive(),
            vocal: this.createVox(),
            // Pattern Maker 2
            subkick: this.createSubKick(),
            clap: this.createClap(),
            ride: this.createRide(),
            reese: this.createReese(),
            wobble: this.createWobble(),
            vox: this.createVox()
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
    
    createVox() {
        const vox = this.audioContext.createGain();
        vox.gain.value = 0.8;
        
        // Create oscillator for the vocal sound
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440; // A4 note
        
        // Create filter for vocal characteristics
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;
        filter.Q.value = 2;
        
        // Create vibrato effect
        const vibrato = this.audioContext.createOscillator();
        vibrato.type = 'sine';
        vibrato.frequency.value = 7; // 7 Hz vibrato
        
        const vibratoGain = this.audioContext.createGain();
        vibratoGain.gain.value = 10; // 10 Hz depth
        
        // Add effects
        const distortion = this.audioContext.createWaveShaper();
        distortion.curve = this.makeDistortionCurve(100);
        distortion.oversample = '4x';
        
        // Connect nodes
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        osc.connect(filter);
        filter.connect(distortion);
        distortion.connect(vox);
        
        // Store oscillators for later use
        vox.osc = osc;
        vox.vibrato = vibrato;
        
        return vox;
    }
    
    createSubKick() {
        const subkick = this.audioContext.createGain();
        subkick.gain.value = 0;
        
        // Create a very low sine wave
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 30; // Very low frequency for sub-bass
        
        // Add a slight pitch envelope
        const pitchEnv = this.audioContext.createGain();
        pitchEnv.gain.value = 0;
        
        // Create a lowpass filter for the sub
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 100;
        filter.Q.value = 0.5;
        
        // Connect nodes
        osc.connect(pitchEnv);
        pitchEnv.connect(filter);
        filter.connect(subkick);
        
        // Start oscillator
        osc.start();
        
        // Store oscillator for later use
        subkick.osc = osc;
        subkick.pitchEnv = pitchEnv;
        
        return subkick;
    }
    
    createClap() {
        const clap = this.audioContext.createGain();
        clap.gain.value = 0;
        
        // Create noise buffer with proper length
        const bufferLength = this.audioContext.sampleRate * 0.1; // 100ms of noise
        const noiseBuffer = this.audioContext.createBuffer(1, bufferLength, this.audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        
        // Fill buffer with noise
        for (let i = 0; i < bufferLength; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }
        
        // Create envelope for the clap
        const envelope = this.audioContext.createGain();
        envelope.gain.value = 0;
        
        // Create filters for different clap layers
        const filter1 = this.audioContext.createBiquadFilter();
        const filter2 = this.audioContext.createBiquadFilter();
        filter1.type = 'bandpass';
        filter1.frequency.value = 2000;
        filter1.Q.value = 1;
        filter2.type = 'bandpass';
        filter2.frequency.value = 4000;
        filter2.Q.value = 1;
        
        // Connect nodes
        envelope.connect(filter1);
        envelope.connect(filter2);
        filter1.connect(clap);
        filter2.connect(clap);
        
        // Store envelope for later use
        clap.envelope = envelope;
        clap.noiseBuffer = noiseBuffer;
        
        return clap;
    }
    
    createRide() {
        const ride = this.audioContext.createGain();
        ride.gain.value = 0;
        
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
        
        // Create high-pass filter for metallic sound
        const highPass = this.audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 8000;
        highPass.Q.value = 0.5;
        
        // Create resonance filter
        const resonance = this.audioContext.createBiquadFilter();
        resonance.type = 'bandpass';
        resonance.frequency.value = 12000;
        resonance.Q.value = 2;
        
        // Connect nodes
        noise.connect(highPass);
        highPass.connect(resonance);
        resonance.connect(ride);
        
        // Start noise
        noise.start();
        
        return ride;
    }
    
    createReese() {
        const reese = this.audioContext.createGain();
        reese.gain.value = 0;
        
        // Create two detuned sawtooth oscillators
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.value = 55; // A1
        osc2.frequency.value = 55.5; // Slightly detuned
        
        // Create LFO for movement
        const lfo = this.audioContext.createOscillator();
        lfo.frequency.value = 0.1;
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 0.5;
        
        // Create filter
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 1;
        
        // Connect nodes
        osc1.connect(filter);
        osc2.connect(filter);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        filter.connect(reese);
        
        // Start oscillators
        osc1.start();
        osc2.start();
        lfo.start();
        
        // Store oscillators for later use
        reese.osc1 = osc1;
        reese.osc2 = osc2;
        reese.lfo = lfo;
        
        return reese;
    }
    
    createWobble() {
        const wobble = this.audioContext.createGain();
        wobble.gain.value = 0;
        
        // Create sawtooth oscillator
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 110; // A2
        
        // Create LFO for wobble effect
        const lfo = this.audioContext.createOscillator();
        lfo.frequency.value = 0.5;
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 100;
        
        // Create filter
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 1;
        
        // Connect nodes
        osc.connect(filter);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        filter.connect(wobble);
        
        // Start oscillators
        osc.start();
        lfo.start();
        
        // Store oscillators for later use
        wobble.osc = osc;
        wobble.lfo = lfo;
        
        return wobble;
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
        
        // Ensure audio context is running
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Create a new gain envelope for each note
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        
        // Trigger animation with Street Fighter style interactions
        const fightersContainer = document.querySelector('.fighters-container');
        const leftFighter = document.querySelector('.fighter-left');
        const rightFighter = document.querySelector('.fighter-right');
        
        // Add the sound trigger class
        fightersContainer.classList.add(`${instrument}-sound`);
        
        // Street Fighter style interactions with combo system
        if (['kick', 'subkick'].includes(instrument)) {
            // Heavy attacks
            leftFighter.classList.add('attacking');
            rightFighter.classList.add('hit');
            this.shakeScreen('heavy');
            
            // Flash effect
            this.flashEffect(fightersContainer);
            
        } else if (['snare', 'clap'].includes(instrument)) {
            // Quick attacks
            rightFighter.classList.add('attacking');
            leftFighter.classList.add('hit');
            
            // Battle effect
            this.battleEffect(fightersContainer);
            
        } else if (['bass', 'reese'].includes(instrument)) {
            // Special moves
            const attacker = instrument === 'bass' ? rightFighter : leftFighter;
            const defender = instrument === 'bass' ? leftFighter : rightFighter;
            
            attacker.classList.add('attacking', 'special');
            defender.classList.add('hit');
            this.shakeScreen('special');
            this.specialEffect(attacker);
            
        } else if (['hihat', 'ride'].includes(instrument)) {
            // Defensive moves
            leftFighter.classList.add('blocking');
            this.blockEffect(leftFighter);
        }
        
        // Play the sound based on instrument type
        switch(instrument) {
            case 'kick':
            case 'subkick':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                break;
                
            case 'snare':
            case 'clap':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                break;
                
            case 'hihat':
            case 'ride':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                break;
                
            case 'bass':
            case 'reese':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                break;
                
            case 'overdrive':
            case 'wobble':
                gain.gain.linearRampToValueAtTime(1, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                break;
                
            case 'vocal':
            case 'vox':
                if (!gain.osc.started) {
                    gain.osc.start();
                    gain.vibrato.start();
                    gain.osc.started = true;
                }
                gain.gain.linearRampToValueAtTime(0.8, now + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
                break;
        }
        
        // Clean up classes
        setTimeout(() => {
            leftFighter.classList.remove('attacking', 'hit', 'blocking', 'special');
            rightFighter.classList.remove('attacking', 'hit', 'blocking', 'special');
            fightersContainer.style.animation = '';
            fightersContainer.classList.remove(`${instrument}-sound`);
        }, 500);
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
            // Pattern Maker 1
            kick: 0.3,      // 30% chance for kick
            snare: 0.2,     // 20% chance for snare
            hihat: 0.4,     // 40% chance for hi-hat
            bass: 0.25,     // 25% chance for bass
            overdrive: 0.2,  // 20% chance for overdrive
            vocal: 0.15,    // 15% chance for vocal
            
            // Pattern Maker 2
            subkick: 0.15,  // 15% chance for sub kick (rare but impactful)
            clap: 0.2,      // 20% chance for clap
            ride: 0.3,      // 30% chance for ride
            reese: 0.25,    // 25% chance for reese bass
            wobble: 0.2,    // 20% chance for wobble
            vox: 0.15       // 15% chance for vox
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

    createEQNode(frequency, type) {
        const node = this.audioContext.createBiquadFilter();
        node.type = type;
        node.frequency.value = frequency;
        
        // Set Q values based on filter type and frequency
        if (type === 'lowshelf') {
            node.Q.value = 0.5;
        } else if (type === 'highshelf') {
            node.Q.value = 0.5;
        } else {
            // For peaking filters, adjust Q based on frequency
            if (frequency <= 100) {
                node.Q.value = 0.5;
            } else if (frequency >= 10000) {
                node.Q.value = 2.0;
            } else {
                node.Q.value = 1.0;
            }
        }
        
        node.gain.value = 0;
        return node;
    }
    
    connectNodes() {
        // Create analyzers for visualization
        this.oscilloscopeAnalyser = this.audioContext.createAnalyser();
        this.oscilloscopeAnalyser.fftSize = 2048;
        this.equalizerAnalyser = this.audioContext.createAnalyser();
        this.equalizerAnalyser.fftSize = 2048;
        
        // Connect all instruments to master gain
        Object.values(this.instruments).forEach(instrument => {
            instrument.connect(this.masterGain);
        });
        
        // Connect master gain to EQ chain
        this.masterGain.connect(this.eqNodes['20hz']);
        this.eqNodes['20hz'].connect(this.eqNodes['5k']);
        this.eqNodes['5k'].connect(this.eqNodes['10k']);
        this.eqNodes['10k'].connect(this.eqNodes['15k']);
        this.eqNodes['15k'].connect(this.eqNodes['20k']);
        
        // Connect EQ chain to analyzers and effects
        this.eqNodes['20k'].connect(this.oscilloscopeAnalyser);
        this.eqNodes['20k'].connect(this.equalizerAnalyser);
        this.eqNodes['20k'].connect(this.masterFilter);
        
        // Connect effects chain
        this.masterFilter.connect(this.masterDrive);
        
        // Connect modulation
        this.modulator.connect(this.modulatorGain);
        this.modulatorGain.connect(this.masterFilter.frequency);
        
        // Connect delay
        this.masterDrive.connect(this.dryGain);
        this.masterDrive.connect(this.delay);
        this.delay.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delay);
        this.delay.connect(this.echoMix);
        
        // Connect to destination
        this.dryGain.connect(this.audioContext.destination);
        this.echoMix.connect(this.audioContext.destination);
        
        // Start modulator
        this.modulator.start();
        
        // Initialize visualization data arrays
        this.oscilloscopeBufferLength = this.oscilloscopeAnalyser.frequencyBinCount;
        this.oscilloscopeDataArray = new Uint8Array(this.oscilloscopeBufferLength);
        this.equalizerBufferLength = this.equalizerAnalyser.frequencyBinCount;
        this.equalizerDataArray = new Uint8Array(this.equalizerBufferLength);
    }

    updateEQ(band, value) {
        const node = this.eqNodes[band];
        if (node) {
            // Convert the slider value (-12 to 12) to decibels
            const dbValue = value;
            node.gain.value = dbValue;
            
            // Force a redraw of the visualization
            requestAnimationFrame(() => this.drawVisualizations());
        }
    }

    // Enhanced visual effects
    shakeScreen(intensity = 'normal') {
        const container = document.querySelector('.fighters-container');
        container.style.animation = 'none';
        container.offsetHeight; // Trigger reflow
        
        switch(intensity) {
            case 'heavy':
                container.style.animation = 'lcd-battle 0.2s steps(4, end) 3';
                break;
            case 'special':
                container.style.animation = 'lcd-battle 0.3s steps(6, end) 4';
                break;
            default:
                container.style.animation = 'lcd-battle 0.2s steps(4, end) 2';
        }
    }
    
    flashEffect(element) {
        element.style.filter = 'brightness(1.5)';
        setTimeout(() => {
            element.style.filter = 'brightness(1.2)';
            setTimeout(() => {
                element.style.filter = '';
            }, 50);
        }, 50);
    }
    
    battleEffect(container) {
        container.style.animation = 'lcd-battle 0.3s steps(4, end)';
        this.flashEffect(container);
    }
    
    specialEffect(fighter) {
        fighter.style.filter = 'hue-rotate(90deg) brightness(1.5)';
        setTimeout(() => {
            fighter.style.filter = '';
        }, 300);
    }
    
    blockEffect(fighter) {
        fighter.style.filter = 'brightness(1.2) contrast(1.2)';
        setTimeout(() => {
            fighter.style.filter = '';
        }, 200);
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