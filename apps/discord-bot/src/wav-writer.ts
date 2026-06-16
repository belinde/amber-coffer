import { openSync, closeSync, writeSync, fstatSync } from 'node:fs';
import { unlink } from 'node:fs/promises';

/**
 * Minimum valid WAV file size in bytes.
 * Files smaller than this after finalization are considered invalid (no useful audio)
 * and are deleted automatically.
 */
const MIN_WAV_BYTES = 512;

/** Standard WAV header size: 44 bytes (RIFF header + fmt chunk + data chunk header). */
const WAV_HEADER_SIZE = 44;

/**
 * Writes raw PCM samples into a valid RIFF/WAVE container.
 *
 * Usage:
 *   const writer = new WavWriter('/tmp/chunk.wav', 48000, 1, 16);
 *   writer.write(pcmBuffer);
 *   const { bytesWritten } = await writer.finalize();
 */
export class WavWriter {
  private readonly fd: number;
  private readonly outputPath: string;
  private readonly sampleRate: number;
  private readonly channels: number;
  private readonly bitsPerSample: number;
  private dataBytes: number;
  private closed: boolean;

  constructor(outputPath: string, sampleRate: number, channels: number, bitsPerSample: number) {
    this.outputPath = outputPath;
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.bitsPerSample = bitsPerSample;
    this.dataBytes = 0;
    this.closed = false;

    this.fd = openSync(outputPath, 'w');
    this.writeHeader();
  }

  /** Append raw PCM samples to the WAV file. */
  write(pcmBuffer: Buffer): void {
    if (this.closed) {
      throw new Error('Cannot write to a closed WavWriter');
    }
    writeSync(this.fd, pcmBuffer);
    this.dataBytes += pcmBuffer.length;
  }

  /**
   * Finalize the WAV file: seek back to update RIFF and data chunk sizes,
   * then close the file handle. If the resulting file is smaller than 512 bytes,
   * delete it and return 0.
   */
  async finalize(): Promise<{ bytesWritten: number }> {
    if (this.closed) {
      return { bytesWritten: 0 };
    }

    this.patchSizes();
    const totalSize = fstatSync(this.fd).size;
    closeSync(this.fd);
    this.closed = true;

    if (totalSize < MIN_WAV_BYTES) {
      await unlink(this.outputPath).catch(() => undefined);
      return { bytesWritten: 0 };
    }

    return { bytesWritten: totalSize };
  }

  /** Close the file handle and delete the incomplete file. */
  async abort(): Promise<void> {
    if (!this.closed) {
      closeSync(this.fd);
      this.closed = true;
    }
    await unlink(this.outputPath).catch(() => undefined);
  }

  /**
   * Write the initial 44-byte WAV header with placeholder sizes.
   * Sizes are patched on finalize().
   */
  private writeHeader(): void {
    const byteRate = this.sampleRate * this.channels * (this.bitsPerSample / 8);
    const blockAlign = this.channels * (this.bitsPerSample / 8);

    const header = Buffer.alloc(WAV_HEADER_SIZE);
    let offset = 0;

    // RIFF chunk descriptor
    header.write('RIFF', offset);
    offset += 4;
    header.writeUInt32LE(0, offset); // placeholder: file size - 8
    offset += 4;
    header.write('WAVE', offset);
    offset += 4;

    // fmt sub-chunk
    header.write('fmt ', offset);
    offset += 4;
    header.writeUInt32LE(16, offset); // fmt chunk size (PCM = 16)
    offset += 4;
    header.writeUInt16LE(1, offset); // audio format: PCM = 1
    offset += 2;
    header.writeUInt16LE(this.channels, offset);
    offset += 2;
    header.writeUInt32LE(this.sampleRate, offset);
    offset += 4;
    header.writeUInt32LE(byteRate, offset);
    offset += 4;
    header.writeUInt16LE(blockAlign, offset);
    offset += 2;
    header.writeUInt16LE(this.bitsPerSample, offset);
    offset += 2;

    // data sub-chunk header
    header.write('data', offset);
    offset += 4;
    header.writeUInt32LE(0, offset); // placeholder: data size
    // offset += 4; // at position 44

    writeSync(this.fd, header);
  }

  /** Seek back and patch RIFF file size and data chunk size. */
  private patchSizes(): void {
    const riffSize = Buffer.alloc(4);
    riffSize.writeUInt32LE(WAV_HEADER_SIZE - 8 + this.dataBytes);
    writeSync(this.fd, riffSize, 0, 4, 4);

    const dataSize = Buffer.alloc(4);
    dataSize.writeUInt32LE(this.dataBytes);
    writeSync(this.fd, dataSize, 0, 4, 40);
  }
}
