// ===== CONFIGURAÇÃO DO CANVAS =====

// Pega o elemento canvas do HTML pelo seu id
const canvas = document.getElementById('c');

// Pede ao canvas um "contexto 2D" — é o objeto que usamos para desenhar
const ctx = canvas.getContext('2d');

// Tamanho de cada célula em pixels
const CELL = 20;

// Quantidade de colunas e linhas da grade
const COLS = 20;
const ROWS = 20;
// ===== CONFIGURAÇÕES DAS FASES =====

// Cada fase tem: velocidade inicial, velocidade máxima, obstáculos e cor da cobra
const PHASES = [
  { speedStart: 220, speedEnd: 120, obstacles: 3,  color: '#7F77DD' }, // Fase 1 — roxo
  { speedStart: 200, speedEnd: 85,  obstacles: 7,  color: '#1D9E75' }, // Fase 2 — verde
  { speedStart: 180, speedEnd: 60,  obstacles: 12, color: '#D85A30' }, // Fase 3 — laranja
];

// Pontuação necessária para passar de fase
const SCORE_NEXT_PHASE = 50;

// A cada quantos milissegundos a velocidade aumenta
const SPEED_TICK_INTERVAL = 3000;

// Quanto a velocidade aumenta a cada tick (menor número = mais rápido)
const SPEED_STEP = 10;
// ===== VARIÁVEIS DO JOGO =====

let snake;          // Array com as células que formam a cobra
let dir;            // Direção atual do movimento { x, y }
let nextDir;        // Próxima direção (evita virar 180° instantaneamente)
let food;           // Posição da fruta vermelha { x, y }
let goldenFood;     // Posição da fruta dourada { x, y } ou null
let obstacles;      // Array com as posições dos obstáculos

let phase;          // Fase atual (0, 1 ou 2)
let score;          // Pontuação atual
let best;           // Recorde salvo
let loop;           // Referência ao setInterval do jogo
let speedLoop;      // Referência ao setInterval de aceleração
let running;        // true se o jogo está rodando
let currentSpeed;   // Velocidade atual em ms

let hasShield;      // true se a cobra tem escudo ativo
let shieldUsed;     // true se o escudo já foi usado nessa fase
let fruitsEaten;    // Quantas frutas foram comidas na fase atual
let goldenActive;   // true se a fruta dourada está visível
let waitingForStart;// true se está esperando o jogador apertar uma seta
let overlayAction;  // Função que é chamada ao clicar/espaço no overlay

// Carrega o recorde salvo no localStorage (ou 0 se não existir)
best = parseInt(localStorage.getItem('snake_best') || '0');
document.getElementById('best').textContent = best;

// Zoom
let zoomLevel = 1;      // Fator atual (1 = 100%)
const ZOOM_STEP = 0.25; // Cada clique aumenta/diminui 25%
const ZOOM_MIN = 0.5;   // Limite mínimo (50%)
const ZOOM_MAX = 3;     // Limite máximo (300%)

// ===== FUNÇÃO DE DESENHO =====

function draw() {
  const ph = PHASES[phase]; // Pega as configs da fase atual

  // --- Fundo ---
  ctx.fillStyle = '#0f0f0f';
  ctx.fillRect(0, 0, 400, 400); // Preenche o canvas inteiro de preto

  // --- Grade xadrez (células alternadas levemente mais claras) ---
  ctx.fillStyle = '#1a1a1a';
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if ((x + y) % 2 === 0) {
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }

  // --- Obstáculos ---
  obstacles.forEach(o => {
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(o.x * CELL + 2, o.y * CELL + 2, CELL - 4, CELL - 4, 3);
    ctx.fill();
    ctx.stroke();
  });

  // --- Fruta vermelha (círculo) ---
  ctx.fillStyle = '#E24B4A';
  ctx.beginPath();
  ctx.arc(
    food.x * CELL + CELL / 2, // Centro X
    food.y * CELL + CELL / 2, // Centro Y
    CELL / 2 - 3,             // Raio
    0, Math.PI * 2            // Ângulo completo (círculo)
  );
  ctx.fill();

  // --- Fruta dourada (se estiver ativa) ---
  if (goldenActive && goldenFood) {
    const gx = goldenFood.x * CELL + CELL / 2;
    const gy = goldenFood.y * CELL + CELL / 2;

    // Círculo dourado
    ctx.fillStyle = '#FAC775';
    ctx.beginPath();
    ctx.arc(gx, gy, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Borda laranja
    ctx.strokeStyle = '#EF9F27';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Estrela no centro
    ctx.fillStyle = '#633806';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', gx, gy + 1);
  }

  // --- Cobra ---
  snake.forEach((seg, i) => {
    // Cabeça: branca normal, ou dourada se tiver escudo ativo
    if (i === 0) {
      ctx.fillStyle = (hasShield && !shieldUsed) ? '#FAC775' : '#ffffff';
    } else {
      ctx.fillStyle = ph.color; // Corpo usa a cor da fase
    }

    ctx.beginPath();
    ctx.roundRect(
      seg.x * CELL + 1,
      seg.y * CELL + 1,
      CELL - 2,
      CELL - 2,
      i === 0 ? 5 : 3 // Cabeça tem cantos mais arredondados
    );
    ctx.fill();
  });
}
// ===== FUNÇÕES AUXILIARES =====

// Retorna um número inteiro aleatório entre 0 e max-1
function rand(max) {
  return Math.floor(Math.random() * max);
}

// Retorna uma célula livre da grade (que não esteja na lista "excluded")
function freeCell(excluded) {
  let pos;
  let tries = 0;
  do {
    pos = { x: rand(COLS), y: rand(ROWS) };
    tries++;
  } while (tries < 200 && excluded.some(e => e.x === pos.x && e.y === pos.y));
  return pos;
}
// ===== INICIALIZAÇÃO DE FASE =====

function initPhase(p) {
  phase = p;
  currentSpeed = PHASES[p].speedStart;

  // Reseta todos os estados da fase
  hasShield = false;
  shieldUsed = false;
  goldenFood = null;
  goldenActive = false;
  fruitsEaten = 0;

  // Atualiza o HUD
  document.getElementById('phase-num').textContent = p + 1;
  document.getElementById('shield-val').textContent = '—';
  document.getElementById('shield-val').style.color = '';

  // Atualiza as bolinhas de fase
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById('dot-' + (i + 1));
    dot.className = 'phase-dot' + (i <= p ? ' active' : '');
  }

  // Cria a cobra no centro do mapa, apontando para a direita
  snake = [
    { x: 10, y: 10 },
    { x: 9,  y: 10 },
    { x: 8,  y: 10 }
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };

  // Gera os obstáculos em posições livres
  obstacles = [];
  for (let i = 0; i < PHASES[p].obstacles; i++) {
    obstacles.push(freeCell([...snake, ...obstacles]));
  }

  // Gera a primeira fruta em posição livre
  food = freeCell([...snake, ...obstacles]);

  // Reseta a pontuação
  score = 0;
  document.getElementById('score').textContent = 0;
}
// ===== HUD DO ESCUDO =====

function updateShieldHUD() {
  const el = document.getElementById('shield-val');
  if (hasShield && !shieldUsed) {
    el.textContent = 'Ativo';
    el.style.color = '#FAC775'; // Dourado
  } else if (shieldUsed) {
    el.textContent = 'Usado';
    el.style.color = 'var(--color-text-secondary)';
  } else {
    el.textContent = '—';
    el.style.color = '';
  }
}
// ===== FRUTA DOURADA =====

function trySpawnGolden() {
  // Não aparece se já está ativa ou se o jogador já tem escudo
  if (goldenActive || hasShield) return;

  // 20% de chance de aparecer
  if (Math.random() < 0.20) {
    goldenFood = freeCell([...snake, ...obstacles, food]);
    goldenActive = true;
  }
}
// ===== FRUTA DOURADA =====

function trySpawnGolden() {
  // Não aparece se já está ativa ou se o jogador já tem escudo
  if (goldenActive || hasShield) return;

  // 20% de chance de aparecer
  if (Math.random() < 0.20) {
    goldenFood = freeCell([...snake, ...obstacles, food]);
    goldenActive = true;
  }
}
// ===== ACELERAÇÃO =====

function accelerate() {
  const minSpeed = PHASES[phase].speedEnd;

  if (currentSpeed > minSpeed) {
    // Diminui o intervalo (aumenta a velocidade), respeitando o limite
    currentSpeed = Math.max(minSpeed, currentSpeed - SPEED_STEP);

    // Reinicia o loop com a nova velocidade
    clearInterval(loop);
    loop = setInterval(tick, currentSpeed);
  }
}
// ===== TICK (atualização do jogo) =====

function tick() {
  // Aplica a direção escolhida pelo jogador
  dir = nextDir;

  // Calcula a posição da nova cabeça
  const head = {
    x: snake[0].x + dir.x,
    y: snake[0].y + dir.y
  };

  // --- Verifica colisões ---
  const hitWall     = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
  const hitSelf     = snake.some(s => s.x === head.x && s.y === head.y);
  const hitObstacle = obstacles.some(o => o.x === head.x && o.y === head.y);

  if (hitWall || hitSelf || hitObstacle) {
    if (hasShield && !shieldUsed) {
      shieldUsed = true;
      hasShield = false;
      flashShield();
      updateShieldHUD();

      if (hitObstacle) {
        // Destrói o obstáculo
        obstacles = obstacles.filter(o => !(o.x === head.x && o.y === head.y));
        // Move a cobra para cima do obstáculo destruído
        snake.unshift(head);
        snake.pop();

      } else if (hitWall) {
        // Na parede: apenas para a cobra, não move para fora
        // Reverte a direção para evitar bater de novo imediatamente
        dir = { x: -dir.x, y: -dir.y };
        nextDir = { x: -dir.x, y: -dir.y };
        // Não move a cobra — ela fica no lugar

      } else if (hitSelf) {
        // Bateu em si mesma: também fica no lugar
      }

      draw();
      return;
    }

    gameOver();
    return;
}
  // --- Move a cobra: adiciona nova cabeça na frente ---
  snake.unshift(head);

  // --- Verifica se comeu a fruta vermelha ---
  if (head.x === food.x && head.y === food.y) {
    // Aumenta pontuação
    score += 10;
    document.getElementById('score').textContent = score;

    // Atualiza recorde se necessário
    if (score > best) {
      best = score;
      localStorage.setItem('snake_best', best);
      document.getElementById('best').textContent = best;
    }

    fruitsEaten++;

    // Gera nova fruta (sem remover o rabo — cobra cresce!)
    food = freeCell([...snake, ...obstacles, ...(goldenFood ? [goldenFood] : [])]);

    // Tenta spawnar fruta dourada após a primeira fruta
    if (fruitsEaten === 1) trySpawnGolden();

    // Verifica se deve passar de fase
    if (score >= SCORE_NEXT_PHASE && phase < 2) {
      draw();
      clearInterval(loop);
      clearInterval(speedLoop);
      running = false;
      showOverlay(
        'Fase ' + (phase + 2) + ' desbloqueada!',
        'Velocidade aumentando... Cuidado!',
        'Próxima fase'
      );
      overlayAction = () => { hideOverlay(); startGame(phase + 1); };
      return;
    }

  // --- Verifica se comeu a fruta dourada ---
  } else if (goldenActive && goldenFood && head.x === goldenFood.x && head.y === goldenFood.y) {
    hasShield = true;
    goldenActive = false;
    goldenFood = null;
    updateShieldHUD();
    snake.pop(); // Remove o rabo (fruta dourada não faz crescer)

  // --- Não comeu nada: remove o rabo (cobra anda) ---
  } else {
    snake.pop();
  }

  draw();
}
// ===== GAME OVER =====

function gameOver() {
  clearInterval(loop);
  clearInterval(speedLoop);
  running = false;
  draw();
  showOverlay('Game Over', 'Pontuação final: ' + score, 'Jogar de novo');
  overlayAction = () => { hideOverlay(); startGame(0); };
}
// ===== OVERLAY =====

function showOverlay(title, sub, btn) {
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-sub').textContent = sub;
  document.getElementById('btn-start').textContent = btn;
  document.getElementById('overlay').style.display = 'flex';
}

function hideOverlay() {
  document.getElementById('overlay').style.display = 'none';
}
// ===== INICIAR JOGO =====

function startGame(p) {
  if (running) return;

  initPhase(p);
  draw();

  // Fica esperando o jogador apertar uma seta antes de começar a mover
  waitingForStart = true;
  running = false;
  overlayAction = null;

  document.getElementById('waiting-hint').style.display = 'block';
}

function beginMoving() {
  if (!waitingForStart) return;
  waitingForStart = false;
  document.getElementById('waiting-hint').style.display = 'none';
  running = true;
  loop = setInterval(tick, currentSpeed);
  speedLoop = setInterval(accelerate, SPEED_TICK_INTERVAL);
}
// ===== CONTROLES =====

const DIR_MAP = {
  ArrowUp:    { x: 0,  y: -1 },
  ArrowDown:  { x: 0,  y:  1 },
  ArrowLeft:  { x: -1, y:  0 },
  ArrowRight: { x: 1,  y:  0 }
};

document.addEventListener('keydown', e => {
  // Espaço: confirma o overlay (passa de fase, reinicia, etc.)
  if (e.key === ' ') {
    e.preventDefault();
    if (overlayAction) overlayAction();
    return;
  }

  const d = DIR_MAP[e.key];
  if (!d) return;
  e.preventDefault();

  // Se está esperando começar: a primeira seta define a direção e inicia
  if (waitingForStart) {
    nextDir = d;
    dir = d;
    beginMoving();
    return;
  }

  if (!running) return;

  // Impede de virar 180° (a cobra não pode ir direto para trás)
  if (d.x === -dir.x && d.y === -dir.y) return;

  nextDir = d;
});

// Botão do overlay também funciona com clique
document.getElementById('btn-start').onclick = () => {
  if (overlayAction) {
    overlayAction();
    return;
  }
  hideOverlay();
  startGame(0);
};

// ===== ZOOM =====

function applyZoom(newZoom) {
  // Garante que o zoom não ultrapasse os limites
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));

  // Arredonda para evitar valores como 0.9999...
  zoomLevel = Math.round(zoomLevel * 100) / 100;

  // Aplica o tamanho no canvas via CSS (não altera a resolução interna)
  const size = Math.round(400 * zoomLevel);
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';

  // Atualiza o label
  document.getElementById('zoom-label').textContent =
    Math.round(zoomLevel * 100) + '%';
}

// ===== BOTÕES DE ZOOM =====
document.getElementById('btn-zoom-in').addEventListener('click', () => {
  applyZoom(zoomLevel + ZOOM_STEP);
});

document.getElementById('btn-zoom-out').addEventListener('click', () => {
  applyZoom(zoomLevel - ZOOM_STEP);
});

document.getElementById('btn-zoom-reset').addEventListener('click', () => {
  applyZoom(1);
});

// ===== INÍCIO =====
overlayAction = null;
