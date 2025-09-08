import React, { useEffect, useRef, useState } from 'react';
import Soundfont from 'soundfont-player';
import rainLoopUrl from '../rain_loop.wav';
import createScheduler from './audio/scheduler.js';

// Constants
const LOOKAHEAD_MS = 25;               // scheduler tick
const SCHEDULE_AHEAD_SEC = 0.2;        // how far ahead to schedule
const PAD_LEVEL = 1.4;                 // pad chain gain
const DRUM_LEVEL = 1.0;                // drums chain gain
const BASS_LEVEL = 0.6;               // bass chain gain
const RAIN_LEVEL = 1.0;                // rain unity
const MASTER_LEVEL = 1.0;              // overall output
const SWING = 0.2;                    // 8th-note swing amount (0..~0.5)
// Sprinkles (high, sparse piano/music_box tinkles)
const SPRINKLE_LEVEL = 0.9;            // sprinkle bus gain
const SPRINKLE_MIN_GAP_BARS = 2;       // min bars between sprinkles

// Four-bar minor progression (Am7 → Fmaj7 → Cmaj7 → G7)
const DEFAULT_PROGRESS = [
  ['A3','C4','E4','G4'],
  ['F3','A3','C4','E4'],
  ['C3','E3','G3','B3'],
  ['G3','B3','D4','F4']
];

// Minor pools for variety (each inner is 4-bar progression)
const MINOR_POOLS = [
  DEFAULT_PROGRESS,
  [ // Am7 – Dm7 – E7 – Am7
    ['A3','C4','E4','G4'],
    ['D3','F3','A3','C4'],
    ['E3','G#3','B3','D4'],
    ['A3','C4','E4','G4']
  ],
  [ // Dm7 – G7 – Cmaj7 – Am7
    ['D3','F3','A3','C4'],
    ['G3','B3','D4','F4'],
    ['C3','E3','G3','B3'],
    ['A3','C4','E4','G4']
  ]
];
const CHANGE_EVERY_BARS = 16; // switch progression every N bars
const PHASE_LENGTH_BARS = 32; // long-term phase length

export default function App() {
  const [bpm, setBpm] = useState(() => {
    const v = Number(localStorage.getItem('bp_bpm'));
    return Number.isFinite(v) ? Math.min(160, Math.max(60, v)) : 96;
  });
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  const [playing, setPlaying] = useState(false);
  const [bassOn, setBassOn] = useState(() => {
    const v = localStorage.getItem('bp_el_bass');
    return v === null ? true : v === 'true';
  });
  const [sprinkleOn, setSprinkleOn] = useState(() => {
    const v = localStorage.getItem('bp_el_sprinkle');
    return v === null ? true : v === 'true';
  });

  const ctxRef = useRef(null);
  const nodes = useRef({});

  const schedulerRef = useRef(null);
  const barsSinceChangeRef = useRef(0);
  const progIdxRef = useRef(0);
  const progressionRef = useRef(DEFAULT_PROGRESS);
  const barCountRef = useRef(0); // total bars scheduled so far
  const lastSprinkleBarRef = useRef(-999);
  const phaseMotifRef = useRef(null);

  function makePhaseMotif() {
    // Build a simple, musical 4–8 bar motif with 1–2 high notes on select bars
    const phraseBars = Math.random() < 0.5 ? 4 : 8;
    // choose 2 active bars in the phrase (e.g., bars 2 and 4)
    const activeBars = new Array(phraseBars).fill(false);
    const first = Math.floor(Math.random() * phraseBars);
    let second = (first + (phraseBars > 4 ? 3 : 2)) % phraseBars;
    activeBars[first] = true; activeBars[second] = true;
    // rhythmic offsets (beats) within the bar
    const baseOffsets = Math.random() < 0.5 ? [2.0, 3.5] : [2.5, 3.0];
    const offsets = baseOffsets.map(b => b + (Math.random() - 0.5) * 0.1);
    // chord tone indices to pick (upper chord tones)
    const toneIdx = Math.random() < 0.5 ? [1, 2] : [2, 1];
    const octavesUp = 2 + (Math.random() < 0.4 ? 1 : 0); // 2 or 3 octaves
    return { phraseBars, activeBars, offsets, toneIdx, octavesUp };
  }

  // Init audio graph once
  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;

    // Master
    const master = ctx.createGain();
    master.gain.value = MASTER_LEVEL;
    master.connect(ctx.destination);

    // Drums bus
    const drums = ctx.createGain();
    drums.gain.value = DRUM_LEVEL;
    drums.connect(master);

    // Pad bus
    const padGain = ctx.createGain();
    padGain.gain.value = PAD_LEVEL;
    padGain.connect(master);

    // Bass bus
    const bassGain = ctx.createGain();
    bassGain.gain.value = BASS_LEVEL;
    bassGain.connect(master);

    // Rain bus
    const rainGain = ctx.createGain();
    rainGain.gain.value = RAIN_LEVEL;
    rainGain.connect(master);

    // Sprinkles bus
    const sprinkleGain = ctx.createGain();
    sprinkleGain.gain.value = SPRINKLE_LEVEL;
    sprinkleGain.connect(master);

    nodes.current = { ctx, master, drums, padGain, bassGain, sprinkleGain, rainGain };

    // Prefetch pad instrument
    Soundfont.instrument(ctx, 'pan_flute', { soundfont: 'MusyngKite' })
      .then(inst => {
        nodes.current.sfPad = inst;
        try { inst.disconnect && inst.disconnect(); } catch {}
        try { inst.connect && inst.connect(padGain); } catch {}
      })
      .catch(() => {});

    // Prefetch sprinkles instrument
    Soundfont.instrument(ctx, 'music_box', { soundfont: 'MusyngKite' })
      .then(inst => {
        nodes.current.sfSprinkle = inst;
        try { inst.disconnect && inst.disconnect(); } catch {}
        try { inst.connect && inst.connect(sprinkleGain); } catch {}
      })
      .catch(() => {});

    // Load rain buffer
    fetch(rainLoopUrl)
      .then(r => r.arrayBuffer())
      .then(ab => ctx.decodeAudioData(ab))
      .then(buf => { nodes.current.rainBuf = buf; })
      .catch(() => {});

    return () => {
      try { schedulerRef.current && schedulerRef.current.stop(); } catch {}
      try { ctx.close(); } catch {}
    };
  }, []);

  // ---- Drum generators ----
  function triggerKick(time) {
    const { ctx, drums } = nodes.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(55, time + 0.12);
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(gain).connect(drums);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  function triggerSnare(time) {
    const { ctx, drums } = nodes.current;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    src.connect(bp).connect(gain).connect(drums);
    src.start(time);
    src.stop(time + 0.15);
  }

  function triggerHat(time) {
    const { ctx, drums } = nodes.current;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    src.connect(hp).connect(gain).connect(drums);
    src.start(time);
    src.stop(time + 0.06);
  }

  // ---- Sprinkles (very sparse, high register) ----
  function incOctName(note, delta = 1) {
    const m = /^([A-Ga-g][#b]?)(-?\d)$/.exec(note);
    if (!m) return note;
    const base = m[1];
    const oct = parseInt(m[2], 10) + delta;
    return `${base}${oct}`;
  }
  function triggerSprinkle(time, chord) {
    const inst = nodes.current.sfSprinkle;
    if (!inst) return;
    // build a tiny motif per phase if missing
    if (!phaseMotifRef.current) phaseMotifRef.current = makePhaseMotif();
    const motif = phaseMotifRef.current;
    const beatSec = 60 / bpmRef.current;
    const dur = Math.max(0.08, Math.min(0.18, 0.25 * beatSec));
    motif.offsets.forEach((off, i) => {
      const idx = motif.toneIdx[i % motif.toneIdx.length];
      const tone = chord[Math.min(idx, chord.length - 1)];
      const hi = incOctName(tone, motif.octavesUp);
      const jitter = (Math.random() - 0.5) * 0.02;
      try { inst.play(hi, time + off * beatSec + jitter, { duration: dur }); } catch {}
    });
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
    const { ctx, bassGain } = nodes.current;
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
    osc.connect(gain).connect(lpf).connect(bassGain);
    osc.start(time);
    osc.stop(time + dur);
  }

  // ---- Pad chords ----
  function triggerPadChord(time, chord) {
    const inst = nodes.current.sfPad;
    if (!inst) return;
    const dur = 60 / bpmRef.current * 4; // 1 measure in seconds
    chord.forEach(n => {
      try { inst.play(n, time, { duration: dur }); } catch {}
    });
  }

  // ---- Scheduling callbacks (external scheduler) ----
  const onSixteenth = (time, sixteenth /* 0..15 */, barIndex /* running */) => {
    if (sixteenth === 0 || sixteenth === 8) triggerKick(time);
    if (sixteenth === 4 || sixteenth === 12) triggerSnare(time);
    if (sixteenth % 2 === 0) triggerHat(time);
  };

  const onBar = (time, barIndex) => {
    // progression change cadence
    barsSinceChangeRef.current += 1;
    if (barsSinceChangeRef.current % CHANGE_EVERY_BARS === 0) {
      let idx = Math.floor(Math.random() * MINOR_POOLS.length);
      if (MINOR_POOLS.length > 1 && idx === progIdxRef.current) {
        idx = (idx + 1) % MINOR_POOLS.length;
      }
      progIdxRef.current = idx;
      progressionRef.current = MINOR_POOLS[idx];
      // progression switched
    }
    // choose chord for this bar index
    const chord = progressionRef.current[barIndex % progressionRef.current.length];
    barCountRef.current = barIndex + 1;
    triggerPadChord(time, chord);
    // bass on root
    if (bassOn) triggerBass(time, chord[0]);
    // phase-based sprinkles with motif and min gap
    const phaseIdx = Math.floor(barIndex / PHASE_LENGTH_BARS);
    const motif = phaseMotifRef.current || makePhaseMotif();
    phaseMotifRef.current = motif;
    const inPhrase = barIndex % motif.phraseBars;
    if (sprinkleOn && motif.activeBars[inPhrase] && (barIndex - (lastSprinkleBarRef.current ?? -999)) >= SPRINKLE_MIN_GAP_BARS) {
      try { console.log(`Sprinkle scheduled at bar ${barIndex + 1}`, { chord, motif }); } catch {}
      triggerSprinkle(time, chord);
      lastSprinkleBarRef.current = barIndex;
    }
  };

  async function toggle() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (!playing) {
      await ctx.resume();
      // Reset counters
      barsSinceChangeRef.current = 0;
      barCountRef.current = 0;
      // Start rain
      if (nodes.current.rainBuf) {
        try {
          const src = ctx.createBufferSource();
          src.buffer = nodes.current.rainBuf;
          src.loop = true;
          src.connect(nodes.current.rainGain);
          src.start();
          nodes.current.rainSrc = src;
        } catch {}
      }
      // Start scheduler
      schedulerRef.current = createScheduler(ctx, {
        bpm,
        lookaheadMs: LOOKAHEAD_MS,
        scheduleAheadSec: SCHEDULE_AHEAD_SEC,
        swing: SWING,
        onSixteenth,
        onBar
      });
      schedulerRef.current.start(0.05);
      setPlaying(true);
    } else {
      if (schedulerRef.current) schedulerRef.current.stop();
      try { nodes.current.rainSrc && nodes.current.rainSrc.stop(); nodes.current.rainSrc = null; } catch {}
      setPlaying(false);
    }
  }

  // Persist BPM and update scheduler
  useEffect(() => { try { localStorage.setItem('bp_bpm', String(bpm)); } catch {} }, [bpm]);
  useEffect(() => { if (schedulerRef.current) try { schedulerRef.current.setBpm(bpm); } catch {} }, [bpm]);
  // Persist toggles
  useEffect(() => { try { localStorage.setItem('bp_el_bass', String(bassOn)); } catch {} }, [bassOn]);
  useEffect(() => { try { localStorage.setItem('bp_el_sprinkle', String(sprinkleOn)); } catch {} }, [sprinkleOn]);

  return (
    <main className="card">
      <div className="titlebar"><h1>Beat Parakeet</h1></div>

      <section className="controls" aria-label="Tempo">
        <div className="bpm">
          <label htmlFor="bpm">BPM <output id="bpmVal">{bpm}</output></label>
          <input id="bpm" type="range" min="60" max="160" step="1"
                 value={bpm}
                 onChange={(e) => setBpm(Number(e.target.value))} />
        </div>
      </section>

      <section className="bg-wrap" aria-label="Extras">
        <label className="title">Extras</label>
        <div className="radios" role="group" aria-label="Extras">
          <label className="radio">
            <input type="checkbox" checked={bassOn} onChange={(e) => setBassOn(e.target.checked)} />
            <span className="label">Bass</span>
          </label>
          <label className="radio">
            <input type="checkbox" checked={sprinkleOn} onChange={(e) => setSprinkleOn(e.target.checked)} />
            <span className="label">Sprinkles</span>
          </label>
        </div>
      </section>

      <button id="play" className="play-btn" data-state={playing ? 'playing' : undefined} onClick={toggle}>
        {playing ? 'Pause' : 'Play'}
      </button>
    </main>
  );
}
