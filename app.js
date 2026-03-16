(function () {
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
    'musicvae-4bar': 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_4bar_med_q2'
  };
  const TRACKS = 2;
  const BARS = 8;

  const state = {
    audioContext: null,
    masterGain: null,
    soundfont: null,
    soundfontLoading: false,
    midiAccess: null,
    seedNotes: [],
    resultClips: [],
    nextClipId: 1,
    arrangement: Array.from({ length: TRACKS }, () => Array(BARS).fill(null)),
    modelInstances: {},
  };

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
    bpmInput: document.getElementById('bpmInput'),
    temperatureRange: document.getElementById('temperatureRange'),
    statusPill: document.getElementById('statusPill'),
    midiPill: document.getElementById('midiPill'),
    capturedCount: document.getElementById('capturedCount'),
    generatedCount: document.getElementById('generatedCount'),
    modeReadout: document.getElementById('modeReadout'),
    scaleReadout: document.getElementById('scaleReadout'),
    keyboard: document.getElementById('keyboard'),
    seedList: document.getElementById('seedList'),
    resultsList: document.getElementById('resultsList'),
    arrangementGrid: document.getElementById('arrangementGrid'),
    startAudioBtn: document.getElementById('startAudioBtn'),
    connectMidiBtn: document.getElementById('connectMidiBtn'),
    seedDemoBtn: document.getElementById('seedDemoBtn'),
    clearBtn: document.getElementById('clearBtn'),
    generateBtn: document.getElementById('generateBtn'),
    playSeedBtn: document.getElementById('playSeedBtn'),
    playArrangementBtn: document.getElementById('playArrangementBtn'),
    clearArrangementBtn: document.getElementById('clearArrangementBtn'),
    exportMidiBtn: document.getElementById('exportMidiBtn'),
  };

  const setStatus = (text) => { els.statusPill.textContent = text; };
  const setMidi = (text) => { els.midiPill.textContent = text; };
  const bpm = () => Math.max(40, Math.min(220, Number(els.bpmInput.value) || 110));
  const beatToSeconds = (beats) => beats * (60 / bpm());

  function midiToName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    const semitone = ((midi % 12) + 12) % 12;
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
    return (SCALE_INTERVALS[scale] || SCALE_INTERVALS.major).map((n) => (rootPc + n) % 12);
  }
  function midiPool(root, scale, octaves) {
    const pcs = getScalePitchClasses(root, scale);
    return octaves.flatMap((oct) => pcs.map((pc) => (oct + 1) * 12 + pc));
  }
  function nearest(target, pool, windowSize) {
    const sorted = pool.slice().sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    return sorted[Math.floor(Math.random() * Math.max(1, Math.min(windowSize, sorted.length)))];
  }
  function styleShift(style, i) {
    const patterns = {
      balanced: [0, 2, -1, 1], arpeggio: [0, 2, 4, 2], jazzy: [0, 1, -2, 3], ambient: [0, -1, 2, -3],
    };
    const p = patterns[style] || patterns.balanced;
    return p[i % p.length];
  }
  function progressionToChordPools(root, scaleName, progression) {
    const isMinor = ['minor', 'dorian', 'blues'].includes(scaleName);
    const scaleBase = midiPool(root, isMinor ? 'minor' : 'major', [4, 5]);
    const degrees = progression.split('-').map((s) => s.trim());
    const map = { I:0, ii:1, III:2, iii:2, IV:3, V:4, vi:5, VI:5, VII:6, i:0, iv:3, v:4 };
    const pcs = getScalePitchClasses(root, isMinor ? 'minor' : 'major');
    return degrees.map((symbol) => {
      const degreeIndex = map[symbol] ?? 0;
      const triad = [0, 2, 4].map((jump) => pcs[(degreeIndex + jump) % pcs.length]);
      return scaleBase.filter((m) => triad.includes(m % 12));
    });
  }
  function estimateAdaptiveStep(seed) {
    if (seed.length < 2) return 1;
    const gaps = [];
    for (let i = 1; i < seed.length; i += 1) gaps.push(Math.max(0.25, seed[i].time - seed[i - 1].time));
    const average = gaps.reduce((sum, n) => sum + n, 0) / gaps.length;
    const options = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
    return options.sort((a, b) => Math.abs(a - average) - Math.abs(b - average))[0] || 1;
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
    if (els.playbackSelect.value === 'soundfont') await loadSoundfont();
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
      state.soundfont = null;
      setStatus('Synth ready');
    } finally {
      state.soundfontLoading = false;
    }
  }
  function playOscillator(noteName, when, duration, velocity) {
    const midi = nameToMidi(noteName);
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, velocity * 0.12), when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain).connect(state.masterGain);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }
  function playNote(noteName, whenSec, durationSec, velocity) {
    if (!state.audioContext) return;
    const start = state.audioContext.currentTime + whenSec;
    if (els.playbackSelect.value === 'soundfont' && state.soundfont) {
      try {
        state.soundfont.play(noteName, start, { duration: durationSec, gain: velocity });
        return;
      } catch (err) { console.warn(err); }
    }
    playOscillator(noteName, start, durationSec, velocity);
  }
  function flashKey(noteName) {
    const el = els.keyboard.querySelector(`[data-note="${noteName}"]`);
    if (!el) return;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 120);
  }

  function createKeyboard() {
    KEYBOARD_NOTES.forEach((note) => {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = note.includes('#') ? 'key black' : 'key';
      key.dataset.note = note;
      key.textContent = note.replace(/\d/, '').replace('#', '♯');
      key.addEventListener('pointerdown', () => triggerInput(note, 0.5, 0.8));
      els.keyboard.appendChild(key);
    });
  }

  function addSeed(noteName, duration = 0.5, velocity = 0.8) {
    const prev = state.seedNotes[state.seedNotes.length - 1];
    const time = prev ? prev.time + prev.duration : 0;
    state.seedNotes.push({ note: noteName, midi: nameToMidi(noteName), time, duration, velocity, origin: 'seed' });
  }
  async function triggerInput(noteName, duration = 0.5, velocity = 0.8) {
    await ensureAudio();
    playNote(noteName, 0, beatToSeconds(duration), velocity);
    addSeed(noteName, duration, velocity);
    flashKey(noteName);
    updateUI();
  }
  function demoSeed() {
    state.seedNotes = [
      { note: 'C4', midi: 60, time: 0, duration: 0.5, velocity: 0.82, origin: 'seed' },
      { note: 'E4', midi: 64, time: 0.5, duration: 0.5, velocity: 0.84, origin: 'seed' },
      { note: 'G4', midi: 67, time: 1.0, duration: 0.5, velocity: 0.86, origin: 'seed' },
      { note: 'A4', midi: 69, time: 1.5, duration: 0.5, velocity: 0.81, origin: 'seed' },
    ];
    updateUI();
  }

  function currentStep(seed) {
    const value = els.stepSelect.value;
    return value === 'adaptive' ? estimateAdaptiveStep(seed) : Number(value);
  }
  function generateTheoryNotes() {
    const root = els.rootSelect.value;
    const scaleName = els.scaleSelect.value;
    const style = els.styleSelect.value;
    const bars = Number(els.barsSelect.value);
    const freedom = Number(els.temperatureRange.value) / 100;
    const seed = state.seedNotes.length ? state.seedNotes.slice() : (demoSeed(), state.seedNotes.slice());
    const stepBeats = currentStep(seed);
    const chordPools = progressionToChordPools(root, scaleName, els.progressionSelect.value);
    const scalePool = midiPool(root, scaleName, [4, 5]);
    const noteCount = Math.max(2, Math.round((bars * 4) / stepBeats));
    let lastMidi = seed[seed.length - 1] ? seed[seed.length - 1].midi : 60;
    let time = 0;
    const out = [];
    for (let i = 0; i < noteCount; i += 1) {
      const chord = chordPools[i % chordPools.length];
      const styled = lastMidi + styleShift(style, i) * (style === 'ambient' ? 1 : 2);
      const useChord = Math.random() > freedom * 0.4;
      const pool = useChord && chord.length ? chord : scalePool;
      const midi = nearest(styled, pool, Math.max(1, 1 + Math.round(freedom * 4)));
      const duration = Math.max(0.25, Math.min(1.5, stepBeats * 0.8));
      const velocity = Math.min(0.95, 0.64 + Math.random() * 0.18);
      out.push({ note: midiToName(midi), midi, time, duration, velocity, origin: 'generated' });
      lastMidi = midi;
      time += stepBeats;
    }
    return out;
  }
  function snapToScale(midi, root, scaleName) {
    return nearest(midi, midiPool(root, scaleName, [3,4,5,6]), 2);
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
    if (!sequence || !sequence.notes || !sequence.notes.length) throw new Error('Model returned empty sequence');
    const root = els.rootSelect.value;
    const scaleName = els.scaleSelect.value;
    const notes = sequence.notes.map((n) => ({
      midi: snapToScale(n.pitch || 60, root, scaleName),
      time: n.startTime || 0,
      duration: Math.max(0.25, (n.endTime || ((n.startTime || 0) + 0.4)) - (n.startTime || 0)),
      velocity: Math.max(0.55, Math.min(0.95, ((n.velocity || 90) / 127))),
      origin: 'generated'
    })).sort((a, b) => a.time - b.time);
    const first = notes[0]?.time || 0;
    return notes.slice(0, 32).map((n) => ({ ...n, time: n.time - first, note: midiToName(n.midi) }));
  }
  async function generateClip() {
    try {
      await ensureAudio();
      const engine = els.engineSelect.value;
      const notes = engine === 'theory' ? generateTheoryNotes() : await generateWithMagenta(engine);
      const clip = {
        id: `clip-${state.nextClipId++}`,
        name: `${engine === 'theory' ? 'Theory' : engine === 'musicvae-2bar' ? 'VAE 2' : 'VAE 4'} · ${state.resultClips.length + 1}`,
        engine,
        bars: Number(els.barsSelect.value),
        notes,
      };
      state.resultClips.unshift(clip);
      els.modeReadout.textContent = engine === 'theory' ? 'Theory' : engine === 'musicvae-2bar' ? 'VAE 2 Bar' : 'VAE 4 Bar';
      setStatus('Clip ready');
      updateUI();
    } catch (err) {
      console.error(err);
      setStatus('Generation fallback');
      const clip = {
        id: `clip-${state.nextClipId++}`,
        name: `Theory · ${state.resultClips.length + 1}`,
        engine: 'theory',
        bars: Number(els.barsSelect.value),
        notes: generateTheoryNotes(),
      };
      state.resultClips.unshift(clip);
      els.modeReadout.textContent = 'Theory';
      updateUI();
    }
  }

  function scheduleSequence(sequence, startOffsetBeats = 0) {
    sequence.forEach((note) => {
      playNote(note.note, beatToSeconds(startOffsetBeats + note.time), beatToSeconds(note.duration), note.velocity || 0.8);
      setTimeout(() => flashKey(note.note), beatToSeconds(startOffsetBeats + note.time) * 1000);
    });
  }
  async function playClip(clipId) {
    const clip = state.resultClips.find((c) => c.id === clipId);
    if (!clip) return;
    await ensureAudio();
    scheduleSequence(clip.notes, 0);
    setStatus(`Playing ${clip.name}`);
  }
  async function playSeed() {
    if (!state.seedNotes.length) return;
    await ensureAudio();
    scheduleSequence(state.seedNotes, 0);
    setStatus('Playing seed');
  }
  async function playArrangement() {
    await ensureAudio();
    state.arrangement.forEach((track, trackIndex) => {
      track.forEach((clipId, barIndex) => {
        if (!clipId) return;
        const clip = state.resultClips.find((c) => c.id === clipId);
        if (!clip) return;
        scheduleSequence(clip.notes, barIndex * 4);
      });
    });
    setStatus('Playing arrangement');
  }

  function addClipToArrangement(clipId, trackIndex, barIndex) {
    state.arrangement[trackIndex][barIndex] = clipId;
    renderArrangement();
  }
  function clearArrangement() {
    state.arrangement = Array.from({ length: TRACKS }, () => Array(BARS).fill(null));
    renderArrangement();
  }
  function removeClipFromArrangement(trackIndex, barIndex) {
    state.arrangement[trackIndex][barIndex] = null;
    renderArrangement();
  }

  function renderSeed() {
    els.seedList.innerHTML = '';
    if (!state.seedNotes.length) {
      els.seedList.innerHTML = '<div class="empty-state">No seed captured yet.</div>';
      return;
    }
    state.seedNotes.forEach((note, index) => {
      const row = document.createElement('div');
      row.className = 'seed-row';
      row.innerHTML = `<strong>${index + 1}</strong><div>${note.note}<br><span>${note.time.toFixed(2)} beat · ${note.duration.toFixed(2)} beat</span></div><div>${Math.round(note.velocity * 100)}%</div>`;
      els.seedList.appendChild(row);
    });
  }
  function renderResults() {
    els.resultsList.innerHTML = '';
    if (!state.resultClips.length) {
      els.resultsList.innerHTML = '<div class="empty-state">Generate a clip to create playable results.</div>';
      return;
    }
    state.resultClips.forEach((clip) => {
      const card = document.createElement('div');
      card.className = 'clip-card';
      card.draggable = true;
      card.dataset.clipId = clip.id;
      card.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', clip.id));
      const preview = clip.notes.slice(0, 12).map((note) => `<div class="clip-bar" style="height:${10 + ((note.midi - 48) % 24) * 1.4}px"></div>`).join('');
      card.innerHTML = `
        <div class="clip-top">
          <div>
            <div class="clip-name">${clip.name}</div>
            <div class="clip-meta">${clip.notes.length} notes · ${clip.bars} bars · ${clip.engine}</div>
          </div>
          <div class="clip-meta">${bpm()} BPM</div>
        </div>
        <div class="clip-preview">${preview}</div>
        <div class="clip-actions">
          <button class="btn play-clip">▷ Play</button>
          <button class="btn add-clip">＋ Add to track</button>
        </div>`;
      card.querySelector('.play-clip').addEventListener('click', () => playClip(clip.id));
      card.querySelector('.add-clip').addEventListener('click', () => {
        for (let t = 0; t < TRACKS; t += 1) {
          const openIndex = state.arrangement[t].findIndex((slot) => slot === null);
          if (openIndex !== -1) { addClipToArrangement(clip.id, t, openIndex); return; }
        }
        addClipToArrangement(clip.id, 0, 0);
      });
      els.resultsList.appendChild(card);
    });
  }
  function renderArrangement() {
    els.arrangementGrid.innerHTML = '';
    for (let trackIndex = 0; trackIndex < TRACKS; trackIndex += 1) {
      const row = document.createElement('div');
      row.className = 'track-row';
      row.innerHTML = `<div class="track-label">Track ${trackIndex + 1}</div>`;
      for (let barIndex = 0; barIndex < BARS; barIndex += 1) {
        const cell = document.createElement('div');
        cell.className = 'bar-cell';
        cell.dataset.track = String(trackIndex);
        cell.dataset.bar = String(barIndex);
        cell.innerHTML = `<div class="bar-num">Bar ${barIndex + 1}</div>`;
        cell.addEventListener('dragover', (event) => { event.preventDefault(); cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (event) => {
          event.preventDefault();
          cell.classList.remove('drag-over');
          const clipId = event.dataTransfer.getData('text/plain');
          if (clipId) addClipToArrangement(clipId, trackIndex, barIndex);
        });
        const clipId = state.arrangement[trackIndex][barIndex];
        if (clipId) {
          const clip = state.resultClips.find((c) => c.id === clipId);
          if (clip) {
            const item = document.createElement('div');
            item.className = 'cell-clip';
            item.innerHTML = `
              <div class="cell-name">${clip.name}</div>
              <div class="cell-meta">${clip.bars} bars</div>
              <div class="cell-actions">
                <button class="btn cell-play">▷</button>
                <button class="btn cell-remove">–</button>
              </div>`;
            item.querySelector('.cell-play').addEventListener('click', () => playClip(clip.id));
            item.querySelector('.cell-remove').addEventListener('click', () => removeClipFromArrangement(trackIndex, barIndex));
            cell.appendChild(item);
          }
        }
        row.appendChild(cell);
      }
      els.arrangementGrid.appendChild(row);
    }
  }

  function updateUI() {
    els.capturedCount.textContent = String(state.seedNotes.length);
    els.generatedCount.textContent = String(state.resultClips.length);
    els.scaleReadout.textContent = `${ROOT_LABEL[els.rootSelect.value] || els.rootSelect.value} ${els.scaleSelect.value}`;
    renderSeed();
    renderResults();
    renderArrangement();
  }

  function varLen(n) {
    let buffer = n & 0x7F;
    const bytes = [];
    while ((n >>= 7)) { buffer <<= 8; buffer |= ((n & 0x7F) | 0x80); }
    while (true) { bytes.push(buffer & 0xFF); if (buffer & 0x80) buffer >>= 8; else break; }
    return bytes;
  }
  function buildMidiFile(sequence) {
    const ticksPerBeat = 480;
    const tempo = Math.round(60000000 / bpm());
    const ordered = sequence.slice().sort((a, b) => a.time - b.time);
    const events = [];
    ordered.forEach((n) => {
      const start = Math.round(n.time * ticksPerBeat);
      const end = Math.round((n.time + n.duration) * ticksPerBeat);
      events.push({ tick: start, type: 'on', midi: n.midi, vel: Math.max(1, Math.min(127, Math.round((n.velocity || 0.8) * 127))) });
      events.push({ tick: end, type: 'off', midi: n.midi, vel: 0 });
    });
    events.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));
    const track = [];
    track.push(0x00, 0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF);
    let lastTick = 0;
    events.forEach((e) => {
      track.push.apply(track, varLen(e.tick - lastTick));
      track.push(e.type === 'on' ? 0x90 : 0x80, e.midi, e.vel);
      lastTick = e.tick;
    });
    track.push(0x00, 0xFF, 0x2F, 0x00);
    const bytes = [];
    const pushStr = (str) => { for (let i = 0; i < str.length; i += 1) bytes.push(str.charCodeAt(i)); };
    const push32 = (n) => bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    const push16 = (n) => bytes.push((n >>> 8) & 255, n & 255);
    pushStr('MThd'); push32(6); push16(0); push16(1); push16(ticksPerBeat);
    pushStr('MTrk'); push32(track.length); bytes.push.apply(bytes, track);
    return new Uint8Array(bytes);
  }
  function exportMidi() {
    const sequence = state.seedNotes.concat(...state.resultClips.map((clip) => clip.notes));
    if (!sequence.length) return alert('Nothing to export yet.');
    const file = buildMidiFile(sequence);
    const blob = new Blob([file], { type: 'audio/midi' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ius-music-assistant-songwriter.mid';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 200);
  }

  async function connectMidi() {
    if (!navigator.requestMIDIAccess) return setMidi('Unsupported');
    try {
      state.midiAccess = await navigator.requestMIDIAccess();
      let count = 0;
      state.midiAccess.inputs.forEach((input) => {
        count += 1;
        input.onmidimessage = async (event) => {
          const [status, pitch, velocity] = event.data || [];
          if (status === 144 && velocity > 0) await triggerInput(midiToName(pitch), 0.5, velocity / 127);
        };
      });
      setMidi(count ? `${count} input${count > 1 ? 's' : ''}` : 'No device');
    } catch (err) {
      console.error(err);
      setMidi('Denied');
    }
  }
  function clearAll() {
    state.seedNotes = [];
    state.resultClips = [];
    clearArrangement();
    setStatus('Idle');
    updateUI();
  }
  function applyTheme() { document.documentElement.setAttribute('data-theme', els.themeSelect.value); }

  function register() {
    els.themeSelect.addEventListener('change', applyTheme);
    els.startAudioBtn.addEventListener('click', ensureAudio);
    els.connectMidiBtn.addEventListener('click', connectMidi);
    els.seedDemoBtn.addEventListener('click', () => { demoSeed(); updateUI(); });
    els.clearBtn.addEventListener('click', clearAll);
    els.generateBtn.addEventListener('click', generateClip);
    els.playSeedBtn.addEventListener('click', playSeed);
    els.playArrangementBtn.addEventListener('click', playArrangement);
    els.clearArrangementBtn.addEventListener('click', clearArrangement);
    els.exportMidiBtn.addEventListener('click', exportMidi);
    [els.rootSelect, els.scaleSelect, els.engineSelect, els.playbackSelect, els.bpmInput].forEach((el) => el.addEventListener('change', updateUI));
    document.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const note = KEYMAP[event.key.toLowerCase()];
      if (note) triggerInput(note, 0.5, 0.82);
    });
  }
  function init() {
    createKeyboard();
    applyTheme();
    register();
    renderArrangement();
    updateUI();
  }
  init();
})();
