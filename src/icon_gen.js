// Generate a browser taskbar icon with serial number overlay.
// Produces a multi-size ICO with the number rendered on the chrome.svg base.

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BASE_SVG = path.join(__dirname, '..', 'renderer', 'chrome.svg');

/**
 * Generate an ICO file with a number overlaid on the chrome icon.
 * @param {number} number - The serial number to display (1-999)
 * @param {string} outputPath - Where to write the .ico file
 */
async function generateNumberedIcon(number, outputPath) {
    const numStr = String(number);
    // Adjust font size based on number of digits
    const fontSize = numStr.length === 1 ? 120 : numStr.length === 2 ? 95 : 72;
    
    // Badge positioned at center-bottom with semi-transparent dark background
    const badgeW = numStr.length === 1 ? 130 : numStr.length === 2 ? 160 : 180;
    const badgeH = fontSize + 30;
    const badgeX = 128 - badgeW / 2;
    const badgeY = 256 - badgeH - 10; // bottom area with 10px margin

    // Create SVG overlay: rounded rect background + white text
    const overlaySvg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
        <rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="16" ry="16"
              fill="rgba(76, 175, 80, 0.82)" />
        <text x="128" y="${badgeY + badgeH / 2 + fontSize * 0.36}" text-anchor="middle"
              font-family="Arial, sans-serif" font-weight="500" font-size="${fontSize}"
              fill="white">${numStr}</text>
    </svg>`;

    // Generate multiple sizes
    const sizes = [16, 32, 48, 256];
    const pngBuffers = [];

    for (const size of sizes) {
        const base = await sharp(BASE_SVG).resize(size, size).png().toBuffer();
        const overlay = await sharp(Buffer.from(overlaySvg)).resize(size, size).png().toBuffer();
        const composited = await sharp(base)
            .composite([{ input: overlay, top: 0, left: 0 }])
            .png()
            .toBuffer();
        pngBuffers.push(composited);
    }

    // Build ICO
    const ico = buildIco(pngBuffers, sizes);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, ico);
}

function buildIco(pngBuffers, sizes) {
    const numImages = pngBuffers.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    let offset = headerSize + dirEntrySize * numImages;

    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(numImages, 4);

    const dirEntries = [];
    for (let i = 0; i < numImages; i++) {
        const entry = Buffer.alloc(dirEntrySize);
        const w = sizes[i] >= 256 ? 0 : sizes[i];
        entry.writeUInt8(w, 0);
        entry.writeUInt8(w, 1);
        entry.writeUInt8(0, 2);
        entry.writeUInt8(0, 3);
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(pngBuffers[i].length, 8);
        entry.writeUInt32LE(offset, 12);
        dirEntries.push(entry);
        offset += pngBuffers[i].length;
    }

    return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

module.exports = { generateNumberedIcon };
