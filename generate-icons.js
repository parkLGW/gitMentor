import sharp from 'sharp';
import { mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sizes = [16, 48, 128];
const sourceImage = join(__dirname, 'public', 'gitmentor.png');
const outputDir = join(__dirname, 'public', 'icons');

async function generateIcons() {
  // Ensure output directory exists
  try {
    await access(outputDir);
  } catch {
    await mkdir(outputDir, { recursive: true });
  }

  console.log('Generating icons from:', sourceImage);
  console.log('Output directory:', outputDir);

  for (const size of sizes) {
    const outputPath = join(outputDir, `icon-${size}.png`);
    
    await sharp(sourceImage)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
    
    console.log(`Generated: icon-${size}.png`);
  }

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
