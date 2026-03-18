(function () {
  'use strict';

  /* ==========================================================
   * 1. MUSICAL CONSTANTS & GLOBAL LOOKUPS
   * ========================================================== */

  /** @type {string[]} */
  const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ROOT_LABEL = { 'C#': 'C♯', 'D#': 'D♯', 'F#': 'F♯', 'G#': 'G♯', 'A#': 'A♯' };
  const NOTE_TO_SEMITONE = { C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11 };
  const SCALE_INTERVALS = {
    major: [0,2,4,5,7,9,11], minor: [0,2,3,5,7,8,10], dorian: [0,2,3,5,7,9,10],
    mixolydian: [0,2,4,5,7,9,10], blues: [0,3,5,6,7,10], pentatonic: [0,2,4,7,9]
  };
  const KEYBOARD_NOTES = ['C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5'];
  const KEYMAP = { a:'C4', w:'C#4', s:'D4', e:'D#4', d:'E4', f:'F4', t:'F#4', g:'G4', y:'G#4', h:'A4', u:'A#4', j:'B4', k:'C5' };
  const MODEL_CONFIG = {
    'musicvae-2bar': 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small',
    'musicvae-4bar': 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_4bar_med_q2',
    'groovae-2bar': 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/groovae_2bar_humanize'
  };
  const TRACK_LABELS = ['Track 1', 'Track 2', 'Track 3', 'Drums'];
  const TRACKS = TRACK_LABELS.length;
  const BAR_BEATS = 4;
  const STORAGE_KEY = 'ius-assistant-state-v2';

  /* ==========================================================
   * 2. DOM REFERENCES & UI MOUNT POINTS
   * ========================================================== */

  /** @type {Record<string, HTMLElement|null>} */
  const els = {
    themeSelect: document.getElementById('themeSelect'),
    rootSelect: document.getElementById('rootSelect'),
    scaleSelect: document.getElementById('scaleSelect'),
    engineSelect: document.getElementById('engineSelect'),
    playbackSelect: document.getElementById('playbackSelect'),
    styleSelect: document.getElementById('styleSelect'),
    stepSelect: document.getElementById('stepSelect'),
    progressionSelect: document.getElementById('progressionSelect'),
    barsSelect: document.getElementById('barsSelect'),
    trackBarsSelect: document.getElementById('trackBarsSelect'),
    bpmInput: document.getElementById('bpmInput'),
    temperatureRange: document.getElementById('temperatureRange'),
    autoHarmonyToggle: document.getElementById('autoHarmonyToggle'),
    liveModeToggle: document.getElementById('liveModeToggle'),
    liveCaptureToggle: document.getElementById('liveCaptureToggle'),
    liveBufferSelect: document.getElementById('liveBufferSelect'),
    statusPill: document.getElementById('statusPill'),
    midiPill: document.getElementById('midiPill'),
    capturedCount: document.getElementById('capturedCount'),
    generatedCount: document.getElementById('generatedCount'),
    modeReadout: document.getElementById('modeReadout'),
    scaleReadout: document.getElementById('scaleReadout'),
    arrangementMeta: document.getElementById('arrangementMeta'),
    companionBox: document.getElementById('companionBox'),
    companionStatus: document.getElementById('companionStatus'),
    keyboard: document.getElementById('keyboard'),
    seedList: document.getElementById('seedList'),
    resultsList: document.getElementById('resultsList'),
    arrangementGrid: document.getElementById('arrangementGrid'),
    startAudioBtn: document.getElementById('startAudioBtn'),
    connectMidiBtn: document.getElementById('connectMidiBtn'),
    seedDemoBtn: document.getElementById('seedDemoBtn'),
    clearBtn: document.getElementById('clearBtn'),
    generateBtn: document.getElementById('generateBtn'),
    generateTrackBtn: document.getElementById('generateTrackBtn'),
    generateDrumsBtn: document.getElementById('generateDrumsBtn'),
    suggestLyricsBtn: document.getElementById('suggestLyricsBtn'),
    speakLyricsBtn: document.getElementById('speakLyricsBtn'),
    playSeedBtn: document.getElementById('playSeedBtn'),
    micCaptureBtn: document.getElementById('micCaptureBtn'),
    micPill: document.getElementById('micPill'),
    playArrangementBtn: document.getElementById('playArrangementBtn'),
    clearArrangementBtn: document.getElementById('clearArrangementBtn'),
    fillProgressionBtn: document.getElementById('fillProgressionBtn'),
    exportSetBtn: document.getElementById('exportSetBtn'),
    exportMidiBtn: document.getElementById('exportMidiBtn'),
    exportWavBtn: document.getElementById('exportWavBtn'),
    progressFill: document.getElementById('progressFill'),
    progressValue: document.getElementById('progressValue'),
    progressLabel: document.getElementById('progressLabel'),
    lyricsBox: document.getElementById('lyricsBox'),
    shortcutList: document.getElementById('shortcutList')
  };

  /* ==========================================================
   * 3. RUNTIME STATE, TRANSPORT, AND SESSION MEMORY
   * ========================================================== */

  /** @type {{audioContext: AudioContext|null, masterGain: GainNode|null, soundfont: any, soundfontLoading: boolean, midiAccess: MIDIAccess|null, seedNotes: any[], resultClips: any[], nextClipId: number, arrangementBars: number, arrangement: any[][], modelInstances: Record<string, any>, liveTimer: number|null, postGenerateHooks: Function[], experimentalPlugins: Function[], micStream: MediaStream|null, micSource: MediaStreamAudioSourceNode|null, micAnalyser: AnalyserNode|null, micFrame: number|null, micIsCapturing: boolean, micPendingMidi: number|null, micStableFrames: number, micLastCaptureTs: number, micLastCapturedMidi: number|null}} */
  const state = {
    audioContext: null,
    masterGain: null,
    soundfont: null,
    soundfontLoading: false,
    midiAccess: null,
    seedNotes: [],
    resultClips: [],
    nextClipId: 1,
    arrangementBars: 16,
    arrangement: Array.from({ length: TRACKS }, () => Array(16).fill(null)),
    modelInstances: {},
    liveTimer: null,
    postGenerateHooks: [],
    experimentalPlugins: [],
    micStream: null,
    micSource: null,
    micAnalyser: null,
    micFrame: null,
    micIsCapturing: false,
    micPendingMidi: null,
    micStableFrames: 0,
    micLastCaptureTs: 0,
    micLastCapturedMidi: null,
    transportTimeouts: [],
    arrangementIsPlaying: false,
    arrangementPaused: false,
    arrangementStartedAt: 0,
    transportTotalBeats: 0,
    liveCaptureSuggestedBar: null,
    lastSuggestedTrack: null,
    companionRoots: [],
    companionClipId: null
  };

  /* ==========================================================
   * 4. MUSIC THEORY, SCALE, AND NOTE UTILITY HELPERS
   * ========================================================== */

  const MusicUtils = {
    /** @param {number} midi */
    midiToName(midi) {
      const octave = Math.floor(midi / 12) - 1;
      const semitone = ((midi % 12) + 12) % 12;
      const root = ROOTS.find((r) => NOTE_TO_SEMITONE[r] === semitone) || 'C';
      return `${root}${octave}`;
    },
    /** @param {string} name */
    niceNote(name) { return name.replace('#', '♯'); },
    /** @param {string} name */
    nameToMidi(name) {
      const match = /^([A-G]#?)(-?\d+)$/.exec(name);
      if (!match) return 60;
      return (Number(match[2]) + 1) * 12 + NOTE_TO_SEMITONE[match[1]];
    },
    /** @param {string} root @param {string} scale */
    getScalePitchClasses(root, scale) {
      const rootPc = NOTE_TO_SEMITONE[root] ?? 0;
      return (SCALE_INTERVALS[scale] || SCALE_INTERVALS.major).map((n) => (rootPc + n) % 12);
    },
    /** @param {string} root @param {string} scale @param {number[]} octaves */
    midiPool(root, scale, octaves) {
      const pcs = MusicUtils.getScalePitchClasses(root, scale);
      return octaves.flatMap((oct) => pcs.map((pc) => (oct + 1) * 12 + pc));
    },
    /** @param {number} target @param {number[]} pool @param {number} windowSize */
    nearest(target, pool, windowSize) {
      const sorted = pool.slice().sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
      return sorted[Math.floor(Math.random() * Math.max(1, Math.min(windowSize, sorted.length)))];
    },
    /** @param {string} style @param {number} i */
    styleShift(style, i) {
      const patterns = {
        balanced: [0, 2, -1, 1], arpeggio: [0, 2, 4, 2], jazzy: [0, 1, -2, 3], ambient: [0, -1, 2, -3]
      };
      const pattern = patterns[style] || patterns.balanced;
      return pattern[i % pattern.length];
    },
    /** @param {string} symbol */
    romanToDegree(symbol) {
      const map = { I:0, ii:1, III:2, iii:2, IV:3, V:4, vi:5, VI:5, VII:6, i:0, iv:3, v:4 };
      return map[symbol] ?? 0;
    },
    /** @param {string} root @param {string} scaleName @param {string} symbol */
    degreeLabel(root, scaleName, symbol) {
      const isMinor = ['minor', 'dorian', 'blues'].includes(scaleName);
      const pcs = MusicUtils.getScalePitchClasses(root, isMinor ? 'minor' : 'major');
      const degree = MusicUtils.romanToDegree(symbol);
      const note = ROOTS.find((r) => NOTE_TO_SEMITONE[r] === pcs[degree]) || 'C';
      const quality = /[a-z]/.test(symbol[0]) ? 'm' : '';
      return `${ROOT_LABEL[note] || note}${quality}`;
    },
    /** @param {string} scaleValue */
    isMinorish(scaleValue) { return ['minor', 'dorian', 'blues'].includes(scaleValue); },
    /** @param {number} duration */
    noteGlyph(duration) {
      if (duration <= 0.3) return '♬';
      if (duration <= 0.6) return '♪';
      if (duration <= 1.2) return '♩';
      return '𝅗𝅥';
    }
  };

  /* ==========================================================
   * 5. UI HELPERS, SETTINGS, AND PERSISTENCE
   * ========================================================== */

  const UI = {
    setStatus(text) { if (els.statusPill) els.statusPill.textContent = text; },
    setMidi(text) { if (els.midiPill) els.midiPill.textContent = text; },
    setMic(text) { if (els.micPill) els.micPill.textContent = text; },
    setCompanion(text, status = 'Ready') {
      if (els.companionBox) els.companionBox.textContent = text;
      if (els.companionStatus) els.companionStatus.textContent = status;
    },
    syncLiveCaptureUI() {
      const row = document.querySelector('.live-capture-row');
      const armed = Boolean(els.liveCaptureToggle?.checked);
      row?.classList.toggle('is-armed', armed);
      if (row) row.setAttribute('aria-pressed', String(armed));
    },
    setProgress(value, label) {
      const pct = Math.max(0, Math.min(100, Math.round(value)));
      if (els.progressFill) els.progressFill.style.width = `${pct}%`;
      if (els.progressValue) els.progressValue.textContent = `${pct}%`;
      if (label && els.progressLabel) els.progressLabel.textContent = label;
    },
    applyTheme() {
      document.documentElement.setAttribute('data-theme', String(els.themeSelect?.value || 'dark'));
    },
    populateShortcuts() {
      if (!els.shortcutList) return;
      const shortcuts = [
        ['A–K', 'play notes from the computer keyboard'],
        ['Space', 'toggle arrangement play/pause'],
        ['Shift + Space', 'play current seed'],
        ['G', 'generate clip'],
        ['T', 'generate full track'],
        ['D', 'generate drums'],
        ['L', 'suggest lyrics'],
        ['H', 'toggle microphone humming capture']
      ];
      els.shortcutList.innerHTML = shortcuts.map(([key, label]) => `<li><strong>${key}</strong> — ${label}</li>`).join('');
    }
  };

  const Settings = {
    bpm() { return Math.max(40, Math.min(220, Number(els.bpmInput?.value) || 110)); },
    beatToSeconds(beats) { return beats * (60 / Settings.bpm()); },
    progressionSymbols() { return String(els.progressionSelect?.value || 'I-IV-V-I').split('-').map((s) => s.trim()); },
    progressionChordLabel(barIndex) {
      const symbol = Settings.progressionSymbols()[barIndex % Settings.progressionSymbols().length] || 'I';
      return MusicUtils.degreeLabel(String(els.rootSelect?.value || 'C'), String(els.scaleSelect?.value || 'major'), symbol);
    },
    progressionToChordPool(symbol) {
      const root = String(els.rootSelect?.value || 'C');
      const scaleName = MusicUtils.isMinorish(String(els.scaleSelect?.value || 'major')) ? 'minor' : 'major';
      const pcs = MusicUtils.getScalePitchClasses(root, scaleName);
      const degreeIndex = MusicUtils.romanToDegree(symbol);
      const triad = [0, 2, 4].map((jump) => pcs[(degreeIndex + jump) % pcs.length]);
      return MusicUtils.midiPool(root, scaleName, [3,4,5,6]).filter((m) => triad.includes(m % 12));
    },
    estimateAdaptiveStep(seed) {
      if (seed.length < 2) return 1;
      const gaps = [];
      for (let i = 1; i < seed.length; i += 1) gaps.push(Math.max(0.25, seed[i].time - seed[i - 1].time));
      const average = gaps.reduce((sum, n) => sum + n, 0) / gaps.length;
      const options = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
      return options.sort((a, b) => Math.abs(a - average) - Math.abs(b - average))[0] || 1;
    },
    currentStep(seed) {
      const value = String(els.stepSelect?.value || '1.5');
      return value === 'adaptive' ? Settings.estimateAdaptiveStep(seed) : Number(value);
    },
    snapshot() {
      return {
        theme: String(els.themeSelect?.value || 'dark'),
        root: String(els.rootSelect?.value || 'C'),
        scale: String(els.scaleSelect?.value || 'major'),
        engine: String(els.engineSelect?.value || 'theory'),
        playback: String(els.playbackSelect?.value || 'soundfont'),
        style: String(els.styleSelect?.value || 'balanced'),
        step: String(els.stepSelect?.value || '1.5'),
        progression: String(els.progressionSelect?.value || 'I-IV-V-I'),
        bars: String(els.barsSelect?.value || '4'),
        trackBars: String(els.trackBarsSelect?.value || '16'),
        bpm: String(els.bpmInput?.value || '110'),
        temperature: String(els.temperatureRange?.value || '42'),
        autoHarmony: Boolean(els.autoHarmonyToggle?.checked),
        liveMode: Boolean(els.liveModeToggle?.checked),
        liveCapture: Boolean(els.liveCaptureToggle?.checked),
        liveBuffer: String(els.liveBufferSelect?.value || '8')
      };
    },
    restore(saved) {
      const mapping = {
        theme: els.themeSelect, root: els.rootSelect, scale: els.scaleSelect, engine: els.engineSelect,
        playback: els.playbackSelect, style: els.styleSelect, step: els.stepSelect, progression: els.progressionSelect,
        bars: els.barsSelect, trackBars: els.trackBarsSelect, bpm: els.bpmInput, temperature: els.temperatureRange
      };
      Object.entries(mapping).forEach(([key, el]) => {
        if (el && saved && saved[key] != null) el.value = saved[key];
      });
      if (els.autoHarmonyToggle && saved && saved.autoHarmony != null) els.autoHarmonyToggle.checked = !!saved.autoHarmony;
      if (els.liveModeToggle && saved && saved.liveMode != null) els.liveModeToggle.checked = !!saved.liveMode;
      if (els.liveCaptureToggle && saved && saved.liveCapture != null) els.liveCaptureToggle.checked = !!saved.liveCapture;
      if (els.liveBufferSelect && saved && saved.liveBuffer != null) els.liveBufferSelect.value = saved.liveBuffer;
    }
  };

  const Persistence = {
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          settings: Settings.snapshot(),
          seedNotes: state.seedNotes,
          resultClips: state.resultClips,
          arrangementBars: state.arrangementBars,
          arrangement: state.arrangement,
          nextClipId: state.nextClipId,
          lyrics: els.lyricsBox?.textContent || ''
        }));
      } catch (error) {
        console.warn('Could not save local state', error);
      }
    },
    load() {
      try {
        const params = new URLSearchParams(window.location.search);
        const shared = params.get('set');
        if (shared) {
          const decoded = JSON.parse(decodeURIComponent(escape(window.atob(shared))));
          Settings.restore(decoded.settings || {});
          state.seedNotes = Array.isArray(decoded.seedNotes) ? decoded.seedNotes : [];
          state.resultClips = Array.isArray(decoded.resultClips) ? decoded.resultClips : [];
          state.nextClipId = Number(decoded.nextClipId) || (state.resultClips.length + 1);
          state.arrangementBars = Number(decoded.arrangementBars) || 16;
          state.arrangement = Array.isArray(decoded.arrangement)
            ? decoded.arrangement.map((track) => Array.isArray(track) ? track : Array(state.arrangementBars).fill(null))
            : Array.from({ length: TRACKS }, () => Array(state.arrangementBars).fill(null));
          if (els.lyricsBox && decoded.lyrics) els.lyricsBox.textContent = decoded.lyrics;
          UI.setStatus('Shared set loaded');
          return;
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        Settings.restore(saved.settings || {});
        state.seedNotes = Array.isArray(saved.seedNotes) ? saved.seedNotes : [];
        state.resultClips = Array.isArray(saved.resultClips) ? saved.resultClips : [];
        state.nextClipId = Number(saved.nextClipId) || (state.resultClips.length + 1);
        state.arrangementBars = Number(saved.arrangementBars) || 16;
        state.arrangement = Array.isArray(saved.arrangement)
          ? saved.arrangement.map((track) => Array.isArray(track) ? track : Array(state.arrangementBars).fill(null))
          : Array.from({ length: TRACKS }, () => Array(state.arrangementBars).fill(null));
        if (els.lyricsBox && saved.lyrics) els.lyricsBox.textContent = saved.lyrics;
      } catch (error) {
        console.warn('Could not load local state', error);
      }
    }
  };

  /* ==========================================================
   * 6. AUDIO, KEYBOARD, MIDI, AND LIVE INPUT CAPTURE
   * ========================================================== */

  const AudioEngine = {
    async ensureAudio() {
      if (!state.audioContext) {
        const AC = window.AudioContext || window.webkitAudioContext;
        state.audioContext = new AC();
        state.masterGain = state.audioContext.createGain();
        state.masterGain.gain.value = 0.18;
        state.masterGain.connect(state.audioContext.destination);
      }
      if (state.audioContext.state !== 'running') {
        await state.audioContext.resume();
      }
      UI.setStatus('Audio ready');
      if (String(els.playbackSelect?.value) === 'soundfont') await AudioEngine.loadSoundfont();
    },
    async loadSoundfont() {
      if (state.soundfont || state.soundfontLoading || !window.Soundfont || !state.audioContext) return;
      state.soundfontLoading = true;
      UI.setStatus('Loading SoundFont');
      try {
        state.soundfont = await window.Soundfont.instrument(state.audioContext, 'acoustic_grand_piano');
        UI.setStatus('SoundFont ready');
      } catch (error) {
        console.warn(error);
        state.soundfont = null;
        UI.setStatus('Synth fallback');
      } finally {
        state.soundfontLoading = false;
      }
    },
    playOscillator(noteName, when, duration, velocity, kind) {
      if (!state.audioContext || !state.masterGain) return;
      const midi = MusicUtils.nameToMidi(noteName);
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const osc = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      osc.type = kind === 'pad' ? 'sine' : kind === 'drum' ? 'square' : 'triangle';
      osc.frequency.value = kind === 'drum' ? Math.max(60, freq / 8) : freq;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.02, velocity * (kind === 'pad' ? 0.05 : 0.12)), when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      osc.connect(gain).connect(state.masterGain);
      osc.start(when);
      osc.stop(when + duration + 0.03);
    },
    playNote(noteName, whenSec, durationSec, velocity, kind) {
      if (!state.audioContext) return;
      const start = state.audioContext.currentTime + whenSec;
      if (String(els.playbackSelect?.value) === 'soundfont' && state.soundfont && kind !== 'drum' && kind !== 'pad') {
        try {
          state.soundfont.play(noteName, start, { duration: durationSec, gain: velocity });
          return;
        } catch (error) {
          console.warn(error);
        }
      }
      AudioEngine.playOscillator(noteName, start, durationSec, velocity, kind);
    },
    flashKey(noteName) {
      const el = els.keyboard?.querySelector(`[data-note="${noteName}"]`);
      if (!el) return;
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 120);
    },
    /** @param {any[]} sequence @param {number} startOffsetBeats */
    scheduleSequence(sequence, startOffsetBeats = 0) {
      sequence.forEach((note) => {
        AudioEngine.playNote(note.note, Settings.beatToSeconds(startOffsetBeats + note.time), Settings.beatToSeconds(note.duration), note.velocity || 0.8, note.kind);
        setTimeout(() => AudioEngine.flashKey(note.note), Settings.beatToSeconds(startOffsetBeats + note.time) * 1000);
      });
      if (els.autoHarmonyToggle?.checked) AudioEngine.scheduleHarmony(sequence, startOffsetBeats);
    },
    /** @param {any[]} sequence @param {number} startOffsetBeats */
    scheduleHarmony(sequence, startOffsetBeats) {
      const byBar = new Map();
      sequence.forEach((note) => {
        const bar = Math.floor(note.time / BAR_BEATS);
        if (!byBar.has(bar)) byBar.set(bar, []);
        byBar.get(bar).push(note);
      });
      byBar.forEach((notes, bar) => {
        const base = notes[0];
        if (!base) return;
        const harmonyMidi = Math.max(36, base.midi - 12);
        AudioEngine.playNote(MusicUtils.midiToName(harmonyMidi), Settings.beatToSeconds(startOffsetBeats + (bar * BAR_BEATS)), Settings.beatToSeconds(BAR_BEATS), 0.35, 'pad');
      });
    }
  };

  const Input = {
    createKeyboard() {
      if (!els.keyboard) return;
      els.keyboard.innerHTML = '';
      KEYBOARD_NOTES.forEach((note) => {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = note.includes('#') ? 'key black' : 'key';
        key.dataset.note = note;
        key.setAttribute('role', 'button');
        key.tabIndex = 0;
        key.setAttribute('aria-label', `${note} key`);
        key.textContent = note.replace(/\d/, '').replace('#', '♯');
        key.addEventListener('pointerdown', () => Input.triggerInput(note, 0.5, 0.8));
        key.addEventListener('keydown', (event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            Input.triggerInput(note, 0.5, 0.8);
          }
        });
        els.keyboard.appendChild(key);
      });
    },
    trimSeedToLiveBuffer() {
      const maxBars = Number(els.liveBufferSelect?.value || 8);
      const maxBeats = maxBars * BAR_BEATS;
      const totalBeats = state.seedNotes.reduce((max, note) => Math.max(max, note.time + note.duration), 0);
      if (totalBeats <= maxBeats) return;
      const trimBefore = totalBeats - maxBeats;
      state.seedNotes = state.seedNotes
        .map((note) => ({ ...note, time: note.time - trimBefore }))
        .filter((note) => note.time + note.duration > 0)
        .map((note) => ({ ...note, time: Math.max(0, note.time) }));
    },
    addSeed(noteName, duration = 0.5, velocity = 0.8) {
      const prev = state.seedNotes[state.seedNotes.length - 1];
      const time = prev ? prev.time + prev.duration : 0;
      state.seedNotes.push({ note: noteName, midi: MusicUtils.nameToMidi(noteName), time, duration, velocity, origin: 'seed', kind: 'note' });
      if (els.liveCaptureToggle?.checked) Input.trimSeedToLiveBuffer();
      Persistence.save();
    },
    async triggerInput(noteName, duration = 0.5, velocity = 0.8) {
      await AudioEngine.ensureAudio();
      AudioEngine.playNote(noteName, 0, Settings.beatToSeconds(duration), velocity, 'note');
      Input.addSeed(noteName, duration, velocity);
      AudioEngine.flashKey(noteName);
      App.updateUI();
    },
    demoSeed() {
      state.seedNotes = [
        { note: 'C4', midi: 60, time: 0, duration: 0.5, velocity: 0.82, origin: 'seed', kind: 'note' },
        { note: 'E4', midi: 64, time: 0.5, duration: 0.5, velocity: 0.84, origin: 'seed', kind: 'note' },
        { note: 'G4', midi: 67, time: 1.0, duration: 0.5, velocity: 0.86, origin: 'seed', kind: 'note' },
        { note: 'A4', midi: 69, time: 1.5, duration: 0.5, velocity: 0.81, origin: 'seed', kind: 'note' }
      ];
      Persistence.save();
      App.updateUI();
    },
    async connectMidi() {
      if (!navigator.requestMIDIAccess) return UI.setMidi('Unsupported');
      try {
        state.midiAccess = await navigator.requestMIDIAccess();
        let count = 0;
        state.midiAccess.inputs.forEach((input) => {
          count += 1;
          input.onmidimessage = async (event) => {
            const [status, pitch, velocity] = event.data || [];
            if (status === 144 && velocity > 0) await Input.triggerInput(MusicUtils.midiToName(pitch), 0.5, velocity / 127);
          };
        });
        UI.setMidi(count ? `${count} input${count > 1 ? 's' : ''}` : 'No device');
      } catch (error) {
        console.error(error);
        UI.setMidi('Denied');
      }
    },
    autoCorrelate(buffer, sampleRate) {
      let rms = 0;
      for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
      rms = Math.sqrt(rms / buffer.length);
      if (rms < 0.01) return null;
      let bestOffset = -1;
      let bestCorrelation = 0;
      const minSamples = Math.floor(sampleRate / 1000);
      const maxSamples = Math.floor(sampleRate / 80);
      for (let offset = minSamples; offset <= maxSamples; offset += 1) {
        let correlation = 0;
        for (let i = 0; i < buffer.length - offset; i += 1) correlation += Math.abs(buffer[i] - buffer[i + offset]);
        correlation = 1 - (correlation / (buffer.length - offset));
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      }
      if (bestOffset === -1 || bestCorrelation < 0.88) return null;
      return sampleRate / bestOffset;
    },
    processMicFrame() {
      if (!state.micIsCapturing || !state.micAnalyser) return;
      const analyser = state.micAnalyser;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      const frequency = Input.autoCorrelate(data, state.audioContext ? state.audioContext.sampleRate : 44100);
      if (frequency && frequency > 70 && frequency < 1000) {
        const midi = Math.max(36, Math.min(84, Math.round(69 + (12 * Math.log2(frequency / 440)))));
        if (state.micPendingMidi === midi) state.micStableFrames += 1;
        else {
          state.micPendingMidi = midi;
          state.micStableFrames = 1;
        }
        const now = performance.now();
        const enoughGap = now - state.micLastCaptureTs > 240;
        const changedPitch = state.micLastCapturedMidi == null || Math.abs(midi - state.micLastCapturedMidi) >= 1;
        if (state.micStableFrames >= 3 && enoughGap && changedPitch) {
          Input.addSeed(MusicUtils.midiToName(midi), 0.5, 0.72);
          state.micLastCaptureTs = now;
          state.micLastCapturedMidi = midi;
          UI.setMic(`Mic ${MusicUtils.niceNote(MusicUtils.midiToName(midi).replace(/\d+/g, ''))}`);
          App.updateUI();
        }
      }
      state.micFrame = window.requestAnimationFrame(Input.processMicFrame);
    },
    async toggleMicCapture() {
      if (state.micIsCapturing) {
        if (state.micFrame) window.cancelAnimationFrame(state.micFrame);
        state.micFrame = null;
        if (state.micSource) {
          try { state.micSource.disconnect(); } catch (error) { console.warn(error); }
        }
        if (state.micStream) state.micStream.getTracks().forEach((track) => track.stop());
        state.micSource = null;
        state.micAnalyser = null;
        state.micStream = null;
        state.micIsCapturing = false;
        state.micPendingMidi = null;
        state.micStableFrames = 0;
        state.micLastCapturedMidi = null;
        if (els.micCaptureBtn) els.micCaptureBtn.textContent = '◉ Hum';
        UI.setMic('Mic off');
        UI.setStatus('Mic stopped');
        return;
      }
      try {
        await AudioEngine.ensureAudio();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        state.micStream = stream;
        state.micSource = state.audioContext.createMediaStreamSource(stream);
        state.micAnalyser = state.audioContext.createAnalyser();
        state.micAnalyser.fftSize = 2048;
        state.micAnalyser.smoothingTimeConstant = 0.2;
        state.micSource.connect(state.micAnalyser);
        state.micIsCapturing = true;
        state.micPendingMidi = null;
        state.micStableFrames = 0;
        state.micLastCaptureTs = 0;
        state.micLastCapturedMidi = null;
        if (els.micCaptureBtn) els.micCaptureBtn.textContent = '■ Stop';
        UI.setMic('Mic on');
        UI.setStatus('Listening for hum');
        Input.processMicFrame();
      } catch (error) {
        console.error(error);
        UI.setMic('Mic denied');
        UI.setStatus('Mic unavailable');
      }
    }
  };

  /* ==========================================================
   * 7. MUSICVAE LOADING, CLIP GENERATION, AND VARIATIONS
   * ========================================================== */

  const Engine = {
    clipRootNotes(clip) {
      const ordered = [...new Set((clip?.notes || []).filter((note) => note.kind !== 'drum').sort((a, b) => a.time - b.time).slice(0, 8).map((note) => MusicUtils.niceNote(note.note.replace(/\d+/g, ''))))];
      return ordered;
    },
    sendClipToCompanion(clipId) {
      const clip = state.resultClips.find((result) => result.id === clipId);
      if (!clip) return;
      const roots = Engine.clipRootNotes(clip);
      state.companionRoots = roots;
      state.companionClipId = clip.id;
      const voicings = [
        `Root shell: ${roots.slice(0, 3).join(' – ') || 'C – E – G'}`,
        `1st inversion: ${roots.slice(1).concat(roots[0] || []).slice(0, Math.max(roots.length, 3)).join(' – ') || 'E – G – C'}`,
        `Spread voicing: ${(roots[0] || 'C')} – ${(roots[2] || roots[0] || 'G')} – ${(roots[1] || 'E')}`
      ];
      UI.setCompanion(`Clip ${clip.name}\n\nRoots: ${roots.join(', ') || 'No pitched notes'}\n\nTry these on PianoCompanion:\n• ${voicings.join('\n• ')}`, 'Clip sent');
      try {
        const params = new URLSearchParams({ roots: roots.join(','), bpm: String(Settings.bpm()), scale: String(els.scaleSelect?.value || 'major') });
        window.open(`./pianocompanion.html?${params.toString()}`, '_blank', 'noopener');
      } catch (error) {
        console.warn(error);
      }
    },
    baseSeed() {
      if (state.seedNotes.length) return state.seedNotes.slice();
      Input.demoSeed();
      return state.seedNotes.slice();
    },
    summarizeBar(notesInBar) {
      if (!notesInBar.length) return { chord: '—', notes: 'Rest', glyphs: '𝄽' };
      const noteNames = [...new Set(notesInBar.slice(0, 4).map((note) => MusicUtils.niceNote(note.note.replace(/\d+/g, ''))))];
      const glyphs = notesInBar.slice(0, 4).map((n) => MusicUtils.noteGlyph(n.duration)).join('');
      return { chord: '', notes: noteNames.join(' · '), glyphs };
    },
    attachBarMeta(clip) {
      const meta = [];
      for (let bar = 0; bar < clip.bars; bar += 1) {
        const start = bar * BAR_BEATS;
        const end = start + BAR_BEATS;
        const notes = clip.notes.filter((n) => n.time >= start && n.time < end);
        const summary = Engine.summarizeBar(notes);
        summary.chord = Settings.progressionChordLabel(bar);
        meta.push(summary);
      }
      clip.barMeta = meta;
      return clip;
    },
    buildClip(name, engine, bars, notes, kind, lane) {
      const clip = Engine.attachBarMeta({
        id: `clip-${state.nextClipId++}`,
        name,
        engine,
        bars,
        notes,
        kind,
        lane: lane || 'melody'
      });
      state.postGenerateHooks.forEach((hook) => {
        try { hook(clip, state); } catch (error) { console.warn(error); }
      });
      return clip;
    },
    generateTheoryForBars(bars, sectionOffset = 0, registerShift = 0) {
      const root = String(els.rootSelect?.value || 'C');
      const scaleName = String(els.scaleSelect?.value || 'major');
      const style = String(els.styleSelect?.value || 'balanced');
      const freedom = Number(els.temperatureRange?.value || 42) / 100;
      const seed = Engine.baseSeed();
      const stepBeats = Settings.currentStep(seed);
      const octaves = [4 + registerShift, 5 + registerShift].filter((oct) => oct >= 2 && oct <= 7);
      const scalePool = MusicUtils.midiPool(root, scaleName, octaves);
      const noteCount = Math.max(2, Math.round((bars * BAR_BEATS) / stepBeats));
      let lastMidi = (seed[seed.length - 1] ? seed[seed.length - 1].midi : 60) + (registerShift * 3);
      let time = 0;
      const out = [];
      for (let i = 0; i < noteCount; i += 1) {
        const absoluteBar = Math.floor(time / BAR_BEATS) + sectionOffset;
        const symbol = Settings.progressionSymbols()[absoluteBar % Settings.progressionSymbols().length] || 'I';
        const chordPool = Settings.progressionToChordPool(symbol);
        const styled = lastMidi + MusicUtils.styleShift(style, i + sectionOffset) * (style === 'ambient' ? 1 : 2);
        const useChord = Math.random() > freedom * 0.35;
        const pool = useChord && chordPool.length ? chordPool : scalePool;
        const midi = MusicUtils.nearest(styled, pool, Math.max(1, 1 + Math.round(freedom * 4)));
        const duration = Math.max(0.25, Math.min(2, stepBeats * (style === 'ambient' ? 1.1 : 0.8)));
        const velocity = Math.min(0.95, 0.6 + Math.random() * 0.22);
        out.push({ note: MusicUtils.midiToName(midi), midi, time, duration, velocity, origin: 'generated', kind: 'note' });
        lastMidi = midi;
        time += stepBeats;
      }
      return out;
    },
    generateDrumGroove(bars) {
      const freedom = Number(els.temperatureRange?.value || 42) / 100;
      const notes = [];
      for (let bar = 0; bar < bars; bar += 1) {
        const base = bar * BAR_BEATS;
        [0, 2].forEach((beat) => notes.push({ note: 'C2', midi: 36, time: base + beat, duration: 0.35, velocity: 0.82, origin: 'generated', kind: 'drum' }));
        [1, 3].forEach((beat) => notes.push({ note: 'D2', midi: 38, time: base + beat, duration: 0.28, velocity: 0.65, origin: 'generated', kind: 'drum' }));
        [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((beat, i) => {
          if (Math.random() > freedom * 0.18 || i % 2 === 0) notes.push({ note: 'F#2', midi: 42, time: base + beat, duration: 0.12, velocity: 0.42, origin: 'generated', kind: 'drum' });
        });
      }
      return notes;
    },
    async getMusicVAE(modelKey) {
      if (state.modelInstances[modelKey]) return state.modelInstances[modelKey];
      if (!window.mm || !window.mm.MusicVAE) throw new Error('Magenta unavailable');
      const model = new window.mm.MusicVAE(MODEL_CONFIG[modelKey]);
      UI.setProgress(5, 'Model load');
      let pct = 5;
      const timer = setInterval(() => {
        pct = Math.min(92, pct + 6);
        UI.setProgress(pct, 'Model load');
      }, 220);
      try {
        await model.initialize();
        UI.setProgress(100, 'Model ready');
      } finally {
        clearInterval(timer);
      }
      state.modelInstances[modelKey] = model;
      return model;
    },
    snapToScale(midi, root, scaleName) {
      return MusicUtils.nearest(midi, MusicUtils.midiPool(root, scaleName, [3,4,5,6]), 2);
    },
    toNoteSequence(seedNotes) {
      return {
        notes: seedNotes.map((note) => ({ pitch: note.midi, startTime: note.time, endTime: note.time + note.duration, velocity: Math.round((note.velocity || 0.8) * 127) })),
        totalTime: seedNotes.reduce((max, note) => Math.max(max, note.time + note.duration), 0)
      };
    },
    async generateWithMagenta(modelKey, bars, seedOverride = null) {
      UI.setStatus('Loading model…');
      const model = await Engine.getMusicVAE(modelKey);
      UI.setStatus('Sampling');
      const freedom = Number(els.temperatureRange?.value || 42) / 100;
      const temp = 0.7 + freedom * 0.8;
      const sample = seedOverride && seedOverride.length && model.interpolate
        ? await model.interpolate([Engine.toNoteSequence(seedOverride), Engine.toNoteSequence(seedOverride)], 1, temp)
        : await model.sample(1, temp);
      const sequence = sample && sample[0];
      if (!sequence || !sequence.notes || !sequence.notes.length) throw new Error('Model returned empty sequence');
      const root = String(els.rootSelect?.value || 'C');
      const scaleName = String(els.scaleSelect?.value || 'major');
      const notes = sequence.notes.map((note) => ({
        midi: Engine.snapToScale(note.pitch || 60, root, scaleName),
        time: note.startTime || 0,
        duration: Math.max(0.25, (note.endTime || ((note.startTime || 0) + 0.4)) - (note.startTime || 0)),
        velocity: Math.max(0.55, Math.min(0.95, ((note.velocity || 90) / 127))),
        origin: 'generated',
        kind: 'note'
      })).sort((a, b) => a.time - b.time);
      const first = notes[0]?.time || 0;
      return notes.slice(0, Math.max(16, bars * 8)).map((note) => ({ ...note, time: note.time - first, note: MusicUtils.midiToName(note.midi) }));
    },
    async generateVariationForTrack(trackIndex) {
      const bar = Arranger.currentPlayheadBar();
      const slot = state.arrangement[trackIndex]?.[bar] || state.arrangement[trackIndex]?.find((entry) => entry && entry.offsetBar === 0);
      if (!slot) return UI.setStatus('No clip on that track');
      const sourceClip = state.resultClips.find((result) => result.id === slot.clipId);
      if (!sourceClip) return UI.setStatus('Track clip missing');
      const engine = String(els.engineSelect?.value || 'theory');
      const originalSeed = state.seedNotes.slice();
      try {
        state.seedNotes = sourceClip.notes.map((note) => ({ ...note, time: note.time - ((slot.offsetBar || 0) * BAR_BEATS), origin: 'seed' }));
        const notes = engine === 'theory' ? Engine.generateTheoryForBars(sourceClip.bars, slot.startBar || 0) : await Engine.generateWithMagenta(engine, sourceClip.bars, state.seedNotes);
        const clip = Engine.buildClip(`Variation · T${trackIndex + 1} · ${state.resultClips.length + 1}`, engine, sourceClip.bars, notes, sourceClip.kind, sourceClip.lane);
        state.resultClips.unshift(clip);
        Arranger.placeClip(clip.id, trackIndex, slot.startBar || 0);
        UI.setStatus(`Variation swapped on ${TRACK_LABELS[trackIndex]}`);
      } catch (error) {
        console.error(error);
        UI.setStatus('Variation fallback');
      } finally {
        state.seedNotes = originalSeed;
        Persistence.save();
        App.updateUI();
      }
    },
    fillProgression(trackIndex = 0) {
      for (let bar = 0; bar < state.arrangementBars; bar += 1) {
        if (state.arrangement[trackIndex][bar]) continue;
        const notes = Engine.generateTheoryForBars(1, bar);
        const clip = Engine.buildClip(`Prog ${bar + 1}`, 'theory', 1, notes, 'clip', 'melody');
        state.resultClips.unshift(clip);
        Arranger.placeClip(clip.id, trackIndex, bar);
      }
      UI.setStatus('Progression filled');
      Persistence.save();
      App.updateUI();
    },
    async generateClip() {
      try {
        await AudioEngine.ensureAudio();
        const bars = Number(els.barsSelect?.value || 4);
        const engine = String(els.engineSelect?.value || 'theory');
        const notes = engine === 'theory' ? Engine.generateTheoryForBars(bars) : await Engine.generateWithMagenta(engine, bars);
        const label = engine === 'theory' ? 'Theory' : engine === 'musicvae-2bar' ? 'VAE 2' : 'VAE 4';
        const clip = Engine.buildClip(`${label} · ${state.resultClips.length + 1}`, engine, bars, notes, 'clip', 'melody');
        state.resultClips.unshift(clip);
        if (els.modeReadout) els.modeReadout.textContent = label;
        UI.setStatus('Clip ready');
      } catch (error) {
        console.error(error);
        const bars = Number(els.barsSelect?.value || 4);
        const clip = Engine.buildClip(`Theory · ${state.resultClips.length + 1}`, 'theory', bars, Engine.generateTheoryForBars(bars), 'clip', 'melody');
        state.resultClips.unshift(clip);
        if (els.modeReadout) els.modeReadout.textContent = 'Theory';
        UI.setStatus('Theory fallback');
      } finally {
        Persistence.save();
        App.updateUI();
      }
    },
    async generateDrums() {
      let notes;
      const bars = Number(els.barsSelect?.value || 4);
      try {
        notes = await Engine.generateWithMagenta('groovae-2bar', Math.max(2, bars));
        notes = notes.map((note, index) => {
          const lane = index % 3;
          const mapping = [36, 38, 42][lane];
          return { ...note, midi: mapping, note: MusicUtils.midiToName(mapping), kind: 'drum', duration: Math.min(0.4, note.duration) };
        });
      } catch (error) {
        console.warn(error);
        notes = Engine.generateDrumGroove(bars);
      }
      const clip = Engine.buildClip(`Drums · ${state.resultClips.length + 1}`, 'drums', bars, notes, 'clip', 'drums');
      state.resultClips.unshift(clip);
      const slot = Arranger.firstOpenSlot(clip.bars, 3);
      Arranger.placeClip(clip.id, slot.t, slot.b);
      UI.setStatus('Drum groove ready');
      Persistence.save();
      App.updateUI();
    },
    async generateFullTrack() {
      await AudioEngine.ensureAudio();
      const bars = Number(els.trackBarsSelect?.value || 16);
      if (bars !== state.arrangementBars) Arranger.resizeArrangement(bars);
      const style = String(els.styleSelect?.value || 'balanced');
      const sections = [];
      const sectionPlan = bars <= 8 ? [bars] : bars <= 16 ? [4,4,4,bars - 12] : [4,4,8,8,Math.max(0, bars - 24)].filter(Boolean);
      let cursor = 0;
      sectionPlan.forEach((len, index) => {
        const shift = index % 3 === 0 ? 0 : index % 3 === 1 ? 1 : -1;
        const notes = Engine.generateTheoryForBars(len, cursor, shift);
        notes.forEach((note) => sections.push({ ...note, time: note.time + (cursor * BAR_BEATS) }));
        cursor += len;
      });
      if (style === 'ambient') sections.forEach((note, index) => { if (index % 5 === 0) note.duration = Math.min(2.5, note.duration * 1.5); });
      const clip = Engine.buildClip(`Full Track · ${bars} bars`, 'theory', bars, sections, 'track', 'melody');
      state.resultClips.unshift(clip);
      Arranger.placeClip(clip.id, 0, 0);
      if (!state.arrangement[3].some(Boolean)) {
        const drums = Engine.buildClip(`Drums · ${bars} bars`, 'drums', bars, Engine.generateDrumGroove(bars), 'track', 'drums');
        state.resultClips.unshift(drums);
        Arranger.placeClip(drums.id, 3, 0);
      }
      if (els.modeReadout) els.modeReadout.textContent = 'Full Track';
      UI.setStatus('Full track ready');
      Lyrics.suggest();
      Persistence.save();
      App.updateUI();
    }
  };

  /* ==========================================================
   * 8. LYRICS, ARRANGEMENT LOGIC, AND CLIP RENDERING
   * ========================================================== */

  const Lyrics = {
    suggest() {
      const chordWords = {
        I: ['home', 'light', 'gold'], IV: ['open', 'wide', 'sky'], V: ['rise', 'fire', 'fall'], vi: ['shadow', 'memory', 'night'],
        ii: ['motion', 'river', 'turn'], i: ['echo', 'stone', 'dream'], VI: ['horizon', 'glow', 'breath'], III: ['signal', 'silver', 'rain'], VII: ['distance', 'pulse', 'storm']
      };
      const symbols = Settings.progressionSymbols();
      const lines = [];
      for (let i = 0; i < 4; i += 1) {
        const symbol = symbols[i % symbols.length] || 'I';
        const bank = chordWords[symbol] || ['sound', 'shape', 'time'];
        const phrase = `${bank[0]} ${bank[1]} ${bank[2]}`;
        lines.push(`${Settings.progressionChordLabel(i)} — ${phrase}`);
      }
      const text = lines.join('\n');
      if (els.lyricsBox) els.lyricsBox.textContent = text;
      Persistence.save();
      return text;
    },
    speak() {
      const text = String(els.lyricsBox?.textContent || '').trim();
      if (!text || text === 'No lyrics suggested yet.') return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    }
  };

  const Arranger = {
    resizeArrangement(bars) {
      state.arrangementBars = bars;
      state.arrangement = Array.from({ length: TRACKS }, (_, trackIndex) => {
        const existing = state.arrangement[trackIndex] || [];
        const next = Array(bars).fill(null);
        for (let i = 0; i < Math.min(bars, existing.length); i += 1) next[i] = existing[i];
        return next;
      });
      Persistence.save();
      Arranger.renderArrangement();
    },
    clearArrangement() {
      state.arrangement = Array.from({ length: TRACKS }, () => Array(state.arrangementBars).fill(null));
      Persistence.save();
      Arranger.renderArrangement();
    },
    removeClipFromArrangement(trackIndex, barIndex) {
      const slot = state.arrangement[trackIndex][barIndex];
      if (!slot) return;
      for (let i = 0; i < state.arrangementBars; i += 1) {
        const current = state.arrangement[trackIndex][i];
        if (current && current.clipId === slot.clipId && current.startBar === slot.startBar) state.arrangement[trackIndex][i] = null;
      }
      Persistence.save();
      Arranger.renderArrangement();
    },
    placeClip(clipId, trackIndex, startBar) {
      const clip = state.resultClips.find((result) => result.id === clipId);
      if (!clip) return false;
      if (startBar + clip.bars > state.arrangementBars) return false;
      for (let i = 0; i < clip.bars; i += 1) state.arrangement[trackIndex][startBar + i] = null;
      for (let i = 0; i < clip.bars; i += 1) state.arrangement[trackIndex][startBar + i] = { clipId, startBar, offsetBar: i };
      const nextBar = startBar + clip.bars;
      state.liveCaptureSuggestedBar = nextBar - 1;
      state.lastSuggestedTrack = trackIndex;
      UI.setStatus(nextBar < state.arrangementBars ? `Next chord suggestion: ${Settings.progressionChordLabel(nextBar)}` : 'Clip placed');
      Persistence.save();
      Arranger.renderArrangement();
      return true;
    },
    firstOpenSlot(barsNeeded, preferredTrack) {
      const trackOrder = preferredTrack != null ? [preferredTrack, ...[0,1,2,3].filter((t) => t !== preferredTrack)] : [0,1,2,3];
      for (const trackIndex of trackOrder) {
        for (let bar = 0; bar <= state.arrangementBars - barsNeeded; bar += 1) {
          let free = true;
          for (let i = 0; i < barsNeeded; i += 1) if (state.arrangement[trackIndex][bar + i]) free = false;
          if (free) return { t: trackIndex, b: bar };
        }
      }
      return { t: preferredTrack ?? 0, b: 0 };
    },
    flattenArrangementSequence() {
      const merged = [];
      state.arrangement.forEach((track) => {
        track.forEach((slot, barIndex) => {
          if (!slot || slot.offsetBar !== 0) return;
          const clip = state.resultClips.find((result) => result.id === slot.clipId);
          if (!clip) return;
          clip.notes.forEach((note) => merged.push({ ...note, time: note.time + (barIndex * BAR_BEATS) }));
        });
      });
      return merged;
    },
    async playClip(clipId) {
      const clip = state.resultClips.find((result) => result.id === clipId);
      if (!clip) return;
      await AudioEngine.ensureAudio();
      AudioEngine.scheduleSequence(clip.notes, 0);
      UI.setStatus(`Playing ${clip.name}`);
    },
    async playSeed() {
      if (!state.seedNotes.length) return;
      await AudioEngine.ensureAudio();
      AudioEngine.scheduleSequence(state.seedNotes, 0);
      UI.setStatus('Playing seed');
    },
    stopTransportTimers() {
      state.transportTimeouts.forEach((timeout) => clearTimeout(timeout));
      state.transportTimeouts = [];
    },
    currentPlayheadBar() {
      if (!state.arrangementIsPlaying || !state.arrangementStartedAt) return 0;
      const elapsedSeconds = (performance.now() - state.arrangementStartedAt) / 1000;
      const elapsedBeats = elapsedSeconds / Settings.beatToSeconds(1);
      return Math.max(0, Math.min(state.arrangementBars - 1, Math.floor(elapsedBeats / BAR_BEATS)));
    },
    async playArrangement() {
      await AudioEngine.ensureAudio();
      if (state.arrangementIsPlaying && !state.arrangementPaused) {
        await state.audioContext?.suspend();
        state.arrangementPaused = true;
        UI.setStatus('Arrangement paused');
        App.updateUI();
        return;
      }
      if (state.arrangementIsPlaying && state.arrangementPaused) {
        await state.audioContext?.resume();
        state.arrangementPaused = false;
        UI.setStatus('Arrangement resumed');
        App.updateUI();
        return;
      }
      Arranger.stopTransportTimers();
      const seenStarts = new Set();
      let totalBeats = 0;
      state.arrangement.forEach((track) => {
        track.forEach((slot, barIndex) => {
          if (!slot || slot.offsetBar !== 0) return;
          const key = `${slot.clipId}:${barIndex}`;
          if (seenStarts.has(key)) return;
          seenStarts.add(key);
          const clip = state.resultClips.find((result) => result.id === slot.clipId);
          if (!clip) return;
          totalBeats = Math.max(totalBeats, (barIndex * BAR_BEATS) + (clip.bars * BAR_BEATS));
          AudioEngine.scheduleSequence(clip.notes, barIndex * BAR_BEATS);
        });
      });
      state.transportTotalBeats = totalBeats;
      state.arrangementIsPlaying = true;
      state.arrangementPaused = false;
      state.arrangementStartedAt = performance.now();
      state.transportTimeouts.push(window.setTimeout(() => {
        state.arrangementIsPlaying = false;
        state.arrangementPaused = false;
        UI.setStatus('Arrangement complete');
        App.updateUI();
      }, Math.max(500, Settings.beatToSeconds(totalBeats || BAR_BEATS) * 1000)));
      UI.setStatus('Playing arrangement');
      App.updateUI();
      Arranger.setLiveMode();
    },
    setLiveMode() {
      if (state.liveTimer) {
        clearTimeout(state.liveTimer);
        state.liveTimer = null;
      }
      if (!els.liveModeToggle?.checked) return;
      const waitMs = Math.max(2000, Settings.beatToSeconds(BAR_BEATS * 4) * 1000);
      state.liveTimer = window.setTimeout(async () => {
        const slot = Arranger.firstOpenSlot(Number(els.barsSelect?.value || 4), 1);
        await Engine.generateClip();
        const latest = state.resultClips[0];
        if (latest) Arranger.placeClip(latest.id, slot.t, slot.b);
      }, waitMs);
    },
    renderSeed() {
      if (!els.seedList) return;
      els.seedList.innerHTML = '';
      if (!state.seedNotes.length) {
        els.seedList.innerHTML = '<div class="empty-state">No seed captured yet.</div>';
        return;
      }
      state.seedNotes.forEach((note, index) => {
        const row = document.createElement('div');
        row.className = 'seed-row';
        row.innerHTML = `<strong>${index + 1}</strong><div>${MusicUtils.niceNote(note.note)}<br><span>${note.time.toFixed(2)} beat · ${note.duration.toFixed(2)} beat</span></div><div>${Math.round(note.velocity * 100)}%</div>`;
        els.seedList.appendChild(row);
      });
    },
    renderResults() {
      if (!els.resultsList) return;
      els.resultsList.innerHTML = '';
      if (!state.resultClips.length) {
        els.resultsList.innerHTML = '<div class="empty-state">Generate a clip, drum groove, or full track to create playable results.</div>';
        return;
      }
      state.resultClips.forEach((clip) => {
        const card = document.createElement('div');
        card.className = 'clip-card';
        card.draggable = true;
        card.dataset.clipId = clip.id;
        card.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', clip.id));
        const preview = clip.notes.slice(0, 20).map((note) => `<div class="clip-bar" style="height:${10 + ((note.midi - 36) % 24) * 1.2}px"></div>`).join('');
        const metaStrip = clip.barMeta.slice(0, Math.min(clip.barMeta.length, 4)).map((meta) => `<span>${meta.chord} · ${meta.notes || 'Rest'} · ${meta.glyphs}</span>`).join('');
        card.innerHTML = `
          <div class="clip-top">
            <div>
              <div class="clip-name">${clip.name}</div>
              <div class="clip-meta">${clip.notes.length} notes · ${clip.bars} bars · ${clip.kind === 'track' ? 'full track' : clip.lane}</div>
            </div>
            <div class="clip-meta">${Settings.bpm()} BPM</div>
          </div>
          <div class="clip-preview">${preview}</div>
          <div class="clip-strip">${metaStrip}</div>
          <div class="clip-actions">
            <button class="btn play-clip">▷ Play</button>
            <button class="btn add-clip">＋ Add to arrangement</button>
            <button class="btn small-btn send-companion">↗ Send to PianoCompanion</button>
          </div>`;
        card.querySelector('.play-clip')?.addEventListener('click', () => Arranger.playClip(clip.id));
        card.querySelector('.send-companion')?.addEventListener('click', () => Engine.sendClipToCompanion(clip.id));
        card.querySelector('.add-clip')?.addEventListener('click', () => {
          const preferredTrack = clip.lane === 'drums' ? 3 : 0;
          const slot = Arranger.firstOpenSlot(clip.bars, preferredTrack);
          Arranger.placeClip(clip.id, slot.t, slot.b);
        });
        els.resultsList.appendChild(card);
      });
    },
    renderArrangement() {
      if (!els.arrangementGrid) return;
      els.arrangementGrid.innerHTML = '';
      if (els.arrangementMeta) els.arrangementMeta.textContent = `Bottom timeline · ${TRACKS} tracks · ${state.arrangementBars} bars`;
      els.arrangementGrid.style.gridTemplateColumns = `120px repeat(${state.arrangementBars}, minmax(90px, 1fr))`;
      for (let trackIndex = 0; trackIndex < TRACKS; trackIndex += 1) {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.style.gridTemplateColumns = `120px repeat(${state.arrangementBars}, minmax(90px, 1fr))`;
        const nextChord = Settings.progressionChordLabel((state.liveCaptureSuggestedBar ?? trackIndex) + 1);
        row.innerHTML = `<div class="track-label"><div class="track-label-main">${TRACK_LABELS[trackIndex]}</div><div class="track-label-actions"><button class="btn track-variation">→ Generate Variation</button></div><div class="track-label-suggestion"><div class="track-next">Next chord: ${nextChord}</div><button class="btn track-fill">Fill Progression</button></div></div>`;
        row.querySelector('.track-variation')?.addEventListener('click', () => Engine.generateVariationForTrack(trackIndex));
        row.querySelector('.track-fill')?.addEventListener('click', () => Engine.fillProgression(trackIndex === 3 ? 0 : trackIndex));
        for (let barIndex = 0; barIndex < state.arrangementBars; barIndex += 1) {
          const cell = document.createElement('div');
          cell.className = 'bar-cell';
          cell.innerHTML = `<div class="bar-num">Bar ${barIndex + 1}</div>`;
          cell.addEventListener('dragover', (event) => { event.preventDefault(); cell.classList.add('drag-over'); });
          cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
          cell.addEventListener('drop', (event) => {
            event.preventDefault();
            cell.classList.remove('drag-over');
            const clipId = event.dataTransfer?.getData('text/plain');
            if (clipId) Arranger.placeClip(clipId, trackIndex, barIndex);
          });
          const slot = state.arrangement[trackIndex][barIndex];
          if (slot) {
            const clip = state.resultClips.find((result) => result.id === slot.clipId);
            if (clip) {
              const meta = clip.barMeta[slot.offsetBar] || { chord:'—', notes:'Rest', glyphs:'𝄽' };
              const item = document.createElement('div');
              item.className = `cell-clip ${slot.offsetBar === 0 ? 'is-start' : 'is-continuation'}`;
              item.innerHTML = `
                <div class="cell-name">${slot.offsetBar === 0 ? clip.name : '↳ Continue'}</div>
                <div class="cell-meta chord">${meta.chord}</div>
                <div class="cell-meta notes">${meta.notes}</div>
                <div class="cell-meta glyphs">${meta.glyphs}</div>
                ${slot.offsetBar === 0 ? `<div class="cell-actions"><button class="btn cell-play">▷</button><button class="btn cell-remove">–</button></div>` : ''}`;
              if (slot.offsetBar === 0) {
                item.querySelector('.cell-play')?.addEventListener('click', () => Arranger.playClip(clip.id));
                item.querySelector('.cell-remove')?.addEventListener('click', () => Arranger.removeClipFromArrangement(trackIndex, barIndex));
              }
              cell.appendChild(item);
            }
          }
          row.appendChild(cell);
        }
        els.arrangementGrid.appendChild(row);
      }
    }
  };

  /* ==========================================================
   * 9. EXPORTS, SHARE LINKS, AND APP BOOTSTRAP
   * ========================================================== */

  const Exporter = {
    varLen(n) {
      let buffer = n & 0x7F;
      const bytes = [];
      while ((n >>= 7)) { buffer <<= 8; buffer |= ((n & 0x7F) | 0x80); }
      while (true) { bytes.push(buffer & 0xFF); if (buffer & 0x80) buffer >>= 8; else break; }
      return bytes;
    },
    buildMidiFile(sequence) {
      const ticksPerBeat = 480;
      const tempo = Math.round(60000000 / Settings.bpm());
      const ordered = sequence.slice().sort((a, b) => a.time - b.time);
      const events = [];
      ordered.forEach((note) => {
        const start = Math.round(note.time * ticksPerBeat);
        const end = Math.round((note.time + note.duration) * ticksPerBeat);
        const channel = note.kind === 'drum' ? 9 : 0;
        events.push({ tick: start, type: 'on', midi: note.midi, vel: Math.max(1, Math.min(127, Math.round((note.velocity || 0.8) * 127))), channel });
        events.push({ tick: end, type: 'off', midi: note.midi, vel: 0, channel });
      });
      events.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));
      const track = [];
      track.push(0x00, 0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF);
      let lastTick = 0;
      events.forEach((event) => {
        track.push(...Exporter.varLen(event.tick - lastTick));
        track.push((event.type === 'on' ? 0x90 : 0x80) + event.channel, event.midi, event.vel);
        lastTick = event.tick;
      });
      track.push(0x00, 0xFF, 0x2F, 0x00);
      const bytes = [];
      const pushStr = (str) => { for (let i = 0; i < str.length; i += 1) bytes.push(str.charCodeAt(i)); };
      const push32 = (n) => bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      const push16 = (n) => bytes.push((n >>> 8) & 255, n & 255);
      pushStr('MThd'); push32(6); push16(0); push16(1); push16(ticksPerBeat);
      pushStr('MTrk'); push32(track.length); bytes.push(...track);
      return new Uint8Array(bytes);
    },
    exportMidi() {
      const flattened = Arranger.flattenArrangementSequence();
      const sequence = flattened.length ? flattened : state.seedNotes.concat(...state.resultClips.map((clip) => clip.notes));
      if (!sequence.length) return alert('Nothing to export yet.');
      const file = Exporter.buildMidiFile(sequence);
      const blob = new Blob([file], { type: 'audio/midi' });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = 'ius-music-assistant-songwriter.mid';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 200);
    },
    exportSet() {
      const payload = {
        settings: Settings.snapshot(),
        seedNotes: state.seedNotes,
        resultClips: state.resultClips,
        arrangementBars: state.arrangementBars,
        arrangement: state.arrangement,
        nextClipId: state.nextClipId,
        lyrics: els.lyricsBox?.textContent || ''
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = 'ius-improv-set.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 300);
      const encoded = window.btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      const url = `${window.location.origin}${window.location.pathname}?set=${encoded}`;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).catch(() => console.warn('Clipboard unavailable'));
      window.history.replaceState({}, '', `?set=${encoded}`);
      UI.setStatus('Set exported + share link copied');
    },
    encodeWav(buffer) {
      const numChannels = buffer.numberOfChannels;
      const sampleRate = buffer.sampleRate;
      const length = buffer.length * numChannels * 2;
      const out = new ArrayBuffer(44 + length);
      const view = new DataView(out);
      const writeString = (offset, string) => { for (let i = 0; i < string.length; i += 1) view.setUint8(offset + i, string.charCodeAt(i)); };
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + length, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * 2, true);
      view.setUint16(32, numChannels * 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, length, true);
      let offset = 44;
      const channels = Array.from({ length: numChannels }, (_, i) => buffer.getChannelData(i));
      for (let i = 0; i < buffer.length; i += 1) {
        for (let c = 0; c < numChannels; c += 1) {
          const sample = Math.max(-1, Math.min(1, channels[c][i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          offset += 2;
        }
      }
      return new Blob([out], { type: 'audio/wav' });
    },
    async exportWav() {
      const sequence = Arranger.flattenArrangementSequence();
      const usable = sequence.length ? sequence : state.seedNotes;
      if (!usable.length) return alert('Nothing to render yet.');
      const durationBeats = usable.reduce((max, note) => Math.max(max, note.time + note.duration), 0) + 1;
      const durationSeconds = Settings.beatToSeconds(durationBeats);
      const sampleRate = 44100;
      const offline = new OfflineAudioContext(1, Math.ceil(durationSeconds * sampleRate), sampleRate);
      const master = offline.createGain();
      master.gain.value = 0.24;
      master.connect(offline.destination);
      usable.forEach((note) => {
        const start = Settings.beatToSeconds(note.time);
        const duration = Settings.beatToSeconds(note.duration);
        const midi = note.midi;
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const osc = offline.createOscillator();
        const gain = offline.createGain();
        osc.type = note.kind === 'drum' ? 'square' : 'triangle';
        osc.frequency.value = note.kind === 'drum' ? Math.max(60, freq / 8) : freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.02, (note.velocity || 0.7) * 0.12), start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(master);
        osc.start(start);
        osc.stop(start + duration + 0.03);
      });
      UI.setStatus('Rendering WAV');
      const buffer = await offline.startRendering();
      const blob = Exporter.encodeWav(buffer);
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = 'ius-music-assistant-songwriter.wav';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
      UI.setStatus('WAV exported');
    }
  };

  const App = {
    debounce(fn, wait = 120) {
      let timeout = 0;
      return (...args) => {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => fn(...args), wait);
      };
    },
    clearAll() {
      state.seedNotes = [];
      state.resultClips = [];
      Arranger.clearArrangement();
      if (els.lyricsBox) els.lyricsBox.textContent = 'No lyrics suggested yet.';
      UI.setStatus('Idle');
      Persistence.save();
      App.updateUI();
    },
    updateUI() {
      UI.syncLiveCaptureUI();
      if (els.playArrangementBtn) els.playArrangementBtn.textContent = state.arrangementIsPlaying && !state.arrangementPaused ? '⏸ Arrangement' : '▶ Arrangement';
      if (els.capturedCount) els.capturedCount.textContent = String(state.seedNotes.length);
      if (els.generatedCount) els.generatedCount.textContent = String(state.resultClips.length);
      if (els.scaleReadout) els.scaleReadout.textContent = `${ROOT_LABEL[String(els.rootSelect?.value || 'C')] || String(els.rootSelect?.value || 'C')} ${String(els.scaleSelect?.value || 'major')}`;
      Arranger.renderSeed();
      Arranger.renderResults();
      Arranger.renderArrangement();
      Persistence.save();
    },
    register() {
      els.themeSelect?.addEventListener('change', () => { UI.applyTheme(); Persistence.save(); });
      els.startAudioBtn?.addEventListener('click', () => AudioEngine.ensureAudio().catch(console.error));
      els.connectMidiBtn?.addEventListener('click', Input.connectMidi);
      els.seedDemoBtn?.addEventListener('click', Input.demoSeed);
      els.clearBtn?.addEventListener('click', App.clearAll);
      els.generateBtn?.addEventListener('click', Engine.generateClip);
      els.generateTrackBtn?.addEventListener('click', Engine.generateFullTrack);
      els.generateDrumsBtn?.addEventListener('click', Engine.generateDrums);
      els.suggestLyricsBtn?.addEventListener('click', () => Lyrics.suggest());
      els.speakLyricsBtn?.addEventListener('click', () => Lyrics.speak());
      els.playSeedBtn?.addEventListener('click', Arranger.playSeed);
      els.micCaptureBtn?.addEventListener('click', Input.toggleMicCapture);
      els.playArrangementBtn?.addEventListener('click', Arranger.playArrangement);
      els.clearArrangementBtn?.addEventListener('click', Arranger.clearArrangement);
      els.fillProgressionBtn?.addEventListener('click', () => Engine.fillProgression(0));
      els.exportSetBtn?.addEventListener('click', Exporter.exportSet);
      els.exportMidiBtn?.addEventListener('click', Exporter.exportMidi);
      els.exportWavBtn?.addEventListener('click', () => Exporter.exportWav().catch(console.error));

      [els.rootSelect, els.scaleSelect, els.engineSelect, els.playbackSelect, els.styleSelect, els.stepSelect, els.progressionSelect, els.barsSelect, els.autoHarmonyToggle, els.liveModeToggle, els.liveCaptureToggle, els.liveBufferSelect].forEach((el) => el?.addEventListener('change', App.updateUI));
      els.trackBarsSelect?.addEventListener('change', () => { Arranger.resizeArrangement(Number(els.trackBarsSelect.value)); App.updateUI(); });
      els.bpmInput?.addEventListener('input', App.debounce(App.updateUI, 100));
      els.temperatureRange?.addEventListener('input', App.debounce(Persistence.save, 100));
      window.addEventListener('beforeunload', Persistence.save);

      document.addEventListener('keydown', (event) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
        if (event.repeat) return;
        if (event.code === 'Space') {
          event.preventDefault();
          if (event.shiftKey) Arranger.playSeed();
          else Arranger.playArrangement();
          return;
        }
        const lower = event.key.toLowerCase();
        if (lower === 'g') return Engine.generateClip();
        if (lower === 't') return Engine.generateFullTrack();
        if (lower === 'd') return Engine.generateDrums();
        if (lower === 'l') return Lyrics.suggest();
        if (lower === 'h') return Input.toggleMicCapture();
        const note = KEYMAP[lower];
        if (note) Input.triggerInput(note, 0.5, 0.82);
      });
    },
    initPlugins() {
      state.postGenerateHooks.push((clip) => {
        if (clip.lane === 'drums') clip.name = clip.name.replace('Theory', 'Drums');
      });
      state.experimentalPlugins.push(() => 'lyrics');
    },
    init() {
      Persistence.load();
      Input.createKeyboard();
      UI.applyTheme();
      UI.populateShortcuts();
      App.initPlugins();
      Arranger.resizeArrangement(Number(els.trackBarsSelect?.value || state.arrangementBars || 16));
      App.register();
      UI.setProgress(0, 'Models');
      UI.setCompanion('Send a generated clip here to inspect root movement, chord shells, and inversion ideas while the arrangement keeps playing.', 'Waiting for clip');
      App.updateUI();
    }
  };

  App.init();
})();
