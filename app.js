(function () {
  const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ROOT_LABEL = { 'C#': 'C♯', 'D#': 'D♯', 'F#': 'F♯', 'G#': 'G♯', 'A#': 'A♯' };
  const NOTE_TO_SEMITONE = { C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11 };
  const SCALE_INTERVALS = {
    major: [0,2,4,5,7,9,11],
    minor: [0,2,3,5,7,8,10],
    dorian: [0,2,3,5,7,9,10],
    mixolydian: [0,2,4,5,7,9,10],
    blues: [0,3,5,6,7,10],
    pentatonic: [0,2,4,7,9],
  };
  const KEYBOARD_NOTES = ['C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5'];
  const KEYMAP = { a:'C4', w:'C#4', s:'D4', e:'D#4', d:'E4', f:'F4', t:'F#4', g:'G4', y:'G#4', h:'A4', u:'A#4', j:'B4', k:'C5' };
  const MODEL_CONFIG = {
    'musicvae-2bar': 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small',
    'musicvae-4bar': 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_4bar_med_q2',
  };

  const state = {
    audioContext: null,
    masterGain: null,
    soundfont: null,
    soundfontLoading: false,
    midiAccess: null,
    capturedNotes: [],
    generatedNotes: [],
    modelInstances: {},
  };

  const els = {
    rootSelect: document.getElementById('rootSelect'),
    scaleSelect: document.getElementById('scaleSelect'),
    engineSelect: document.getElementById('engineSelect'),
    playbackSelect: document.getElementById('playbackSelect'),
    styleSelect: document.getElementById('styleSelect'),
    stepSelect: document.getElementById('stepSelect'),
    progressionSelect: document.getElementById('progressionSelect'),
    barsSelect: document.getElementById('barsSelect'),
    temperatureRange: document.getElementById('temperatureRange'),
    statusPill: document.getElementById('statusPill'),
    midiPill: document.getElementById('midiPill'),
    capturedCount: document.getElementById('capturedCount'),
    generatedCount: document.getElementById('generatedCount'),
    modeReadout: document.getElementById('modeReadout'),
    scaleReadout: document.getElementById('scaleReadout'),
    timeline: document.getElementById('timeline'),
    keyboard: document.getElementById('keyboard'),
    startAudioBtn: document.getElementById('startAudioBtn'),
    connectMidiBtn: document.getElementById('connectMidiBtn'),
    seedDemoBtn: document.getElementById('seedDemoBtn'),
    clearBtn: document.getElementById('clearBtn'),
    generateBtn: document.getElementById('generateBtn'),
    playSeedBtn: document.getElementById('playSeedBtn'),
    playAllBtn: document.getElementById('playAllBtn'),
    exportMidiBtn: document.getElementById('exportMidiBtn'),
  };

  function setStatus(text) { els.statusPill.textContent = text; }
  function setMidi(text) { els.midiPill.textContent = text; }

  function midiToName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    const semitone = midi % 12;
    const root = ROOTS.find((r) => NOTE_TO_SEMITONE[r] === semitone) || 'C';
    return `${root}${octave}`;
  }

  function nameToMidi(name) {
    const m = /^([A-G]#?)(-?\d+)$/.exec(name);
    if (!m) return 60;
    return (Number(m[2]) + 1) * 12 + NOTE_TO_SEMITONE[m[1]];
  }

  function getScalePitchClasses(root, scale) {
    const rootPc = NOTE_TO_SEMITONE[root] ?? 0;
    const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.major;
    return intervals.map((n) => (rootPc + n) % 12);
  }

  function midiPool(root, scale, octaves) {
    const pcs = getScalePitchClasses(root, scale);
    const out = [];
    octaves.forEach((oct) => {
      pcs.forEach((pc) => out.push((oct + 1) * 12 + pc));
    });
    return out;
  }

  function nearest(target, pool, windowSize) {
    const sorted = pool.slice().sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    return sorted[Math.floor(Math.random() * Math.max(1, Math.min(windowSize, sorted.length)))];
  }

  function styleShift(style, i) {
    const patterns = {
      balanced: [0, 2, -1, 1],
      arpeggio: [0, 2, 4, 2],
      jazzy: [0, 1, -2, 3],
      ambient: [0, -1, 2, -3],
    };
    const p = patterns[style] || patterns.balanced;
    return p[i % p.length];
  }

  function progressionToChordPools(root, scaleName, progression) {
    const isMinorFamily = ['minor', 'dorian', 'blues'].includes(scaleName);
    const scaleMajor = midiPool(root, isMinorFamily ? 'minor' : 'major', [4, 5]);
    const degrees = progression.split('-').map((s) => s.trim());
    const map = { I:0, ii:1, III:2, iii:2, IV:3, V:4, vi:5, VI:5, VII:6, i:0, iv:3, v:4 };
    const pcs = getScalePitchClasses(root, isMinorFamily ? 'minor' : 'major');
    return degrees.map((symbol) => {
      const degreeIndex = map[symbol] ?? 0;
      const triad = [0, 2, 4].map((jump) => pcs[(degreeIndex + jump) % pcs.length]);
      return scaleMajor.filter((m) => triad.includes(m % 12));
    });
  }

  async function ensureAudio() {
    if (!state.audioContext) {
      const AC = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AC();
      state.masterGain = state.audioContext.createGain();
      state.masterGain.gain.value = 0.18;
      state.masterGain.connect(state.audioContext.destination);
    }
    if (state.audioContext.state !== 'running') await state.audioContext.resume();
    setStatus('Audio ready');
    if (els.playbackSelect.value === 'soundfont') {
      await loadSoundfont();
    }
  }

  async function loadSoundfont() {
    if (state.soundfont || state.soundfontLoading || !window.Soundfont || !state.audioContext) return;
    state.soundfontLoading = true;
    setStatus('Loading SoundFont');
    try {
      state.soundfont = await window.Soundfont.instrument(state.audioContext, 'acoustic_grand_piano');
      setStatus('SoundFont ready');
    } catch (err) {
      console.warn(err);
      setStatus('Synth fallback');
      state.soundfont = null;
    } finally {
      state.soundfontLoading = false;
    }
  }

  function playOscillator(noteName, when, duration, velocity) {
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    const midi = nameToMidi(noteName);
    osc.type = 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, velocity * 0.12), when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain).connect(state.masterGain);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  function playNote(noteName, when = 0, duration = 0.45, velocity = 0.8) {
    if (!state.audioContext) return;
    const start = state.audioContext.currentTime + when;
    if (els.playbackSelect.value === 'soundfont' && state.soundfont) {
      try {
        state.soundfont.play(noteName, start, { duration, gain: velocity });
        return;
      } catch (e) {
        console.warn(e);
      }
    }
    playOscillator(noteName, start, duration, velocity);
  }

  function flashKey(noteName) {
    const el = els.keyboard.querySelector(`[data-note="${noteName}"]`);
    if (!el) return;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 120);
  }

  function pushSeed(noteName, duration = 0.45, velocity = 0.8) {
    const timeline = state.capturedNotes.length ? state.capturedNotes[state.capturedNotes.length - 1].time + state.capturedNotes[state.capturedNotes.length - 1].duration + 0.05 : 0;
    state.capturedNotes.push({
      note: noteName,
      midi: nameToMidi(noteName),
      time: timeline,
      duration,
      velocity,
      origin: 'seed',
    });
    updateUI();
  }

  async function triggerInput(noteName, duration, velocity) {
    await ensureAudio();
    playNote(noteName, 0, duration, velocity);
    pushSeed(noteName, duration, velocity);
    flashKey(noteName);
  }

  function createKeyboard() {
    KEYBOARD_NOTES.forEach((note) => {
      const key = document.createElement('button');
      key.className = note.includes('#') ? 'key black' : 'key';
      key.dataset.note = note;
      key.textContent = note.replace(/\d/, '').replace('#', '♯');
      key.addEventListener('pointerdown', () => triggerInput(note, 0.45, 0.8));
      els.keyboard.appendChild(key);
    });
  }

  function demoSeed() {
    state.capturedNotes = [
      { note: 'C4', midi: 60, time: 0, duration: 0.45, velocity: 0.85, origin: 'seed' },
      { note: 'E4', midi: 64, time: 0.5, duration: 0.45, velocity: 0.84, origin: 'seed' },
      { note: 'G4', midi: 67, time: 1.0, duration: 0.5, velocity: 0.86, origin: 'seed' },
      { note: 'A4', midi: 69, time: 1.55, duration: 0.45, velocity: 0.82, origin: 'seed' },
    ];
    state.generatedNotes = [];
    updateUI();
  }

  function generateTheory() {
    const root = els.rootSelect.value;
    const scaleName = els.scaleSelect.value;
    const style = els.styleSelect.value;
    const bars = Number(els.barsSelect.value);
    const stepBeats = Number(els.stepSelect.value);
    const freedom = Number(els.temperatureRange.value) / 100;
    const seed = state.capturedNotes.length ? state.capturedNotes.slice() : (demoSeed(), state.capturedNotes.slice());
    const chordPools = progressionToChordPools(root, scaleName, els.progressionSelect.value);
    const scalePool = midiPool(root, scaleName, [4, 5]);
    const noteCount = Math.max(2, Math.round((bars * 4) / stepBeats));
    let lastMidi = seed[seed.length - 1]?.midi ?? 60;
    let time = seed[seed.length - 1]?.time + seed[seed.length - 1]?.duration + 0.05 || 0.5;
    const out = [];

    for (let i = 0; i < noteCount; i += 1) {
      const chord = chordPools[i % chordPools.length];
      const styled = lastMidi + styleShift(style, i) * (style === 'ambient' ? 1 : 2);
      const useChord = Math.random() > freedom * 0.4;
      const pool = useChord && chord.length ? chord : scalePool;
      const midi = nearest(styled, pool, Math.max(1, 1 + Math.round(freedom * 4)));
      const duration = Math.max(0.3, Math.min(1.1, stepBeats * 0.28));
      const velocity = Math.min(0.95, 0.65 + Math.random() * 0.15);
      out.push({ note: midiToName(midi), midi, time, duration, velocity, origin: 'generated' });
      lastMidi = midi;
      time += duration + 0.1;
    }
    return out;
  }

  function snapToScale(midi, root, scaleName) {
    return nearest(midi, midiPool(root, scaleName, [3, 4, 5, 6]), 2);
  }

  async function getMusicVAE(modelKey) {
    if (state.modelInstances[modelKey]) return state.modelInstances[modelKey];
    if (!window.mm || !window.mm.MusicVAE) throw new Error('Magenta unavailable');
    const model = new window.mm.MusicVAE(MODEL_CONFIG[modelKey]);
    await model.initialize();
    state.modelInstances[modelKey] = model;
    return model;
  }

  async function generateWithMagenta(modelKey) {
    setStatus('Loading model');
    const model = await getMusicVAE(modelKey);
    setStatus('Sampling');
    const freedom = Number(els.temperatureRange.value) / 100;
    const temp = 0.7 + freedom * 0.8;
    const sample = await model.sample(1, temp);
    const sequence = sample && sample[0];
    if (!sequence || !sequence.notes || !sequence.notes.length) {
      throw new Error('Model returned empty sequence');
    }
    const root = els.rootSelect.value;
    const scaleName = els.scaleSelect.value;
    const seed = state.capturedNotes.length ? state.capturedNotes : (demoSeed(), state.capturedNotes);
    const baseTime = seed[seed.length - 1].time + seed[seed.length - 1].duration + 0.05;
    const firstStart = Math.min.apply(null, sequence.notes.map((n) => n.startTime || 0));

    return sequence.notes
      .map((n) => {
        const start = (n.startTime || 0) - firstStart;
        const end = (n.endTime || (start + 0.4)) - firstStart;
        const midi = snapToScale(n.pitch || 60, root, scaleName);
        return {
          note: midiToName(midi),
          midi,
          time: baseTime + start,
          duration: Math.max(0.25, Math.min(1.2, end - start)),
          velocity: Math.max(0.55, Math.min(0.95, ((n.velocity || 90) / 127))),
          origin: 'generated',
        };
      })
      .sort((a, b) => a.time - b.time)
      .slice(0, 32);
  }

  async function generate() {
    try {
      await ensureAudio();
      const engine = els.engineSelect.value;
      els.modeReadout.textContent = engine === 'theory' ? 'Theory' : engine === 'musicvae-2bar' ? 'VAE 2-Bar' : 'VAE 4-Bar';
      state.generatedNotes = engine === 'theory' ? generateTheory() : await generateWithMagenta(engine);
      setStatus('Ready');
      updateUI();
    } catch (err) {
      console.error(err);
      state.generatedNotes = generateTheory();
      els.modeReadout.textContent = 'Theory';
      setStatus('Fallback ready');
      updateUI();
    }
  }

  function playSequence(sequence) {
    if (!sequence.length) return;
    ensureAudio().then(() => {
      const anchor = sequence[0].time;
      sequence.forEach((note) => {
        playNote(note.note, Math.max(0, note.time - anchor) + 0.03, note.duration, note.velocity);
      });
    });
  }

  function allNotes() {
    return state.capturedNotes.concat(state.generatedNotes).sort((a, b) => a.time - b.time);
  }

  function updateUI() {
    els.capturedCount.textContent = String(state.capturedNotes.length);
    els.generatedCount.textContent = String(state.generatedNotes.length);
    els.scaleReadout.textContent = `${ROOT_LABEL[els.rootSelect.value] || els.rootSelect.value} ${els.scaleSelect.value}`;
    els.timeline.innerHTML = '';
    const notes = allNotes();
    if (!notes.length) {
      const row = document.createElement('div');
      row.className = 'timeline-item';
      row.innerHTML = '<strong>—</strong><span class="muted">No notes yet</span><span>—</span>';
      els.timeline.appendChild(row);
      return;
    }
    notes.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `timeline-item ${item.origin}`;
      row.innerHTML = `<strong>${item.origin === 'seed' ? 'Seed' : 'Gen'} ${index + 1}</strong><span>${item.note} · ${item.time.toFixed(2)}s · ${item.duration.toFixed(2)}s</span><span>${Math.round(item.velocity * 100)}%</span>`;
      els.timeline.appendChild(row);
    });
  }

  function varLen(n) {
    let buffer = n & 0x7F;
    const bytes = [];
    while ((n >>= 7)) {
      buffer <<= 8;
      buffer |= ((n & 0x7F) | 0x80);
    }
    while (true) {
      bytes.push(buffer & 0xFF);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  }

  function buildMidiFile(sequence) {
    const ticksPerBeat = 480;
    const tempo = 600000;
    const ordered = sequence.slice().sort((a, b) => a.time - b.time);
    const events = [];
    ordered.forEach((n) => {
      const start = Math.round(n.time * ticksPerBeat * 2);
      const end = Math.round((n.time + n.duration) * ticksPerBeat * 2);
      events.push({ tick: start, type: 'on', midi: n.midi, vel: Math.max(1, Math.min(127, Math.round(n.velocity * 127))) });
      events.push({ tick: end, type: 'off', midi: n.midi, vel: 0 });
    });
    events.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));

    const track = [];
    track.push(0x00, 0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF);
    let lastTick = 0;
    events.forEach((e) => {
      const delta = e.tick - lastTick;
      track.push.apply(track, varLen(delta));
      track.push(e.type === 'on' ? 0x90 : 0x80, e.midi, e.vel);
      lastTick = e.tick;
    });
    track.push(0x00, 0xFF, 0x2F, 0x00);

    const bytes = [];
    function pushStr(str) { for (let i = 0; i < str.length; i += 1) bytes.push(str.charCodeAt(i)); }
    function push32(n) { bytes.push((n>>>24)&255, (n>>>16)&255, (n>>>8)&255, n&255); }
    function push16(n) { bytes.push((n>>>8)&255, n&255); }

    pushStr('MThd'); push32(6); push16(0); push16(1); push16(ticksPerBeat);
    pushStr('MTrk'); push32(track.length); bytes.push.apply(bytes, track);
    return new Uint8Array(bytes);
  }

  function exportMidi() {
    const seq = allNotes();
    if (!seq.length) { alert('Nothing to export yet.'); return; }
    const file = buildMidiFile(seq);
    const blob = new Blob([file], { type: 'audio/midi' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ius-music-assistant-songwriter.mid';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 200);
  }

  async function connectMidi() {
    if (!navigator.requestMIDIAccess) { setMidi('MIDI unsupported'); return; }
    try {
      state.midiAccess = await navigator.requestMIDIAccess();
      let count = 0;
      state.midiAccess.inputs.forEach((input) => {
        count += 1;
        input.onmidimessage = async (event) => {
          const [status, pitch, velocity] = event.data;
          if (status === 144 && velocity > 0) {
            const note = midiToName(pitch);
            await triggerInput(note, 0.45, velocity / 127);
          }
        };
      });
      setMidi(count ? `${count} input${count > 1 ? 's' : ''}` : 'No devices');
    } catch (err) {
      console.error(err);
      setMidi('Access denied');
    }
  }

  function clearAll() {
    state.capturedNotes = [];
    state.generatedNotes = [];
    setStatus('Idle');
    updateUI();
  }

  function register() {
    els.startAudioBtn.addEventListener('click', ensureAudio);
    els.connectMidiBtn.addEventListener('click', connectMidi);
    els.seedDemoBtn.addEventListener('click', demoSeed);
    els.clearBtn.addEventListener('click', clearAll);
    els.generateBtn.addEventListener('click', generate);
    els.playSeedBtn.addEventListener('click', () => playSequence(state.capturedNotes));
    els.playAllBtn.addEventListener('click', () => playSequence(allNotes()));
    els.exportMidiBtn.addEventListener('click', exportMidi);
    [els.rootSelect, els.scaleSelect, els.engineSelect].forEach((el) => el.addEventListener('change', updateUI));
    document.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const note = KEYMAP[event.key.toLowerCase()];
      if (note) triggerInput(note, 0.45, 0.82);
    });
  }

  function init() {
    createKeyboard();
    register();
    updateUI();
  }

  init();
})();
