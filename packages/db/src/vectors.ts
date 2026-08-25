export function normalizeVector(vector: number[] | Float32Array): Float32Array {
  const result = new Float32Array(vector);
  let sumSq = 0;
  for (let i = 0; i < result.length; i++) {
    const val = result[i] ?? 0;
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < result.length; i++) {
      result[i] = (result[i] ?? 0) / norm;
    }
  }
  return result;
}

export function encodeVector(vector: number[] | Float32Array, expectedDimensions?: number): Buffer {
  if (expectedDimensions !== undefined && vector.length !== expectedDimensions) {
    throw new Error(`Vector dimension mismatch: expected ${expectedDimensions}, got ${vector.length}`);
  }
  const normalized = normalizeVector(vector);
  return Buffer.from(normalized.buffer, normalized.byteOffset, normalized.byteLength);
}

export function decodeVector(buffer: Buffer, expectedDimensions?: number): Float32Array {
  if (buffer.byteLength % 4 !== 0) {
    throw new Error(`Corrupt vector buffer: byte length ${buffer.byteLength} is not a multiple of 4`);
  }
  const floatArray = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  if (expectedDimensions !== undefined && floatArray.length !== expectedDimensions) {
    throw new Error(
      `Decoded vector dimension mismatch: expected ${expectedDimensions}, got ${floatArray.length}`
    );
  }
  return floatArray;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compute similarity: vector dimensions differ (${a.length} vs ${b.length})`);
  }
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return dotProduct;
}
