import React, { useEffect, useRef, useState } from 'react';
import Soundfont from 'soundfont-player';
import createScheduler from './audio/scheduler.js';
import { getNormalizationGain } from './audio/normalization.js';

const SILENCE_EPS = 0.0005;

const ARRANGEMENT = [
  {
    name: 'Still Water',
    bars: 16,
    intensity: { piano: 0.72, strings: 0.3, winds: 0.08, texture: 0.2 },
    pianoPattern: 'delicate',
    stringMode: 'drones',
    windMode: 'sparse',
    textureMode: 'mist',
    pedalChord: true,
    sparkle: 0.08,
  },
  {
    name: 'First Theme',
    bars: 24,
    intensity: { piano: 0.85, strings: 0.45, winds: 0.15, texture: 0.26 },
    pianoPattern: 'rolling',
    stringMode: 'arcs',
    windMode: 'answer',
    textureMode: 'stream',
    pedalChord: true,
    sparkle: 0.14,
  },
  {
    name: 'Open Skies',
    bars: 20,
    intensity: { piano: 0.78, strings: 0.55, winds: 0.22, texture: 0.28 },
    pianoPattern: 'wide',
    stringMode: 'legato',
    windMode: 'duet',
    textureMode: 'breeze',
    pedalChord: true,
    sparkle: 0.18,
  },
  {
    name: 'Quiet River',
    bars: 28,
    intensity: { piano: 0.82, strings: 0.5, winds: 0.12, texture: 0.22 },
    pianoPattern: 'cascade',
    stringMode: 'drones',
    windMode: 'sparse',
    textureMode: 'stream',
    pedalChord: false,
    sparkle: 0.1,
  },
  {
    name: 'Return To Light',
    bars: 18,
    intensity: { piano: 0.68, strings: 0.42, winds: 0.1, texture: 0.18 },
    pianoPattern: 'delicate',
    stringMode: 'legato',
    windMode: 'tail',
    textureMode: 'mist',
    pedalChord: true,
    sparkle: 0.06,
  },
];

const TOTAL_BARS = ARRANGEMENT.reduce((sum, section) => sum + section.bars, 0);

const CHORD_LIBRARY = {
  dm9: {
    piano: ['D4', 'A4', 'C5', 'E5', 'F5', 'A5'],
    strings: ['D3', 'F3', 'A3', 'C4', 'E4'],
    winds: ['A4', 'C5', 'E5', 'F5'],
    bass: { root: 'D2', fifth: 'A2', octave: 'D3' },
  },
  bbMaj7: {
    piano: ['Bb3', 'F4', 'A4', 'C5', 'D5', 'F5'],
    strings: ['Bb2', 'D3', 'F3', 'A3', 'C4'],
    winds: ['F4', 'A4', 'C5', 'D5'],
    bass: { root: 'Bb1', fifth: 'F2', octave: 'Bb2' },
  },
  fMaj9: {
    piano: ['F3', 'C4', 'E4', 'G4', 'A4', 'C5'],
    strings: ['F2', 'A2', 'C3', 'E3', 'G3'],
    winds: ['C4', 'E4', 'G4', 'A4'],
    bass: { root: 'F2', fifth: 'C3', octave: 'F3' },
  },
  cAdd9: {
    piano: ['C4', 'G4', 'D5', 'E5', 'G5', 'B5'],
    strings: ['C3', 'E3', 'G3', 'B3', 'D4'],
    winds: ['G4', 'B4', 'D5', 'E5'],
    bass: { root: 'C2', fifth: 'G2', octave: 'C3' },
  },
  gm9: {
    piano: ['G3', 'D4', 'F4', 'A4', 'Bb4', 'D5'],
    strings: ['G2', 'Bb2', 'D3', 'F3', 'A3'],
    winds: ['D4', 'F4', 'A4', 'Bb4'],
    bass: { root: 'G2', fifth: 'D3', octave: 'G3' },
  },
  am7: {
    piano: ['A3', 'E4', 'G4', 'C5', 'D5', 'E5'],
    strings: ['A2', 'C3', 'E3', 'G3', 'B3'],
    winds: ['E4', 'G4', 'C5', 'D5'],
    bass: { root: 'A2', fifth: 'E3', octave: 'A3' },
  },
  aSus: {
    piano: ['A3', 'E4', 'B4', 'D5', 'E5', 'A5'],
    strings: ['A2', 'D3', 'E3', 'A3', 'B3'],
    winds: ['E4', 'A4', 'B4', 'D5'],
    bass: { root: 'A2', fifth: 'E3', octave: 'A3' },
  },
};

const CHORD_SEQUENCE = [
  CHORD_LIBRARY.dm9,
  CHORD_LIBRARY.bbMaj7,
  CHORD_LIBRARY.fMaj9,
  CHORD_LIBRARY.cAdd9,
  CHORD_LIBRARY.gm9,
  CHORD_LIBRARY.dm9,
  CHORD_LIBRARY.bbMaj7,
  CHORD_LIBRARY.aSus,
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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteToMidi(note) {
  const match = /^([A-G](?:#|b)?)(-?\d)$/.exec(note);
  if (!match) return 60;
  const [, name, octaveStr] = match;
  const octave = Number(octaveStr);
  const base = NOTE_INDEX[name] ?? 0;
  return base + (octave + 1) * 12;
}

function midiToNote(midi) {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  const name = NOTE_NAMES[clamped % 12];
  return `${name}${octave}`;
}

function transpose(note, semitones) {
  return midiToNote(noteToMidi(note) + semitones);
}

function resolveDegree(chord, degree, index = 0) {
  if (typeof degree === 'string') {
    switch (degree) {
      case 'bass':
        return chord.bass?.root || chord.piano[0];
      case 'fifth':
        return chord.bass?.fifth || transpose(chord.piano[0], 7);
      case 'octave':
        return chord.bass?.octave || transpose(chord.piano[0], 12);
      default:
        return chord.piano[0];
    }
  }
  const list = chord.piano || [];
  if (!list.length) return 'C4';
  const normalized = ((degree % list.length) + list.length) % list.length;
  return list[normalized];
}

const PIANO_PATTERNS = {
  delicate: [
    { step: 0, degrees: ['bass'], octave: -1, len16: 8, vel: 0.72 },
    { step: 4, degrees: ['fifth'], len16: 6, vel: 0.64 },
    { step: 8, degrees: [0], len16: 4, vel: 0.6 },
    { step: 10, degrees: [2], len16: 3, vel: 0.56 },
    { step: 12, degrees: [4], len16: 3, vel: 0.55 },
    { step: 14, degrees: [3], len16: 2, vel: 0.52 },
  ],
  rolling: [
    { step: 0, degrees: ['bass'], octave: -1, len16: 6, vel: 0.78 },
    { step: 2, degrees: ['fifth'], len16: 5, vel: 0.7 },
    { step: 4, degrees: [0, 2], len16: 2, vel: 0.64 },
    { step: 6, degrees: [1, 3], len16: 2, vel: 0.62 },
    { step: 8, degrees: ['octave'], len16: 4, vel: 0.66 },
    { step: 10, degrees: [2], len16: 3, vel: 0.6 },
    { step: 12, degrees: [4], len16: 3, vel: 0.58 },
    { step: 15, degrees: [3], len16: 2, vel: 0.56 },
  ],
  wide: [
    { step: 0, degrees: ['bass'], octave: -1, len16: 8, vel: 0.76 },
    { step: 4, degrees: ['fifth'], len16: 6, vel: 0.7 },
    { step: 5, degrees: [0], len16: 2, vel: 0.62 },
    { step: 7, degrees: [2], len16: 2, vel: 0.6 },
    { step: 8, degrees: [4], len16: 4, vel: 0.62 },
    { step: 11, degrees: [1, 3], len16: 2, vel: 0.58 },
    { step: 13, degrees: [5], len16: 3, vel: 0.6 },
    { step: 15, degrees: [2], len16: 2, vel: 0.58 },
  ],
  cascade: [
    { step: 0, degrees: ['bass'], octave: -1, len16: 4, vel: 0.74 },
    { step: 2, degrees: ['fifth'], len16: 4, vel: 0.68 },
    { step: 4, degrees: [0, 3], len16: 2, vel: 0.64 },
    { step: 5, degrees: [2], len16: 2, vel: 0.6 },
    { step: 6, degrees: [4], len16: 2, vel: 0.6 },
    { step: 8, degrees: ['octave'], len16: 4, vel: 0.66 },
    { step: 10, degrees: [1, 4], len16: 2, vel: 0.6 },
    { step: 12, degrees: [3], len16: 2, vel: 0.58 },
    { step: 14, degrees: [5], len16: 2, vel: 0.58 },
  ],
};

function createNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.6;
  }
  return buffer;
}

function createImpulseResponse(ctx, seconds = 3.5) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.pow(1 - t, 3.6);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return impulse;
}

export default function Piano() {
  const [bpm, setBpm] = useState(() => {
    const stored = localStorage.getItem('bp_piano_bpm');
    if (stored == null) return 74;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 74;
    return Math.min(96, Math.max(60, parsed));
  });
  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
    try { localStorage.setItem('bp_piano_bpm', String(bpm)); } catch {}
    if (schedulerRef.current) schedulerRef.current.setBpm(bpm);
  }, [bpm]);

  const [pianoLevel, setPianoLevel] = useState(() => {
    const stored = localStorage.getItem('bp_piano_level');
    if (stored == null) return 0.85;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.85;
    return Math.min(1.3, Math.max(0, parsed));
  });
  const pianoLevelRef = useRef(pianoLevel);
  useEffect(() => {
    pianoLevelRef.current = pianoLevel;
    try { localStorage.setItem('bp_piano_level', String(pianoLevel)); } catch {}
    const ctx = nodesRef.current?.ctx;
    if (ctx && nodesRef.current.pianoBus) {
      const now = ctx.currentTime;
      nodesRef.current.pianoBus.gain.cancelScheduledValues(now);
      nodesRef.current.pianoBus.gain.setTargetAtTime(pianoLevel, now, 0.1);
    }
  }, [pianoLevel]);

  const [stringsLevel, setStringsLevel] = useState(() => {
    const stored = localStorage.getItem('bp_piano_strings');
    if (stored == null) return 0.7;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.7;
    return Math.min(1.2, Math.max(0, parsed));
  });
  const stringsLevelRef = useRef(stringsLevel);
  useEffect(() => {
    stringsLevelRef.current = stringsLevel;
    try { localStorage.setItem('bp_piano_strings', String(stringsLevel)); } catch {}
    const ctx = nodesRef.current?.ctx;
    if (ctx && nodesRef.current.stringBus) {
      const now = ctx.currentTime;
      nodesRef.current.stringBus.gain.cancelScheduledValues(now);
      nodesRef.current.stringBus.gain.setTargetAtTime(stringsLevel, now, 0.12);
    }
  }, [stringsLevel]);

  const [windsLevel, setWindsLevel] = useState(() => {
    const stored = localStorage.getItem('bp_piano_winds');
    if (stored == null) return 0.55;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.55;
    return Math.min(1.0, Math.max(0, parsed));
  });
  const windsLevelRef = useRef(windsLevel);
  useEffect(() => {
    windsLevelRef.current = windsLevel;
    try { localStorage.setItem('bp_piano_winds', String(windsLevel)); } catch {}
    const ctx = nodesRef.current?.ctx;
    if (ctx && nodesRef.current.windBus) {
      const now = ctx.currentTime;
      nodesRef.current.windBus.gain.cancelScheduledValues(now);
      nodesRef.current.windBus.gain.setTargetAtTime(windsLevel, now, 0.12);
    }
  }, [windsLevel]);

  const [textureLevel, setTextureLevel] = useState(() => {
    const stored = localStorage.getItem('bp_piano_texture');
    if (stored == null) return 0.1;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.1;
    return Math.min(0.9, Math.max(0, parsed));
  });
  const textureLevelRef = useRef(textureLevel);
  useEffect(() => {
    textureLevelRef.current = textureLevel;
    try { localStorage.setItem('bp_piano_texture', String(textureLevel)); } catch {}
    const ctx = nodesRef.current?.ctx;
    if (ctx && nodesRef.current.textureBus) {
      const now = ctx.currentTime;
      nodesRef.current.textureBus.gain.cancelScheduledValues(now);
      nodesRef.current.textureBus.gain.setTargetAtTime(textureLevel, now, 0.2);
    }
  }, [textureLevel]);

  const [dynamics, setDynamics] = useState(() => {
    const stored = localStorage.getItem('bp_piano_dynamics');
    if (stored == null) return 0.65;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 0.65;
    return Math.min(1, Math.max(0.2, parsed));
  });
  const dynamicsRef = useRef(dynamics);
  useEffect(() => {
    dynamicsRef.current = dynamics;
    try { localStorage.setItem('bp_piano_dynamics', String(dynamics)); } catch {}
    updateToneShaping();
  }, [dynamics]);

  const [repeat, setRepeat] = useState(() => {
    const stored = localStorage.getItem('bp_piano_repeat');
    if (stored == null) return false;
    return stored === '1';
  });
  const repeatRef = useRef(repeat);
  useEffect(() => {
    repeatRef.current = repeat;
    try { localStorage.setItem('bp_piano_repeat', repeat ? '1' : '0'); } catch {}
    if (repeat) {
      fadeScheduledRef.current = false;
    }
  }, [repeat]);

  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  const nodesRef = useRef({});
  const schedulerRef = useRef(null);
  const arrangementStateRef = useRef({ section: ARRANGEMENT[0], index: 0, offset: 0 });
  const chordRef = useRef(CHORD_SEQUENCE[0]);
  const fadeScheduledRef = useRef(false);

  function updateToneShaping() {
    const ctx = nodesRef.current?.ctx;
    const nodes = nodesRef.current;
    if (!ctx || !nodes?.colorLow || !nodes?.colorHigh) return;
    const now = ctx.currentTime;
    const dyn = dynamicsRef.current;
    const lowGain = -3 + dyn * 5;
    nodes.colorLow.gain.cancelScheduledValues(now);
    nodes.colorLow.gain.setTargetAtTime(lowGain, now, 0.4);
    const highGain = -1 + dyn * 4;
    nodes.colorHigh.gain.cancelScheduledValues(now);
    nodes.colorHigh.gain.setTargetAtTime(highGain, now, 0.4);
    if (nodes.masterGain) {
      const target = 0.82 + dyn * 0.12;
      nodes.masterGain.gain.cancelScheduledValues(now);
      nodes.masterGain.gain.setTargetAtTime(target, now, 0.6);
    }
    if (nodes.reverbGain) {
      const wet = 0.28 + dyn * 0.1;
      nodes.reverbGain.gain.cancelScheduledValues(now);
      nodes.reverbGain.gain.setTargetAtTime(wet, now, 0.5);
    }
  }

  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(ctx.destination);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 24;
    compressor.ratio.value = 2.8;
    compressor.attack.value = 0.03;
    compressor.release.value = 0.6;
    compressor.connect(masterGain);

    const colorLow = ctx.createBiquadFilter();
    colorLow.type = 'lowshelf';
    colorLow.frequency.value = 220;
    colorLow.gain.value = -1;

    const colorHigh = ctx.createBiquadFilter();
    colorHigh.type = 'peaking';
    colorHigh.frequency.value = 3200;
    colorHigh.Q.value = 0.7;
    colorHigh.gain.value = 0.5;

    const mixBus = ctx.createGain();
    mixBus.gain.value = 1;

    mixBus.connect(colorLow);
    colorLow.connect(colorHigh);
    colorHigh.connect(compressor);

    const reverb = ctx.createConvolver();
    reverb.buffer = createImpulseResponse(ctx, 4.2);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.33;
    reverb.connect(reverbGain);
    reverbGain.connect(mixBus);

    const pianoBus = ctx.createGain();
    pianoBus.gain.value = pianoLevelRef.current;
    pianoBus.connect(mixBus);
    const pianoNorm = ctx.createGain();
    pianoNorm.gain.value = 1;
    pianoNorm.connect(pianoBus);
    const pianoVerbSend = ctx.createGain();
    pianoVerbSend.gain.value = 0.55;
    pianoBus.connect(pianoVerbSend);
    pianoVerbSend.connect(reverb);

    const stringBus = ctx.createGain();
    stringBus.gain.value = stringsLevelRef.current;
    stringBus.connect(mixBus);
    const stringNorm = ctx.createGain();
    stringNorm.gain.value = 1;
    stringNorm.connect(stringBus);
    const celloNorm = ctx.createGain();
    celloNorm.gain.value = 1;
    celloNorm.connect(stringBus);
    const stringVerbSend = ctx.createGain();
    stringVerbSend.gain.value = 0.72;
    stringBus.connect(stringVerbSend);
    stringVerbSend.connect(reverb);

    const windBus = ctx.createGain();
    windBus.gain.value = windsLevelRef.current;
    windBus.connect(mixBus);
    const oboeNorm = ctx.createGain();
    oboeNorm.gain.value = 1;
    oboeNorm.connect(windBus);
    const windVerbSend = ctx.createGain();
    windVerbSend.gain.value = 0.65;
    windBus.connect(windVerbSend);
    windVerbSend.connect(reverb);

    const textureBus = ctx.createGain();
    textureBus.gain.value = textureLevelRef.current;
    textureBus.connect(mixBus);
    const textureFilter = ctx.createBiquadFilter();
    textureFilter.type = 'bandpass';
    textureFilter.frequency.value = 900;
    textureFilter.Q.value = 0.8;
    const textureSource = ctx.createBufferSource();
    textureSource.buffer = createNoiseBuffer(ctx);
    textureSource.loop = true;
    textureSource.connect(textureFilter);
    textureFilter.connect(textureBus);
    textureSource.start(ctx.currentTime + 0.05);

    const nodes = {
      ctx,
      masterGain,
      compressor,
      colorLow,
      colorHigh,
      mixBus,
      reverb,
      reverbGain,
      pianoBus,
      pianoNorm,
      pianoVerbSend,
      stringBus,
      stringNorm,
      celloNorm,
      stringVerbSend,
      windBus,
      oboeNorm,
      windVerbSend,
      textureBus,
      textureFilter,
      textureSource,
    };
    nodesRef.current = nodes;

    let mounted = true;
    Soundfont.instrument(ctx, 'acoustic_grand_piano', { soundfont: 'MusyngKite' })
      .then(inst => {
        if (!mounted) return;
        nodes.pianoInstrument = inst;
        if (inst.disconnect) {
          try { inst.disconnect(); } catch {}
        }
        if (inst.connect) inst.connect(nodes.pianoNorm);
        const gain = getNormalizationGain(inst, 'sf:acoustic_grand_piano');
        nodes.pianoNorm.gain.value = Number.isFinite(gain) ? gain : 1;
      })
      .catch(() => {});

    Soundfont.instrument(ctx, 'string_ensemble_1', { soundfont: 'MusyngKite' })
      .then(inst => {
        if (!mounted) return;
        nodes.stringInstrument = inst;
        if (inst.disconnect) {
          try { inst.disconnect(); } catch {}
        }
        if (inst.connect) inst.connect(nodes.stringNorm);
        const gain = getNormalizationGain(inst, 'sf:string_ensemble_1');
        nodes.stringNorm.gain.value = Number.isFinite(gain) ? gain : 1;
      })
      .catch(() => {});

    Soundfont.instrument(ctx, 'cello', { soundfont: 'MusyngKite' })
      .then(inst => {
        if (!mounted) return;
        nodes.celloInstrument = inst;
        if (inst.disconnect) {
          try { inst.disconnect(); } catch {}
        }
        if (inst.connect) inst.connect(nodes.celloNorm);
        const gain = getNormalizationGain(inst, 'sf:cello');
        nodes.celloNorm.gain.value = Number.isFinite(gain) ? gain : 1;
      })
      .catch(() => {});

    Soundfont.instrument(ctx, 'oboe', { soundfont: 'MusyngKite' })
      .then(inst => {
        if (!mounted) return;
        nodes.oboeInstrument = inst;
        if (inst.disconnect) {
          try { inst.disconnect(); } catch {}
        }
        if (inst.connect) inst.connect(nodes.oboeNorm);
        const gain = getNormalizationGain(inst, 'sf:oboe');
        nodes.oboeNorm.gain.value = Number.isFinite(gain) ? gain : 1;
      })
      .catch(() => {});

    const scheduler = createScheduler(ctx, {
      bpm: bpmRef.current,
      swing: 0.0,
    });

    function playPiano(time, chord, event, baseGain) {
      if (!nodes.pianoInstrument || !playingRef.current) return;
      const secondsPerBeat = 60 / bpmRef.current;
      const sixteenth = secondsPerBeat / 4;
      const duration = Math.max(sixteenth * (event.len16 ?? 2), secondsPerBeat * 0.35);
      const dyn = dynamicsRef.current;
      const gainBase = baseGain * (event.vel ?? 0.5) * (0.6 + dyn * 0.7);
      const degrees = event.degrees || (event.degree != null ? [event.degree] : [0]);
      const notes = degrees.map((deg, idx) => {
        const base = resolveDegree(chord, deg, idx);
        const offset = Array.isArray(event.octave)
          ? (event.octave[idx] ?? 0)
          : (event.octave ?? (deg === 'bass' ? -1 : 0));
        const shift = Array.isArray(event.shift)
          ? (event.shift[idx] ?? 0)
          : (event.shift ?? 0);
        return transpose(base, offset * 12 + shift);
      });
      notes.forEach((note, idx) => {
        try {
          nodes.pianoInstrument.play(note, time, {
            gain: gainBase * (idx === 0 ? 1 : 0.75),
            duration,
          });
        } catch {}
      });
    }

    function schedulePedalChord(time, chord, strength) {
      if (!nodes.pianoInstrument || !playingRef.current) return;
      const secondsPerBeat = 60 / bpmRef.current;
      const duration = secondsPerBeat * 4.2;
      const notes = [resolveDegree(chord, 'bass'), resolveDegree(chord, 'fifth'), resolveDegree(chord, 2)];
      notes.forEach((note, idx) => {
        try {
          nodes.pianoInstrument.play(idx === 0 ? transpose(note, -12) : note, time, {
            gain: strength * (idx === 0 ? 0.6 : 0.42),
            duration,
          });
        } catch {}
      });
    }

    function scheduleStrings(time, chord, amount, mode, offset) {
      if (!playingRef.current || amount < SILENCE_EPS) return;
      const secondsPerBeat = 60 / bpmRef.current;
      const hold = mode === 'arcs' ? secondsPerBeat * 6 : secondsPerBeat * 8;
      const padNotes = chord.strings.slice(0, 3);
      if (nodes.stringInstrument) {
        padNotes.forEach((note, idx) => {
          const gain = amount * (mode === 'arcs' ? 0.4 : 0.5) * (idx === 0 ? 1 : 0.8);
          try {
            nodes.stringInstrument.play(note, time, {
              gain,
              duration: hold,
            });
          } catch {}
        });
      }
      if (nodes.celloInstrument) {
        const celloNote = mode === 'legato' ? chord.bass?.octave || chord.strings[0] : chord.bass?.root;
        const gain = amount * (mode === 'legato' ? 0.58 : 0.5);
        try {
          nodes.celloInstrument.play(celloNote, time, {
            gain,
            duration: hold * 1.1,
          });
        } catch {}
      }
      if (mode === 'arcs' && nodes.stringInstrument) {
        const lateNote = chord.strings[3] || chord.strings[2];
        try {
          nodes.stringInstrument.play(lateNote, time + secondsPerBeat * 2.2, {
            gain: amount * 0.42,
            duration: secondsPerBeat * 4,
          });
        } catch {}
      }
    }

    function scheduleWinds(time, chord, amount, mode, offset) {
      if (!nodes.oboeInstrument || !playingRef.current || amount < SILENCE_EPS) return;
      const secondsPerBeat = 60 / bpmRef.current;
      const baseNotes = chord.winds;
      if (!baseNotes?.length) return;
      const noteIdx = (offset * 2) % baseNotes.length;
      const leadNote = baseNotes[noteIdx];
      const entryDelay = mode === 'duet' ? secondsPerBeat * 1.5 : secondsPerBeat * 2;
      try {
        nodes.oboeInstrument.play(leadNote, time + entryDelay, {
          gain: amount * (mode === 'tail' ? 0.32 : 0.42),
          duration: secondsPerBeat * (mode === 'duet' ? 4.5 : 3.8),
        });
      } catch {}
      if (mode === 'duet' && baseNotes.length > 1) {
        const harmony = baseNotes[(noteIdx + 2) % baseNotes.length];
        try {
          nodes.oboeInstrument.play(harmony, time + entryDelay + secondsPerBeat * 1.5, {
            gain: amount * 0.28,
            duration: secondsPerBeat * 3,
          });
        } catch {}
      }
      if (mode === 'sparse' && Math.random() < 0.3) {
        const gentle = baseNotes[(noteIdx + 1) % baseNotes.length];
        try {
          nodes.oboeInstrument.play(gentle, time + secondsPerBeat * 3.4, {
            gain: amount * 0.22,
            duration: secondsPerBeat * 2.4,
          });
        } catch {}
      }
    }

    function updateTexture(mode, amount) {
      if (!nodes.textureFilter || !nodes.textureBus) return;
      const ctx = nodes.ctx;
      const now = ctx.currentTime;
      const freqBase = mode === 'stream' ? 1100 : mode === 'breeze' ? 1400 : 800;
      const q = mode === 'breeze' ? 1.1 : 0.9;
      nodes.textureFilter.frequency.cancelScheduledValues(now);
      nodes.textureFilter.frequency.setTargetAtTime(freqBase, now, 0.6);
      nodes.textureFilter.Q.cancelScheduledValues(now);
      nodes.textureFilter.Q.setTargetAtTime(q, now, 0.6);
      nodes.textureBus.gain.cancelScheduledValues(now);
      nodes.textureBus.gain.setTargetAtTime(textureLevelRef.current * amount, now, 0.6);
    }

    function handleSixteenth(time, sixteenth, barCount) {
      const { section } = arrangementStateRef.current;
      const base = section.intensity;
      const pianoAmt = base.piano * pianoLevelRef.current;
      const pattern = PIANO_PATTERNS[section.pianoPattern] || [];
      for (const event of pattern) {
        if (event.step === sixteenth) {
          playPiano(time, chordRef.current, event, pianoAmt);
        }
      }

      if (section.sparkle > 0.01 && sixteenth === 7 && Math.random() < section.sparkle) {
        playPiano(time + 0.03, chordRef.current, {
          degrees: [4, 5],
          len16: 4,
          vel: 0.5,
          octave: 1,
        }, pianoAmt * 0.55);
      }
    }

    function handleBar(time, barCount) {
      const effectiveBar = repeatRef.current ? (barCount % TOTAL_BARS) : barCount;
      if (!repeatRef.current && barCount >= TOTAL_BARS) {
        if (!fadeScheduledRef.current) {
          fadeScheduledRef.current = true;
          const fadeGain = nodes.masterGain;
          const now = ctx.currentTime;
          fadeGain.gain.cancelScheduledValues(now);
          fadeGain.gain.setTargetAtTime(0.0001, time + 2, 2.5);
          setTimeout(() => {
            if (!schedulerRef.current) return;
            schedulerRef.current.stop();
            setPlaying(false);
          }, 8000);
        }
        return;
      }

      const lookup = getSectionForBar(effectiveBar);
      arrangementStateRef.current = lookup;
      const chord = CHORD_SEQUENCE[effectiveBar % CHORD_SEQUENCE.length];
      chordRef.current = chord;

      const sec = lookup.section;
      const stringsAmt = sec.intensity.strings * stringsLevelRef.current;
      const windsAmt = sec.intensity.winds * windsLevelRef.current;
      updateTexture(sec.textureMode, sec.intensity.texture);
      scheduleStrings(time, chord, stringsAmt, sec.stringMode, lookup.offset);
      scheduleWinds(time, chord, windsAmt, sec.windMode, lookup.offset);
      if (sec.pedalChord) {
        schedulePedalChord(time, chord, sec.intensity.piano * pianoLevelRef.current * 0.45);
      }
    }

    scheduler.setCallbacks({ onSixteenth: handleSixteenth, onBar: handleBar });
    schedulerRef.current = scheduler;
    updateToneShaping();

    return () => {
      mounted = false;
      scheduler.stop();
      try { textureSource.stop(); } catch {}
      try { ctx.close(); } catch {}
      nodesRef.current = {};
      schedulerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const play = async () => {
    if (!nodesRef.current?.ctx || !schedulerRef.current) return;
    await nodesRef.current.ctx.resume();
    fadeScheduledRef.current = false;
    arrangementStateRef.current = { section: ARRANGEMENT[0], index: 0, offset: 0 };
    chordRef.current = CHORD_SEQUENCE[0];
    updateToneShaping();
    if (nodesRef.current.masterGain) {
      const now = nodesRef.current.ctx.currentTime;
      nodesRef.current.masterGain.gain.cancelScheduledValues(now);
      nodesRef.current.masterGain.gain.setTargetAtTime(0.88, now, 0.4);
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
      nodesRef.current.masterGain.gain.setTargetAtTime(0.0001, now, 0.4);
      nodesRef.current.masterGain.gain.setTargetAtTime(0.88, now + 0.8, 0.01);
    }
    setPlaying(false);
  };

  const bpmDisplay = `${Math.round(bpm)} BPM`;

  return (
    <div className="card">
      <div className="titlebar">
        <h1>Riverlights — Piano Reverie</h1>
        <span className="tag">soothing multi-part suite</span>
      </div>

      <div className="controls">
        <div className="slider-row">
          <label htmlFor="piano-bpm">Tempo<span className="value">{bpmDisplay}</span></label>
          <input
            id="piano-bpm"
            type="range"
            min="60"
            max="96"
            step="1"
            value={bpm}
            onChange={(ev) => setBpm(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="piano-dyn">Piano Dynamics<span className="value">{(dynamics * 100).toFixed(0)}%</span></label>
          <input
            id="piano-dyn"
            type="range"
            min="0.2"
            max="1"
            step="0.01"
            value={dynamics}
            onChange={(ev) => setDynamics(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="piano-level">Piano Presence<span className="value">{pianoLevel.toFixed(2)}</span></label>
          <input
            id="piano-level"
            type="range"
            min="0"
            max="1.3"
            step="0.01"
            value={pianoLevel}
            onChange={(ev) => setPianoLevel(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="strings-level">Strings Bloom<span className="value">{stringsLevel.toFixed(2)}</span></label>
          <input
            id="strings-level"
            type="range"
            min="0"
            max="1.2"
            step="0.01"
            value={stringsLevel}
            onChange={(ev) => setStringsLevel(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="winds-level">Winds Whisper<span className="value">{windsLevel.toFixed(2)}</span></label>
          <input
            id="winds-level"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={windsLevel}
            onChange={(ev) => setWindsLevel(Number(ev.target.value))}
          />
        </div>

        <div className="slider-row">
          <label htmlFor="texture-level">Texture Veil<span className="value">{textureLevel.toFixed(2)}</span></label>
          <input
            id="texture-level"
            type="range"
            min="0"
            max="0.9"
            step="0.01"
            value={textureLevel}
            onChange={(ev) => setTextureLevel(Number(ev.target.value))}
          />
        </div>

        <label className="option-row">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(ev) => setRepeat(ev.target.checked)}
          />
          Repeat arrangement
        </label>
      </div>

      <button
        type="button"
        className="play-btn"
        data-state={playing ? 'playing' : 'stopped'}
        onClick={playing ? stop : play}
      >
        {playing ? 'Pause The Reverie' : 'Begin The Reverie'}
      </button>
    </div>
  );
}
