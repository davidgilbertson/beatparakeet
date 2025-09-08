// Analyze a WAV file for loopability and suggest loop points after ~1s.
// No external deps; supports PCM 16-bit and float32 WAV.

const fs = require('fs');
const path = require('path');

function readUInt32LE(buf, off) { return buf.readUInt32LE(off); }
function readUInt16LE(buf, off) { return buf.readUInt16LE(off); }

function parseWav(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }

  let fmt = null;
  let dataOffset = -1;
  let dataSize = 0;

  // Walk chunks
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = readUInt32LE(buf, off + 4);
    const chunkStart = off + 8;
    if (id === 'fmt ') {
      const audioFormat = readUInt16LE(buf, chunkStart);
      const numChannels = readUInt16LE(buf, chunkStart + 2);
      const sampleRate = readUInt32LE(buf, chunkStart + 4);
      const byteRate = readUInt32LE(buf, chunkStart + 8);
      const blockAlign = readUInt16LE(buf, chunkStart + 12);
      const bitsPerSample = readUInt16LE(buf, chunkStart + 14);
      fmt = { audioFormat, numChannels, sampleRate, byteRate, blockAlign, bitsPerSample };
    } else if (id === 'data') {
      dataOffset = chunkStart;
      dataSize = size;
    }
    off = chunkStart + size + (size % 2); // align to even
  }

  if (!fmt) throw new Error('Missing fmt chunk');
  if (dataOffset < 0) throw new Error('Missing data chunk');

  // Only handle PCM 1 (integer) and 3 (IEEE float)
  if (fmt.audioFormat !== 1 && fmt.audioFormat !== 3) {
    throw new Error('Unsupported WAV format (need PCM 16-bit or float32)');
  }

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(dataSize / (bytesPerSample * fmt.numChannels));
  const channelsData = Array.from({ length: fmt.numChannels }, () => new Float32Array(frameCount));

  let p = dataOffset;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < fmt.numChannels; ch++) {
      let v;
      if (fmt.audioFormat === 1) {
        // PCM integer
        if (fmt.bitsPerSample === 16) {
          v = buf.readInt16LE(p) / 32768; p += 2;
        } else if (fmt.bitsPerSample === 24) {
          const b0 = buf[p];
          const b1 = buf[p + 1];
          const b2 = buf[p + 2];
          let val = b0 | (b1 << 8) | (b2 << 16);
          if (val & 0x800000) val |= ~0xffffff; // sign extend
          v = val / 8388608; p += 3; // 2^23
        } else if (fmt.bitsPerSample === 32) {
          v = buf.readInt32LE(p) / 2147483648; p += 4;
        } else {
          throw new Error('Unsupported PCM bits per sample: ' + fmt.bitsPerSample);
        }
      } else if (fmt.audioFormat === 3) {
        // IEEE float
        if (fmt.bitsPerSample !== 32) throw new Error('Unsupported float bit depth: ' + fmt.bitsPerSample);
        v = buf.readFloatLE(p); p += 4;
      }
      channelsData[ch][i] = v;
    }
  }

  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.numChannels,
    bitsPerSample: fmt.bitsPerSample,
    frames: frameCount,
    channelsData,
  };
}

function removeDCAndNormalize(x) {
  let mean = 0;
  for (let i = 0; i < x.length; i++) mean += x[i];
  mean /= x.length || 1;
  let maxAbs = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] - mean;
    x[i] = v;
    const a = Math.abs(v);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs > 0) {
    const s = 1 / maxAbs;
    for (let i = 0; i < x.length; i++) x[i] *= s;
  }
  return x;
}

function decimate(x, factor) {
  if (factor <= 1) return x;
  const n = Math.floor(x.length / factor);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const start = i * factor;
    for (let k = 0; k < factor; k++) sum += x[start + k];
    y[i] = sum / factor;
  }
  return y;
}

function ncc(template, signal, pos) {
  // normalized cross-correlation between template and signal segment at pos
  const w = template.length;
  let sumTS = 0, sumTT = 0, sumSS = 0;
  for (let i = 0; i < w; i++) {
    const t = template[i];
    const s = signal[pos + i];
    sumTS += t * s;
    sumTT += t * t;
    sumSS += s * s;
  }
  const denom = Math.sqrt(sumTT * sumSS);
  return denom > 0 ? (sumTS / denom) : 0;
}

function findBestMatchAfter(signal, sr, startIdx, opts = {}) {
  const minLoopSec = opts.minLoopSec ?? 2.0;
  const maxSearchSec = opts.maxSearchSec ?? 60.0; // avoid scanning extremely long files
  const templateSec = opts.templateSec ?? 0.5;

  // Decimate for performance to around target rate
  const targetRate = 11025;
  const factor = Math.max(1, Math.round(sr / targetRate));
  const ds = decimate(signal, factor);
  const dsr = Math.round(sr / factor);

  const sd = Math.floor(startIdx / factor);
  const w = Math.max(32, Math.floor(templateSec * dsr));
  const tStart = sd;
  if (tStart + w + 1 >= ds.length) throw new Error('Audio too short after start');
  const template = ds.subarray(tStart, tStart + w);

  const searchStart = Math.min(ds.length - w - 1, sd + Math.floor(minLoopSec * dsr));
  const searchEnd = Math.min(ds.length - w - 1, sd + Math.floor(maxSearchSec * dsr));

  let bestPos = -1;
  let bestCorr = -1;
  for (let pos = searchStart; pos <= searchEnd; pos++) {
    const c = ncc(template, ds, pos);
    if (c > bestCorr) {
      bestCorr = c;
      bestPos = pos;
    }
  }
  if (bestPos < 0) throw new Error('No match found');
  return { bestPos: bestPos * factor, bestCorr, factor };
}

function refineBoundary(signal, aStart, bEnd, sr) {
  // Refine loop boundary by maximizing NCC in a small neighborhood at full rate
  const windowSec = 0.25; // 250ms
  const w = Math.max(64, Math.floor(windowSec * sr));
  const template = signal.subarray(aStart, Math.min(aStart + w, signal.length));
  let bestEnd = bEnd;
  let bestCorr = -1;
  const span = Math.floor(0.15 * sr); // +/-150ms
  const start = Math.max(aStart + w + 1, bEnd - span);
  const end = Math.min(signal.length - 1 - w, bEnd + span);
  for (let pos = start; pos <= end; pos++) {
    const segStart = pos - w;
    const c = ncc(template, signal, segStart);
    if (c > bestCorr) {
      bestCorr = c;
      bestEnd = pos;
    }
  }
  return { end: bestEnd, corr: bestCorr };
}

function findNearestZeroCrossing(x, idx, window) {
  // Find index near idx where there is a zero-crossing with negative->positive slope
  const start = Math.max(1, idx - window);
  const end = Math.min(x.length - 1, idx + window);
  let best = idx;
  let bestDist = Infinity;
  for (let i = start; i < end; i++) {
    const a = x[i - 1];
    const b = x[i];
    if (a <= 0 && b > 0) {
      const d = Math.abs(i - idx);
      if (d < bestDist) { bestDist = d; best = i; }
    }
  }
  return best;
}

function fmtTime(samples, sr) {
  const sec = samples / sr;
  return `${sec.toFixed(6)}s`;
}

function writeWav16(filePath, channelsData, sampleRate) {
  const numChannels = channelsData.length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = channelsData[0].length;
  const dataSize = frameCount * bytesPerSample * numChannels;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;
  // RIFF header
  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(36 + dataSize, o); o += 4;
  buf.write('WAVE', o); o += 4;
  // fmt chunk
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4; // PCM fmt chunk size
  buf.writeUInt16LE(1, o); o += 2; // PCM
  buf.writeUInt16LE(numChannels, o); o += 2;
  buf.writeUInt32LE(sampleRate, o); o += 4;
  buf.writeUInt32LE(byteRate, o); o += 4;
  buf.writeUInt16LE(blockAlign, o); o += 2;
  buf.writeUInt16LE(bitsPerSample, o); o += 2;
  // data chunk
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(dataSize, o); o += 4;
  // samples interleaved
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let v = channelsData[ch][i];
      if (!Number.isFinite(v)) v = 0;
      if (v > 1) v = 1;
      if (v < -1) v = -1;
      const s = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
      buf.writeInt16LE(s, o); o += 2;
    }
  }
  fs.writeFileSync(filePath, buf);
}

function main() {
  // Prefer a few common names automatically
  const candidates = [
    'rain_raw.wav', 'RainRaw.wav', 'RainRaw.WAV', 'rainraw.wav', 'RainRaw', 'rain_raw'
  ];
  let file = process.env.WAV || null;
  if (!file) {
    for (const c of candidates) {
      if (fs.existsSync(path.join(process.cwd(), c))) { file = c; break; }
    }
  }
  if (!file) {
    console.error('No WAV file found. Place rain_raw.wav (or set WAV=path).');
    process.exit(1);
  }

  const parsed = parseWav(file);
  const { sampleRate, channelsData } = parsed;
  const frames = parsed.frames;
  // Build mono for analysis (average channels), keep stereo for export
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let ch = 0; ch < channelsData.length; ch++) s += channelsData[ch][i];
    mono[i] = s / channelsData.length;
  }
  const analyzed = new Float32Array(frames);
  analyzed.set(mono);
  removeDCAndNormalize(analyzed);

  const startSec = 1.0;
  const startIdx = Math.min(analyzed.length - 1, Math.floor(startSec * sampleRate));

  // Target a shorter loop if requested
  let targetSec = null;
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === '--target-sec') { const v = parseFloat(process.argv[i + 1]); if (Number.isFinite(v)) targetSec = v; }
  }
  if (!targetSec && process.env.TARGET_SEC) {
    const v = parseFloat(process.env.TARGET_SEC);
    if (Number.isFinite(v)) targetSec = v;
  }
  const opts = { minLoopSec: 2.0, templateSec: 0.5 };
  if (targetSec) {
    opts.maxSearchSec = Math.max(opts.minLoopSec + 0.5, targetSec + 2.0);
  } else {
    opts.maxSearchSec = Math.max(5.0, (frames / sampleRate) - startSec - 0.5);
  }
  const { bestPos, bestCorr } = findBestMatchAfter(analyzed, sampleRate, startIdx, opts);

  // Refine at full rate
  const refined = refineBoundary(analyzed, startIdx, bestPos, sampleRate);
  let endIdx = refined.end;

  // Snap both boundaries to nearest matching zero-crossings
  const zWin = Math.floor(0.05 * sampleRate); // 50ms search window
  const startZ = findNearestZeroCrossing(analyzed, startIdx, zWin);
  const endZ = findNearestZeroCrossing(analyzed, endIdx, zWin);

  const loopLen = endZ - startZ;
  const loopSec = loopLen / sampleRate;

  console.log('File:', file);
  console.log('Sample rate:', sampleRate, 'Hz');
  console.log('Duration:', (frames / sampleRate).toFixed(3), 's');
  console.log('--- Suggested Loop ---');
  console.log('Start (raw):', fmtTime(startIdx, sampleRate));
  console.log('End (raw):  ', fmtTime(endIdx, sampleRate));
  console.log('Start (zero-cross):', fmtTime(startZ, sampleRate));
  console.log('End (zero-cross):  ', fmtTime(endZ, sampleRate));
  console.log('Loop length:', loopSec.toFixed(6), 's');
  console.log('Match corr (coarse):', bestCorr.toFixed(3));
  console.log('Match corr (refined ~250ms window):', refined.corr.toFixed(3));

  if (refined.corr < 0.5) {
    console.log('Note: correlation is modest; consider a short crossfade at the boundary (e.g., 10–50ms).');
  }

  // Provide quick tips to audition externally
  console.log('\nTo audition: cut', fmtTime(startZ, sampleRate), 'to', fmtTime(endZ, sampleRate), 'and loop it.');

  const shouldWrite = process.argv.includes('--write') || process.env.WRITE === '1';
  if (shouldWrite) {
    const outPath = 'rain_loop.wav';
    const sliceLen = Math.max(0, endZ - startZ);
    const slicedChans = channelsData.map(ch => ch.subarray(startZ, endZ));
    writeWav16(outPath, slicedChans, sampleRate);
    console.log(`\nWrote ${outPath} with ${sliceLen} frames (${fmtTime(sliceLen, sampleRate)}), ${channelsData.length}ch 16-bit PCM @ ${sampleRate} Hz.`);
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Error:', e.message); process.exit(1); }
}
