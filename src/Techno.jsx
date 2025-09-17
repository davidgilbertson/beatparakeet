import React, { useEffect, useRef, useState } from 'react';
import Soundfont from 'soundfont-player';
import createScheduler from './audio/scheduler.js';
import { getNormalizationGain } from './audio/normalization.js';

const ARRANGEMENT = [
  {
    name: 'Distant Intro',
    bars: 16,
    intensity: {
      kick: 0.35,
      clap: 0,
      hatsClosed: 0.18,
      hatsShuffle: 0.08,
      hatsOpen: 0,
      bass: 0,
      pad: 0.9,
      lead: 0,
      fx: 0.65,
    },
    bassPattern: 'none',
    leadPattern: 'none',
    hatPattern: 'light',
    fxMode: 'wash',
  },
  {
    name: 'Warm Build',
    bars: 32,
    intensity: {
      kick: 0.7,
      clap: 0.25,
      hatsClosed: 0.4,
      hatsShuffle: 0.3,
      hatsOpen: 0.15,
      bass: 0.45,
      pad: 1.0,
      lead: 0.25,
      fx: 0.75,
    },
    bassPattern: 'minimal',
    leadPattern: 'tease',
    hatPattern: 'light',
    fxMode: 'lift',
  },
  {
    name: 'Drop One',
    bars: 32,
    intensity: {
      kick: 1.05,
      clap: 0.55,
      hatsClosed: 0.9,
      hatsShuffle: 0.6,
      hatsOpen: 0.35,
      bass: 1.1,
      pad: 0.6,
      lead: 0.75,
      fx: 0.85,
    },
    bassPattern: 'driving',
    leadPattern: 'sparkle',
    hatPattern: 'wide',
    fxMode: 'impact',
  },
  {
    name: 'Airy Breakdown',
    bars: 16,
    intensity: {
      kick: 0.4,
      clap: 0.2,
      hatsClosed: 0.25,
      hatsShuffle: 0.12,
      hatsOpen: 0.08,
      bass: 0.3,
      pad: 1.0,
      lead: 0.2,
      fx: 0.9,
    },
    bassPattern: 'minimal',
    leadPattern: 'tease',
    hatPattern: 'light',
    fxMode: 'dive',
  },
  {
    name: 'Second Build',
    bars: 32,
    intensity: {
      kick: 0.9,
      clap: 0.45,
      hatsClosed: 0.8,
      hatsShuffle: 0.55,
      hatsOpen: 0.3,
      bass: 0.9,
      pad: 0.8,
      lead: 0.6,
      fx: 0.8,
    },
    bassPattern: 'rolling',
    leadPattern: 'sparkle',
    hatPattern: 'tight',
    fxMode: 'lift',
  },
  {
    name: 'Final Drop',
    bars: 24,
    intensity: {
      kick: 1.1,
      clap: 0.6,
      hatsClosed: 1.0,
      hatsShuffle: 0.75,
      hatsOpen: 0.5,
      bass: 1.15,
      pad: 0.7,
      lead: 0.95,
      fx: 0.9,
    },
    bassPattern: 'anthem',
    leadPattern: 'anthem',
    hatPattern: 'wide',
    fxMode: 'impact',
  },
  {
    name: 'Outro Fade',
    bars: 16,
    intensity: {
      kick: 0.55,
      clap: 0.2,
      hatsClosed: 0.35,
      hatsShuffle: 0.15,
      hatsOpen: 0.05,
      bass: 0.35,
      pad: 0.9,
      lead: 0.1,
      fx: 0.7,
    },
    bassPattern: 'minimal',
    leadPattern: 'none',
    hatPattern: 'light',
    fxMode: 'wash',
  },
];

const TOTAL_BARS = ARRANGEMENT.reduce((acc, section) => acc + section.bars, 0);

const CHORD_LIBRARY = {
  fm9: {
    pad: ['F3', 'Ab3', 'C4', 'Eb4', 'G4'],
    lead: ['C5', 'Eb5', 'F5', 'G5', 'Bb5', 'C6'],
    bass: { root: 'F2', fifth: 'C3', octave: 'F3' },
  },
  dbMaj9: {
    pad: ['Db3', 'F3', 'Ab3', 'C4', 'Eb4'],
    lead: ['Ab4', 'C5', 'Db5', 'F5', 'G5', 'Ab5'],
    bass: { root: 'Db2', fifth: 'Ab2', octave: 'Db3' },
  },
  eb7sus: {
    pad: ['Eb3', 'Ab3', 'Bb3', 'Db4', 'F4'],
    lead: ['Bb4', 'Db5', 'Eb5', 'F5', 'G5', 'Bb5'],
    bass: { root: 'Eb2', fifth: 'Bb2', octave: 'Eb3' },
  },
  c7: {
    pad: ['C3', 'E3', 'G3', 'Bb3', 'D4'],
    lead: ['G4', 'Bb4', 'C5', 'D5', 'E5', 'G5'],
    bass: { root: 'C2', fifth: 'G2', octave: 'C3' },
  },
  bbMin9: {
    pad: ['Bb2', 'Db3', 'F3', 'Ab3', 'C4'],
    lead: ['F4', 'Ab4', 'Bb4', 'C5', 'Db5', 'F5'],
    bass: { root: 'Bb1', fifth: 'F2', octave: 'Bb2' },
  },
  abMaj9: {
    pad: ['Ab2', 'C3', 'Eb3', 'G3', 'Bb3'],
    lead: ['Eb4', 'G4', 'Ab4', 'Bb4', 'C5', 'Eb5'],
    bass: { root: 'Ab1', fifth: 'Eb2', octave: 'Ab2' },
  },
};

const CHORD_SEQUENCE = [
  CHORD_LIBRARY.fm9,
  CHORD_LIBRARY.dbMaj9,
  CHORD_LIBRARY.eb7sus,
  CHORD_LIBRARY.c7,
  CHORD_LIBRARY.fm9,
  CHORD_LIBRARY.abMaj9,
  CHORD_LIBRARY.bbMin9,
  CHORD_LIBRARY.c7,
];

const NOTE_INDEX = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteToMidi(note) {
  const match = /^([A-G](?:b|#)?)(-?\d)$/.exec(note);
  if (!match) return 60;
  const [, name, octaveStr] = match;
  const octave = Number(octaveStr);
  const base = NOTE_INDEX[name] ?? 0;
  return base + (octave + 1) * 12;
}

function midiToNote(midi) {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  const name = NOTE_NAMES_SHARP[clamped % 12];
  return `${name}${octave}`;
}

function transpose(note, semitones) {
  return midiToNote(noteToMidi(note) + semitones);
}

const BASS_PATTERNS = {
  none: [],
  minimal: [
    { step: 0, role: 'root', len16: 6, vel: 1.0 },
    { step: 8, role: 'root', len16: 4, vel: 0.85 },
    { step: 12, role: 'fifth', len16: 4, vel: 0.8 },
  ],
  rolling: [
    { step: 0, role: 'root', len16: 6, vel: 1.05 },
    { step: 2, role: 'ghostDown', len16: 2, vel: 0.5 },
    { step: 4, role: 'fifth', len16: 4, vel: 0.95 },
    { step: 6, role: 'ghostUp', len16: 2, vel: 0.52 },
    { step: 8, role: 'octave', len16: 4, vel: 0.98 },
    { step: 12, role: 'root', len16: 6, vel: 1.0 },
    { step: 14, role: 'ghostDown', len16: 2, vel: 0.58 },
  ],
  driving: [
    { step: 0, role: 'root', len16: 6, vel: 1.15 },
    { step: 1, role: 'ghostDown', len16: 1, vel: 0.48 },
    { step: 2, role: 'fifth', len16: 4, vel: 0.92 },
    { step: 3, role: 'ghostUp', len16: 1, vel: 0.52 },
    { step: 4, role: 'octave', len16: 4, vel: 1.02 },
    { step: 6, role: 'ghostDown', len16: 2, vel: 0.55 },
    { step: 8, role: 'root', len16: 4, vel: 1.08 },
    { step: 10, role: 'fifth', len16: 3, vel: 0.9 },
    { step: 12, role: 'octave', len16: 6, vel: 1.1 },
    { step: 14, role: 'ghostUp', len16: 2, vel: 0.58 },
  ],
  anthem: [
    { step: 0, role: 'root', len16: 6, vel: 1.2 },
    { step: 2, role: 'fifth', len16: 4, vel: 0.95 },
    { step: 4, role: 'octave', len16: 6, vel: 1.1 },
    { step: 6, role: 'walkUp', len16: 2, vel: 0.72 },
    { step: 8, role: 'rootHi', len16: 4, vel: 1.05 },
    { step: 10, role: 'fifth', len16: 3, vel: 0.92 },
    { step: 12, role: 'octave', len16: 6, vel: 1.18 },
    { step: 14, role: 'walkDown', len16: 2, vel: 0.78 },
  ],
};

const LEAD_PATTERNS = {
  none: Array(16).fill(null),
  tease: [
    null, null, null, null,
    { idx: 0, len16: 4, vel: 0.5 },
    null,
    { idx: 2, len16: 3, vel: 0.46 },
    null,
    null,
    { idx: 1, len16: 2, vel: 0.45 },
    null,
    null,
    { idx: 3, len16: 3, vel: 0.48 },
    null,
    null,
    null,
  ],
  sparkle: [
    { idx: 0, len16: 2, vel: 0.48 },
    null,
    { idx: 1, len16: 2, vel: 0.42 },
    null,
    { idx: 2, len16: 2, vel: 0.55 },
    null,
    { idx: 3, len16: 2, vel: 0.5 },
    null,
    { idx: 4, len16: 2, vel: 0.58 },
    null,
    { idx: 2, len16: 2, vel: 0.5 },
    null,
    { idx: 1, len16: 2, vel: 0.44 },
    null,
    { idx: 0, len16: 2, vel: 0.48 },
    null,
  ],
  anthem: [
    { idx: 4, len16: 2, vel: 0.68 },
    null,
    { idx: 3, len16: 2, vel: 0.6 },
    { idx: 2, len16: 2, vel: 0.56 },
    { idx: 1, len16: 2, vel: 0.62 },
    null,
    { idx: 5, len16: 2, vel: 0.7 },
    { idx: 4, len16: 2, vel: 0.66 },
    { idx: 3, len16: 2, vel: 0.6 },
    null,
    { idx: 2, len16: 2, vel: 0.56 },
    null,
    { idx: 1, len16: 2, vel: 0.6 },
    null,
    { idx: 0, len16: 2, vel: 0.58 },
    { idx: 2, len16: 2, vel: 0.55 },
  ],
};

function resolveBassRole(chord, role) {
  const { root, fifth, octave } = chord.bass;
  switch (role) {
    case 'root':
      return root;
    case 'fifth':
      return fifth || transpose(root, 7);
    case 'octave':
      return octave || transpose(root, 12);
    case 'rootHi':
      return transpose(root, 12);
    case 'ghostDown':
      return transpose(root, -2);
    case 'ghostUp':
      return transpose(root, -1);
    case 'walkUp':
      return transpose(root, 5);
    case 'walkDown':
      return transpose(fifth || root, -3);
    default:
      return root;
  }
}

function getSectionForBar(bar) {
  let cursor = 0;
  for (let i = 0; i < ARRANGEMENT.length; i++) {
    const section = ARRANGEMENT[i];
    const start = cursor;
    const end = cursor + section.bars;
    if (bar < end) {
      return {
        section,
        index: i,
        offset: bar - start,
        isSectionStart: bar === start,
      };
    }
    cursor = end;
  }
  const lastIndex = ARRANGEMENT.length - 1;
  return {
    section: ARRANGEMENT[lastIndex],
    index: lastIndex,
    offset: ARRANGEMENT[lastIndex].bars - 1,
    isSectionStart: false,
  };
}

function createNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createImpulseResponse(ctx, seconds = 2.8) {
  const sampleLength = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, sampleLength, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < sampleLength; i++) {
      const decay = Math.pow(1 - i / sampleLength, 3.5);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return impulse;
}

function makeDriveCurve(amount = 0.5) {
  const k = amount * 100;
  const samples = 1024;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export default function Techno() {
  const [bpm, setBpm] = useState(() => {
    const stored = localStorage.getItem('bp_techno_bpm');
    if (stored == null) return 128;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 128;
    return Math.min(138, Math.max(118, parsed));
  });
  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
    try { localStorage.setItem('bp_techno_bpm', String(bpm)); } catch {}
    if (schedulerRef.current) schedulerRef.current.setBpm(bpm);
  }, [bpm]);

  const [energy, setEnergy] = useState(() => {
    const stored = localStorage.getItem('bp_techno_energy');
    if (stored == null) return 0.6;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.6;
    return Math.min(1, Math.max(0, parsed));
  });
  const energyRef = useRef(energy);
  useEffect(() => {
    energyRef.current = energy;
    try { localStorage.setItem('bp_techno_energy', String(energy)); } catch {}
    updateEnergyCurve();
  }, [energy]);

  const [padLevel, setPadLevel] = useState(() => {
    const stored = localStorage.getItem('bp_techno_pad');
    if (stored == null) return 0.85;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.85;
    return Math.min(1.25, Math.max(0, parsed));
  });
  const padLevelRef = useRef(padLevel);
  useEffect(() => {
    padLevelRef.current = padLevel;
    try { localStorage.setItem('bp_techno_pad', String(padLevel)); } catch {}
    const ctx = nodesRef.current?.ctx;
    if (ctx && nodesRef.current.padBus) {
      const now = ctx.currentTime;
      nodesRef.current.padBus.gain.cancelScheduledValues(now);
      nodesRef.current.padBus.gain.setTargetAtTime(padLevel, now, 0.08);
    }
  }, [padLevel]);

  const [bassLevel, setBassLevel] = useState(() => {
    const stored = localStorage.getItem('bp_techno_bass');
    if (stored == null) return 0.9;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.9;
    return Math.min(1.4, Math.max(0, parsed));
  });
  const bassLevelRef = useRef(bassLevel);
  useEffect(() => {
    bassLevelRef.current = bassLevel;
    try { localStorage.setItem('bp_techno_bass', String(bassLevel)); } catch {}
    const ctx = nodesRef.current?.ctx;
    if (ctx && nodesRef.current.bassBus) {
      const now = ctx.currentTime;
      nodesRef.current.bassBus.gain.cancelScheduledValues(now);
      nodesRef.current.bassBus.gain.setTargetAtTime(bassLevel, now, 0.08);
    }
  }, [bassLevel]);

  const [leadLevel, setLeadLevel] = useState(() => {
    const stored = localStorage.getItem('bp_techno_lead');
    if (stored == null) return 0.8;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.8;
    return Math.min(1.2, Math.max(0, parsed));
  });
  const leadLevelRef = useRef(leadLevel);
  useEffect(() => {
    leadLevelRef.current = leadLevel;
    try { localStorage.setItem('bp_techno_lead', String(leadLevel)); } catch {}
    const ctx = nodesRef.current?.ctx;
    if (ctx && nodesRef.current.leadBus) {
      const now = ctx.currentTime;
      nodesRef.current.leadBus.gain.cancelScheduledValues(now);
      nodesRef.current.leadBus.gain.setTargetAtTime(leadLevel, now, 0.08);
    }
  }, [leadLevel]);

  const [fxLevel, setFxLevel] = useState(() => {
    const stored = localStorage.getItem('bp_techno_fx');
    if (stored == null) return 0.7;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.7;
    return Math.min(1.2, Math.max(0, parsed));
  });
  const fxLevelRef = useRef(fxLevel);
  useEffect(() => {
    fxLevelRef.current = fxLevel;
    try { localStorage.setItem('bp_techno_fx', String(fxLevel)); } catch {}
    const ctx = nodesRef.current?.ctx;
    if (ctx && nodesRef.current.fxBus) {
      const now = ctx.currentTime;
      nodesRef.current.fxBus.gain.cancelScheduledValues(now);
      nodesRef.current.fxBus.gain.setTargetAtTime(fxLevel, now, 0.1);
    }
  }, [fxLevel]);

  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  const nodesRef = useRef({});
  const schedulerRef = useRef(null);
  const arrangementStateRef = useRef({ section: ARRANGEMENT[0], index: 0, offset: 0 });
  const chordRef = useRef(CHORD_SEQUENCE[0]);
  const fadeScheduledRef = useRef(false);

  function updateEnergyCurve() {
    const ctx = nodesRef.current?.ctx;
    const nodes = nodesRef.current;
    if (!ctx || !nodes?.colorLow || !nodes?.colorHigh || !nodes?.drive) return;
    const now = ctx.currentTime;
    const amount = energyRef.current;
    // low shelf: tame lows at low energy, boost at high
    const lowGain = -4 + amount * 6;
    nodes.colorLow.gain.cancelScheduledValues(now);
    nodes.colorLow.gain.setTargetAtTime(lowGain, now, 0.15);
    // high sheen boost up to +9dB
    const highGain = -2 + amount * 11;
    nodes.colorHigh.gain.cancelScheduledValues(now);
    nodes.colorHigh.gain.setTargetAtTime(highGain, now, 0.12);
    nodes.drive.curve = makeDriveCurve(0.25 + amount * 0.9);
    if (nodes.masterGain) {
      const target = 0.85 + amount * 0.1;
      nodes.masterGain.gain.cancelScheduledValues(now);
      nodes.masterGain.gain.setTargetAtTime(target, now, 0.4);
    }
    if (nodes.reverbGain) {
      const target = 0.24 + amount * 0.12;
      nodes.reverbGain.gain.cancelScheduledValues(now);
      nodes.reverbGain.gain.setTargetAtTime(target, now, 0.2);
    }
  }

  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(ctx.destination);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.25;
    compressor.connect(masterGain);

    const drive = ctx.createWaveShaper();
    drive.curve = makeDriveCurve(0.6);

    const colorLow = ctx.createBiquadFilter();
    colorLow.type = 'lowshelf';
    colorLow.frequency.value = 160;
    colorLow.gain.value = -2;

    const colorHigh = ctx.createBiquadFilter();
    colorHigh.type = 'peaking';
    colorHigh.Q.value = 0.9;
    colorHigh.frequency.value = 3800;
    colorHigh.gain.value = 2;

    const mixBus = ctx.createGain();
    mixBus.gain.value = 1;

    mixBus.connect(colorLow);
    colorLow.connect(colorHigh);
    colorHigh.connect(drive);
    drive.connect(compressor);

    const reverb = ctx.createConvolver();
    reverb.buffer = createImpulseResponse(ctx, 3.8);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.28;
    reverb.connect(reverbGain);
    reverbGain.connect(mixBus);

    const delay = ctx.createDelay(0.75);
    delay.delayTime.value = 0.32;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.34;
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 4800;
    delay.connect(delayFeedback);
    delayFeedback.connect(delayFilter);
    delayFilter.connect(delay);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.42;
    delay.connect(delayOut);
    delayOut.connect(mixBus);
    delayOut.connect(reverb);

    const drumsBus = ctx.createGain();
    drumsBus.gain.value = 1;
    drumsBus.connect(mixBus);

    const kickBus = ctx.createGain();
    kickBus.gain.value = 1.05;
    kickBus.connect(drumsBus);

    const clapBus = ctx.createGain();
    clapBus.gain.value = 0.8;
    clapBus.connect(drumsBus);
    const clapVerbSend = ctx.createGain();
    clapVerbSend.gain.value = 0.26;
    clapVerbSend.connect(reverb);

    const hatBus = ctx.createGain();
    hatBus.gain.value = 0.75;
    hatBus.connect(drumsBus);

    const percBus = ctx.createGain();
    percBus.gain.value = 0.6;
    percBus.connect(drumsBus);

    const bassBus = ctx.createGain();
    bassBus.gain.value = bassLevelRef.current;
    bassBus.connect(mixBus);
    const bassNorm = ctx.createGain();
    bassNorm.gain.value = 1;
    bassNorm.connect(bassBus);

    const padBus = ctx.createGain();
    padBus.gain.value = padLevelRef.current;
    padBus.connect(mixBus);
    const padNorm = ctx.createGain();
    padNorm.gain.value = 1;
    padNorm.connect(padBus);
    const padVerbSend = ctx.createGain();
    padVerbSend.gain.value = 0.46;
    padVerbSend.connect(reverb);
    padBus.connect(padVerbSend);

    const leadBus = ctx.createGain();
    leadBus.gain.value = leadLevelRef.current;
    leadBus.connect(mixBus);
    const leadNorm = ctx.createGain();
    leadNorm.gain.value = 1;
    leadNorm.connect(leadBus);
    const leadDelaySend = ctx.createGain();
    leadDelaySend.gain.value = 0.65;
    leadDelaySend.connect(delay);
    const leadVerbSend = ctx.createGain();
    leadVerbSend.gain.value = 0.32;
    leadVerbSend.connect(reverb);
    leadBus.connect(leadDelaySend);
    leadBus.connect(leadVerbSend);

    const fxBus = ctx.createGain();
    fxBus.gain.value = fxLevelRef.current;
    fxBus.connect(mixBus);
    const stabNorm = ctx.createGain();
    stabNorm.gain.value = 1;
    stabNorm.connect(fxBus);
    const fxVerbSend = ctx.createGain();
    fxVerbSend.gain.value = 0.5;
    fxVerbSend.connect(reverb);
    fxBus.connect(fxVerbSend);

    const noiseBuffer = createNoiseBuffer(ctx);

    const nodes = {
      ctx,
      masterGain,
      compressor,
      drive,
      colorLow,
      colorHigh,
      mixBus,
      reverb,
      reverbGain,
      delay,
      delayFeedback,
      delayOut,
      drumsBus,
      kickBus,
      clapBus,
      clapVerbSend,
      hatBus,
      percBus,
      bassBus,
      bassNorm,
      padBus,
      padNorm,
      padVerbSend,
      leadBus,
      leadNorm,
      leadDelaySend,
      leadVerbSend,
      fxBus,
      stabNorm,
      fxVerbSend,
      noiseBuffer,
    };
    nodesRef.current = nodes;

    let isMounted = true;
    Soundfont.instrument(ctx, 'synth_bass_2', { soundfont: 'MusyngKite' })
      .then(inst => {
        if (!isMounted) return;
        nodes.bassInstrument = inst;
        if (inst.disconnect) {
          try { inst.disconnect(); } catch {}
        }
        if (inst.connect) inst.connect(nodes.bassNorm);
        const gain = getNormalizationGain(inst, 'sf:synth_bass_2');
        nodes.bassNorm.gain.value = Number.isFinite(gain) ? gain : 1;
      })
      .catch(() => {});

    Soundfont.instrument(ctx, 'synth_strings_1', { soundfont: 'MusyngKite' })
      .then(inst => {
        if (!isMounted) return;
        nodes.padInstrument = inst;
        if (inst.disconnect) {
          try { inst.disconnect(); } catch {}
        }
        if (inst.connect) inst.connect(nodes.padNorm);
        const gain = getNormalizationGain(inst, 'sf:synth_strings_1');
        nodes.padNorm.gain.value = Number.isFinite(gain) ? gain : 1;
      })
      .catch(() => {});

    Soundfont.instrument(ctx, 'lead_2_sawtooth', { soundfont: 'MusyngKite' })
      .then(inst => {
        if (!isMounted) return;
        nodes.leadInstrument = inst;
        if (inst.disconnect) {
          try { inst.disconnect(); } catch {}
        }
        if (inst.connect) inst.connect(nodes.leadNorm);
        const gain = getNormalizationGain(inst, 'sf:lead_2_sawtooth');
        nodes.leadNorm.gain.value = Number.isFinite(gain) ? gain : 1;
      })
      .catch(() => {});

    Soundfont.instrument(ctx, 'synth_brass_1', { soundfont: 'MusyngKite' })
      .then(inst => {
        if (!isMounted) return;
        nodes.stabInstrument = inst;
        if (inst.disconnect) {
          try { inst.disconnect(); } catch {}
        }
        if (inst.connect) inst.connect(nodes.stabNorm);
        const gain = getNormalizationGain(inst, 'sf:synth_brass_1');
        nodes.stabNorm.gain.value = Number.isFinite(gain) ? gain : 1;
      })
      .catch(() => {});

    const scheduler = createScheduler(ctx, {
      bpm: bpmRef.current,
      swing: 0.1,
    });

    function triggerKick(time, amt = 1) {
      if (!playingRef.current) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(68, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.18);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(1.2 * amt, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
      osc.connect(gain);
      gain.connect(nodes.kickBus);
      osc.start(time);
      osc.stop(time + 0.5);
    }

    function triggerClap(time, amt = 1) {
      if (!playingRef.current) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, time);
      filter.Q.value = 0.9;
      const gain = ctx.createGain();
      const envStages = [0, 0.03, 0.06];
      envStages.forEach((offset, idx) => {
        const peak = (idx === 0 ? 1 : 0.75) * amt;
        gain.gain.setValueAtTime(0, time + offset);
        gain.gain.linearRampToValueAtTime(peak, time + offset + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + offset + 0.12);
      });
      src.connect(filter);
      filter.connect(gain);
      gain.connect(nodes.clapBus);
      gain.connect(nodes.clapVerbSend);
      src.start(time);
      src.stop(time + 0.35);
    }

    function triggerHat(time, amt = 1, open = false) {
      if (!playingRef.current) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = open ? 8000 : 9000;
      hp.Q.value = open ? 0.7 : 1.2;
      const gain = ctx.createGain();
      const start = open ? 0.0001 : 0.0001;
      gain.gain.setValueAtTime(start, time);
      if (open) {
        gain.gain.linearRampToValueAtTime(0.8 * amt, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.38);
      } else {
        gain.gain.linearRampToValueAtTime(0.6 * amt, time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
      }
      src.connect(hp);
      hp.connect(gain);
      gain.connect(nodes.hatBus);
      if (open) gain.connect(nodes.fxBus);
      src.start(time);
      src.stop(time + (open ? 0.5 : 0.2));
    }

    function triggerPercTick(time, amt = 1) {
      if (!playingRef.current) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 3.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.4 * amt, time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(nodes.percBus);
      src.start(time);
      src.stop(time + 0.2);
    }

    function triggerImpact(time, amt = 1) {
      if (!playingRef.current) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(1.2 * amt, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);
      src.connect(hp);
      hp.connect(gain);
      gain.connect(nodes.fxBus);
      gain.connect(nodes.fxVerbSend);
      src.start(time);
      src.stop(time + 2);
    }

    function triggerRiser(time, lengthSec, amt = 1) {
      if (!playingRef.current) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(600, time);
      hp.frequency.linearRampToValueAtTime(9000, time + lengthSec);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.9 * amt, time + lengthSec * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + lengthSec + 0.6);
      src.connect(hp);
      hp.connect(gain);
      gain.connect(nodes.fxBus);
      gain.connect(nodes.fxVerbSend);
      src.start(time);
      src.stop(time + lengthSec + 1);
    }

    function triggerDownshift(time, lengthSec, amt = 1) {
      if (!playingRef.current) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(10000, time);
      lp.frequency.linearRampToValueAtTime(600, time + lengthSec);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6 * amt, time);
      gain.gain.linearRampToValueAtTime(0.0001, time + lengthSec + 0.2);
      src.connect(lp);
      lp.connect(gain);
      gain.connect(nodes.fxBus);
      src.start(time);
      src.stop(time + lengthSec + 0.3);
    }

    function schedulePadChord(time, chord, padAmt) {
      if (!nodes.padInstrument || !playingRef.current) return;
      const secondsPerBeat = 60 / bpmRef.current;
      const duration = secondsPerBeat * 4 * 0.95;
      chord.pad.forEach((note, idx) => {
        const weight = idx === 0 ? 0.6 : 0.4;
        try {
          nodes.padInstrument.play(note, time, {
            gain: padAmt * weight,
            duration,
          });
        } catch {}
      });
    }

    function maybeTriggerChordStab(time, chord, amt) {
      if (!nodes.stabInstrument || !playingRef.current) return;
      const secondsPerBeat = 60 / bpmRef.current;
      const duration = secondsPerBeat * 0.9;
      const voicing = [chord.pad[1] || chord.pad[0], chord.pad[3] || chord.pad[2], chord.pad[4] || transpose(chord.pad[2], 7)];
      voicing.forEach((note, idx) => {
        try {
          nodes.stabInstrument.play(note, time, {
            gain: amt * (idx === 0 ? 0.4 : 0.3),
            duration,
          });
        } catch {}
      });
    }

    function triggerBass(time, chord, event, bassAmt) {
      if (!nodes.bassInstrument || !playingRef.current) return;
      const secondsPerBeat = 60 / bpmRef.current;
      const sixteenth = secondsPerBeat / 4;
      const duration = Math.max(sixteenth * (event.len16 ?? 2), sixteenth * 0.9);
      const note = resolveBassRole(chord, event.role);
      try {
        nodes.bassInstrument.play(note, time, {
          gain: bassAmt * event.vel,
          duration,
        });
      } catch {}
    }

    function triggerLead(time, chord, event, leadAmt) {
      if (!nodes.leadInstrument || !playingRef.current) return;
      const secondsPerBeat = 60 / bpmRef.current;
      const sixteenth = secondsPerBeat / 4;
      const duration = Math.max(sixteenth * (event.len16 ?? 2), sixteenth * 0.7);
      const idx = Math.min(chord.lead.length - 1, event.idx);
      const note = chord.lead[idx];
      try {
        nodes.leadInstrument.play(note, time, {
          gain: leadAmt * event.vel,
          duration,
        });
      } catch {}
    }

    function handleSixteenth(time, sixteenth, barCount) {
      const { section, offset } = arrangementStateRef.current;
      const energy = energyRef.current;
      const base = section.intensity;
      const hatEnergy = base.hatsClosed * (0.55 + energy * 0.7);
      const shuffleEnergy = base.hatsShuffle * (0.35 + energy * 0.8);
      const openEnergy = base.hatsOpen * (0.3 + energy * 0.75);
      const bassAmt = base.bass * (0.85 + energy * 0.5) * bassLevelRef.current;
      const leadAmt = base.lead * (0.7 + energy * 0.65) * leadLevelRef.current;
      const barsRemaining = section.bars - offset - 1;

      const beatIndex = sixteenth % 4;
      if (beatIndex === 0) {
        const accent = base.kick * (0.85 + energy * 0.3);
        triggerKick(time, accent);
      }

      if ((sixteenth === 4 || sixteenth === 12) && base.clap > 0.01) {
        const clapAmt = base.clap * (0.7 + energy * 0.35);
        triggerClap(time, clapAmt);
      }

      if (sixteenth % 2 === 0) {
        const downbeatBoost = beatIndex === 0 ? 1.08 : 1;
        const scale = section.hatPattern === 'light' ? 0.78 : section.hatPattern === 'tight' ? 0.95 : 1.1;
        triggerHat(time, hatEnergy * scale * downbeatBoost, false);
      }

      if (section.hatPattern !== 'light' && sixteenth % 2 === 1 && shuffleEnergy > 0.02) {
        const chance = section.hatPattern === 'tight' ? 0.65 : 0.45;
        if (Math.random() < chance) {
          triggerHat(time, shuffleEnergy * 0.72, false);
        }
      }

      if (openEnergy > 0.01 && (sixteenth === 6 || sixteenth === 14)) {
        triggerHat(time, openEnergy, true);
      }

      if (section.hatPattern !== 'light' && sixteenth === 15 && Math.random() < 0.4) {
        triggerPercTick(time, base.hatsShuffle * 0.5);
      }

      if (section.fxMode === 'lift' && barsRemaining === 0 && sixteenth === 0) {
        const secondsPerBeat = 60 / bpmRef.current;
        triggerRiser(time, secondsPerBeat * 4, base.fx * fxLevelRef.current);
      }

      const bassPattern = BASS_PATTERNS[section.bassPattern] || [];
      for (const event of bassPattern) {
        if (event.step === sixteenth) {
          triggerBass(time, chordRef.current, event, bassAmt);
        }
      }

      const leadPattern = LEAD_PATTERNS[section.leadPattern] || [];
      const leadEvent = leadPattern[sixteenth];
      if (leadEvent) {
        triggerLead(time, chordRef.current, leadEvent, leadAmt);
      }

      if (section.fxMode === 'impact' && sixteenth === 0 && offset % 4 === 0 && base.fx > 0.05) {
        triggerPercTick(time + 0.18, base.fx * 0.6);
      }

      if (section.fxMode === 'dive' && sixteenth === 0 && base.fx > 0.1 && offset % 2 === 0) {
        triggerPercTick(time + 0.12, base.fx * 0.4);
      }

      if (section.fxMode === 'impact' && sixteenth === 15 && (offset + 1) % 8 === 0) {
        triggerClap(time + 0.1, base.fx * 0.9);
      }

      if (section.leadPattern === 'anthem' && sixteenth === 12 && Math.random() < 0.6) {
        maybeTriggerChordStab(time + 0.02, chordRef.current, base.lead * 0.35 * leadLevelRef.current);
      }
    }

    function handleBar(time, barCount) {
      const lookup = getSectionForBar(barCount);
      const prev = arrangementStateRef.current;
      arrangementStateRef.current = lookup;
      const changed = prev.section !== lookup.section;
      const chord = CHORD_SEQUENCE[barCount % CHORD_SEQUENCE.length];
      chordRef.current = chord;

      const padAmt = lookup.section.intensity.pad * padLevelRef.current;
      schedulePadChord(time, chord, padAmt);

      if (changed && barCount > 0) {
        const secondsPerBeat = 60 / bpmRef.current;
        if (lookup.section.fxMode === 'impact') {
          triggerImpact(time, lookup.section.intensity.fx * fxLevelRef.current * 1.1);
        } else if (lookup.section.fxMode === 'wash') {
          triggerRiser(time, secondsPerBeat * 6, lookup.section.intensity.fx * fxLevelRef.current * 0.7);
        } else if (lookup.section.fxMode === 'dive') {
          triggerDownshift(time, secondsPerBeat * 5, lookup.section.intensity.fx * fxLevelRef.current);
        }
      }

      if (lookup.offset % 8 === 4 && lookup.section.intensity.lead > 0.2) {
        maybeTriggerChordStab(time + 0.02, chord, lookup.section.intensity.lead * 0.42 * leadLevelRef.current);
      }

      if (barCount >= TOTAL_BARS && !fadeScheduledRef.current) {
        fadeScheduledRef.current = true;
        const fadeGain = nodes.masterGain;
        const now = ctx.currentTime;
        fadeGain.gain.cancelScheduledValues(now);
        fadeGain.gain.setTargetAtTime(0.0001, time, 1.5);
        setTimeout(() => {
          if (!schedulerRef.current) return;
          schedulerRef.current.stop();
          setPlaying(false);
        }, 4000);
      }
    }

    scheduler.setCallbacks({
      onSixteenth: handleSixteenth,
      onBar: handleBar,
    });

    schedulerRef.current = scheduler;
    updateEnergyCurve();

    return () => {
      isMounted = false;
      scheduler.stop();
      try { ctx.close(); } catch {}
      nodesRef.current = {};
      schedulerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = async () => {
    if (!nodesRef.current?.ctx || !schedulerRef.current) return;
    await nodesRef.current.ctx.resume();
    fadeScheduledRef.current = false;
    arrangementStateRef.current = { section: ARRANGEMENT[0], index: 0, offset: 0 };
    chordRef.current = CHORD_SEQUENCE[0];
    updateEnergyCurve();
    if (nodesRef.current.masterGain) {
      const now = nodesRef.current.ctx.currentTime;
      nodesRef.current.masterGain.gain.cancelScheduledValues(now);
      nodesRef.current.masterGain.gain.setTargetAtTime(0.9, now, 0.25);
    }
    if (!playingRef.current) {
      schedulerRef.current.start(0.1);
      setPlaying(true);
    }
  };

  const stop = () => {
    if (!schedulerRef.current || !nodesRef.current?.ctx) return;
    schedulerRef.current.stop();
    const ctx = nodesRef.current.ctx;
    const now = ctx.currentTime;
    if (nodesRef.current.masterGain) {
      nodesRef.current.masterGain.gain.cancelScheduledValues(now);
      nodesRef.current.masterGain.gain.setTargetAtTime(0.0001, now, 0.25);
      nodesRef.current.masterGain.gain.setTargetAtTime(0.9, now + 0.6, 0.01);
    }
    setPlaying(false);
  };

  const bpmDisplay = `${Math.round(bpm)} BPM`;

  return (
    <div className="card">
      <div className="titlebar">
        <h1>Neon Bunker — Techno Journey</h1>
        <span className="tag">~5 minute arrangement</span>
      </div>

      <div className="controls">
        <div className="slider-row">
          <label htmlFor="bpm">Tempo<span className="value">{bpmDisplay}</span></label>
          <input
            id="bpm"
            type="range"
            min="118"
            max="138"
            step="1"
            value={bpm}
            onChange={(ev) => setBpm(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="energy">Energy / Drive<span className="value">{(energy * 100).toFixed(0)}%</span></label>
          <input
            id="energy"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={energy}
            onChange={(ev) => setEnergy(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="pad">Pad Depth<span className="value">{padLevel.toFixed(2)}</span></label>
          <input
            id="pad"
            type="range"
            min="0"
            max="1.25"
            step="0.01"
            value={padLevel}
            onChange={(ev) => setPadLevel(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="bass">Bass Weight<span className="value">{bassLevel.toFixed(2)}</span></label>
          <input
            id="bass"
            type="range"
            min="0"
            max="1.4"
            step="0.01"
            value={bassLevel}
            onChange={(ev) => setBassLevel(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="lead">Lead Sparkle<span className="value">{leadLevel.toFixed(2)}</span></label>
          <input
            id="lead"
            type="range"
            min="0"
            max="1.2"
            step="0.01"
            value={leadLevel}
            onChange={(ev) => setLeadLevel(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="fx">Atmosphere / FX<span className="value">{fxLevel.toFixed(2)}</span></label>
          <input
            id="fx"
            type="range"
            min="0"
            max="1.2"
            step="0.01"
            value={fxLevel}
            onChange={(ev) => setFxLevel(Number(ev.target.value))}
          />
        </div>
      </div>

      <button
        type="button"
        className="play-btn"
        data-state={playing ? 'playing' : 'stopped'}
        onClick={playing ? stop : play}
      >
        {playing ? 'Stop The System' : 'Launch The Techno Trip'}
      </button>
    </div>
  );
}
