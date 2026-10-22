export const MIN_PIECES = 2;
export const MAX_PIECES = 5000;
export function isValidCount(count) {
  return Number.isInteger(count) && count >= MIN_PIECES && count <= MAX_PIECES;
}

export function chooseGrid(count, aspect) {
  if (!isValidCount(count) || !Number.isFinite(aspect) || aspect <= 0) throw new Error(`片數請輸入 ${MIN_PIECES}～${MAX_PIECES} 的整數。`);
  let best, score = Infinity;
  for (let rows = 1; rows <= count; rows++) {
    if (count % rows) continue;
    const cols = count / rows;
    const value = Math.abs(Math.log((cols / rows) / aspect));
    if (value < score) { best = { cols, rows }; score = value; }
  }
  if (score <= .6 || count < 6) return best;
  // Prime counts (and poorly factored counts) still keep the exact requested total.
  // Merge adjacent cells in the last row instead of making hundreds of thin strips.
  for (let rows = 2; rows <= count; rows++) {
    const cols = Math.ceil(count / rows), last = count - cols * (rows - 1);
    if (last <= 0) continue;
    const value = Math.abs(Math.log((cols / rows) / aspect)) + .08 * (cols * rows - count) / cols + .025 * (Math.ceil(cols / last) - 1);
    if (value < score) { best = { cols, rows }; score = value; }
  }
  return best;
}

export function createPieces(cols, rows, random = Math.random, total = cols * rows) {
  if (total > cols * rows || total <= cols * (rows - 1)) throw new Error('無效的分割數量');
  const pieces = [], cells = [];
  for (let row = 0; row < rows; row++) {
    const rowCount = row === rows - 1 ? total - cols * row : cols;
    let col = 0;
    for (let index = 0; index < rowCount; index++) {
      const span = Math.floor(cols / rowCount) + (index < cols % rowCount ? 1 : 0);
      const id = pieces.length;
      const top = Array.from({ length: span }, (_, i) => row ? -pieces[cells[(row - 1) * cols + col + i]].edges[2] : 0);
      pieces.push({ id, row, col, span, locked: false, x: 0, y: 0,
        edges: [span === 1 ? top[0] : top, col + span < cols ? (random() < .5 ? 1 : -1) : 0,
          row < rows - 1 ? (random() < .5 ? 1 : -1) : 0, col ? -pieces[id - 1].edges[1] : 0] });
      for (let i = 0; i < span; i++) cells[row * cols + col + i] = id;
      col += span;
    }
  }
  return pieces;
}

export function cellMap(pieces, cols, rows) {
  const cells = new Array(cols * rows);
  for (const piece of pieces) for (let i = 0; i < piece.span; i++) cells[piece.row * cols + piece.col + i] = piece.id;
  return cells;
}

// All edges use the same symmetric curve. Adjacent pieces use opposite signs.
export function piecePath(width, height, pad, edges, span = 1) {
  const points = [[pad, pad], [pad + width, pad], [pad + width, pad + height], [pad, pad + height]];
  let d = `M ${pad} ${pad}`;
  const tab = Math.min(width / span, height) * .23;
  for (let e = 0; e < 4; e++) {
    const [sx, sy] = points[e], [ex, ey] = points[(e + 1) % 4];
    const signs = Array.isArray(edges[e]) ? edges[e] : [edges[e]];
    for (let segment = 0; segment < signs.length; segment++) {
    const sign = signs[segment];
    const ax = sx + (ex - sx) * segment / signs.length, ay = sy + (ey - sy) * segment / signs.length;
    const bx = sx + (ex - sx) * (segment + 1) / signs.length, by = sy + (ey - sy) * (segment + 1) / signs.length;
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    const pos = (t, n) => `${ax + dx * t + dy / length * n * tab * sign} ${ay + dy * t - dx / length * n * tab * sign}`;
    if (!sign) { d += ` L ${bx} ${by}`; continue; }
    d += ` L ${pos(.34, 0)} C ${pos(.46, 0)} ${pos(.43, .25)} ${pos(.40, .46)}`;
    d += ` C ${pos(.27, 1.27)} ${pos(.73, 1.27)} ${pos(.60, .46)}`;
    d += ` C ${pos(.57, .25)} ${pos(.54, 0)} ${pos(.66, 0)} L ${bx} ${by}`;
    }
  }
  return d + ' Z';
}

export function shuffled(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function cellAt(x, y, board, cols, rows) {
  if (x < board.x || y < board.y || x >= board.x + board.w || y >= board.y + board.h) return -1;
  return Math.floor((y - board.y) / (board.h / rows)) * cols + Math.floor((x - board.x) / (board.w / cols));
}

export function placePiece(pieces, id, target) {
  const piece = pieces[id];
  if (!piece || piece.locked) return 'locked';
  if (id !== target) return 'wrong';
  piece.locked = true;
  return pieces.every(p => p.locked) ? 'complete' : 'correct';
}

export function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function validatePayload(data) {
  if (!data || data.v !== 1 || !isValidCount(data.count) || typeof data.title !== 'string' || data.title.length > 48) throw new Error('拼圖連結的設定不完整，請朋友重新分享。');
  if (data.demo === true) return { v: 1, count: data.count, title: data.title, demo: true };
  if (typeof data.image !== 'string' || data.image.length > 150000 || !/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data.image)) throw new Error('照片資料遺失或連結遭到截斷，請重新複製完整連結。');
  return { v: 1, count: data.count, title: data.title, image: data.image };
}

export function encodePayload(payload) {
  const data = new TextEncoder().encode(JSON.stringify(validatePayload(payload)));
  let text = '';
  for (const byte of data) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodePayload(encoded) {
  if (!encoded || encoded.length > 220000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('分享連結不完整或過大。請朋友重新複製。');
  try {
    const text = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    return validatePayload(JSON.parse(new TextDecoder().decode(Uint8Array.from(text, c => c.charCodeAt(0)))));
  } catch (error) {
    if (error.message.includes('拼圖') || error.message.includes('照片')) throw error;
    throw new Error('無法讀取分享連結，請確認連結已完整複製。');
  }
}
