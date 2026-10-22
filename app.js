import { MIN_PIECES, MAX_PIECES, isValidCount, chooseGrid, createPieces, cellMap, piecePath, shuffled, cellAt, placePiece, formatTime, encodePayload, decodePayload, validatePayload } from './core.mjs';
import { SHORT_LINK_API } from './config.js';

const $ = id => document.getElementById(id);
const DEMO = './assets/alpine-lake.jpg';
const STORE_KEY = 'piece-by-piece-v1';
let photo, photoSource = DEMO, isDemo = true, count = 24, saved = false;
let phase = 'setup', pieces = [], grid, layout, selected = null, drag = null, topZ = 100;
let startedAt = 0, elapsed = 0, timer, sound = true, audioContext;
let shareMode = 'standard', shareVersion = 0, shareCache = {}, currentPayload, shareURL = '', shortURL = '';
let busyPhoto = false, toastTimeout, resizeTimeout, lastPointerAction = 0;
let zoom = 1, previewTimeout, panMode = false, pan = null;
let sharedPuzzle = null, sharedLink = false, sharedURL = '';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message, error = false) {
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function title() { if (sharedPuzzle) return sharedPuzzle.title; return $('puzzle-title').value.trim() || '我的專屬拼圖'; }
function setMessage(message, kind = '') {
  $('game-message').textContent = message;
  $('game-message').className = kind ? `is-${kind}` : '';
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('照片沒有有效尺寸。'));
    image.onerror = () => reject(new Error('無法讀取照片，請改用 JPG、PNG 或 WebP 格式。'));
    image.src = src;
  });
}

function canvasImage(image, maxSide, quality, mime = 'image/jpeg') {
  // Preserve the entire picture. Very wide/tall images receive neutral letterboxing.
  const rawAspect = image.naturalWidth / image.naturalHeight;
  const aspect = Math.max(.65, Math.min(2, rawAspect));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(aspect >= 1 ? maxSide : maxSide * aspect);
  canvas.height = Math.round(aspect >= 1 ? maxSide / aspect : maxSide);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#edece3'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  const encoded = canvas.toDataURL(mime, quality);
  return mime === 'image/webp' && !encoded.startsWith('data:image/webp;') ? canvas.toDataURL('image/jpeg', quality) : encoded;
}

function invalidateSave() {
  saved = false; shareVersion++; shareCache = {}; shortURL = '';
  $('setup-share').hidden = true;
  $('save-status').textContent = '照片先在瀏覽器處理；分享後保留照片與設定，不自動到期。';
  $('shared-banner').hidden = true;
}

function readCount(report = false) {
  if (sharedLink) {
    if (!sharedPuzzle) return false;
    count = sharedPuzzle.count; $('piece-count').value = String(count); return true;
  }
  const input = $('piece-count'), value = input.valueAsNumber;
  const valid = isValidCount(value);
  input.setCustomValidity(valid ? '' : `片數請輸入 ${MIN_PIECES}～${MAX_PIECES} 的整數。`);
  input.setAttribute('aria-invalid', String(!valid));
  $('count-error').hidden = valid;
  $('count-error').textContent = valid ? '' : `請輸入 ${MIN_PIECES}～${MAX_PIECES} 的整數片數。`;
  if (!valid) { if (report) input.reportValidity(); return false; }
  count = value;
  return true;
}

function updatePreview() {
  if (!photo) return;
  const aspect = photo.naturalWidth / photo.naturalHeight;
  const { cols, rows } = chooseGrid(count, aspect);
  $('preview-image').src = photoSource;
  $('preview-image').alt = `拼圖預覽：${title()}`;
  $('preview-title').textContent = title();
  $('preview-size').textContent = `${count} 片 · ${cols} × ${rows}`;
  $('photo-frame').style.aspectRatio = String(aspect);
  const preview = $('preview-lines');
  preview.setAttribute('viewBox', `0 0 ${cols * 100} ${rows * 100}`);
  preview.replaceChildren();
  const previewPieces = createPieces(cols, rows, () => .4, count);
  $('preview-size').textContent = `${count} 片 · ${cols * rows === count ? `${cols} × ${rows}` : `${rows} 列・末列合併分格`}`;
  const fragment = document.createDocumentFragment();
  for (const piece of previewPieces) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', piecePath(100 * piece.span, 100, 0, piece.edges, piece.span));
    path.setAttribute('transform', `translate(${piece.col * 100} ${piece.row * 100})`);
    fragment.append(path);
  }
  preview.append(fragment);
  $('count-hint').textContent = `${cols * rows === count ? '自行輸入 2～5000 的整數，例如 24、100、500、1000。' : `保留確切 ${count} 片；末列部分碎片較寬，照片仍完整。`}${count >= 300 ? ' 大量碎片可放大拼圖桌操作。' : ''}`;
}

async function acceptPhoto(file) {
  if (sharedLink || !file || busyPhoto) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) return toast('請選擇 JPG、PNG、WebP 或 AVIF 圖片。', true);
  if (file.size > 20 * 1024 * 1024) return toast('照片超過 20 MB，請先縮小後再試一次。', true);
  busyPhoto = true;
  $('start-button').disabled = $('save-button').disabled = $('upload-button').disabled = true;
  $('puzzle-title').disabled = true;
  $('photo-status').textContent = '正在準備照片，請稍候…';
  const objectURL = URL.createObjectURL(file);
  try {
    const original = await loadImage(objectURL);
    if (original.naturalWidth * original.naturalHeight > 60000000) throw new Error('照片尺寸過大，請先縮小至 6,000 萬像素以下。');
    const normalized = canvasImage(original, 1600, .9);
    const decoded = await loadImage(normalized);
    photoSource = normalized; photo = decoded; isDemo = false;
    $('puzzle-title').value = file.name.replace(/\.[^.]+$/, '').slice(0, 48);
    $('photo-status').textContent = '照片已準備好！完整保留畫面。';
    invalidateSave(); updatePreview();
    toast('照片已載入，挑選片數就可以開始。');
  } catch (error) { toast(error.message, true); }
  finally {
    URL.revokeObjectURL(objectURL); busyPhoto = false;
    $('start-button').disabled = $('save-button').disabled = $('upload-button').disabled = false;
    $('puzzle-title').disabled = false;
    $('photo-input').value = '';
  }
}

async function savePuzzle(showToast = true) {
  if (sharedLink) return !!sharedPuzzle;
  if (!photo || busyPhoto) return false;
  if (!readCount(true)) return false;
  const data = { v: 1, title: title(), count, ...(isDemo ? { demo: true } : { image: canvasImage(photo, 1200, .82) }) };
  let persisted = true;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch { persisted = false; }
  saved = true;
  $('setup-share').hidden = false;
  $('save-status').textContent = persisted ? '已儲存在這個瀏覽器。現在可以分享給朋友了。' : '本次拼圖已準備好分享；瀏覽器無法永久儲存，關閉後不會保留。';
  if (showToast) toast(persisted ? '拼圖已儲存，分享按鈕已開啟。' : '已準備好分享，但無法儲存在此瀏覽器。');
  return true;
}

function calculateLayout() {
  const stage = $('puzzle-stage'), w = $('puzzle-viewport').clientWidth, aspect = photo.naturalWidth / photo.naturalHeight;
  const mobile = w < 700;
  let h, bw, bh, x, y;
  if (mobile) {
    bw = Math.min(w - 48, 470, 410 * aspect); bh = bw / aspect;
    const cellW = bw / grid.cols, cellH = bh / grid.rows;
    const trayRows = Math.ceil(count / Math.max(2, Math.floor((w - 28) / (cellW * .98))));
    h = Math.max(690, bh + 115 + trayRows * cellH * .94 + cellH * .6);
    x = (w - bw) / 2; y = 42;
  } else {
    h = Math.max(180, $('puzzle-viewport').clientHeight);
    // Leave enough room for full-size pieces above and below the board too.
    const boardHeight = (h - 64) / (1 + 3.1 / grid.rows);
    bw = Math.min(w * .49, boardHeight * aspect, 780); bh = bw / aspect;
    x = (w - bw) / 2; y = (h - bh) / 2;
  }
  const pw = bw / grid.cols, ph = bh / grid.rows, pad = Math.min(pw, ph) * .25 + 2;
  stage.style.height = `${h}px`;
  stage.style.width = `${w}px`;
  return { w, h, board: { x, y, w: bw, h: bh }, pw, ph, pad, mobile };
}

function setZoom(value, center = true) {
  if (!layout) return;
  const viewport = $('puzzle-viewport'), previous = zoom;
  const focusX = (viewport.scrollLeft + viewport.clientWidth / 2) / previous;
  const focusY = (viewport.scrollTop + viewport.clientHeight / 2) / previous;
  zoom = Math.min(6, Math.max(1, value));
  $('puzzle-stage').style.transform = `scale(${zoom})`;
  $('puzzle-surface').style.width = `${layout.w * zoom}px`;
  $('puzzle-surface').style.height = `${layout.h * zoom}px`;

  $('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  $('zoom-out').disabled = zoom <= 1; $('zoom-in').disabled = zoom >= 6;
  if (center) viewport.scrollTo(focusX * zoom - viewport.clientWidth / 2, focusY * zoom - viewport.clientHeight / 2);
}
function centerBoard() {
  if (!layout) return;
  const viewport = $('puzzle-viewport'), b = layout.board;
  viewport.scrollTo({ left: (b.x + b.w / 2) * zoom - viewport.clientWidth / 2, top: (b.y + b.h / 2) * zoom - viewport.clientHeight / 2, behavior: 'instant' });
}

function renderBoard() {
  layout = calculateLayout();
  const { board, pw, ph, pad } = layout;
  Object.assign($('puzzle-board').style, { left: `${board.x}px`, top: `${board.y}px`, width: `${board.w}px`, height: `${board.h}px` });
  $('board-slots').style.gridTemplateColumns = `repeat(${grid.cols}, 1fr)`;
  $('board-slots').style.gridTemplateRows = `repeat(${grid.rows}, 1fr)`;
  $('board-slots').replaceChildren(); $('pieces-layer').replaceChildren();
  $('puzzle-stage').classList.toggle('dense', count >= 300);
  for (const piece of pieces) {
    const slot = document.createElement('button');
    slot.className = 'board-slot'; slot.dataset.cell = piece.id;
    slot.style.gridColumn = `${piece.col + 1} / span ${piece.span}`;
    slot.style.gridRow = String(piece.row + 1);
    slot.setAttribute('aria-label', `第 ${piece.row + 1} 列第 ${piece.col + 1} 格`);
    slot.tabIndex = -1;
    slot.addEventListener('click', () => { if (selected !== null) tryPlace(selected, piece.id); });
    slot.addEventListener('keydown', event => handleSlotKey(event, piece.id));
    $('board-slots').append(slot);
    const button = document.createElement('button');
    button.className = 'piece'; button.dataset.piece = piece.id;
    button.setAttribute('aria-label', `拼圖碎片 ${piece.id + 1}`);
    button.setAttribute('aria-pressed', 'false');
    button.style.width = `${pw * piece.span + pad * 2}px`; button.style.height = `${ph + pad * 2}px`;
    const canvas = document.createElement('canvas');
    const dpr = count >= 300 ? 4 : Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.ceil((pw * piece.span + pad * 2) * dpr); canvas.height = Math.ceil((ph + pad * 2) * dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const path = new Path2D(piecePath(pw * piece.span, ph, pad, piece.edges, piece.span));
    ctx.save(); ctx.clip(path);
    ctx.drawImage(photo, pad - piece.col * pw, pad - piece.row * ph, board.w, board.h);
    ctx.restore(); ctx.strokeStyle = '#fffefacc'; ctx.lineWidth = .85; ctx.stroke(path);
    button.append(canvas); piece.element = button;
    button.addEventListener('pointerdown', event => pointerDown(event, piece));
    button.addEventListener('pointermove', pointerMove);
    button.addEventListener('pointerup', pointerUp);
    button.addEventListener('pointercancel', pointerCancel);
    button.addEventListener('click', event => {
      if (event.detail > 0 && performance.now() - lastPointerAction < 450) return;
      selectPiece(piece.id, true);
    });
    button.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); selectPiece(piece.id, true);
      }
    });
    $('pieces-layer').append(button);
    if (piece.locked) lockPiece(piece); else if (phase !== 'playing') button.disabled = true;
  }
  scatterPieces();
  setZoom(zoom, false);
}

function movePiece(piece, x, y) {
  piece.x = x; piece.y = y;
  piece.element.style.left = `${x}px`; piece.element.style.top = `${y}px`;
}

function scatterPieces() {
  if (!layout) return;
  deselectPiece();
  const { w, h, board: b, pw, ph, pad, mobile } = layout;
  const fullW = pw + 2 * pad, fullH = ph + 2 * pad;
  const slots = [];
  if (mobile) {
    const cols = Math.max(2, Math.floor((w - 22) / (pw * .97)));
    const stepX = (w - 20 - fullW) / Math.max(1, cols - 1);
    for (let i = 0; i < count; i++) slots.push({ x: 10 + (i % cols) * stepX, y: b.y + b.h + 35 + Math.floor(i / cols) * ph * .94 });
  } else {
    // Perimeter positions may overlap slightly, like pieces on a real table.
    const stepX = fullW * .9, stepY = fullH * .9;
    const nx = Math.max(1, Math.floor((w - fullW - 16) / stepX));
    const ny = Math.max(1, Math.floor((h - fullH - 16) / stepY));
    for (let yi = 0; yi <= ny; yi++) for (let xi = 0; xi <= nx; xi++) {
      const x = 8 + xi * (w - fullW - 16) / nx, y = 8 + yi * (h - fullH - 16) / ny;
      if (x + fullW < b.x - 10 || x > b.x + b.w + 10 || y + fullH < b.y - 10 || y > b.y + b.h + 10) slots.push({ x, y });
    }
    if (slots.length < count) {
      const needed = count - slots.length;
      const sideW = b.x - fullW - 14;
      for (let i = 0; i < needed; i++) {
        const side = i % 2, row = Math.floor(i / 2), totalRows = Math.ceil(needed / 2);
        slots.push({ x: side ? w - fullW - 9 - Math.random() * Math.max(0, sideW) : 9 + Math.random() * Math.max(0, sideW), y: 9 + row / Math.max(1, totalRows - 1) * (h - fullH - 18) });
      }
    }
  }
  const positions = shuffled(slots);
  shuffled(pieces.filter(p => !p.locked)).forEach((piece, index) => {
    const position = positions[index % positions.length];
    const jitter = mobile ? 2 : Math.min(7, pw * .1);
    const pieceWidth = pw * piece.span + 2 * pad;
    let px = Math.max(2, Math.min(w - pieceWidth - 2, position.x + (Math.random() - .5) * jitter));
    let py = Math.max(2, Math.min(h - fullH - 2, position.y + (Math.random() - .5) * jitter));
    if (!mobile && piece.span > 1 && px + pieceWidth > b.x - 8 && px < b.x + b.w + 8 && py + fullH > b.y - 8 && py < b.y + b.h + 8) py = 5;
    movePiece(piece, px, py);
    piece.element.style.zIndex = String(++topZ);
  });
}

function selectPiece(id, keyboard = false) {
  if (phase !== 'playing' || pieces[id].locked || panMode) return;
  deselectPiece(); selected = id;
  const piece = pieces[id];
  piece.element.classList.add('selected'); piece.element.setAttribute('aria-pressed', 'true');
  piece.element.style.zIndex = String(++topZ);
  document.querySelectorAll('.board-slot').forEach(slot => { slot.tabIndex = 0; });
  setMessage(`已選取碎片 ${id + 1}，請點選目標格子；按 Escape 可取消。`);
  if (keyboard) $('board-slots').children[0].focus({ preventScroll: false });
}

function deselectPiece() {
  if (selected !== null && pieces[selected]?.element) {
    pieces[selected].element.classList.remove('selected'); pieces[selected].element.setAttribute('aria-pressed', 'false');
  }
  selected = null;
  document.querySelectorAll('.board-slot').forEach(slot => { slot.tabIndex = -1; });
}

function handleSlotKey(event, id) {
  const piece = pieces[id];
  let row = piece.row, col = piece.col;
  if (event.key === 'ArrowLeft') col = Math.max(0, col - 1);
  else if (event.key === 'ArrowRight') col = Math.min(grid.cols - 1, col + piece.span);
  else if (event.key === 'ArrowUp') row = Math.max(0, row - 1);
  else if (event.key === 'ArrowDown') row = Math.min(grid.rows - 1, row + 1);
  else return;
  const next = grid.cells[row * grid.cols + col];
  event.preventDefault(); $('board-slots').children[next].focus();
}

function pointerDown(event, piece) {
  if (phase !== 'playing' || piece.locked || panMode || event.button !== 0 || drag) return;
  event.preventDefault();
  const rect = $('puzzle-stage').getBoundingClientRect();
  drag = { id: piece.id, pointer: event.pointerId, sx: event.clientX, sy: event.clientY, startX: piece.x, startY: piece.y, offsetX: (event.clientX - rect.left) / zoom - piece.x, offsetY: (event.clientY - rect.top) / zoom - piece.y, moved: false };
  selectPiece(piece.id); piece.element.setPointerCapture(event.pointerId);
}
function pointerMove(event) {
  if (!drag || drag.pointer !== event.pointerId) return;
  if (Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) > 4) drag.moved = true;
  if (!drag.moved) return;
  const piece = pieces[drag.id], rect = $('puzzle-stage').getBoundingClientRect();
  piece.element.classList.add('dragging');
  movePiece(piece, Math.max(-layout.pad, Math.min(layout.w - layout.pw * piece.span - layout.pad, (event.clientX - rect.left) / zoom - drag.offsetX)), Math.max(-layout.pad, Math.min(layout.h - layout.ph - layout.pad, (event.clientY - rect.top) / zoom - drag.offsetY)));

}
function pointerUp(event) {
  if (!drag || drag.pointer !== event.pointerId) return;
  const active = drag; drag = null; lastPointerAction = performance.now();
  const piece = pieces[active.id]; piece.element.classList.remove('dragging');
  if (piece.element.hasPointerCapture(event.pointerId)) piece.element.releasePointerCapture(event.pointerId);
  if (!active.moved) return;
  const cell = cellAt(piece.x + layout.pad + layout.pw * piece.span / 2, piece.y + layout.pad + layout.ph / 2, layout.board, grid.cols, grid.rows);
  if (cell >= 0) {
    const target = grid.cells[cell];
    const result = tryPlace(piece.id, target);
    if (result === 'wrong') movePiece(piece, active.startX, active.startY);
  } else deselectPiece();
}
function pointerCancel(event) {
  if (!drag || drag.pointer !== event.pointerId) return;
  const piece = pieces[drag.id]; movePiece(piece, drag.startX, drag.startY);
  piece.element.classList.remove('dragging'); drag = null; deselectPiece();
}

function lockPiece(piece) {
  movePiece(piece, layout.board.x + piece.col * layout.pw - layout.pad, layout.board.y + piece.row * layout.ph - layout.pad);
  piece.element.classList.add('locked'); piece.element.disabled = true; piece.element.tabIndex = -1;
  piece.element.style.zIndex = '1';
  piece.element.setAttribute('aria-label', `拼圖碎片 ${piece.id + 1}，已正確固定`);
  $('board-slots').children[piece.id].setAttribute('aria-label', `第 ${piece.row + 1} 列第 ${piece.col + 1} 格，已完成`);
}

function tryPlace(id, target) {
  if (phase !== 'playing' || panMode) return;
  const result = placePiece(pieces, id, target), piece = pieces[id];
  if (result === 'locked') return result;
  if (result === 'wrong') {
    piece.element.classList.add('wrong'); $('board-slots').children[target]?.classList.add('wrong');
    setMessage('這片還沒找到它的位置，再換一格試試！', 'error');
    setTimeout(() => { piece.element?.classList.remove('wrong'); $('board-slots').children[target]?.classList.remove('wrong'); }, 850);
    return result;
  }
  deselectPiece(); lockPiece(piece); piece.element.classList.add('correct');
  $('board-hint').hidden = true; updateProgress();
  playSnap();
  setMessage('拼對了！這片已經固定，繼續尋找下一片吧。', 'success');
  if (result === 'complete') finishGame(false);
  else if (document.activeElement?.classList.contains('board-slot')) pieces.find(p => !p.locked)?.element.focus({ preventScroll: true });
  return result;
}

function updateProgress() {
  const completed = pieces.filter(p => p.locked).length;
  $('progress-label').textContent = `${completed} / ${count}`;
  $('progress-bar').style.width = `${completed / count * 100}%`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', String(Math.round(completed / count * 100)));
}

async function unlockAudio() {
  if (!sound) return;
  try { audioContext ??= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') await audioContext.resume(); } catch { /* Audio is optional; game state must continue. */ }
}
function playSnap() {
  if (!sound || !audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
  oscillator.frequency.setValueAtTime(680, now); oscillator.frequency.exponentialRampToValueAtTime(1050, now + .06);
  gain.gain.setValueAtTime(.04, now); gain.gain.exponentialRampToValueAtTime(.001, now + .1);
  oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(now + .12);
}
function playApplause() {
  if (!sound || !audioContext || audioContext.state !== 'running') return;
  // A locally synthesized crowd of claps: overlapping filtered noise bursts, no remote audio dependency.
  const ctx = audioContext, length = ctx.sampleRate * .15;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate), samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * .025));
  for (let i = 0; i < 105; i++) {
    const start = ctx.currentTime + Math.random() * 3.3;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer; source.playbackRate.value = .7 + Math.random() * .7;
    filter.type = 'bandpass'; filter.frequency.value = 800 + Math.random() * 1800; filter.Q.value = .45;
    gain.gain.value = .18 + Math.random() * .2;
    source.connect(filter).connect(gain).connect(ctx.destination); source.start(start);
  }
}
function celebrate() {
  if (reducedMotion) return;
  $('confetti').replaceChildren();
  const colors = ['#6f8b66', '#d9ad68', '#cc785d', '#f2d9a7', '#91aca6'];
  for (let i = 0; i < 110; i++) {
    const ribbon = document.createElement('i');
    ribbon.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-duration:${3 + Math.random() * 2}s;animation-delay:${Math.random() * 1.2}s;--drift:${(Math.random() - .5) * 350}px;--spin:${Math.random() * 1500}deg`;
    $('confetti').append(ribbon);
  }
  setTimeout(() => $('confetti').replaceChildren(), 6500);
}

function startGame() {
  if (!photo || busyPhoto) return;
  if (!readCount(true)) return;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  clearInterval(timer); deselectPiece(); drag = null;
  setPanMode(false);
  phase = 'playing'; grid = chooseGrid(count, photo.naturalWidth / photo.naturalHeight);
  pieces = createPieces(grid.cols, grid.rows, Math.random, count); topZ = 100; zoom = 1;
  grid.cells = cellMap(pieces, grid.cols, grid.rows);
  $('setup-view').hidden = true; $('game-view').hidden = false; document.body.classList.add('playing');
  $('game-title').textContent = title(); $('board-hint').hidden = false;
  $('finish-button').hidden = $('give-up-button').hidden = false;
  $('new-game-button').hidden = true; $('shuffle-button').disabled = false;
  $('timer').textContent = '00:00'; elapsed = 0; startedAt = performance.now();
  timer = setInterval(() => { elapsed = Math.floor((performance.now() - startedAt) / 1000); $('timer').textContent = formatTime(elapsed); }, 1000);
  renderBoard(); updateProgress();
  $('puzzle-viewport').scrollTo(0, 0);
  setMessage('拖曳碎片到中央，或先點碎片、再點格子。鍵盤：Tab 選取 → Enter 拿起 → 方向鍵選格 → Enter 放下。');
  window.scrollTo({ top: 0, behavior: 'instant' }); unlockAudio();
}

function finishGame(gaveUp) {
  if (phase !== 'playing') return;
  elapsed = Math.floor((performance.now() - startedAt) / 1000); clearInterval(timer);
  phase = gaveUp ? 'gave-up' : 'won'; deselectPiece(); drag = null;
  if (gaveUp) pieces.forEach(piece => { piece.locked = true; lockPiece(piece); });
  updateProgress(); $('board-hint').hidden = true;
  $('finish-button').hidden = $('give-up-button').hidden = true;
  $('new-game-button').hidden = false; $('shuffle-button').disabled = true;
  $('timer').textContent = formatTime(elapsed);
  $('result-title').textContent = gaveUp ? '歡迎再次挑戰！' : '你把美好，拼完整了！';
  $('result-eyebrow').textContent = gaveUp ? 'ANOTHER DAY, ANOTHER LITTLE MOMENT' : 'EVERY PIECE FOUND ITS PLACE';
  $('result-text').textContent = gaveUp ? '已經幫你拼好完整照片。休息一下，下一次再享受拼圖的樂趣。' : `完成 ${count} 片拼圖，用時 ${formatTime(elapsed)}。每一片耐心，都值得一點掌聲。`;
  $('result-image').src = photoSource;
  setMessage(gaveUp ? '已自動完成拼圖。歡迎再次挑戰！' : '恭喜，所有碎片都找到了自己的位置！', 'success');
  $('result-dialog').showModal();
  if (!gaveUp) { playApplause(); celebrate(); }
}

function backToSetup() {
  clearInterval(timer); phase = 'setup'; drag = null;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('game-view').hidden = true; $('setup-view').hidden = false; document.body.classList.remove('playing');
  updatePreview(); window.scrollTo({ top: 0, behavior: 'instant' });
}

async function buildPayload(mode) {
  if (isDemo) return { v: 1, title: title(), count, demo: true };
  let side = mode === 'compact' ? 480 : 1000;
  const maxLength = mode === 'compact' ? 17000 : 110000;
  const quality = mode === 'compact' ? .58 : .83;
  let image;
  do { image = canvasImage(photo, side, quality, 'image/webp'); side = Math.floor(side * .85); }
  while (image.length > maxLength && side >= 128);
  return { v: 1, title: title(), count, image };
}
function publicBase() {
  const url = new URL(location.href); url.hash = ''; url.search = ''; return url.href;
}
async function updateShare() {
  const version = ++shareVersion;
  if (sharedPuzzle) {
    $('share-url').value = sharedURL;
    $('share-thumbnail').src = photoSource; $('share-name').textContent = title();
    $('share-details').textContent = `${sharedPuzzle.count} 片 · 分享者指定`;
    $('link-size').textContent = `${sharedURL.length} 個字元`;
    $('share-note').textContent = '轉傳同一份挑戰，照片和片數都維持分享者的設定。';
    $('short-link-status').textContent = '不自動到期，朋友不需要登入。';
    $('copy-link').disabled = $('native-share').disabled = false;
    return;
  }
  shortURL = ''; shareURL = ''; $('share-url').value = '';
  $('copy-link').disabled = $('native-share').disabled = $('shorten-link').disabled = true;
  $('link-size').textContent = '正在準備分享照片…'; $('short-link-status').textContent = '';
  $('quality-standard').setAttribute('aria-pressed', String(shareMode === 'standard'));
  $('quality-compact').setAttribute('aria-pressed', String(shareMode === 'compact'));
  try {
    const payload = shareCache[shareMode] ??= await buildPayload(shareMode);
    if (version !== shareVersion) return;
    currentPayload = payload;
    $('share-thumbnail').src = payload.demo ? DEMO : payload.image;
    $('share-name').textContent = payload.title;
    $('share-details').textContent = `${count} 片 · ${shareMode === 'compact' ? '省流量畫質' : '標準畫質'}`;
    $('share-note').textContent = '分享不設到期日。短網址由 da.gd 提供；新建立的網址可能先顯示目的地確認頁。';
    await shortenLink();
  } catch (error) { $('link-size').textContent = '準備失敗，請關閉視窗後重試。'; toast(error.message, true); }
}
async function openShare() {
  if (!saved && !await savePuzzle(false)) return;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('share-dialog').showModal(); await updateShare();
}
async function copyLink() {
  const value = $('share-url').value;
  if (!value) return;
  try { await navigator.clipboard.writeText(value); $('copy-link').textContent = '已複製！'; setTimeout(() => { $('copy-link').textContent = '複製短網址'; }, 2000); }
  catch { $('share-url').focus(); $('share-url').select(); $('share-note').textContent = '請長按選取網址並複製，或使用 Ctrl+C／⌘C 複製。'; }
}
async function shortenLink() {
  const version = shareVersion, mode = shareMode;
  $('copy-link').disabled = $('native-share').disabled = $('shorten-link').disabled = true;
  $('link-size').textContent = '正在建立短網址…';
  $('short-link-status').textContent = '照片與片數正在儲存到分享服務…';
  try {
    if (!SHORT_LINK_API) throw new Error('尚未設定短網址服務，請網站管理者設定 config.js。');
    const cacheKey = mode + '-url';
    let url = shareCache[cacheKey];
    if (!url) {
      const response = await fetch(`${SHORT_LINK_API.replace(/\/$/, '')}/p`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...currentPayload, target: publicBase(), requestKey: shareCache[mode + '-request'] ??= crypto.randomUUID() }), signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(response.status === 429 ? '建立太頻繁，請一分鐘後重試。' : problem.error === 'SHORTENER_UNAVAILABLE' ? '照片已保留，縮網址服務暫時無法連線；請按「重新建立短網址」。' : '短網址服務暫時無法使用，請稍後按「重新建立短網址」。');
      }
      const result = await response.json();
      if (!/^[A-Za-z0-9_-]{12}$/.test(result.id)) throw new Error('短網址服務回傳的資料不完整。');
      url = result.url || `${publicBase()}#s=${result.id}`;
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || (result.url && parsed.origin !== new URL(SHORT_LINK_API).origin && !/^https:\/\/da\.gd\/[A-Za-z0-9_-]{3,24}$/.test(url))) throw new Error('短網址來源不正確。');
      if (version !== shareVersion) return;
      shareCache[cacheKey] = url;
    }
    if (version !== shareVersion) return;
    shortURL = url; shareURL = url; $('share-url').value = url;
    $('link-size').textContent = `${url.length} 個字元 · 真正短網址`;
    $('short-link-status').textContent = '短網址已建立，不自動到期。朋友只能玩指定片數，不需要登入。';
    $('copy-link').disabled = $('native-share').disabled = false;
  } catch (error) {
    if (version !== shareVersion) return;
    $('link-size').textContent = '短網址尚未建立';
    $('short-link-status').textContent = error.name === 'TimeoutError' ? '連線逾時，請稍後重新建立。' : error.message;
  } finally { if (version === shareVersion) $('shorten-link').disabled = false; }
}

async function restorePayload(data, shared = false) {
  const safe = validatePayload(data);
  const src = safe.demo ? DEMO : safe.image;
  const loaded = await loadImage(src);
  // Reject hostile image dimensions before any puzzle canvases are allocated.
  if (loaded.naturalWidth * loaded.naturalHeight > 6000000) throw new Error('分享照片尺寸過大，請重新儲存後分享。');
  if (shared) {
    sharedPuzzle = Object.freeze({...safe}); sharedLink = true;
    const canonical = data.shareUrl;
    sharedURL = typeof canonical === 'string' && /^https:\/\/da\.gd\/[A-Za-z0-9_-]{3,24}$/.test(canonical) ? canonical : location.href;
    setSharedView();
  }
  photo = loaded; photoSource = src; isDemo = !!safe.demo; count = safe.count;
  $('piece-count').value = String(count); readCount();
  $('puzzle-title').value = safe.title;
  saved = false; shareCache = {}; updatePreview();
  if (shared) { $('shared-banner').hidden = false; $('shared-banner').querySelector('span').textContent = `朋友邀你挑戰 ${count} 片拼圖！照片與片數已固定。`; $('shared-piece-count').textContent = count; }
  else { saved = true; $('setup-share').hidden = false; $('save-status').textContent = '已載入你上次儲存的拼圖。'; }
}

function setSharedView() {
  document.body.classList.toggle('shared-mode', sharedLink);
  $('shared-challenge').hidden = !sharedLink;
  document.querySelector('.friend-create').hidden = !sharedLink;
  for (const id of ['piece-count','puzzle-title','upload-button','photo-input','demo-button']) $(id).disabled = sharedLink;
  if (sharedLink) {
    $('back-to-setup').textContent = '回到挑戰預覽';
    $('new-game-button').textContent = '回到挑戰預覽';
    document.querySelector('.intro h1').textContent = '朋友的心意，一片片拼起來。';
    document.querySelector('.intro p').textContent = '照片與片數都已準備好，留一點時間，完成這份專屬挑戰。';
  }
}

function setPanMode(enabled) {
  panMode = enabled; pan = null;
  $('pan-mode').setAttribute('aria-pressed', String(enabled));
  $('pan-mode').textContent = enabled ? '返回拼圖' : '移動畫布';
  $('puzzle-viewport').classList.toggle('pan-mode', enabled);
}

function bindEvents() {
  const viewport = $('puzzle-viewport');
  $('pan-mode').addEventListener('click', () => setPanMode(!panMode));
  $('show-tray').addEventListener('click', () => {
    if (!layout) return;
    const next = selected === null ? pieces.find(piece => !piece.locked) : pieces[selected];
    if (next) viewport.scrollTo((next.x + layout.pw / 2) * zoom - viewport.clientWidth / 2, (next.y + layout.ph / 2) * zoom - viewport.clientHeight / 2);
  });
  viewport.addEventListener('pointerdown', event => {
    if (!panMode || event.button !== 0 || pan) return;
    event.preventDefault(); event.stopPropagation();
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
  }, true);
  viewport.addEventListener('pointermove', event => {
    if (!pan || pan.id !== event.pointerId) return;
    event.preventDefault();
    viewport.scrollTo(pan.left + pan.x - event.clientX, pan.top + pan.y - event.clientY);
  });
  const endPan = event => {
    if (!pan || pan.id !== event.pointerId) return;
    pan = null; lastPointerAction = performance.now();
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', endPan);
  viewport.addEventListener('pointercancel', endPan);
  viewport.addEventListener('wheel', event => event.preventDefault(), { passive: false });
  document.addEventListener('selectstart', event => { if (!event.target.closest?.('#share-url')) event.preventDefault(); });
  document.addEventListener('copy', event => { if (!event.target.closest?.('#share-url')) event.preventDefault(); });
  document.addEventListener('contextmenu', event => { if (!event.target.closest?.('#share-url')) event.preventDefault(); });
  document.addEventListener('dragstart', event => event.preventDefault());
  document.addEventListener('touchmove', event => {
    if (document.body.classList.contains('playing') && !event.target.closest('dialog[open]')) event.preventDefault();
  }, { passive: false });
  $('setup-form').addEventListener('submit', event => { event.preventDefault(); startGame(); });
  $('upload-button').addEventListener('click', () => $('photo-input').click());
  $('photo-input').addEventListener('change', event => acceptPhoto(event.target.files[0]));
  const zone = $('upload-button');
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('drag-over'); acceptPhoto(event.dataTransfer.files[0]); });
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
  $('demo-button').addEventListener('click', async () => {
    if (sharedLink || busyPhoto) return;
    try { const loaded = await loadImage(DEMO); photo = loaded; photoSource = DEMO; isDemo = true; $('puzzle-title').value = '山湖之間'; $('photo-status').textContent = '還沒靈感？先用這張風景試試。'; invalidateSave(); updatePreview(); }
    catch (error) { toast(error.message, true); }
  });
  $('puzzle-title').addEventListener('input', () => { invalidateSave(); updatePreview(); });
  $('piece-count').addEventListener('input', () => {
    invalidateSave(); clearTimeout(previewTimeout);
    if (readCount()) previewTimeout = setTimeout(updatePreview, 160);
  });
  $('zoom-in').addEventListener('click', () => setZoom(zoom + .5));
  $('zoom-out').addEventListener('click', () => setZoom(zoom - .5));
  $('center-board').addEventListener('click', centerBoard);
  $('grid-toggle').addEventListener('click', () => { const visible = $('grid-toggle').getAttribute('aria-pressed') === 'true'; $('grid-toggle').setAttribute('aria-pressed', String(!visible)); $('preview-lines').hidden = visible; $('grid-toggle').querySelector('span').textContent = visible ? '顯示分割線' : '隱藏分割線'; });
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));
  $('save-button').addEventListener('click', () => savePuzzle());
  $('setup-share').addEventListener('click', openShare);
  $('result-share').addEventListener('click', openShare);
  $('reference-button').addEventListener('click', () => { $('reference-image').src = photoSource; $('reference-dialog').showModal(); });
  $('shuffle-button').addEventListener('click', () => { scatterPieces(); setMessage('已重新整理未完成的碎片，拼好的位置都保留了。'); });
  $('sound-button').addEventListener('click', () => { sound = !sound; $('sound-button').setAttribute('aria-pressed', String(sound)); $('sound-button').setAttribute('aria-label', sound ? '關閉音效' : '開啟音效'); $('sound-button').querySelector('span').textContent = sound ? '音效開' : '音效關'; if (sound) unlockAudio(); });
  $('give-up-button').addEventListener('click', () => $('give-up-dialog').showModal());
  $('confirm-give-up').addEventListener('click', () => { $('give-up-dialog').close(); finishGame(true); });
  $('finish-button').addEventListener('click', () => {
    if (pieces.every(p => p.locked)) finishGame(false);
    else { const left = pieces.filter(p => !p.locked).length; setMessage(`還有 ${left} 片沒有完成，繼續試試看！`, 'error'); toast(`還差 ${left} 片，拼圖尚未完成。`, true); }
  });
  $('replay-button').addEventListener('click', startGame);
  $('back-to-setup').addEventListener('click', backToSetup);
  $('new-game-button').addEventListener('click', backToSetup);
  for (const mode of ['standard', 'compact']) $(`quality-${mode}`).addEventListener('click', () => { shareMode = mode; updateShare(); });
  $('copy-link').addEventListener('click', copyLink);
  $('shorten-link').addEventListener('click', shortenLink);
  $('native-share').addEventListener('click', async () => {
    if (!navigator.share) { await copyLink(); $('share-note').textContent = '這個瀏覽器未提供系統分享選單，請複製連結貼到聊天訊息。'; return; }
    try { await navigator.share({ title: `${title()}｜片刻拼圖`, text: '送你一份專屬拼圖，一起享受片刻！', url: $('share-url').value }); }
    catch (error) { if (error.name !== 'AbortError') $('share-note').textContent = '系統分享未成功，請使用複製連結。'; }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && selected !== null) {
      const piece = pieces[selected]; deselectPiece(); piece.element.focus(); setMessage('已取消選取。選另一片繼續吧。');
    }
  });
  window.addEventListener('resize', () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(() => { if (phase !== 'setup') { drag = null; renderBoard(); updateProgress(); } }, 160); });
}

async function init() {
  $('start-button').disabled = $('save-button').disabled = true;
  const hash = new URLSearchParams(location.hash.slice(1));
  sharedLink = hash.has('p') || hash.has('s'); setSharedView();
  bindEvents();
  try {
    photo = await loadImage(DEMO); updatePreview();
    if (hash.has('p')) await restorePayload(decodePayload(hash.get('p')), true);
    else if (hash.has('s')) {
      const id = hash.get('s');
      if (!SHORT_LINK_API) throw new Error('本站尚未設定短網址服務，請朋友改用一般分享連結。');
      if (!/^[A-Za-z0-9_-]{12}$/.test(id)) throw new Error('這個短網址不完整。');
      const response = await fetch(`${SHORT_LINK_API.replace(/\/$/, '')}/p/${id}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(response.status === 404 ? '找不到這份拼圖，請確認連結是否正確。' : '暫時無法載入拼圖，請稍後重新整理。');
      await restorePayload(await response.json(), true);
    } else {
      try {
        const previous = localStorage.getItem(STORE_KEY);
        if (previous) {
          const data = JSON.parse(previous);
          // Saved originals may be larger than the share payload limit.
          if (data.image?.length > 150000 && data.image.length < 3000000) {
            const loaded = await loadImage(data.image); data.image = canvasImage(loaded, 800, .7, 'image/webp');
          }
          await restorePayload(data);
        }
      } catch { /* A bad/private-mode local save must never block a fresh game. */ }
    }
  } catch (error) {
    $('shared-banner').hidden = false; $('shared-banner').querySelector('span').textContent = error.message;
    toast(error.message, true);
  } finally { $('start-button').disabled = sharedLink ? !sharedPuzzle : !photo; $('save-button').disabled = sharedLink || !photo; }
}
init();
