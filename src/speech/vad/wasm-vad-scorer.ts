interface WasmVadExports {
  score(
    energyScore: number,
    peakScore: number,
    voicedScore: number,
    zcrPenalty: number,
    fluxScore: number,
  ): number;
}

export async function createWasmVadScorer(): Promise<WasmVadExports> {
  const moduleBytes = buildVadScorerBinary();
  const { instance } = await WebAssembly.instantiate(moduleBytes);

  return instance.exports as unknown as WasmVadExports;
}

function buildVadScorerBinary(): Uint8Array {
  const bytes: number[] = [
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
  ];

  const functionType = [
    0x60,
    ...encodeU32(5),
    0x7d, 0x7d, 0x7d, 0x7d, 0x7d,
    ...encodeU32(1),
    0x7d,
  ];

  pushSection(bytes, 1, [
    ...encodeU32(1),
    ...functionType,
  ]);

  pushSection(bytes, 3, [
    ...encodeU32(1),
    ...encodeU32(0),
  ]);

  const exportName = encodeString("score");
  pushSection(bytes, 7, [
    ...encodeU32(1),
    ...exportName,
    0x00,
    ...encodeU32(0),
  ]);

  const body = [
    ...encodeU32(0),
    0x20, 0x00,
    0x43, ...encodeF32(1.42),
    0x94,
    0x20, 0x01,
    0x43, ...encodeF32(0.52),
    0x94,
    0x92,
    0x20, 0x02,
    0x43, ...encodeF32(0.74),
    0x94,
    0x92,
    0x20, 0x03,
    0x43, ...encodeF32(-0.9),
    0x94,
    0x92,
    0x20, 0x04,
    0x43, ...encodeF32(0.34),
    0x94,
    0x92,
    0x43, ...encodeF32(-1.12),
    0x92,
    0x0b,
  ];

  pushSection(bytes, 10, [
    ...encodeU32(1),
    ...encodeU32(body.length),
    ...body,
  ]);

  return Uint8Array.from(bytes);
}

function pushSection(target: number[], sectionId: number, payload: number[]): void {
  target.push(sectionId, ...encodeU32(payload.length), ...payload);
}

function encodeString(value: string): number[] {
  const encoded = new TextEncoder().encode(value);

  return [...encodeU32(encoded.length), ...encoded];
}

function encodeU32(value: number): number[] {
  const output: number[] = [];
  let remaining = value >>> 0;

  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;

    if (remaining !== 0) {
      byte |= 0x80;
    }

    output.push(byte);
  } while (remaining !== 0);

  return output;
}

function encodeF32(value: number): number[] {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  view.setFloat32(0, value, true);

  return Array.from(new Uint8Array(buffer));
}
