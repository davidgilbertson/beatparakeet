// Simple lookahead scheduler for Web Audio without external deps
// Schedules 16th notes ahead of time with a setInterval tick.

// Defaults chosen for smooth scheduling on modern browsers/devices.
const DEFAULT_LOOKAHEAD_MS = 25;      // scheduler tick interval
const DEFAULT_SCHEDULE_AHEAD_SEC = 0.2; // how far ahead to schedule events

export default function createScheduler(ctx, opts = {}) {
  let bpm = opts.bpm ?? 120;
  let lookaheadMs = opts.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS;
  let scheduleAheadSec = opts.scheduleAheadSec ?? DEFAULT_SCHEDULE_AHEAD_SEC;
  let swing = opts.swing ?? 0; // 0..0.5 typical; applies to off-8ths
  let onSixteenth = opts.onSixteenth ?? (() => {});
  let onBar = opts.onBar ?? (() => {});

  let nextNoteTime = 0; // absolute AudioContext time for next 16th
  let current16th = 0;  // 0..15
  let barCount = 0;     // total bars since start
  let timerId = null;

  const secondsPerBeat = () => 60.0 / bpm;
  const sixteenthDur = () => 0.25 * secondsPerBeat();

  function swingOffset(ix16) {
    // Simple 8th-note swing: delay 8th offbeats (16th indices 2,6,10,14)
    // by a fraction of a 16th duration.
    if (!swing) return 0;
    const isOff8th = (ix16 % 4 === 2);
    return isOff8th ? swing * sixteenthDur() : 0;
  }

  function advance() {
    nextNoteTime += 0.25 * secondsPerBeat(); // 16th note
    current16th = (current16th + 1) % 16;
    if (current16th === 0) barCount += 1;
  }

  function schedule() {
    const now = ctx.currentTime;
    while (nextNoteTime < now + scheduleAheadSec) {
      const tSwing = nextNoteTime + swingOffset(current16th);
      try { onSixteenth(tSwing, current16th, barCount); } catch {}
      if (current16th === 0) {
        // keep bar anchor on-grid (no swing) for stability
        try { onBar(nextNoteTime, barCount); } catch {}
      }
      advance();
    }
  }

  function start(startDelaySec = 0.05) {
    if (timerId) return;
    const now = ctx.currentTime;
    nextNoteTime = now + startDelaySec;
    current16th = 0;
    barCount = 0;
    timerId = setInterval(schedule, lookaheadMs);
  }

  function stop() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function setBpm(newBpm) { bpm = newBpm; }
  function setSwing(newSwing) { swing = Math.max(0, Math.min(0.75, Number(newSwing) || 0)); }

  function setCallbacks(cbs = {}) {
    if (typeof cbs.onSixteenth === 'function') onSixteenth = cbs.onSixteenth;
    if (typeof cbs.onBar === 'function') onBar = cbs.onBar;
  }

  return {
    start,
    stop,
    setBpm,
    setSwing,
    setCallbacks,
    getState: () => ({ nextNoteTime, current16th, barCount, bpm })
  };
}
