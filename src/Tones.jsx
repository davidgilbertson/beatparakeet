// This is a legacy component using Tones.js. It was too CPU intensive to work on mobile.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import Soundfont from 'soundfont-player';
import rainLoopUrl from '../rain_loop.wav';

// How many bars per progression before switching (make 8 or 16 later if desired)
const CHANGE_EVERY_BARS = 16;

// Pool of 4-bar minor progressions (each inner array is one chord as note names).
const MINOR_POOLS = [
  [ ['A3','C4','E4','G4'], ['D3','F3','A3','C4'], ['E3','G#3','B3','D4'], ['A3','C4','E4','G4'] ],
  [ ['A3','C4','E4','G4'], ['F3','A3','C4','E4'], ['C3','E3','G3','B3'], ['G3','B3','D4','F4'] ],
  [ ['D3','F3','A3','C4'], ['G3','B3','D4','F4'], ['C3','E3','G3','B3'], ['A3','C4','E4','G4'] ],
];

// Scheduling stability settings
const SCHED_LOOKAHEAD_SEC = 0.4;
const SCHED_UPDATE_INTERVAL_SEC = 0.06;

export default function Tones() {
  const [bpm, setBpm] = useState(() => {
    const v = Number(localStorage.getItem('bp_bpm'));
    if (Number.isFinite(v)) return Math.min(160, Math.max(60, v));
    return 96;
  });
  const [playing, setPlaying] = useState(false);
  const [blend, setBlend] = useState(() => {
    const v = localStorage.getItem('bp_blend');
    const n = v === null ? 0.5 : Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
  });
  const blendRef = useRef(0.5);
  // Non-linear blend: UI 50% -> effective 0.75
  const BLEND_GAMMA = 0.415; // 0.5 ** 0.415 ≈ 0.75
  const blendCurve = (u) => Math.pow(Math.min(1, Math.max(0, u)), BLEND_GAMMA);
  useEffect(() => { blendRef.current = blendCurve(blend); }, [blend]);

  const voices4 = true;
  const vibratoDepth = 0.03;
  const reverbWet = 0.18;
  const stereoWidth = 1;
  const CHORD_LEVEL = 1.6;
  const MUSIC_LEVEL = 2.5;
  const KICK_VOLUME_DB = -20;
  const CHORD_INSTRUMENT = 'pan_flute'

  const buildDate = useMemo(() => new Date(typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : Date.now()), []);
  const nodes = useRef({});
  const progressionRef = useRef(MINOR_POOLS[0]);
  const lastIndexRef = useRef(-1);

  // Legacy prefetch removed; instrument is loaded when building the graph below.

  // Initialize audio graph once
  useEffect(() => {
    try {
      const ctx = Tone.getContext();
      ctx.latencyHint = 'playback';
      ctx.lookAhead = SCHED_LOOKAHEAD_SEC;
      ctx.updateInterval = SCHED_UPDATE_INTERVAL_SEC;
      const t = Tone.getTransport ? Tone.getTransport() : Tone.Transport;
      t.clockSource = 'worker';
    } catch {}

    const limiter = new Tone.Limiter(-1).toDestination();
    const mixBus = new Tone.Gain(1).connect(limiter);
    const glue = new Tone.Compressor({ threshold: -18, ratio: 2.5, attack: 0.01, release: 0.15 }).connect(mixBus);

    const rainGain = new Tone.Gain(1).connect(glue);
    const rain = new Tone.Player({ url: rainLoopUrl, loop: true, autostart: false });
    rain.connect(rainGain);

    const musicGain = new Tone.Gain(1);
    const musicLevel = new Tone.Gain(MUSIC_LEVEL).connect(glue);
    musicGain.connect(musicLevel);

    const chordIn = new Tone.Gain(1);
    const wow = new Tone.Vibrato({ frequency: 0.8, depth: vibratoDepth });
    const chordFilter = new Tone.Filter({ type: 'lowpass', frequency: 1400, Q: 0.2 });
    const chordRev = new Tone.Reverb({ decay: 2.8, preDelay: 0.02, wet: reverbWet });
    const width = new Tone.StereoWidener({ width: stereoWidth });
    const chordGain = new Tone.Gain(CHORD_LEVEL);
    chordIn.chain(chordFilter, chordGain, wow, chordRev, width, musicGain);

    const ac = Tone.getContext().rawContext || Tone.getContext()._context || Tone.getContext();
    Soundfont.instrument(ac, CHORD_INSTRUMENT, { soundfont: 'MusyngKite', destination: (chordIn.input ? chordIn.input : chordIn) })
      .then(inst => { nodes.current.sfChord = inst; })
      .catch(() => {});

    const kick = new Tone.MembraneSynth({
      volume: KICK_VOLUME_DB,
      pitchDecay: 0.03,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.2 }
    }).connect(musicGain);

    const snrNoise = new Tone.NoiseSynth({ volume: -14, noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } });
    const snrBP = new Tone.Filter({ type: 'bandpass', frequency: 2000, Q: 1.2 }).connect(musicGain);
    const snrRev = new Tone.Reverb({ decay: 1.2, wet: 0.12 }).connect(snrBP);
    snrNoise.connect(snrRev);

    const hat = new Tone.NoiseSynth({ volume: -20, noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } });
    const hatHP = new Tone.Filter({ type: 'highpass', frequency: 8000, Q: 0.7 }).connect(musicGain);
    hat.connect(hatHP);

    const transport = Tone.getTransport ? Tone.getTransport() : Tone.Transport;
    transport.bpm.value = bpm;

    const HUMANIZE_SEC = 0.01;
    const chordPart = new Tone.Part((time, chordIndex) => {
      const prog = progressionRef.current;
      const base = prog[chordIndex % prog.length];
      const notes = base.slice(0, Math.min(4, base.length));
      const offset = (Math.random() - 0.5) * HUMANIZE_SEC;
      const currentBlend = Math.max(0, Math.min(1, blendRef.current));
      if (nodes.current?.sfChord) {
        const dur = Tone.Time('1m').toSeconds();
        if (currentBlend <= 0.001) return;
        notes.forEach(n => { try { nodes.current.sfChord.play(n, time + offset, { duration: dur }); } catch {} });
      }
    }, [ ['0:0',0], ['1:0',1], ['2:0',2], ['3:0',3] ]);
    chordPart.loop = true; chordPart.loopEnd = '4m'; chordPart.start(0);

    const kickPart = new Tone.Part((time) => { const off = (Math.random() - 0.5) * HUMANIZE_SEC; kick.triggerAttackRelease('C2','8n', time + off); }, ['0:0','1:0','2:0','2:3','3:0']);
    kickPart.loop = true; kickPart.loopEnd = '4m'; kickPart.start(0);

    const snarePart = new Tone.Part((time) => { const off = (Math.random() - 0.5) * HUMANIZE_SEC; snrNoise.triggerAttackRelease('16n', time + off); }, ['0:2','1:2','2:2','3:2']);
    snarePart.loop = true; snarePart.loopEnd = '4m'; snarePart.start(0);

    const hatLoop = new Tone.Loop((time) => { const off = (Math.random() - 0.5) * HUMANIZE_SEC; hat.triggerAttackRelease('16n', time + off); }, '8n').start(0);

    nodes.current = { limiter, mixBus, glue, rain, kick, snrNoise, hat, chordPart, kickPart, snarePart, hatLoop, wow, chordRev, width, chordFilter, chordIn, musicGain, rainGain };

    const chooseProgression = () => {
      const pools = MINOR_POOLS;
      let idx = Math.floor(Math.random() * pools.length);
      if (pools.length > 1 && idx === lastIndexRef.current) idx = (idx + 1) % pools.length;
      lastIndexRef.current = idx; progressionRef.current = pools[idx];
    };
    chooseProgression();
    const changeId = transport.scheduleRepeat(() => { chooseProgression(); }, `${CHANGE_EVERY_BARS}m`, `${CHANGE_EVERY_BARS}m`);

    return () => {
      try { chordPart.dispose(); kickPart.dispose(); snarePart.dispose(); hatLoop.dispose(); } catch {}
      try { kick.dispose(); snrNoise.dispose(); hat.dispose(); } catch {}
      try { rain.dispose(); } catch {}
      try { glue.dispose(); mixBus.dispose(); limiter.dispose(); } catch {}
      try { transport.clear(changeId); } catch {}
      try { nodes.current.sfChord && nodes.current.sfChord.stop && nodes.current.sfChord.stop(); } catch {}
    };
  }, []);

  useEffect(() => { try { localStorage.setItem('bp_bpm', String(bpm)); } catch {} }, [bpm]);
  useEffect(() => { try { localStorage.setItem('bp_blend', String(blend)); } catch {} }, [blend]);

  useEffect(() => {
    const t = Tone.getTransport ? Tone.getTransport() : Tone.Transport;
    t.bpm.rampTo(bpm, 0.08);
  }, [bpm]);

  useEffect(() => {
    const mg = nodes.current?.musicGain;
    const rg = nodes.current?.rainGain;
    const eff = blendCurve(blend);
    if (mg) { try { mg.gain.rampTo(eff, 0.05); } catch {} }
    if (rg) { try { rg.gain.rampTo(1 - eff, 0.05); } catch {} }
  }, [blend]);

  function stopRain(rain) { try { rain?.stop(); } catch {} }

  async function togglePlay() {
    if (!playing) {
      await Tone.start();
      const { rain } = nodes.current;
      rain?.start();
      Tone.Transport.start('+0.05');
      setPlaying(true);
    } else {
      Tone.Transport.pause();
      const { rain } = nodes.current;
      stopRain(rain);
      setPlaying(false);
    }
  }

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

      <section className="bg-wrap" aria-label="Background blend">
        <label className="title">Blend (Rain ↔ Music)</label>
        <div className="bpm">
          <input id="blend" type="range" min="0" max="100" step="1"
                 value={Math.round(blend * 100)}
                 onChange={(e) => setBlend(Number(e.target.value) / 100)} />
        </div>
      </section>

      <button id="play" className="play-btn" data-state={playing ? 'playing' : undefined} onClick={togglePlay}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <div className="timestamp" aria-hidden="true">{buildDate.toLocaleString()}</div>
    </main>
  );
}
