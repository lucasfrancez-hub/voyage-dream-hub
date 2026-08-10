/**
 * Converte um áudio gravado no navegador (webm/opus, ogg, mp4…) em WAV
 * 16 kHz mono — um dos poucos formatos que o Instagram aceita como anexo
 * de DM (aac, m4a, mp4 e wav). MP3 é recusado com o erro 2534080.
 */
export async function audioBlobToWav(blob: Blob, sampleRate = 16000): Promise<Blob> {
  const AudioContextClass = window.AudioContext;
  const ctx = new AudioContextClass();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await ctx.close();
  }

  // Mixa para mono e reamostra para 16 kHz (offline, sem travar a interface).
  const frames = Math.max(1, Math.round((decoded.duration || 0) * sampleRate));
  const offline = new OfflineAudioContext(1, frames, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return wavFromChannel(rendered.getChannelData(0), sampleRate);
}

function wavFromChannel(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i += 1) view.setUint8(offset + i, texto.charCodeAt(i));
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
