import { Mp3Encoder } from "@breezystack/lamejs";

function pcm16(samples: Float32Array, start: number, size: number): Int16Array {
  const output = new Int16Array(size);
  for (let i = 0; i < size; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[start + i] ?? 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

/** Decodifica a gravação nativa do navegador e gera bytes MP3 reais. */
export async function audioBlobToMp3(blob: Blob): Promise<Blob> {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Math.min(decoded.numberOfChannels, 2);
    const encoder = new Mp3Encoder(channels, decoded.sampleRate, 96);
    const left = decoded.getChannelData(0);
    const right = channels === 2 ? decoded.getChannelData(1) : undefined;
    const chunks: Uint8Array[] = [];
    const blockSize = 1152;

    for (let offset = 0; offset < decoded.length; offset += blockSize) {
      const size = Math.min(blockSize, decoded.length - offset);
      const encoded = encoder.encodeBuffer(
        pcm16(left, offset, size),
        right ? pcm16(right, offset, size) : undefined,
      );
      if (encoded.length > 0) chunks.push(encoded);
    }
    const flushed = encoder.flush();
    if (flushed.length > 0) chunks.push(flushed);
    return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
  } finally {
    await context.close();
  }
}