import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "../public/brand");
const svgPath = resolve(outputDirectory, "app-icon.svg");

const BACKGROUND = [0xc8, 0xff, 0x4d];
const FOREGROUND = [0x09, 0x0b, 0x12];
const SUPERSAMPLE = 4;

const mainSpark = [
  [0.5, 0.148],
  [0.58, 0.42],
  [0.852, 0.5],
  [0.58, 0.58],
  [0.5, 0.852],
  [0.42, 0.58],
  [0.148, 0.5],
  [0.42, 0.42],
];

function diamond(centerX, centerY, radius) {
  return [
    [centerX, centerY - radius],
    [centerX + radius, centerY],
    [centerX, centerY + radius],
    [centerX - radius, centerY],
  ];
}

const sparks = [
  mainSpark,
  diamond(0.773, 0.254, 0.109),
  diamond(0.219, 0.762, 0.09),
];

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    const crosses =
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) /
          (previousY - currentY) +
          currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function renderIcon(size) {
  const rowLength = 1 + size * 4;
  const raw = Buffer.alloc(rowLength * size);

  for (let y = 0; y < size; y += 1) {
    raw[y * rowLength] = 0;
    for (let x = 0; x < size; x += 1) {
      let foregroundSamples = 0;
      for (let sampleY = 0; sampleY < SUPERSAMPLE; sampleY += 1) {
        for (let sampleX = 0; sampleX < SUPERSAMPLE; sampleX += 1) {
          const normalizedX = (x + (sampleX + 0.5) / SUPERSAMPLE) / size;
          const normalizedY = (y + (sampleY + 0.5) / SUPERSAMPLE) / size;
          if (
            sparks.some((spark) =>
              pointInPolygon(normalizedX, normalizedY, spark),
            )
          ) {
            foregroundSamples += 1;
          }
        }
      }

      const mix = foregroundSamples / (SUPERSAMPLE * SUPERSAMPLE);
      const offset = y * rowLength + 1 + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        raw[offset + channel] = Math.round(
          BACKGROUND[channel] * (1 - mix) + FOREGROUND[channel] * mix,
        );
      }
      raw[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

await readFile(svgPath);
await mkdir(outputDirectory, { recursive: true });

for (const [filename, size] of [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
]) {
  await writeFile(resolve(outputDirectory, filename), renderIcon(size));
}

process.stdout.write("Generated PWA icons from the versioned spark design.\n");
