import React, { useEffect, useRef, useState } from 'react';
import Soundfont from 'soundfont-player';
import rainLoopUrl from '../rain_loop.wav';
import createScheduler from './audio/scheduler.js';

// App constants
const DEFAULT_CHORD_GAIN = 0.1; // chords default gain
const DEFAULT_DRUM_GAIN = 1.0;  // drums default gain
const DEFAULT_BASS_GAIN = 0.5;  // bass default gain
const DEFAULT_RAIN_GAIN = 1.0;  // rain default gain
const SWING = 0.2; // 8th-note swing amount (0..~0.5)
const CHORD_INSTRUMENT = 'pan_flute';
const SILENCE_EPS = 0.0005; // threshold below which a bus is treated as off

// Cache normalization so analysis only runs once (React StrictMode mounts twice in dev)
let CACHED_CHORD_NORM_GAIN = null;

// Compute a single peak-based normalization gain for a Soundfont instrument.
// Returns the gain to apply (number).
function computePeakNormalizationGain(instrument) {
  let chosenGain = 1;
  const buffers = instrument && instrument.buffers;
  if (!buffers || typeof buffers !== 'object') {
    return chosenGain;
  }
  const entries = Object.values(buffers);
  let globalPeak = 0;
  for (const buf of entries) {
    if (!buf) continue;
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
      }
    }
    if (peak > globalPeak) globalPeak = peak;
  }
  chosenGain = globalPeak > 0 ? 1 / globalPeak : 1;
  return chosenGain;
}

// Three 4-bar progressions; cycle through each for CHANGE_EVERY_BARS bars
const CHORD_PROGRESSIONS = [
  [ // Am7 → Fmaj7 → Cmaj7 → G7
    ['A3','C4','E4','G4'],
    ['F3','A3','C4','E4'],
    ['C3','E3','G3','B3'],
    ['G3','B3','D4','F4']
  ],
  [ // Dm7 – G7 – Cmaj7 – Am7
    ['D3','F3','A3','C4'],
    ['G3','B3','D4','F4'],
    ['C3','E3','G3','B3'],
    ['A3','C4','E4','G4']
  ],
  [ // Am7 – G7 – Fmaj7 – E7
    ['A3','C4','E4','G4'],
    ['G3','B3','D4','F4'],
    ['F3','A3','C4','E4'],
    ['E3','G#3','B3','D4']
  ],
];
const CHANGE_EVERY_BARS = 16;

export default function App() {
  const [bpm, setBpm] = useState(() => {
    const s = localStorage.getItem('bp_bpm');
    if (s == null) return 96;
    const v = Number(s);
    return Number.isFinite(v) ? Math.min(160, Math.max(80, v)) : 96;
  });
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Gain sliders (0..1) map directly to absolute gain values for each bus.
  // Defaults use the constants above; persisted in localStorage.
  const [drumsGain, setDrumsGain] = useState(() => {
    const abs = localStorage.getItem('bp_drums_gain');
    if (abs != null && Number.isFinite(Number(abs))) return Math.min(1, Math.max(0, Number(abs)));
    return DEFAULT_DRUM_GAIN; // default absolute
  });
  const [chordsGain, setChordsGain] = useState(() => {
    // Read new key, fall back once to old key name if present
    const absS = localStorage.getItem('bp_chords_gain') ?? localStorage.getItem('bp_pads_gain');
    if (absS != null && Number.isFinite(Number(absS))) return Math.min(1, Math.max(0, Number(absS)));
    return DEFAULT_CHORD_GAIN;
  });
  const [bassGain, setBassGain] = useState(() => {
    const abs = localStorage.getItem('bp_bass_gain');
    if (abs != null && Number.isFinite(Number(abs))) return Math.min(1, Math.max(0, Number(abs)));
    return DEFAULT_BASS_GAIN;
  });
  const [rainGain, setRainGain] = useState(() => {
    const abs = localStorage.getItem('bp_rain_gain');
    if (abs != null && Number.isFinite(Number(abs))) return Math.min(1, Math.max(0, Number(abs)));
    return DEFAULT_RAIN_GAIN;
  });
  // Config is always visible; no expand/collapse state

  const ctxRef = useRef(null);
  const nodes = useRef({});
  // Live refs for gains so scheduler callbacks can gate triggers without stale closures
  const drumsGainRef = useRef(0);
  const bassGainRef = useRef(0);
  const chordsGainRef = useRef(0);
  const rainGainRef = useRef(0);
  // Current per-chord stacking factor (1/sqrt(noteCount)), applied on top of slider gain
  const chordStackFactorRef = useRef(1);
  const chordFactorTimeoutRef = useRef(null);
  useEffect(() => { drumsGainRef.current = drumsGain; }, [drumsGain]);
  useEffect(() => { bassGainRef.current = bassGain; }, [bassGain]);
  useEffect(() => { chordsGainRef.current = chordsGain; }, [chordsGain]);
  useEffect(() => { rainGainRef.current = rainGain; }, [rainGain]);

  const schedulerRef = useRef(null);
  // Deterministic progression order
  const barsSinceChangeRef = useRef(0);
  const progIdxRef = useRef(0);
  const progressionRef = useRef(CHORD_PROGRESSIONS[0]);
  const barCountRef = useRef(0); // total bars scheduled so far

  // Init audio graph once
  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;

    // Master
    const master = ctx.createGain();
    master.connect(ctx.destination);

    // Rain bus
    const rainGainNode = ctx.createGain();
    rainGainNode.gain.value = rainGain;
    rainGainNode.connect(master);

    // Drums bus
    const drumsNode = ctx.createGain();
    drumsNode.gain.value = drumsGain;
    drumsNode.connect(master);

    // Bass bus
    const bassGainNode = ctx.createGain();
    bassGainNode.gain.value = bassGain;
    bassGainNode.connect(master);

    // Chord bus
    const chordGainNode = ctx.createGain();
    chordGainNode.gain.value = chordsGain;
    chordGainNode.connect(master);
    // Master chord normalization stage; set to computed gain when instrument loads (defaults to 1)
    const chordNormNode = ctx.createGain();
    chordNormNode.connect(chordGainNode);

    nodes.current = { ctx, master, rainGainNode, drumsNode, bassGainNode, chordGainNode, chordNormNode };

    // Load chord instrument and compute normalization
    Soundfont.instrument(ctx, CHORD_INSTRUMENT, { soundfont: 'MusyngKite' })
      .then(inst => {
        nodes.current.sfChord = inst;
        if (inst.disconnect) inst.disconnect();
        if (inst.connect) inst.connect(nodes.current.chordNormNode || nodes.current.chordGainNode);
        let g = CACHED_CHORD_NORM_GAIN;
        if (!Number.isFinite(g)) {
          const gain = computePeakNormalizationGain(inst);
          g = Number.isFinite(gain) ? gain : 1;
          CACHED_CHORD_NORM_GAIN = g;
        }
        // Apply as master gain for chords
        (nodes.current.chordNormNode || nodes.current.chordGainNode).gain.value = g;
      })
      .catch(() => {});

    // Load rain buffer (and start if already playing and audible)
    fetch(rainLoopUrl)
      .then(r => r.arrayBuffer())
      .then(ab => ctx.decodeAudioData(ab))
      .then(buf => {
        nodes.current.rainBuf = buf;
        if (playingRef.current && !nodes.current.rainSrc && rainGainRef.current > SILENCE_EPS) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(nodes.current.rainGainNode);
          src.start();
          nodes.current.rainSrc = src;
        }
      })
      .catch(() => {});

    return () => {
      if (schedulerRef.current) schedulerRef.current.stop();
      ctx.close();
    };
  }, []);

  // ---- Drum generators ----
  function triggerKick(time) {
    const { ctx, drumsNode } = nodes.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(55, time + 0.12);
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(gain).connect(drumsNode);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  function triggerSnare(time, level = 0.9, decaySec = 0.12) {
    const { ctx, drumsNode } = nodes.current;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.04, decaySec));
    src.connect(bp).connect(gain).connect(drumsNode);
    src.start(time);
    src.stop(time + Math.max(0.08, decaySec + 0.03));
  }

  function triggerHat(time, level = 0.6, decaySec = 0.04) {
    const { ctx, drumsNode } = nodes.current;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.02, decaySec));
    src.connect(hp).connect(gain).connect(drumsNode);
    src.start(time);
    src.stop(time + Math.max(0.04, decaySec + 0.02));
  }

  // ---- Bass (deep, slow, sustained) ----
  function noteToHz(name) {
    // name like 'A3', 'G#4', 'Bb2'
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
    if (!m) return 110;
    const letter = m[1].toUpperCase();
    const acc = m[2];
    const oct = parseInt(m[3], 10);
    const table = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
    let semis = table[letter];
    if (acc === '#') semis += 1; else if (acc === 'b') semis -= 1;
    const midi = (oct + 1) * 12 + semis; // C-1 => 0
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function triggerBass(time, rootNote) {
    const { ctx, bassGainNode } = nodes.current;
    if (!ctx) return;
    // shift root down an octave for depth
    const m = /^([A-Ga-g][#b]?)(-?\d)$/.exec(rootNote);
    // drop two octaves for a deeper sub
    const target = m ? `${m[1]}${parseInt(m[2], 10) - 2}` : rootNote;
    const freq = noteToHz(target);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 140;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    // envelope (slow, natural fade across most of the bar)
    const dur = (60 / bpmRef.current) * 4; // 1 bar
    const a = 0.02;
    const fadeFrac = 0.7; // fade down over ~70% of the bar
    const fadeEnd = time + dur * fadeFrac;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.9, time + a);
    // gradual fade across majority of the bar (stay above zero for exp ramp)
    gain.gain.exponentialRampToValueAtTime(0.12, fadeEnd);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain).connect(lpf).connect(bassGainNode);
    osc.start(time);
    osc.stop(time + dur);
  }

  // ---- Chords ----
  function triggerChord(time, chord) {
    const inst = nodes.current.sfChord;
    const chordGainNode = nodes.current.chordGainNode;
    if (!inst) return;
    const dur = 60 / bpmRef.current * 4; // 1 measure in seconds
    // Attenuate by note count to avoid perceived loudness spikes when stacking
    const count = Math.max(1, chord.length);
    const stackFactor = 1 / Math.sqrt(count);
    const g = chordsGainRef.current;
    if (chordGainNode && Number.isFinite(g)) {
      chordGainNode.gain.setValueAtTime(g * stackFactor, time);
      // Update the live factor right when the chord starts so slider changes keep scaling correctly
      const ctx = nodes.current.ctx;
      if (ctx) {
        const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
        if (chordFactorTimeoutRef.current) clearTimeout(chordFactorTimeoutRef.current);
        chordFactorTimeoutRef.current = setTimeout(() => { chordStackFactorRef.current = stackFactor; }, delayMs);
      } else {
        chordStackFactorRef.current = stackFactor;
      }
    }
    chord.forEach(n => { inst.play(n, time, { duration: dur }); });
  }

  // ---- Scheduling callbacks (external scheduler) ----
  const onSixteenth = (time, sixteenth /* 0..15 */, barIndex /* running */) => {
    if (drumsGainRef.current > SILENCE_EPS) {
      if (sixteenth === 0 || sixteenth === 8) triggerKick(time);
      if (sixteenth === 4 || sixteenth === 12) triggerSnare(time);
      if (sixteenth % 2 === 0) triggerHat(time);
    }

    // Subtle 4-bar variation at the end of every 4th bar
    if (drumsGainRef.current > SILENCE_EPS && sixteenth === 15 && ((barIndex + 1) % 4 === 0)) {
      const beatSec = 60 / bpmRef.current;
      const offset = 0.125 * beatSec; // a light 32nd-note after the last 16th
      triggerHat(time + offset, 0.5, 0.03);
      triggerSnare(time + offset, 0.35, 0.08);
    }
  };

  const onBar = (time, barIndex) => {
    // choose chord for this bar index within the current 4-bar progression
    const chord = progressionRef.current[barIndex % progressionRef.current.length];
    barCountRef.current = barIndex + 1;
    // bass first (root), then chords — gated by gains
    if (bassGainRef.current > SILENCE_EPS) triggerBass(time, chord[0]);
    if (chordsGainRef.current > SILENCE_EPS) triggerChord(time, chord);
    // after scheduling this bar, update progression if needed for the NEXT bar
    barsSinceChangeRef.current += 1;
    if (barsSinceChangeRef.current % CHANGE_EVERY_BARS === 0) {
      progIdxRef.current = (progIdxRef.current + 1) % CHORD_PROGRESSIONS.length;
      progressionRef.current = CHORD_PROGRESSIONS[progIdxRef.current];
    }
  };

  async function toggle() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (!playing) {
      await ctx.resume();
      // Reset counters
      barsSinceChangeRef.current = 0;
      progIdxRef.current = 0;
      progressionRef.current = CHORD_PROGRESSIONS[0];
      barCountRef.current = 0;
      // Start rain
      if (nodes.current.rainBuf) {
        const src = ctx.createBufferSource();
        src.buffer = nodes.current.rainBuf;
        src.loop = true;
        src.connect(nodes.current.rainGainNode);
        src.start();
        nodes.current.rainSrc = src;
      }
      // Start scheduler
      schedulerRef.current = createScheduler(ctx, { bpm, swing: SWING, onSixteenth, onBar });
      schedulerRef.current.start(0.05);
      setPlaying(true);
    } else {
      if (schedulerRef.current) schedulerRef.current.stop();
      if (nodes.current.rainSrc) { nodes.current.rainSrc.stop(); nodes.current.rainSrc = null; }
      setPlaying(false);
    }
  }

  // Persist BPM and update scheduler
  useEffect(() => { localStorage.setItem('bp_bpm', String(bpm)); }, [bpm]);
  useEffect(() => { if (schedulerRef.current) schedulerRef.current.setBpm(bpm); }, [bpm]);
  // Persist + apply gains (rain, drums, bass, chords)
  useEffect(() => {
    localStorage.setItem('bp_rain_gain', String(rainGain));
    const { rainGainNode } = nodes.current;
    if (rainGainNode) rainGainNode.gain.value = rainGain;
    // Start/stop loop so zero gain truly silences the bus
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (playing) {
      if (rainGain <= SILENCE_EPS && nodes.current.rainSrc) {
        nodes.current.rainSrc.stop();
        nodes.current.rainSrc = null;
      } else if (rainGain > SILENCE_EPS && !nodes.current.rainSrc && nodes.current.rainBuf) {
        const src = ctx.createBufferSource();
        src.buffer = nodes.current.rainBuf;
        src.loop = true;
        src.connect(nodes.current.rainGainNode);
        src.start();
        nodes.current.rainSrc = src;
      }
    }
  }, [rainGain, playing]);
  useEffect(() => {
    localStorage.setItem('bp_drums_gain', String(drumsGain));
    const { drumsNode } = nodes.current;
    if (drumsNode) drumsNode.gain.value = drumsGain;
  }, [drumsGain]);
  useEffect(() => {
    localStorage.setItem('bp_bass_gain', String(bassGain));
    const { bassGainNode } = nodes.current;
    if (bassGainNode) bassGainNode.gain.value = bassGain;
  }, [bassGain]);
  useEffect(() => {
    localStorage.setItem('bp_chords_gain', String(chordsGain));
    const { chordGainNode } = nodes.current;
    if (chordGainNode) chordGainNode.gain.value = chordsGain * chordStackFactorRef.current;
  }, [chordsGain]);
  // (no config open/closed persistence; always visible)

  return (
    <main className="card">
      <div className="titlebar"><h1>Beat Parakeet</h1></div>

      <div className="controls" aria-label="Controls">
        <div className="slider-row">
          <label htmlFor="bpm">BPM <span className="value">{bpm}</span></label>
          <input id="bpm" type="range" min="80" max="160" step="1"
                 value={bpm}
                 onChange={(e) => setBpm(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label htmlFor="gain-rain">Rain <span className="value">{Math.round(rainGain * 100)}%</span></label>
          <input id="gain-rain" type="range" min="0" max="1" step="0.01"
                 value={rainGain}
                 onChange={(e) => setRainGain(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label htmlFor="gain-drums">Drums <span className="value">{Math.round(drumsGain * 100)}%</span></label>
          <input id="gain-drums" type="range" min="0" max="1" step="0.01"
                 value={drumsGain}
                 onChange={(e) => setDrumsGain(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label htmlFor="gain-bass">Bass <span className="value">{Math.round(bassGain * 100)}%</span></label>
          <input id="gain-bass" type="range" min="0" max="1" step="0.01"
                 value={bassGain}
                 onChange={(e) => setBassGain(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label htmlFor="gain-chords">Chords <span className="value">{Math.round(chordsGain * 100)}%</span></label>
          <input id="gain-chords" type="range" min="0" max="1" step="0.01"
                 value={chordsGain}
                 onChange={(e) => setChordsGain(Number(e.target.value))} />
        </div>
      </div>

      <button id="play" className="play-btn" data-state={playing ? 'playing' : undefined} onClick={toggle}>
        {playing ? 'Pause' : 'Play'}
      </button>
    </main>
  );
}
