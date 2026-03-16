import * as Tone from 'https://esm.sh/tone@15.1.22';
import { Midi } from 'https://esm.sh/@tonejs/midi@2.0.28';
import { Scale, Chord, Note } from 'https://esm.sh/tonal@6.4.2';
import Soundfont from 'https://esm.sh/soundfont-player@0.15.7';

const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const whiteKeys = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const blackKeys = ['C#4', 'D#4', null, 'F#4', 'G#4', 'A#4', null];
const keyboardMap = {
  a: 'C4', w: 'C#4', s: 'D4', e: 'D#4', d: 'E4',
  f: 'F4', t: 'F#4', g: 'G4', y: 'G#4', h: 'A4', u: 'A#4', j: 'B4', k: 'C5'
};

const MODEL_CONFIG = {
  'musicvae-2bar': 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small',
  'musicvae-4bar': 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_4bar_med_q2',
};

const state = {
  capturedNotes: [],
  generatedNotes: [],
  noteStart: performance.now(),
  midiAccess: null,
  midiConnected: false,
  soundfontReady: false,
  soundfontInstrument: null,
  modelInstances: new Map(),
  audioReady: false,
};

const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.02, decay: 0.15, sustain: 0.4, release: 0.8 },
}).toDestination();

const els = {
  rootSelect: document.getElementById('rootSelect'),
  scaleSelect: document.getElementById('scaleSelect'),
  styleSelect: document.getElementById('styleSelect'),
  modelSelect: document.getElementById('modelSelect'),
  stepSelect: document.getElementById('stepSelect'),
  progressionSelect: document.getElementById('progressionSelect'),
  barsSelect: document.getElementById('barsSelect'),
  temperatureRange: document.getElementById('temperatureRange'),
  midiStatus: document.getElementById('midiStatus'),
  recordStatus: document.getElementById('recordStatus'),
  capturedCount: document.getElementById('capturedCount'),
  generatedCount: document.getElementById('generatedCount'),
  scaleReadout: document.getElementById('scaleReadout'),
  stepReadout: document.getElementById('stepReadout'),
  timeline: document.getElementById('timeline'),
  keyboard: document.getElementById('keyboard'),
  startAudioBtn: document.getElementById('startAudioBtn'),
  connectMidiBtn: document.getElementById('connectMidiBtn'),
  seedDemoBtn: document.getElementById('seedDemoBtn'),
  clearBtn: document.getElementById('clearBtn'),
  improviseBtn: document.getElementById('improviseBtn'),
  playPhraseBtn: document.getElementById('playPhraseBtn'),
  playAllBtn: document.getElementById('playAllBtn'),
  exportMidiBtn: document.getElementById('exportMidiBtn'),
};

function populateRoots() {
  notes.forEach((note) => {
    const option = document.createElement('option');
    option.value = note;
    option.textContent = note;
    if (note === 'C') option.selected = true;
    els.rootSelect.appendChild(option);
  });
}

function createKeyboard() {
  whiteKeys.forEach((noteName, index) => {
    const white = document.createElement('button');
    white.className = 'key';
    white.textContent = noteName.replace(/\d/, '');
    white.dataset.note = noteName;
    wireKeyEvents(white, noteName);
    els.keyboard.appendChild(white);

    const blackNote = blackKeys[index];
    if (blackNote) {
      const black = document.createElement('button');
      black.className = 'key black';
      black.textContent = blackNote.replace(/\d/, '');
      black.dataset.note = blackNote;
      wireKeyEvents(black, blackNote);
      els.keyboard.appendChild(black);
    }
  });
}

function wireKeyEvents(button, noteName) {
  button.addEventListener('mousedown', async () => {
    await ensureAudio();
    triggerInputNote(noteName, 0.6);
    flashKey(button);
  });
}

function flashKey(button) {
  button.classList.add('active');
  window.setTimeout(() => button.classList.remove('active'), 150);
}

async function ensureAudio() {
  if (state.audioReady) return;
  await Tone.start();
  state.audioReady = true;
  els.recordStatus.textContent = 'Audio ready';
  await loadSoundfont();
}

async function loadSoundfont() {
  if (state.soundfontReady || state.soundfontInstrument) return;
  try {
    const audioContext = Tone.getContext().rawContext;
    state.soundfontInstrument = await Soundfont.instrument(audioContext, 'acoustic_grand_piano', {
      soundfont: 'FluidR3_GM',
      format: 'mp3',
    });
    state.soundfontReady = true;
    els.recordStatus.textContent = 'SoundFont ready';
  } catch (error) {
    state.soundfontReady = false;
    console.warn('SoundFont load failed, using synth fallback.', error);
    els.recordStatus.textContent = 'Audio ready';
  }
}

function playNote(note, duration = 0.5, when = Tone.now(), velocity = 0.8) {
  if (state.soundfontReady && state.soundfontInstrument) {
    const offset = Math.max(0, when - Tone.now());
    state.soundfontInstrument.play(note, Tone.getContext().rawContext.currentTime + offset, {
      duration,
      gain: velocity,
    });
    return;
  }
  synth.triggerAttackRelease(note, duration, when, velocity);
}

function recordSeedNote(noteName, duration = 0.5, velocity = 0.8) {
  const midi = Note.midi(noteName) ?? 60;
  const time = Math.max(0, (performance.now() - state.noteStart) / 1000);
  state.capturedNotes.push({
    note: noteName,
    midi,
    time,
    duration,
    velocity,
    origin: 'seed',
  });
  els.recordStatus.textContent = 'Recording';
  updateUI();
}

function triggerInputNote(noteName, duration = 0.5, velocity = 0.8) {
  playNote(noteName, duration, Tone.now(), velocity);
  recordSeedNote(noteName, duration, velocity);
}

function getScaleNotes(root, scaleName) {
  const normalizedScale = scaleName === 'pentatonic' ? 'major pentatonic' : scaleName;
  const result = Scale.get(`${root} ${normalizedScale}`).notes;
  return result.length ? result : Scale.get(`${root} major`).notes;
}

function progressionToChords(prog, root, scaleName) {
  const isMinor = ['minor', 'dorian', 'blues'].includes(scaleName);
  const map = isMinor
    ? { i: 'm', ii: 'dim', III: '', iv: 'm', v: 'm', VI: '', VII: '' }
    : { I: '', ii: 'm', iii: 'm', IV: '', V: '', vi: 'm', vii: 'dim' };

  const romanSteps = prog.split('-');
  const scale = getScaleNotes(root, isMinor ? 'minor' : 'major');

  return romanSteps.map((symbol) => {
    const normalized = symbol.trim();
    const degreeIndexMap = { I: 0, ii: 1, III: 2, iii: 2, IV: 3, V: 4, vi: 5, VI: 5, VII: 6, i: 0, iv: 3, v: 4 };
    const degreeIndex = degreeIndexMap[normalized] ?? 0;
    const base = scale[degreeIndex] || root;
    const suffix = map[normalized] ?? '';
    const chordName = `${base}${suffix}`;
    const chordNotes = Chord.get(chordName).notes;
    return chordNotes.length ? chordNotes : [base, scale[(degreeIndex + 2) % scale.length], scale[(degreeIndex + 4) % scale.length]];
  });
}

function nearestMidi(targetMidi, midiPool, freedom) {
  const sorted = [...midiPool].sort((a, b) => Math.abs(a - targetMidi) - Math.abs(b - targetMidi));
  const windowSize = Math.max(1, Math.round(1 + freedom * 3));
  return sorted[Math.floor(Math.random() * Math.min(windowSize, sorted.length))];
}

function styleInterval(style, index) {
  const patterns = {
    balanced: [0, 2, -1, 1],
    arpeggio: [0, 2, 4, 2],
    jazzy: [0, 1, -2, 3],
    ambient: [0, -1, 2, -3],
  };
  const arr = patterns[style] || patterns.balanced;
  return arr[index % arr.length];
}

function generateRuleBasedContinuation() {
  const root = els.rootSelect.value;
  const scaleName = els.scaleSelect.value;
  const style = els.styleSelect.value;
  const stepBeats = Number(els.stepSelect.value);
  const bars = Number(els.barsSelect.value);
  const freedom = Number(els.temperatureRange.value) / 100;
  const progression = progressionToChords(els.progressionSelect.value, root, scaleName);
  const scaleNotes = getScaleNotes(root, scaleName);
  const seed = state.capturedNotes.length ? [...state.capturedNotes] : getDemoSeed(true);
  if (!state.capturedNotes.length) state.capturedNotes = [...seed];

  const totalBeats = bars * 4;
  const noteCount = Math.max(2, Math.round(totalBeats / stepBeats));
  const generated = [];
  const lastSeed = seed[seed.length - 1];
  let currentMidi = lastSeed?.midi ?? 60;
  let currentTime = (lastSeed?.time ?? 0) + (lastSeed?.duration ?? 0.5);
  const midiPoolBase = scaleNotes.flatMap((n) => [4, 5].map((oct) => Note.midi(`${n}${oct}`))).filter(Boolean);

  for (let i = 0; i < noteCount; i += 1) {
    const chord = progression[i % progression.length];
    const chordPool = chord.flatMap((n) => [4, 5].map((oct) => Note.midi(`${n}${oct}`))).filter(Boolean);
    const useChord = Math.random() > freedom * 0.45;
    const pool = useChord ? chordPool : midiPoolBase;
    const styledTarget = currentMidi + styleInterval(style, i) * (style === 'ambient' ? 1 : 2);
    const nextMidi = nearestMidi(styledTarget, pool, freedom);
    const noteName = Note.fromMidi(nextMidi) || 'C4';
    const duration = Math.max(0.35, stepBeats * 0.42 + (freedom * 0.18));
    const velocity = Math.min(0.96, 0.62 + Math.random() * 0.18 + freedom * 0.12);
    generated.push({
      note: noteName,
      midi: nextMidi,
      time: currentTime,
      duration,
      velocity,
      origin: 'generated',
      chord: chord.join('-'),
    });
    currentTime += stepBeats * 0.5;
    currentMidi = nextMidi;
  }

  return generated;
}

function snapMidiToScale(midiValue, root, scaleName) {
  const scaleNotes = getScaleNotes(root, scaleName);
  const midiPool = scaleNotes.flatMap((noteName) => [3, 4, 5, 6].map((oct) => Note.midi(`${noteName}${oct}`))).filter(Boolean);
  return nearestMidi(midiValue, midiPool, 0.15);
}

function buildSeedSequence() {
  const seed = state.capturedNotes.length ? [...state.capturedNotes] : getDemoSeed(true);
  if (!state.capturedNotes.length) state.capturedNotes = [...seed];
  return seed;
}

async function getModelInstance(modelKey) {
  const existing = state.modelInstances.get(modelKey);
  if (existing) return existing;
  const mm = window.mm;
  if (!mm) throw new Error('Magenta.js did not load.');
  const checkpoint = MODEL_CONFIG[modelKey];
  if (!checkpoint) throw new Error('Unknown model selection.');
  const model = new mm.MusicVAE(checkpoint);
  await model.initialize();
  state.modelInstances.set(modelKey, model);
  return model;
}

async function generateMusicVAEContinuation(modelKey) {
  const root = els.rootSelect.value;
  const scaleName = els.scaleSelect.value;
  const bars = Number(els.barsSelect.value);
  const freedom = Number(els.temperatureRange.value) / 100;
  const seed = buildSeedSequence();
  const lastSeed = seed[seed.length - 1];
  const model = await getModelInstance(modelKey);
  const temperature = 0.7 + freedom * 0.8;
  const samples = await model.sample(1, temperature);
  const sequence = samples?.[0];
  if (!sequence?.notes?.length) {
    return generateRuleBasedContinuation();
  }

  const baseTime = (lastSeed?.time ?? 0) + (lastSeed?.duration ?? 0.5);
  const maxDuration = bars * 2.0;
  const firstStart = Math.min(...sequence.notes.map((n) => n.startTime ?? 0));
  const mapped = sequence.notes
    .map((n) => {
      const startTime = (n.startTime ?? 0) - firstStart;
      const endTime = (n.endTime ?? (startTime + 0.4)) - firstStart;
      if (startTime > maxDuration) return null;
      const rawMidi = n.pitch ?? 60;
      const midi = snapMidiToScale(rawMidi, root, scaleName);
      return {
        note: Note.fromMidi(midi) || 'C4',
        midi,
        time: baseTime + startTime,
        duration: Math.max(0.25, Math.min(1.2, endTime - startTime)),
        velocity: Math.max(0.55, Math.min(0.95, (n.velocity ?? 80) / 127)),
        origin: 'generated',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  return mapped.length ? mapped : generateRuleBasedContinuation();
}

async function generateContinuation() {
  await ensureAudio();
  els.recordStatus.textContent = 'Generating';
  try {
    const engine = els.modelSelect.value;
    const generated = engine === 'theory'
      ? generateRuleBasedContinuation()
      : await generateMusicVAEContinuation(engine);
    state.generatedNotes = generated;
    els.recordStatus.textContent = 'Ready';
    updateUI();
  } catch (error) {
    console.error(error);
    state.generatedNotes = generateRuleBasedContinuation();
    els.recordStatus.textContent = 'Ready';
    updateUI();
  }
}

function getDemoSeed(silent = false) {
  const demo = [
    { note: 'C4', midi: 60, time: 0, duration: 0.5, velocity: 0.85, origin: 'seed' },
    { note: 'E4', midi: 64, time: 0.55, duration: 0.5, velocity: 0.84, origin: 'seed' },
    { note: 'G4', midi: 67, time: 1.1, duration: 0.6, velocity: 0.88, origin: 'seed' },
    { note: 'A4', midi: 69, time: 1.7, duration: 0.55, velocity: 0.82, origin: 'seed' },
  ];
  if (!silent) {
    state.capturedNotes = demo;
    state.generatedNotes = [];
    state.noteStart = performance.now();
    updateUI();
  }
  return demo;
}

function playSequence(sequence) {
  if (!sequence.length) return;
  ensureAudio();
  const start = Tone.now() + 0.05;
  sequence.forEach((item) => {
    playNote(item.note, item.duration, start + item.time, item.velocity);
  });
}

function updateUI() {
  els.capturedCount.textContent = String(state.capturedNotes.length);
  els.generatedCount.textContent = String(state.generatedNotes.length);
  els.scaleReadout.textContent = `${els.rootSelect.value} ${els.scaleSelect.value}`;
  els.stepReadout.textContent = `${els.stepSelect.value} beats`;

  const combined = [...state.capturedNotes, ...state.generatedNotes].sort((a, b) => a.time - b.time);
  els.timeline.innerHTML = '';

  if (!combined.length) {
    const empty = document.createElement('div');
    empty.className = 'timeline-item';
    empty.innerHTML = '<strong>No notes yet</strong><span>Play a phrase or load the demo seed, then generate continuation.</span><span>—</span>';
    els.timeline.appendChild(empty);
    return;
  }

  combined.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = `timeline-item ${item.origin}`;
    row.innerHTML = `
      <strong>${item.origin === 'seed' ? 'Seed' : 'Gen'} ${idx + 1}</strong>
      <span>${item.note} · ${(item.time).toFixed(2)}s · ${(item.duration).toFixed(2)}s${item.chord ? ` · ${item.chord}` : ''}</span>
      <span>Vel ${(item.velocity * 100).toFixed(0)}%</span>
    `;
    els.timeline.appendChild(row);
  });
}

async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    els.midiStatus.textContent = 'Web MIDI unsupported in this browser';
    return;
  }
  try {
    state.midiAccess = await navigator.requestMIDIAccess();
    let bound = 0;
    for (const input of state.midiAccess.inputs.values()) {
      input.onmidimessage = async (event) => {
        const [status, noteNumber, velocity] = event.data;
        if (status === 144 && velocity > 0) {
          await ensureAudio();
          const noteName = Note.fromMidi(noteNumber) || 'C4';
          playNote(noteName, 0.5, Tone.now(), velocity / 127);
          recordSeedNote(noteName, 0.5, velocity / 127);
        }
      };
      bound += 1;
    }
    state.midiConnected = bound > 0;
    els.midiStatus.textContent = bound > 0 ? `${bound} MIDI input${bound > 1 ? 's' : ''} connected` : 'No MIDI inputs found';
  } catch (error) {
    els.midiStatus.textContent = 'MIDI access denied';
    console.error(error);
  }
}

function exportMidi() {
  const combined = [...state.capturedNotes, ...state.generatedNotes].sort((a, b) => a.time - b.time);
  if (!combined.length) {
    alert('Play or generate a phrase first.');
    return;
  }

  const midi = new Midi();
  midi.header.setTempo(100);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  const track = midi.addTrack();
  track.name = 'IUS Improvisation Preview';

  combined.forEach((item) => {
    track.addNote({
      midi: item.midi,
      time: item.time,
      duration: item.duration,
      velocity: item.velocity,
    });
  });

  const blob = new Blob([midi.toArray()], { type: 'audio/midi' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'ius-music-assistant-preview.mid';
  link.click();
  URL.revokeObjectURL(link.href);
}

function clearAll() {
  state.capturedNotes = [];
  state.generatedNotes = [];
  state.noteStart = performance.now();
  els.recordStatus.textContent = 'Idle';
  updateUI();
}

function playCapturedOnly() {
  playSequence([...state.capturedNotes]);
}

function playFullResult() {
  const combined = [...state.capturedNotes, ...state.generatedNotes].sort((a, b) => a.time - b.time);
  playSequence(combined);
}

function registerEvents() {
  els.startAudioBtn.addEventListener('click', ensureAudio);
  els.connectMidiBtn.addEventListener('click', connectMidi);
  els.seedDemoBtn.addEventListener('click', () => getDemoSeed(false));
  els.clearBtn.addEventListener('click', clearAll);
  els.improviseBtn.addEventListener('click', generateContinuation);
  els.playPhraseBtn.addEventListener('click', playCapturedOnly);
  els.playAllBtn.addEventListener('click', playFullResult);
  els.exportMidiBtn.addEventListener('click', exportMidi);

  [els.rootSelect, els.scaleSelect, els.stepSelect].forEach((el) => el.addEventListener('change', updateUI));

  document.addEventListener('keydown', async (event) => {
    if (event.repeat) return;
    const noteName = keyboardMap[event.key.toLowerCase()];
    if (!noteName) return;
    await ensureAudio();
    triggerInputNote(noteName, 0.5);
    const btn = [...document.querySelectorAll('.key')].find((key) => key.dataset.note === noteName);
    if (btn) flashKey(btn);
  });
}

function init() {
  populateRoots();
  createKeyboard();
  registerEvents();
  updateUI();
}

init();
