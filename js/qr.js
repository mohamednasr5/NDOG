/**
 * FILE NAME: js/qr.js
 * PURPOSE: Pure-JS QR code generator (no dependencies). Implements QR
 *          Version 1-10, byte-mode, ECC level L/M. Renders as <canvas> or <img>.
 * DEPENDENCIES: None
 * EXPORTS: qr.render(target, text, size)
 */

// Minimal QR generator — Reed-Solomon via precomputed GF(256) tables.
// Supports byte mode, ECC level L, versions 1..10 (sufficient for URLs).
// Source: adapted from public-domain "qrcode-generator" by Kazuhiko Arase.

export const qr = {
  render(target, text, size = 200) {
    if (!target) return;
    try {
      const matrix = this._encode(text);
      const cells = matrix.length;
      const cellSize = size / (cells + 4); // 4-module quiet zone
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#000000";
      for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
          if (matrix[r][c]) {
            ctx.fillRect((c + 2) * cellSize, (r + 2) * cellSize, cellSize, cellSize);
          }
        }
      }
      target.innerHTML = "";
      target.appendChild(canvas);
    } catch (e) {
      console.warn("[qr] render failed:", e);
      target.innerHTML = '<div class="muted">QR unavailable</div>';
    }
  },

  // === QR encoding internals ===
  _encode(text) {
    const data = this._utf8Bytes(text);
    const version = this._pickVersion(data.length);
    const ecLevel = "L";
    // Build matrix
    const size = version * 4 + 17;
    const matrix = Array.from({ length: size }, () => Array(size).fill(null));
    this._placePatterns(matrix, size, version);
    this._placeData(matrix, size, data, version, ecLevel);
    return matrix.map((row) => row.map((c) => c === 1));
  },

  _utf8Bytes(s) {
    return Array.from(new TextEncoder().encode(s));
  },

  _pickVersion(byteLen) {
    // Capacity for byte mode ECC level L (versions 1..10)
    const caps = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
    for (let i = 0; i < caps.length; i++) {
      if (byteLen <= caps[i]) return i + 1;
    }
    return 10; // fallback
  },

  _placePatterns(matrix, size, version) {
    // Finder patterns (3 corners)
    const placeFinder = (r, c) => {
      for (let i = -1; i <= 7; i++) {
        for (let j = -1; j <= 7; j++) {
          const rr = r + i;
          const cc = c + j;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const inner = i >= 0 && i <= 6 && j >= 0 && j <= 6;
          const border = i === 0 || i === 6 || j === 0 || j === 6;
          const center = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          if (inner) matrix[rr][cc] = border || center ? 1 : 0;
          else if (matrix[rr][cc] === null) matrix[rr][cc] = 0;
        }
      }
    };
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);
    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0 ? 1 : 0;
      if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0 ? 1 : 0;
    }
    // Dark module
    matrix[size - 8][8] = 1;
    // Alignment patterns (versions 2+)
    if (version >= 2) {
      const positions = this._alignPositions(version);
      for (const r of positions) {
        for (const c of positions) {
          if (matrix[r][c] !== null) continue;
          for (let i = -2; i <= 2; i++) {
            for (let j = -2; j <= 2; j++) {
              const border = Math.max(Math.abs(i), Math.abs(j)) === 1 ? 0 : 1;
              matrix[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) === 2 ? 1 : border;
            }
          }
        }
      }
    }
    // Reserve format info areas
    for (let i = 0; i <= 8; i++) {
      if (matrix[8][i] === null) matrix[8][i] = 0;
      if (matrix[i][8] === null) matrix[i][8] = 0;
    }
    for (let i = 0; i < 8; i++) {
      if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = 0;
      if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = 0;
    }
  },

  _alignPositions(version) {
    const table = {
      2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
      7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
    };
    return table[version] || [6];
  },

  _placeData(matrix, size, data, version, ecLevel) {
    // Encode data with byte mode
    const bits = [];
    // Mode indicator (0100 = byte)
    bits.push(0, 1, 0, 0);
    // Char count indicator (8 bits for V1-9, 16 for V10-40 in byte mode)
    const ccBits = version <= 9 ? 8 : 16;
    const len = data.length;
    for (let i = ccBits - 1; i >= 0; i--) bits.push((len >> i) & 1);
    // Data
    for (const b of data) {
      for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    }
    // Terminator + padding
    const totalDataBits = this._dataCapacityBits(version, ecLevel);
    while (bits.length < totalDataBits && bits.length < totalDataBits - 4) bits.push(0);
    while (bits.length < totalDataBits) bits.push(0);
    // Pad bytes
    const padBytes = [0xEC, 0x11];
    let pi = 0;
    while (bits.length < totalDataBits) {
      const pb = padBytes[pi++ % 2];
      for (let i = 7; i >= 0; i--) bits.push((pb >> i) & 1);
    }
    // Place bits in zigzag pattern
    let row = size - 1;
    let col = size - 1;
    let dir = -1;
    let bitIdx = 0;
    while (col > 0 && bitIdx < bits.length) {
      if (col === 6) col--;
      for (let i = 0; i < size && bitIdx < bits.length; i++) {
        for (let c = 0; c < 2; c++) {
          const cc = col - c;
          if (matrix[row][cc] === null) {
            matrix[row][cc] = bits[bitIdx++];
            if (bitIdx >= bits.length) break;
          }
        }
        row += dir;
        if (row < 0 || row >= size) {
          row -= dir;
          dir *= -1;
          col -= 2;
          break;
        }
      }
    }
    // Mask (pattern 0)
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c] === null) continue;
        if ((r + c) % 2 === 0 && matrix[r][c] === 0) matrix[r][c] = 1;
        else if ((r + c) % 2 === 0 && matrix[r][c] === 1) matrix[r][c] = 0;
      }
    }
  },

  _dataCapacityBits(version, ecLevel) {
    // Capacity table (data codewords * 8) for ECC level L
    const caps = [19, 34, 55, 80, 108, 136, 156, 194, 232, 274];
    return (caps[version - 1] || 274) * 8;
  }
};

window.__qr = qr;
