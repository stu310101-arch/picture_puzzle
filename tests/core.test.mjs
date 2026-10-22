import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCount, chooseGrid, createPieces, cellMap, piecePath, cellAt, placePiece, shuffled, encodePayload, decodePayload, validatePayload, formatTime } from '../core.mjs';

test('all difficulties preserve piece count for landscape, portrait and square photos', () => {
  for (const count of [12, 24, 48, 96, 100, 500, 1000, 5000]) for (const aspect of [.65, 1, 4 / 3, 2]) {
    const { rows, cols } = chooseGrid(count, aspect);
    assert.equal(createPieces(cols, rows, Math.random, count).length, count);
    assert.ok(rows >= 2 && cols >= 2);
  }
  assert.throws(() => chooseGrid(5001, 1));
});
test('jigsaw edges interlock and the outside perimeter is flat', () => {
  const pieces = createPieces(6, 4);
  for (const piece of pieces) {
    if (piece.col < 5) assert.equal(piece.edges[1], -pieces[piece.id + 1].edges[3]);
    else assert.equal(piece.edges[1], 0);
    if (piece.row < 3) assert.equal(piece.edges[2], -pieces[piece.id + 6].edges[0]);
    else assert.equal(piece.edges[2], 0);
    if (piece.row === 0) assert.equal(piece.edges[0], 0);
    if (piece.col === 0) assert.equal(piece.edges[3], 0);
    assert.ok(!piecePath(100, 90, 25, piece.edges).includes('NaN'));
  }
});
test('incorrect placement stays movable, correct placement locks, completion happens only at the last piece', () => {
  const pieces = createPieces(4, 3);
  assert.equal(placePiece(pieces, 0, 1), 'wrong');
  assert.equal(pieces[0].locked, false);
  assert.equal(placePiece(pieces, 0, 0), 'correct');
  assert.equal(placePiece(pieces, 0, 1), 'locked');
  assert.equal(pieces[0].locked, true);
  for (let id = 1; id < 11; id++) assert.equal(placePiece(pieces, id, id), 'correct');
  assert.equal(placePiece(pieces, 11, 11), 'complete');
});
test('drop hit testing handles all boundaries without accepting outside pieces', () => {
  const b = { x: 100, y: 100, w: 400, h: 300 };
  assert.equal(cellAt(100, 100, b, 4, 3), 0);
  assert.equal(cellAt(499, 399, b, 4, 3), 11);
  assert.equal(cellAt(99, 100, b, 4, 3), -1);
  assert.equal(cellAt(500, 400, b, 4, 3), -1);
  assert.equal(cellAt(201, 201, b, 4, 3), 5);
});
test('a link round trip preserves Chinese, emoji, count and photo bytes', () => {
  for (const payload of [
    { v: 1, title: '我們的夏天 🌿 & #', count: 96, demo: true },
    { v: 1, title: '我的照片', count: 12, image: 'data:image/webp;base64,UklGRg==' }
  ]) assert.deepEqual(decodePayload(encodePayload(payload)), payload);
});
test('links reject malformed or oversized input and unsafe image schemes', () => {
  for (const input of ['', 'bad%link', 'x'.repeat(220001), 'bm90LWpzb24']) assert.throws(() => decodePayload(input));
  for (const image of ['javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', 'https://other.example/x.jpg']) {
    assert.throws(() => validatePayload({ v: 1, title: 'x', count: 12, image }));
  }
  assert.throws(() => validatePayload({ v: 1, title: 'x', count: 5001, demo: true }));
});

test('custom counts reject empty, fractional, unsafe and out-of-range numbers', () => {
  for (const value of [0, 1, -2, 12.5, NaN, Infinity, 5001, '100', null]) assert.equal(isValidCount(value), false);
  for (const value of [2, 7, 24, 100, 101, 500, 997, 1000, 5000]) assert.equal(isValidCount(value), true);
});

test('every custom count has exactly that many pieces and covers the full photo', () => {
  for (let count = 2; count <= 5000; count++) {
    const { cols, rows } = chooseGrid(count, 4 / 3);
    const pieces = createPieces(cols, rows, () => .2, count), map = cellMap(pieces, cols, rows);
    assert.equal(pieces.length, count);
    assert.equal(pieces.reduce((sum, p) => sum + p.span, 0), cols * rows);
    assert.equal(map.filter(id => Number.isInteger(id)).length, cols * rows);
    for (const p of pieces.filter(p => p.span > 1)) {
      for (let i = 0; i < p.span; i++) {
        const above = pieces[map[(p.row - 1) * cols + p.col + i]];
        assert.equal(p.edges[0][i], -above.edges[2]);
      }
      assert.ok(!piecePath(30 * p.span, 30, 10, p.edges, p.span).includes('NaN'));
    }
  }
});

test('large and non-preset counts survive both share formats', () => {
  for (const count of [100, 101, 500, 997, 1000, 5000]) {
    const payload = { v: 1, title: '自訂片數', count, demo: true };
    assert.equal(decodePayload(encodePayload(payload)).count, count);
    assert.equal(validatePayload({ ...payload, demo: false, image: 'data:image/webp;base64,UklGRg==' }).count, count);
  }
});
test('shuffle preserves every piece and elapsed time supports over an hour', () => {
  const values = Array.from({ length: 96 }, (_, i) => i);
  assert.deepEqual(shuffled(values).sort((a, b) => a - b), values);
  assert.equal(formatTime(3661), '61:01');
});
