import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseGrid, createPieces, piecePath, cellAt, placePiece, shuffled, encodePayload, decodePayload, validatePayload, formatTime } from '../core.mjs';

test('all difficulties preserve piece count for landscape, portrait and square photos', () => {
  for (const count of [12, 24, 48, 96]) for (const aspect of [.65, 1, 4 / 3, 2]) {
    const { rows, cols } = chooseGrid(count, aspect);
    assert.equal(rows * cols, count);
    assert.ok(rows >= 2 && cols >= 2);
  }
  assert.throws(() => chooseGrid(7, 1));
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
  assert.throws(() => validatePayload({ v: 1, title: 'x', count: 999, demo: true }));
});
test('shuffle preserves every piece and elapsed time supports over an hour', () => {
  const values = Array.from({ length: 96 }, (_, i) => i);
  assert.deepEqual(shuffled(values).sort((a, b) => a - b), values);
  assert.equal(formatTime(3661), '61:01');
});
