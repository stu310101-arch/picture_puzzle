export const COUNTS = [12, 24, 48, 96];

export function chooseGrid(count, aspect) {
  if (!COUNTS.includes(count) || !Number.isFinite(aspect) || aspect <= 0) throw new Error('不支援的拼圖設定');
  let best, score = Infinity;
  for (let rows = 2; rows <= count / 2; rows++) {
    if (count % rows) continue;
    const cols = count / rows;
    const value = Math.abs(Math.log((cols / rows) / aspect));
    if (value < score) { best = { cols, rows }; score = value; }
  }
  return best;
}

export function createPieces(cols, rows, random = Math.random) {
  const pieces = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const id = row * cols + col;
    pieces.push({ id, row, col, locked: false, x: 0, y: 0,
      edges: [row ? -pieces[id - cols].edges[2] : 0, col < cols - 1 ? (random() < .5 ? 1 : -1) : 0,
        row < rows - 1 ? (random() < .5 ? 1 : -1) : 0, col ? -pieces[id - 1].edges[1] : 0] });
  }
  return pieces;
}

// All edges use the same symmetric curve. Adjacent pieces use opposite signs.
export function piecePath(width, height, pad, edges) {
  const points = [[pad, pad], [pad + width, pad], [pad + width, pad + height], [pad, pad + height]];
  let d = `M ${pad} ${pad}`;
  const tab = Math.min(width, height) * .23;
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = points[e], [bx, by] = points[(e + 1) % 4];
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    const pos = (t, n) => `${ax + dx * t + dy / length * n * tab * edges[e]} ${ay + dy * t - dx / length * n * tab * edges[e]}`;
    if (!edges[e]) { d += ` L ${bx} ${by}`; continue; }
    d += ` L ${pos(.34, 0)} C ${pos(.46, 0)} ${pos(.43, .25)} ${pos(.40, .46)}`;
    d += ` C ${pos(.27, 1.27)} ${pos(.73, 1.27)} ${pos(.60, .46)}`;
    d += ` C ${pos(.57, .25)} ${pos(.54, 0)} ${pos(.66, 0)} L ${bx} ${by}`;
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
  if (!data || data.v !== 1 || !COUNTS.includes(data.count) || typeof data.title !== 'string' || data.title.length > 48) throw new Error('拼圖連結的設定不完整，請朋友重新分享。');
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
