import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const sizes = [16, 32, 48, 128];
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#53FC18"/>
  <text x="64" y="88" font-family="Arial, sans-serif" font-size="72" font-weight="bold" text-anchor="middle" fill="#0F0F0F">K</text>
</svg>`;

await mkdir('public/icons', { recursive: true });
for (const size of sizes) {
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(`public/icons/${size}.png`, buffer);
}
console.log('Generated icons:', sizes.join(', '));
