import sharp from 'sharp';

export function optimizeImage(input: Buffer) {
  return sharp(input)
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();
}
