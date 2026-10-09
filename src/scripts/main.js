const BOARD_WIDTH = 7;
const BOARD_SIZE = BOARD_WIDTH * BOARD_WIDTH;
const REQUIRED_LAMPS = 5;
const BOARD_LAMPS = 3;
const STARTING_SCARABS = 10;
const STORAGE_KEY = "bezi-proof:combo-path-playable:state-v1";
const PROP_TYPES = ["agrabah", "scimitar", "scarab", "staff"];
const VALID_TYPES = new Set([...PROP_TYPES, "lamp"]);
const COLORS = {
  ink: "#f5f1e8",
  gold: "#f0d391",
  blue: "#314d68",
  teal: "#a3cec4",
  rust: "#d3a37f",
};

const canvas = document.querySelector("#board");
const context = canvas.getContext("2d");
const statusLine = document.querySelector("#game-status");
const roundValue = document.querySelector("#round-value");
const lampValue = document.querySelector("#lamp-value");
const lampPips = document.querySelector("#lamp-pips");
const scarabValue = document.querySelector("#scarab-value");
const roundOverlay = document.querySelector("#round-overlay");
const nextRoundButton = document.querySelector("#next-round");
const addScarabsButton = document.querySelector("#add-scarabs");
const startOverButton = document.querySelector("#start-over");

let game = createInitialGame();
let isTracing = false;
let tracePath = [];
let pointerId = null;
let currentStatus = "Drag from Aladdin, then trace adjacent matching props.";
let canvasWidth = 0;
let canvasHeight = 0;
let boardGeometry = null;

function createInitialGame() {
  const aladdin = Math.floor(Math.random() * BOARD_WIDTH);
  return {
    board: createBoard(aladdin),
    aladdin,
    lampsCollected: 0,
    completedRounds: 0,
    scarabs: STARTING_SCARABS,
    roundComplete: false,
  };
}

function createBoard(aladdinIndex) {
  const board = Array(BOARD_SIZE).fill(null);
  for (let index = 0; index < BOARD_SIZE; index++) {
    if (index !== aladdinIndex) board[index] = randomProp();
  }
  let lampCount = 0;
  let safety = 0;
  while (lampCount < BOARD_LAMPS && safety < 1000) {
    safety++;
    const candidates = [];
    for (let index = 0; index < BOARD_SIZE; index++) {
      if (index !== aladdinIndex && board[index] !== "lamp" && !hasAdjacentType(board, index, "lamp") && !areAdjacent(index, aladdinIndex)) {
        candidates.push(index);
      }
    }
    if (candidates.length === 0) break;
    board[candidates[Math.floor(Math.random() * candidates.length)]] = "lamp";
    lampCount++;
  }
  return board;
}

function randomProp() {
  return PROP_TYPES[Math.floor(Math.random() * PROP_TYPES.length)];
}

function adjacentIndices(index) {
  const row = Math.floor(index / BOARD_WIDTH);
  const column = index % BOARD_WIDTH;
  const result = [];
  if (row > 0) result.push(index - BOARD_WIDTH);
  if (row < BOARD_WIDTH - 1) result.push(index + BOARD_WIDTH);
  if (column > 0) result.push(index - 1);
  if (column < BOARD_WIDTH - 1) result.push(index + 1);
  return result;
}

function areAdjacent(first, second) {
  return adjacentIndices(first).includes(second);
}

function hasAdjacentType(board, index, type) {
  return adjacentIndices(index).some((neighbor) => board[neighbor] === type);
}

function isValidGameState(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.board) || value.board.length !== BOARD_SIZE) return false;
  if (!Number.isInteger(value.aladdin) || value.aladdin < 0 || value.aladdin >= BOARD_SIZE) return false;
  if (value.board[value.aladdin] !== null) return false;
  if (!Number.isInteger(value.lampsCollected) || value.lampsCollected < 0 || value.lampsCollected > REQUIRED_LAMPS) return false;
  if (!Number.isInteger(value.completedRounds) || value.completedRounds < 0 || value.completedRounds > 9999) return false;
  if (!Number.isInteger(value.scarabs) || value.scarabs < 0 || value.scarabs > 99999) return false;
  if (typeof value.roundComplete !== "boolean" || value.roundComplete !== (value.lampsCollected === REQUIRED_LAMPS)) return false;
  if (value.board.some((cell, index) => index !== value.aladdin && !VALID_TYPES.has(cell))) return false;
  const lampIndices = value.board.flatMap((cell, index) => cell === "lamp" ? [index] : []);
  if (lampIndices.length !== BOARD_LAMPS) return false;
  for (const lampIndex of lampIndices) {
    if (hasAdjacentType(value.board, lampIndex, "lamp")) return false;
  }
  return true;
}

function snapshotGame() {
  return {
    board: [...game.board],
    aladdin: game.aladdin,
    lampsCollected: game.lampsCollected,
    completedRounds: game.completedRounds,
    scarabs: game.scarabs,
    roundComplete: game.roundComplete,
  };
}

function persistGame() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotGame()));
  } catch {
    // The board remains playable when browser storage is blocked or full.
  }
}

function loadSavedGame() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (isValidGameState(saved)) {
      game = { ...saved, board: [...saved.board] };
      return true;
    }
  } catch {
    // Start from a clean board if saved data is missing or malformed.
  }
  return false;
}

function setStatus(message) {
  currentStatus = message;
  statusLine.textContent = message;
}

function updateHud() {
  roundValue.textContent = String(game.completedRounds + 1).padStart(2, "0");
  lampValue.textContent = String(game.lampsCollected);
  scarabValue.textContent = String(game.scarabs);
  lampPips.replaceChildren(...Array.from({ length: REQUIRED_LAMPS }, (_, index) => {
    const pip = document.createElement("i");
    if (index < game.lampsCollected) pip.className = "filled";
    return pip;
  }));
  roundOverlay.hidden = !game.roundComplete;
  canvas.setAttribute("aria-label", `Round ${game.completedRounds + 1}. ${game.lampsCollected} of 5 lamps collected, ${game.scarabs} scarabs. Drag from Aladdin through adjacent matching props or directly into an adjacent lamp.`);
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const targetWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
  const targetHeight = Math.max(1, Math.round(bounds.height * pixelRatio));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  canvasWidth = bounds.width;
  canvasHeight = bounds.height;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const side = Math.max(1, Math.min(canvasWidth, canvasHeight) - 24);
  const gap = side > 410 ? 7 : 5;
  const tileSize = (side - gap * (BOARD_WIDTH - 1)) / BOARD_WIDTH;
  const totalSize = tileSize * BOARD_WIDTH + gap * (BOARD_WIDTH - 1);
  boardGeometry = {
    left: (canvasWidth - totalSize) / 2,
    top: (canvasHeight - totalSize) / 2,
    tileSize,
    stride: tileSize + gap,
    totalSize,
  };
}

function drawFrame() {
  resizeCanvas();
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  drawBoard();
  drawRoute();
  requestAnimationFrame(drawFrame);
}

function drawBoard() {
  const { left, top, tileSize, stride } = boardGeometry;
  for (let index = 0; index < BOARD_SIZE; index++) {
    const row = Math.floor(index / BOARD_WIDTH);
    const column = index % BOARD_WIDTH;
    const x = left + column * stride;
    const y = top + row * stride;
    const type = game.board[index];
    drawTile(x, y, tileSize, type === "lamp", index === game.aladdin, (row + column) % 2 === 0);
    if (index === game.aladdin) drawAladdin(x, y, tileSize);
    else if (type) drawProp(type, x, y, tileSize);
  }
}

function drawTile(x, y, size, isLamp, isAladdin, alternate) {
  context.save();
  roundedRectPath(context, x, y, size, size, Math.max(7, size * 0.17));
  if (isLamp) {
    context.fillStyle = "#f2f0e8";
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.85)";
    context.lineWidth = 1;
    context.stroke();
  } else if (isAladdin) {
    const gradient = context.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, "#3f9f45");
    gradient.addColorStop(1, "#2f7838");
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = "rgba(190,245,174,.72)";
    context.lineWidth = 1;
    context.stroke();
  } else {
    const gradient = context.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, alternate ? "#365674" : "#2d4964");
    gradient.addColorStop(1, alternate ? "#2b455e" : "#243d56");
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = "rgba(198,220,231,.09)";
    context.lineWidth = 1;
    context.stroke();
  }
  context.restore();
}

function drawProp(type, x, y, size) {
  context.save();
  context.translate(x + size / 2, y + size / 2);
  const scale = size * 0.66 / 48;
  context.scale(scale, scale);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 2.8;
  const style = type === "lamp" ? "#9c7744" : type === "scarab" ? COLORS.teal : type === "staff" ? COLORS.rust : type === "scimitar" ? "#d7e3dc" : COLORS.gold;
  context.strokeStyle = style;
  context.fillStyle = style;
  switch (type) {
    case "agrabah": drawAgrabah(); break;
    case "scimitar": drawScimitar(); break;
    case "scarab": drawScarab(); break;
    case "staff": drawStaff(); break;
    case "lamp": drawLamp(); break;
  }
  context.restore();
}

function drawAgrabah() {
  context.beginPath();
  context.moveTo(-15, 15); context.lineTo(-15, -1); context.lineTo(-10, -1); context.lineTo(-10, -11);
  context.quadraticCurveTo(-10, -18, -5, -11); context.lineTo(-5, 15);
  context.moveTo(-19, 15); context.lineTo(18, 15); context.moveTo(0, 15); context.lineTo(0, -14);
  context.quadraticCurveTo(0, -24, 6, -14); context.lineTo(6, 15);
  context.moveTo(11, 15); context.lineTo(11, -4); context.lineTo(16, -4); context.lineTo(16, 15);
  context.stroke();
  context.beginPath(); context.arc(2, -19, 2, 0, Math.PI * 2); context.fill();
}

function drawScimitar() {
  context.beginPath();
  context.moveTo(-15, 15);
  context.quadraticCurveTo(5, 11, 16, -12);
  context.quadraticCurveTo(1, 2, -12, 5);
  context.quadraticCurveTo(3, 0, 20, -16);
  context.quadraticCurveTo(9, 13, -15, 15);
  context.closePath();
  context.fill();
  context.strokeStyle = "rgba(18,31,40,.72)";
  context.lineWidth = 1.4;
  context.beginPath(); context.moveTo(-14, 13); context.lineTo(-19, 19); context.stroke();
  context.strokeStyle = "#c98e64";
  context.lineWidth = 3.5;
  context.beginPath(); context.moveTo(-13, 14); context.lineTo(-18, 19); context.stroke();
}

function drawScarab() {
  context.beginPath(); context.ellipse(0, 2, 10, 13, 0, 0, Math.PI * 2); context.stroke();
  context.beginPath(); context.arc(0, -13, 5, 0, Math.PI * 2); context.stroke();
  context.beginPath(); context.moveTo(0, -7); context.lineTo(0, 14); context.moveTo(-8, -5); context.lineTo(-14, -9); context.moveTo(8, -5); context.lineTo(14, -9);
  for (const y of [-3, 3, 9]) {
    context.moveTo(-8, y); context.lineTo(-15, y + 3);
    context.moveTo(8, y); context.lineTo(15, y + 3);
  }
  context.stroke();
}

function drawStaff() {
  context.beginPath();
  context.moveTo(-8, 19); context.lineTo(7, -10);
  context.quadraticCurveTo(13, -22, 6, -21);
  context.quadraticCurveTo(-2, -20, 2, -13);
  context.stroke();
  context.beginPath(); context.arc(4, -17, 2.5, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.moveTo(-10, 18); context.lineTo(-5, 20); context.stroke();
}

function drawLamp() {
  context.beginPath();
  context.moveTo(-18, 3);
  context.quadraticCurveTo(-10, 5, -10, 11);
  context.quadraticCurveTo(-2, 17, 10, 11);
  context.quadraticCurveTo(14, 7, 17, 1);
  context.quadraticCurveTo(10, 5, 3, 2);
  context.quadraticCurveTo(-4, -1, -8, 1);
  context.stroke();
  context.beginPath(); context.moveTo(17, 1); context.quadraticCurveTo(23, -2, 19, -6); context.stroke();
  context.beginPath(); context.moveTo(-11, 4); context.quadraticCurveTo(-21, -2, -15, -8); context.stroke();
  context.beginPath(); context.moveTo(-4, -2); context.lineTo(-5, -6); context.lineTo(2, -6); context.lineTo(2, -2); context.stroke();
  context.beginPath(); context.moveTo(-9, 15); context.lineTo(9, 15); context.stroke();
}

function drawAladdin(x, y, size) {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  context.save();
  context.shadowColor = "rgba(0,0,0,.25)";
  context.shadowBlur = size * .11;
  context.fillStyle = "#1b2e40";
  context.beginPath(); context.arc(centerX, centerY, size * .4, 0, Math.PI * 2); context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "#f1d18e";
  context.lineWidth = Math.max(1.4, size * .035);
  context.stroke();
  context.fillStyle = "#bd8053";
  roundedRectPath(context, centerX - size * .2, centerY + size * .12, size * .4, size * .22, size * .08);
  context.fill();
  context.fillStyle = "#eac39a";
  context.beginPath(); context.ellipse(centerX, centerY - size * .055, size * .175, size * .2, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#24212a";
  context.beginPath(); context.arc(centerX, centerY - size * .14, size * .19, Math.PI, Math.PI * 2); context.quadraticCurveTo(centerX + size * .12, centerY - size * .17, centerX + size * .17, centerY - size * .04); context.lineTo(centerX + size * .08, centerY - size * .09); context.quadraticCurveTo(centerX, centerY - size * .02, centerX - size * .17, centerY - size * .035); context.fill();
  context.fillStyle = "#df8061";
  context.beginPath(); context.moveTo(centerX - size * .12, centerY - size * .22); context.lineTo(centerX + size * .12, centerY - size * .22); context.lineTo(centerX + size * .07, centerY - size * .34); context.lineTo(centerX - size * .07, centerY - size * .34); context.closePath(); context.fill();
  context.fillStyle = "#f3d49a";
  context.beginPath(); context.ellipse(centerX, centerY - size * .34, size * .09, size * .035, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#25232b";
  context.beginPath(); context.arc(centerX - size * .055, centerY - size * .04, Math.max(1, size * .014), 0, Math.PI * 2); context.arc(centerX + size * .055, centerY - size * .04, Math.max(1, size * .014), 0, Math.PI * 2); context.fill();
  context.restore();
}

function drawRoute() {
  if (tracePath.length === 0) return;
  const route = [game.aladdin, ...tracePath];
  const { left, top, stride, tileSize } = boardGeometry;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(244,217,153,.94)";
  context.lineWidth = Math.max(4, tileSize * .105);
  for (let index = 0; index < route.length - 1; index++) {
    const [fromX, fromY] = cellCenter(route[index], left, top, stride, tileSize);
    const [toX, toY] = cellCenter(route[index + 1], left, top, stride, tileSize);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    const endX = toX - dx / length * tileSize * .19;
    const endY = toY - dy / length * tileSize * .19;
    context.beginPath(); context.moveTo(fromX, fromY); context.lineTo(endX, endY); context.stroke();
    drawArrowHead(toX, toY, Math.atan2(dy, dx), tileSize * .17);
  }
  for (const index of tracePath) {
    const [centerX, centerY] = cellCenter(index, left, top, stride, tileSize);
    context.beginPath(); context.arc(centerX, centerY, tileSize * .13, 0, Math.PI * 2);
    context.fillStyle = "#fff4d1"; context.fill();
    context.strokeStyle = "rgba(39,49,59,.75)"; context.lineWidth = 1.3; context.stroke();
  }
  context.restore();
}

function drawArrowHead(x, y, angle, size) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(size * .28, 0);
  context.lineTo(-size * .65, -size * .56);
  context.lineTo(-size * .48, 0);
  context.lineTo(-size * .65, size * .56);
  context.closePath();
  context.fillStyle = "#f7dda0";
  context.fill();
  context.restore();
}

function cellCenter(index, left, top, stride, tileSize) {
  const row = Math.floor(index / BOARD_WIDTH);
  const column = index % BOARD_WIDTH;
  return [left + column * stride + tileSize / 2, top + row * stride + tileSize / 2];
}

function roundedRectPath(target, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  target.beginPath();
  target.moveTo(x + safeRadius, y);
  target.arcTo(x + width, y, x + width, y + height, safeRadius);
  target.arcTo(x + width, y + height, x, y + height, safeRadius);
  target.arcTo(x, y + height, x, y, safeRadius);
  target.arcTo(x, y, x + width, y, safeRadius);
  target.closePath();
}

function pointToCell(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const { left, top, stride, tileSize } = boardGeometry;
  const column = Math.floor((x - left) / stride);
  const row = Math.floor((y - top) / stride);
  if (row < 0 || row >= BOARD_WIDTH || column < 0 || column >= BOARD_WIDTH) return -1;
  const offsetX = x - (left + column * stride);
  const offsetY = y - (top + row * stride);
  if (offsetX > tileSize + 5 || offsetY > tileSize + 5) return -1;
  return row * BOARD_WIDTH + column;
}

function handlePointerDown(event) {
  if (game.roundComplete) return;
  const cellIndex = pointToCell(event);
  if (cellIndex !== game.aladdin) return;
  event.preventDefault();
  isTracing = true;
  pointerId = event.pointerId;
  tracePath = [];
  canvas.setPointerCapture(pointerId);
  setStatus("Route started · choose an adjacent prop or move directly to a lamp.");
}

function handlePointerMove(event) {
  if (!isTracing || event.pointerId !== pointerId) return;
  const cellIndex = pointToCell(event);
  if (cellIndex < 0 || tracePath.length === 0 && cellIndex === game.aladdin) return;
  const previousCell = tracePath.length === 0 ? game.aladdin : tracePath[tracePath.length - 1];
  if (cellIndex === previousCell) return;
  const backtrackIndex = tracePath.length < 2 ? game.aladdin : tracePath[tracePath.length - 2];
  if (cellIndex === backtrackIndex) {
    tracePath.pop();
    setStatus(tracePath.length ? `Route shortened · ${tracePath.length} tile${tracePath.length === 1 ? "" : "s"} selected.` : "Route cleared · keep tracing from Aladdin.");
    return;
  }
  if (!areAdjacent(previousCell, cellIndex) || tracePath.includes(cellIndex)) return;
  const type = game.board[cellIndex];
  if (!type) return;
  const firstProp = tracePath.map((index) => game.board[index]).find((item) => item !== "lamp");
  const hasLamp = tracePath.some((index) => game.board[index] === "lamp");
  if (type === "lamp") {
    const directMove = tracePath.length === 0;
    if (hasLamp || (!directMove && !firstProp)) return;
  } else if (type !== "lamp" && hasLamp) {
    return;
  } else if (firstProp && type !== firstProp) {
    setStatus("That prop doesn’t match · reverse one tile or continue the same kind.");
    return;
  }
  if (tracePath.some((index) => game.board[index] === "lamp")) return;
  tracePath.push(cellIndex);
  const cost = tracePath.length;
  setStatus(`${type === "lamp" ? "Lamp reached" : "Matched route"} · ${cost} scarab${cost === 1 ? "" : "s"} on release.`);
}

function handlePointerUp(event) {
  if (!isTracing || event.pointerId !== pointerId) return;
  finishTrace();
}

function finishTrace() {
  if (!isTracing) return;
  isTracing = false;
  pointerId = null;
  if (tracePath.length === 0) {
    setStatus("No route selected · nothing spent.");
    return;
  }
  const submittedPath = [...tracePath];
  tracePath = [];
  const cost = submittedPath.length;
  if (cost > game.scarabs) {
    setStatus("Not enough scarabs for that route · add test scarabs or choose a shorter path.");
    return;
  }
  const reachesLamp = game.board[submittedPath[submittedPath.length - 1]] === "lamp";
  game.scarabs -= cost;
  resolveMove(submittedPath, reachesLamp);
  if (reachesLamp) {
    game.lampsCollected = Math.min(REQUIRED_LAMPS, game.lampsCollected + 1);
    setStatus(game.lampsCollected === REQUIRED_LAMPS ? "Five lamps collected · round complete." : `Lamp collected · ${REQUIRED_LAMPS - game.lampsCollected} more to complete the round.`);
  } else {
    setStatus(`Route cleared · ${cost} scarab${cost === 1 ? "" : "s"} spent. Find a lamp next.`);
  }
  if (game.lampsCollected === REQUIRED_LAMPS) game.roundComplete = true;
  updateHud();
  persistGame();
}

function resolveMove(path, reachesLamp) {
  const endpoint = path[path.length - 1];
  for (const index of path) game.board[index] = null;
  game.board[game.aladdin] = null;
  game.aladdin = endpoint;
  game.board[game.aladdin] = null;
  if (reachesLamp) game.board[endpoint] = null;
  applyGravityAndRefill();
  normalizeLamps();
}

function applyGravityAndRefill() {
  for (let column = 0; column < BOARD_WIDTH; column++) {
    const stack = [];
    for (let row = BOARD_WIDTH - 1; row >= 0; row--) {
      const index = row * BOARD_WIDTH + column;
      if (index === game.aladdin) continue;
      if (game.board[index] !== null) stack.push(game.board[index]);
      game.board[index] = null;
    }
    let stackIndex = 0;
    for (let row = BOARD_WIDTH - 1; row >= 0; row--) {
      const index = row * BOARD_WIDTH + column;
      if (index === game.aladdin) continue;
      game.board[index] = stackIndex < stack.length ? stack[stackIndex++] : randomProp();
    }
  }
}

function normalizeLamps() {
  const lampIndices = game.board.flatMap((cell, index) => cell === "lamp" ? [index] : []);
  const kept = [];
  for (const index of lampIndices) {
    const conflictsWithLamp = kept.some((other) => areAdjacent(index, other));
    const conflictsWithAladdin = areAdjacent(index, game.aladdin);
    if (!conflictsWithLamp && !conflictsWithAladdin) {
      kept.push(index);
      continue;
    }
    const newSpot = findLampSpot(kept);
    if (newSpot >= 0) {
      game.board[index] = randomProp();
      game.board[newSpot] = "lamp";
      kept.push(newSpot);
    } else {
      kept.push(index);
    }
  }
  while (game.board.filter((cell) => cell === "lamp").length < BOARD_LAMPS) {
    const newSpot = findLampSpot(kept);
    if (newSpot < 0) break;
    game.board[newSpot] = "lamp";
    kept.push(newSpot);
  }
}

function findLampSpot(existingLamps) {
  const candidates = [];
  for (let index = 0; index < BOARD_SIZE; index++) {
    if (index === game.aladdin || game.board[index] === "lamp" || areAdjacent(index, game.aladdin)) continue;
    if (existingLamps.some((lampIndex) => areAdjacent(index, lampIndex))) continue;
    candidates.push(index);
  }
  if (candidates.length === 0) return -1;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function startNextRound() {
  if (!game.roundComplete) return;
  game.completedRounds += 1;
  game.lampsCollected = 0;
  game.roundComplete = false;
  game.aladdin = Math.floor(Math.random() * BOARD_WIDTH);
  game.board = createBoard(game.aladdin);
  tracePath = [];
  updateHud();
  setStatus(`Round ${String(game.completedRounds + 1).padStart(2, "0")} · new board, same scarab balance.`);
  persistGame();
}

function startOver() {
  game = createInitialGame();
  tracePath = [];
  isTracing = false;
  updateHud();
  setStatus("Fresh run started · round 01, five lamps to collect.");
  persistGame();
}

function addTestScarabs() {
  game.scarabs = Math.min(99999, game.scarabs + 10);
  updateHud();
  setStatus("10 playtest scarabs added.");
  persistGame();
}

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", () => {
  if (isTracing) {
    isTracing = false;
    pointerId = null;
    tracePath = [];
    setStatus("Route canceled · nothing spent.");
  }
});
canvas.addEventListener("lostpointercapture", () => {
  if (isTracing) finishTrace();
});
nextRoundButton.addEventListener("click", startNextRound);
addScarabsButton.addEventListener("click", addTestScarabs);
startOverButton.addEventListener("click", startOver);
window.addEventListener("resize", resizeCanvas);

if (!loadSavedGame()) persistGame();
updateHud();
statusLine.textContent = currentStatus;

if (window.Bezi && typeof window.Bezi === "object") {
  try {
    window.Bezi.onDataRequest = () => ({ gameState: snapshotGame() });
    window.Bezi.setData = (data) => {
      const importedState = data && typeof data === "object" ? data.gameState : null;
      if (!isValidGameState(importedState)) return;
      game = { ...importedState, board: [...importedState.board] };
      tracePath = [];
      isTracing = false;
      updateHud();
      setStatus("Game state restored from the Proof host.");
      persistGame();
    };
  } catch {
    // The game works normally when the optional host bridge is unavailable.
  }
}

requestAnimationFrame(drawFrame);
