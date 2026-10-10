/** Returns false for decoded silence, true for audible energy, and null when the browser cannot decode this format. */
export async function hasAudibleEnergy(blob: Blob, threshold = 0.0045): Promise<boolean | null> {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  let context: AudioContext | null = null;
  try {
    context = new AudioContextClass();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (!decoded.length || decoded.duration < 0.18) return false;
    let sumSquares = 0;
    let samples = 0;
    const stride = Math.max(1, Math.floor(decoded.length / 24_000));
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < data.length; i += stride) {
        sumSquares += data[i] * data[i];
        samples++;
      }
    }
    return samples > 0 && Math.sqrt(sumSquares / samples) >= threshold;
  } catch {
    return null;
  } finally {
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }
}
