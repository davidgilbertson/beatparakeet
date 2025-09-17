const gainCache = new Map();

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
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const amp = Math.abs(data[i]);
        if (amp > globalPeak) globalPeak = amp;
      }
    }
  }
  chosenGain = globalPeak > 0 ? 1 / globalPeak : 1;
  return chosenGain;
}

export function getNormalizationGain(instrument, cacheKey) {
  if (cacheKey && gainCache.has(cacheKey)) {
    return gainCache.get(cacheKey);
  }
  const gain = computePeakNormalizationGain(instrument);
  if (cacheKey) {
    gainCache.set(cacheKey, gain);
  }
  return gain;
}

export function clearNormalizationCache() {
  gainCache.clear();
}
