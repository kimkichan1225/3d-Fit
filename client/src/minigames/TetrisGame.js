import { useEffect, useReducer, useRef, useCallback, useState } from 'react';
import { getSocket } from '../net/socket';

// ── 테트리스 상수 ──
const COLS = 10;
const ROWS = 20;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const COLORS = {
  I: '#22d3ee', O: '#eab308', T: '#a855f7',
  S: '#22c55e', Z: '#ef4444', J: '#3b82f6', L: '#f97316',
  garbage: '#6b7280',
};
const TYPES = Object.keys(SHAPES);

const LINE_SCORES = [0, 100, 300, 500, 800];

// ── 대결 공격 게이지 시스템 ──
const GAUGE_MAX = 100; // 이 값에 도달하면 발사
const GAUGE_TABLE = [0, 15, 35, 60, 100]; // 동시 클리어 줄 수 → 게이지 적립(①)
const GARBAGE_BONUS = 5; // 방해 줄 1줄 정리당 추가 게이지(②)
const COMBO_BONUS = 5; // 콤보 단계당 추가 게이지(③)
const ATTACK_LINES = 4; // 게이지 발사 시 상대에게 보낼 방해 줄 수(④)

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
const randomType = () => TYPES[Math.floor(Math.random() * TYPES.length)];

const rotateCW = (m) => {
  const n = m.length;
  const w = m[0].length;
  const r = Array.from({ length: w }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < w; j++) r[j][n - 1 - i] = m[i][j];
  }
  return r;
};

const canPlace = (board, shape, row, col) => {
  for (let i = 0; i < shape.length; i++) {
    for (let j = 0; j < shape[i].length; j++) {
      if (!shape[i][j]) continue;
      const r = row + i;
      const c = col + j;
      if (c < 0 || c >= COLS || r >= ROWS) return false;
      if (r >= 0 && board[r][c]) return false;
    }
  }
  return true;
};

const dropInterval = (level) => Math.max(100, 800 - (level - 1) * 70);

// ── 게임 보드 (싱글/대결 공용 엔진) ──
function TetrisBoard({ mode, matchId, opponentName, onBack }) {
  const isVersus = mode === 'versus';
  const [, force] = useReducer((x) => x + 1, 0);
  const g = useRef(null);
  const [opponentBoard, setOpponentBoard] = useState(null);
  const [flash, setFlash] = useState(false); // 공격 받을 때 보드 플래시
  const [gaugePulse, setGaugePulse] = useState(false); // 게이지 차오를 때 번쩍
  const [particles, setParticles] = useState([]); // 줄→게이지 입자 연출
  const countdownTimerRef = useRef(null);
  const boardRef = useRef(null); // 파티클 출발 좌표 측정용
  const gaugeRef = useRef(null); // 파티클 도착(게이지 바) 좌표 측정용

  const removeParticle = useCallback((id) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // 시작 카운트다운 타이머 (reset 때마다 재시작)
  const startCountdown = useCallback(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      if (!g.current) return;
      if (g.current.countdown > 0) {
        g.current.countdown -= 1;
        force();
      } else {
        clearInterval(countdownTimerRef.current);
      }
    }, 1000);
  }, []);

  const reset = useCallback(() => {
    const t = randomType();
    g.current = {
      board: emptyBoard(),
      piece: { type: t, shape: SHAPES[t], row: 0, col: Math.floor((COLS - SHAPES[t][0].length) / 2) },
      next: randomType(),
      score: 0,
      lines: 0,
      level: 1,
      combo: 0,
      gauge: 0, // 대결 공격 게이지 (0~100)
      pendingGarbage: 0, // 받은 공격 줄 (다음 고정 때 정산)
      countdown: 3, // 시작 카운트다운
      over: false,
      paused: false,
    };
    force();
    startCountdown();
  }, [startCountdown]);

  // 언마운트 시 카운트다운 타이머 정리
  useEffect(() => () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }, []);

  // 보드 하단에 가비지(방해) 줄 n개 추가
  const addGarbage = useCallback((n) => {
    const board = g.current.board;
    for (let k = 0; k < n; k++) {
      const hole = Math.floor(Math.random() * COLS);
      board.shift();
      const row = Array(COLS).fill('garbage');
      row[hole] = null;
      board.push(row);
    }
  }, []);

  const lockPiece = useCallback(() => {
    const s = g.current;
    const { board, piece } = s;
    piece.shape.forEach((rowArr, i) => {
      rowArr.forEach((v, j) => {
        if (!v) return;
        const r = piece.row + i;
        const c = piece.col + j;
        if (r >= 0) board[r][c] = piece.type;
      });
    });

    // 꽉 찬 줄 찾기 (원래 위치 기록 → 클리어 연출용)
    const fullRows = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r].every((cell) => cell)) fullRows.push(r);
    }
    const cleared = fullRows.length;
    const garbageCleared = fullRows.filter((r) => board[r].some((c) => c === 'garbage')).length;
    // 즉시 제거: 큰 인덱스부터 splice로 다 제거한 뒤, 제거한 만큼 위에 빈 줄 추가
    // (제거 중간에 unshift하면 인덱스가 밀려 다음 splice가 엉뚱한 줄을 지운다)
    for (let i = fullRows.length - 1; i >= 0; i--) {
      board.splice(fullRows[i], 1);
    }
    for (let i = 0; i < cleared; i++) {
      board.unshift(Array(COLS).fill(null));
    }
    if (cleared > 0) {
      s.lines += cleared;
      s.score += LINE_SCORES[cleared] * s.level;
      s.level = Math.floor(s.lines / 10) + 1;
      s.combo += 1;
    } else {
      s.combo = 0;
    }

    if (isVersus) {
      const sock = getSocket();
      if (cleared > 0) {
        // 게이지 적립: ① 동시 클리어 + ② 방해 줄 정리 + ③ 콤보
        let gain = GAUGE_TABLE[cleared] || 0;
        gain += garbageCleared * GARBAGE_BONUS;
        gain += Math.max(0, s.combo - 1) * COMBO_BONUS;
        s.gauge += gain;
        if (gain > 0) {
          // 지워진 줄 위치 → 게이지 바로 입자가 날아가는 연출
          const boardEl = boardRef.current;
          const gaugeEl = gaugeRef.current;
          if (boardEl && gaugeEl) {
            const br = boardEl.getBoundingClientRect();
            const gr = gaugeEl.getBoundingClientRect();
            const ex = gr.left + gr.width / 2;
            const ey = gr.top + gr.height / 2;
            const parts = [];
            fullRows.forEach((r) => {
              const cy = br.top + (br.height * (r + 0.5)) / ROWS;
              for (let k = 0; k < 5; k++) {
                parts.push({
                  id: `p${Date.now()}-${r}-${k}-${Math.random().toString(36).slice(2, 6)}`,
                  sx: br.left + (br.width * (k + 0.5)) / 5,
                  sy: cy,
                  ex,
                  ey,
                });
              }
            });
            setParticles((prev) => [...prev, ...parts]);
          }
          // 입자가 도착할 즈음 게이지 바를 번쩍이게
          setTimeout(() => {
            setGaugePulse(true);
            setTimeout(() => setGaugePulse(false), 350);
          }, 420);
        }
        // ④ 게이지가 가득 차면 발사 (초과분 이월)
        while (s.gauge >= GAUGE_MAX) {
          s.gauge -= GAUGE_MAX;
          sock.emit('tetris:attack', { matchId, lines: ATTACK_LINES });
        }
      }
      // 상쇄 없음: 받은 방해 줄은 줄 지움 여부와 무관하게 쌓인다
      if (s.pendingGarbage > 0) {
        addGarbage(s.pendingGarbage);
        s.pendingGarbage = 0;
      }
    }

    // 다음 조각 스폰
    const type = s.next;
    const shape = SHAPES[type];
    const col = Math.floor((COLS - shape[0].length) / 2);
    if (!canPlace(board, shape, 0, col)) {
      s.over = true;
      if (isVersus) getSocket().emit('tetris:over', { matchId });
      else getSocket().emit('tetris:score', { score: s.score });
    } else {
      s.piece = { type, shape, row: 0, col };
      s.next = randomType();
    }

    if (isVersus) getSocket().emit('tetris:board', { matchId, board: s.board });
  }, [isVersus, matchId, addGarbage]);

  const step = useCallback(() => {
    const s = g.current;
    if (!s || s.over || s.paused || s.countdown > 0) return;
    const { board, piece } = s;
    if (canPlace(board, piece.shape, piece.row + 1, piece.col)) {
      piece.row += 1;
    } else {
      lockPiece();
    }
    force();
  }, [lockPiece]);

  const move = useCallback((dx) => {
    const s = g.current;
    if (!s || s.over || s.paused || s.countdown > 0) return;
    const { board, piece } = s;
    if (canPlace(board, piece.shape, piece.row, piece.col + dx)) {
      piece.col += dx;
      force();
    }
  }, []);

  const rotate = useCallback(() => {
    const s = g.current;
    if (!s || s.over || s.paused || s.countdown > 0) return;
    const { board, piece } = s;
    const rotated = rotateCW(piece.shape);
    for (const dx of [0, -1, 1, -2, 2]) {
      if (canPlace(board, rotated, piece.row, piece.col + dx)) {
        piece.shape = rotated;
        piece.col += dx;
        force();
        return;
      }
    }
  }, []);

  const hardDrop = useCallback(() => {
    const s = g.current;
    if (!s || s.over || s.paused || s.countdown > 0) return;
    const { board, piece } = s;
    while (canPlace(board, piece.shape, piece.row + 1, piece.col)) piece.row += 1;
    lockPiece();
    force();
  }, [lockPiece]);

  useEffect(() => {
    reset();
  }, [reset]);

  // 자동 낙하 타이머
  useEffect(() => {
    let timer;
    const tick = () => {
      step();
      const lvl = g.current ? g.current.level : 1;
      timer = setTimeout(tick, dropInterval(lvl));
    };
    timer = setTimeout(tick, dropInterval(1));
    return () => clearTimeout(timer);
  }, [step]);

  // 대결: 상대 보드 / 공격 수신
  useEffect(() => {
    if (!isVersus) return;
    const sock = getSocket();
    const onBoard = (data) => setOpponentBoard(data.board);
    const onAttack = (data) => {
      if (g.current) g.current.pendingGarbage += data.lines;
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
    };
    sock.on('tetris:board', onBoard);
    sock.on('tetris:attack', onAttack);
    return () => {
      sock.off('tetris:board', onBoard);
      sock.off('tetris:attack', onAttack);
    };
  }, [isVersus]);

  // 키 입력
  useEffect(() => {
    const onKey = (e) => {
      const s = g.current;
      if (!s) return;
      const k = e.key;
      if (k === 'Escape') {
        if (!isVersus && onBack) onBack(); // 대결 중엔 Esc 무시
        return;
      }
      if (s.over) return;
      if (k === 'p' || k === 'P') {
        if (!isVersus) { s.paused = !s.paused; force(); } // 대결은 일시정지 불가
        return;
      }
      if (s.paused || s.countdown > 0) return;
      switch (k) {
        case 'ArrowLeft': e.preventDefault(); move(-1); break;
        case 'ArrowRight': e.preventDefault(); move(1); break;
        case 'ArrowDown': e.preventDefault(); step(); break;
        case 'ArrowUp': case 'x': case 'X': e.preventDefault(); rotate(); break;
        case ' ': e.preventDefault(); hardDrop(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, rotate, step, hardDrop, onBack, isVersus]);

  const s = g.current;
  if (!s) return null;

  const display = s.board.map((row) => row.slice());
  if (!s.over && s.piece) {
    s.piece.shape.forEach((rowArr, i) => {
      rowArr.forEach((v, j) => {
        if (!v) return;
        const r = s.piece.row + i;
        const c = s.piece.col + j;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) display[r][c] = s.piece.type;
      });
    });
  }

  const nextShape = SHAPES[s.next];

  return (
    <div style={wrap}>
      {particles.map((p) => (
        <Particle key={p.id} sx={p.sx} sy={p.sy} ex={p.ex} ey={p.ey} onDone={() => removeParticle(p.id)} />
      ))}
      <div ref={boardRef} style={{ ...boardStyle(CELL), ...(flash ? boardFlash : null) }}>
        {display.map((row, i) =>
          row.map((cell, j) => (
            <div
              key={`${i}-${j}`}
              style={{
                width: CELL, height: CELL,
                background: cell ? COLORS[cell] : 'rgba(255,255,255,0.04)',
                border: cell ? '1px solid rgba(0,0,0,0.25)' : '1px solid rgba(255,255,255,0.03)',
                boxSizing: 'border-box',
              }}
            />
          ))
        )}

        {s.countdown > 0 && (
          <div style={boardOverlay}>
            <div style={{ fontSize: 72, fontWeight: 800 }}>{s.countdown}</div>
          </div>
        )}

        {(s.over || s.paused) && (
          <div style={boardOverlay}>
            {s.over ? (
              isVersus ? (
                <div style={{ fontSize: 20, fontWeight: 700 }}>판정 중…</div>
              ) : (
                <>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>게임 오버</div>
                  <div style={{ opacity: 0.8, margin: '6px 0 14px' }}>점수 {s.score}</div>
                  <Button onClick={reset}>다시 하기</Button>
                  <Button variant="ghost" onClick={onBack}>메뉴 (Esc)</Button>
                </>
              )
            ) : (
              <div style={{ fontSize: 20, fontWeight: 700 }}>일시정지 (P)</div>
            )}
          </div>
        )}
      </div>

      <div style={side}>
        <div style={panel}>
          <div style={labelStyle}>점수</div>
          <div style={value}>{s.score}</div>
        </div>
        <div style={panel}>
          <div style={labelStyle}>줄 / 레벨</div>
          <div style={value}>{s.lines} / {s.level}</div>
        </div>
        <div style={panel}>
          <div style={labelStyle}>다음</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
            {nextShape.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 2 }}>
                {row.map((v, j) => (
                  <div key={j} style={{ width: 14, height: 14, background: v ? COLORS[s.next] : 'transparent' }} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {isVersus && (
          <div style={panel}>
            <div style={labelStyle}>공격 게이지</div>
            <div ref={gaugeRef} style={gaugeOuter}>
              <div
                style={{
                  ...gaugeInner,
                  width: `${Math.min(100, s.gauge)}%`,
                  background: s.gauge >= 80 ? '#ef4444' : s.gauge >= 50 ? '#eab308' : '#5b8def',
                  ...(gaugePulse ? { boxShadow: '0 0 14px 3px rgba(255,255,255,0.85)', filter: 'brightness(1.4)' } : null),
                }}
              />
            </div>
          </div>
        )}

        {isVersus && (
          <div style={panel}>
            <div style={labelStyle}>상대: {opponentName}</div>
            <MiniBoard board={opponentBoard} />
          </div>
        )}

        <div style={help}>
          ← → 이동 · ↑/X 회전<br />↓ 소프트드롭 · Space 하드드롭
          {!isVersus && <><br />P 일시정지 · Esc 메뉴</>}
        </div>
      </div>
    </div>
  );
}

// 줄 클리어 → 게이지로 날아가는 입자
function Particle({ sx, sy, ex, ey, onDone }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMoved(true));
    const t = setTimeout(onDone, 520);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [onDone]);
  return (
    <div
      style={{
        position: 'fixed',
        left: moved ? ex : sx,
        top: moved ? ey : sy,
        width: 8, height: 8, borderRadius: 2,
        background: '#9ec1ff',
        boxShadow: '0 0 8px #5b8def',
        opacity: moved ? 0.15 : 1,
        transform: moved ? 'scale(0.4)' : 'scale(1)',
        transition: 'left 0.5s cubic-bezier(0.45,0,0.9,0.5), top 0.5s cubic-bezier(0.45,0,0.9,0.5), opacity 0.5s, transform 0.5s',
        pointerEvents: 'none',
        zIndex: 300,
      }}
    />
  );
}

// 상대 보드 미니뷰
function MiniBoard({ board }) {
  const grid = board || emptyBoard();
  const C = 9;
  return (
    <div style={{ ...boardStyle(C), marginTop: 6, border: '1px solid rgba(255,255,255,0.12)' }}>
      {grid.map((row, i) =>
        row.map((cell, j) => (
          <div
            key={`${i}-${j}`}
            style={{
              width: C, height: C,
              background: cell ? COLORS[cell] : 'rgba(255,255,255,0.04)',
              boxSizing: 'border-box',
            }}
          />
        ))
      )}
    </div>
  );
}

// 단색 버튼 (hover 피드백 포함)
function Button({ children, onClick, variant = 'primary', disabled }) {
  const [hover, setHover] = useState(false);
  const base = variant === 'primary' ? primaryBtn : ghostBtn;
  const hov = variant === 'primary'
    ? { background: '#4a7ce0' }
    : { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.3)' };
  return (
    <button
      style={{
        ...base,
        ...(hover && !disabled ? hov : null),
        ...(disabled ? { opacity: 0.45, cursor: 'default' } : null),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// TETRIS 블록 로고 (각 글자가 테트로미노 색)
const LOGO_LETTERS = [
  ['T', '#ef4444'], ['E', '#f97316'], ['T', '#eab308'],
  ['R', '#22c55e'], ['I', '#22d3ee'], ['S', '#a855f7'],
];
function TetrisLogo() {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {LOGO_LETTERS.map(([ch, color], i) => (
        <span
          key={i}
          style={{
            display: 'inline-block', width: 46, height: 54, lineHeight: '54px',
            textAlign: 'center', fontSize: 34, fontWeight: 900, color: '#fff',
            background: color, borderRadius: 7,
            border: '2px solid rgba(255,255,255,0.35)',
            boxShadow: 'inset 0 -5px 0 rgba(0,0,0,0.22), 0 4px 10px rgba(0,0,0,0.45)',
            transform: i % 2 === 0 ? 'translateY(-3px)' : 'translateY(3px)',
            textShadow: '0 2px 2px rgba(0,0,0,0.4)',
          }}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

// ── 컨테이너: 메뉴 → 싱글 / (매칭 → 대결 → 결과) ──
export function TetrisGame({ onExit }) {
  const [phase, setPhase] = useState('menu');
  const [match, setMatch] = useState(null);
  const [result, setResult] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [rooms, setRooms] = useState([]); // 로비 방 목록
  const [currentRoom, setCurrentRoom] = useState(null); // 내가 들어간 방
  const [rematchState, setRematchState] = useState('idle'); // idle | waiting | requested

  useEffect(() => {
    const sock = getSocket();
    const onStart = (m) => {
      sock.emit('tetris:lobby:leave');
      setMatch(m);
      setCurrentRoom(null);
      setRematchState('idle');
      setPhase('versus');
    };
    const onResult = (r) => { setResult(r); setRematchState('idle'); setPhase('result'); };
    const onLobby = ({ rooms: list }) => setRooms(list);
    const onRoomUpdate = (room) => setCurrentRoom(room);
    const onRoomClosed = () => { setCurrentRoom(null); setPhase('lobby'); };
    const onRematchReq = () => setRematchState('requested');
    const onRematchCancel = () => setRematchState('idle');
    sock.on('tetris:start', onStart);
    sock.on('tetris:result', onResult);
    sock.on('tetris:lobby:update', onLobby);
    sock.on('tetris:room:update', onRoomUpdate);
    sock.on('tetris:room:closed', onRoomClosed);
    sock.on('tetris:rematch:request', onRematchReq);
    sock.on('tetris:rematch:cancel', onRematchCancel);
    return () => {
      sock.off('tetris:start', onStart);
      sock.off('tetris:result', onResult);
      sock.off('tetris:lobby:update', onLobby);
      sock.off('tetris:room:update', onRoomUpdate);
      sock.off('tetris:room:closed', onRoomClosed);
      sock.off('tetris:rematch:request', onRematchReq);
      sock.off('tetris:rematch:cancel', onRematchCancel);
    };
  }, []);

  // 메뉴로 올 때마다 랭킹 조회 (게임 종료 후 갱신 반영)
  useEffect(() => {
    if (phase !== 'menu') return;
    getSocket().emit('tetris:ranking', {}, (resp) => {
      if (resp?.ranking) setRanking(resp.ranking);
    });
  }, [phase]);

  const enterLobby = () => {
    getSocket().emit('tetris:lobby:enter', {}, (resp) => {
      if (resp?.rooms) setRooms(resp.rooms);
    });
    setPhase('lobby');
  };
  const backToMenuFromLobby = () => {
    getSocket().emit('tetris:lobby:leave');
    setPhase('menu');
  };
  const createRoom = () => {
    getSocket().emit('tetris:room:create', {}, (resp) => {
      if (resp?.ok) { setCurrentRoom(resp.room); setPhase('room'); }
    });
  };
  const joinRoom = (roomId) => {
    getSocket().emit('tetris:room:join', { roomId }, (resp) => {
      if (resp?.ok) { setCurrentRoom(resp.room); setPhase('room'); }
    });
  };
  const leaveRoom = () => {
    getSocket().emit('tetris:room:leave');
    setCurrentRoom(null);
    setPhase('lobby');
  };
  const startGame = () => {
    if (!currentRoom) return;
    getSocket().emit('tetris:room:start', { roomId: currentRoom.id }, () => {});
  };
  const requestRematch = () => {
    if (!match) return;
    getSocket().emit('tetris:rematch', { opponentId: match.opponent.id }, (resp) => {
      if (resp?.waiting) setRematchState('waiting'); // started면 tetris:start로 전환됨
    });
  };
  const cancelRematch = () => {
    if (match) getSocket().emit('tetris:rematch:cancel', { opponentId: match.opponent.id });
    setRematchState('idle');
  };

  if (phase === 'single') return <TetrisBoard mode="single" onBack={() => setPhase('menu')} />;
  if (phase === 'versus') return <TetrisBoard mode="versus" matchId={match.matchId} opponentName={match.opponent.nickname} />;

  if (phase === 'lobby') {
    return (
      <div style={centerBox}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>대결 로비</div>
        <div style={lobbyListStyle}>
          {rooms.length === 0 ? (
            <div style={rankEmpty}>열린 방이 없어요. 방을 만들어보세요!</div>
          ) : (
            rooms.map((r) => (
              <div key={r.id} style={roomRow}>
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.hostName}의 방
                </span>
                <span style={{ opacity: 0.6, fontSize: 12 }}>{r.count}/2</span>
                <Button variant="ghost" onClick={() => joinRoom(r.id)} disabled={r.full}>
                  {r.full ? '가득' : '참가'}
                </Button>
              </div>
            ))
          )}
        </div>
        <Button onClick={createRoom}>방 만들기</Button>
        <Button variant="ghost" onClick={backToMenuFromLobby}>뒤로</Button>
      </div>
    );
  }

  if (phase === 'room' && currentRoom) {
    const cr = currentRoom;
    return (
      <div style={centerBox}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{cr.hostName}의 방</div>
        <div style={roomSlots}>
          <div style={slot}>👑 {cr.hostName}</div>
          <div style={{ ...slot, opacity: cr.guestName ? 1 : 0.5 }}>
            {cr.guestName || '상대 대기 중…'}
          </div>
        </div>
        {cr.isHost ? (
          <Button onClick={startGame} disabled={cr.count < 2}>
            {cr.count < 2 ? '상대 대기 중…' : '게임 시작'}
          </Button>
        ) : (
          <div style={{ opacity: 0.7, fontSize: 13, padding: '8px 0' }}>방장이 시작하기를 기다리는 중…</div>
        )}
        <Button variant="ghost" onClick={leaveRoom}>나가기</Button>
      </div>
    );
  }

  if (phase === 'result') {
    const win = result?.win;
    const canRematch = result?.reason !== 'opponent_left' && !!match;
    return (
      <div style={centerBox}>
        <div style={{ fontSize: 28, fontWeight: 800, color: win ? '#7bd96e' : '#ef6b5b' }}>
          {win ? '승리!' : '패배'}
        </div>
        {result?.reason === 'opponent_left' && <div style={{ opacity: 0.7 }}>상대가 나갔습니다</div>}
        {canRematch && rematchState === 'requested' && (
          <div style={{ color: '#9ec1ff', fontSize: 13 }}>상대가 재대결을 신청했어요!</div>
        )}
        {canRematch && rematchState === 'waiting' && (
          <div style={{ opacity: 0.7, fontSize: 13 }}>상대 응답을 기다리는 중…</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {canRematch && rematchState !== 'waiting' && (
            <Button onClick={requestRematch}>
              {rematchState === 'requested' ? '재대결 수락' : '재대결'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => { cancelRematch(); setResult(null); setPhase('menu'); }}>메뉴로</Button>
          <Button variant="ghost" onClick={() => { cancelRematch(); onExit(); }}>나가기</Button>
        </div>
      </div>
    );
  }

  // menu
  return (
    <div style={menuWrap}>
      <div style={menuCard}>
        <TetrisLogo />
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 12, letterSpacing: 1 }}>
          블록을 쌓아 줄을 지우세요
        </div>
        <div style={menuButtons}>
          <Button onClick={() => setPhase('single')}>혼자 하기</Button>
          <Button onClick={enterLobby}>대결 (1:1)</Button>
          <Button variant="ghost" onClick={onExit}>나가기</Button>
        </div>
      </div>

      <div style={rankPanel}>
        <div style={rankHeader}>🏆 랭킹</div>
        {ranking.length === 0 ? (
          <div style={rankEmpty}>아직 기록이 없어요</div>
        ) : (
          ranking.slice(0, 10).map((r, i) => (
            <div key={i} style={rankRow}>
              <span style={{ width: 20, color: i < 3 ? '#ffd45b' : 'rgba(255,255,255,0.45)', fontWeight: i < 3 ? 700 : 400 }}>
                {i + 1}
              </span>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.nickname}
              </span>
              <span style={{ fontWeight: 700, color: '#9ec1ff' }}>{r.score}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── 스타일 ──
const CELL = 26;

const wrap = { display: 'flex', gap: 18, alignItems: 'flex-start' };

const boardStyle = (cell) => ({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: `repeat(${COLS}, ${cell}px)`,
  gridTemplateRows: `repeat(${ROWS}, ${cell}px)`,
  background: 'rgba(0,0,0,0.4)',
  borderRadius: 6,
  border: '2px solid rgba(255,255,255,0.15)',
});

const boardFlash = {
  boxShadow: '0 0 26px 5px rgba(239,68,68,0.85)',
  borderColor: '#ef4444',
};

const boardOverlay = {
  position: 'absolute', inset: 0,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 8,
  background: 'rgba(0,0,0,0.7)', borderRadius: 6, color: '#fff',
};

const side = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 130 };
const panel = { background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' };
const labelStyle = { fontSize: 11, color: 'rgba(255,255,255,0.6)' };
const value = { fontSize: 20, fontWeight: 700, color: '#fff' };
const help = { fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginTop: 4 };

const gaugeOuter = {
  width: '100%', height: 14, borderRadius: 7, marginTop: 6,
  background: 'rgba(0,0,0,0.4)', overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.1)',
};
const gaugeInner = {
  height: '100%', borderRadius: 7,
  transition: 'width 0.35s ease-out, background 0.25s, box-shadow 0.2s, filter 0.2s',
};

const centerBox = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 12, padding: '34px 40px', minWidth: 300,
  background: 'rgba(22, 26, 50, 0.55)', borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)', color: '#fff',
};

// 테트리스 메인 메뉴 카드 (그리드 배경 + 네온 테두리)
const menuCard = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  padding: '44px 52px 38px', minWidth: 360,
  backgroundColor: '#0b1030',
  backgroundImage:
    'linear-gradient(rgba(120,160,255,0.06) 1px, transparent 1px),' +
    'linear-gradient(90deg, rgba(120,160,255,0.06) 1px, transparent 1px)',
  backgroundSize: '30px 30px',
  borderRadius: 16,
  border: '2px solid rgba(91,141,239,0.45)',
  boxShadow: '0 0 28px rgba(91,141,239,0.18), 0 24px 60px rgba(0,0,0,0.55)',
  color: '#fff',
};

const menuButtons = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 11, marginTop: 24, width: '100%',
};

const menuWrap = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 16,
};

const rankPanel = {
  width: 230,
  background: 'rgba(11, 16, 48, 0.85)',
  borderRadius: 16,
  border: '2px solid rgba(91,141,239,0.35)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  padding: '20px 18px',
  display: 'flex',
  flexDirection: 'column',
  color: '#fff',
  overflowY: 'auto',
  maxHeight: '80vh',
};

const rankHeader = {
  fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
  marginBottom: 14, textAlign: 'center',
};

const rankEmpty = {
  fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '4px 0',
};

const rankRow = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 13, color: 'rgba(255,255,255,0.85)', padding: '3px 0',
};

const lobbyListStyle = {
  width: 300,
  minHeight: 120,
  maxHeight: 260,
  overflowY: 'auto',
  background: 'rgba(0,0,0,0.25)',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)',
  padding: 10,
  margin: '6px 0 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const roomRow = {
  display: 'flex', alignItems: 'center', gap: 10,
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 8, padding: '8px 12px',
  fontSize: 14, color: '#fff',
};

const roomSlots = {
  display: 'flex', flexDirection: 'column', gap: 8,
  width: 280, margin: '4px 0 14px',
};

const slot = {
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 8, padding: '12px 14px',
  fontSize: 15, fontWeight: 600, textAlign: 'center',
  border: '1px solid rgba(255,255,255,0.1)',
};

const primaryBtn = {
  padding: '12px 22px', borderRadius: 10, border: 'none',
  background: '#5b8def', color: '#fff',
  fontSize: 15, fontWeight: 600, cursor: 'pointer', minWidth: 184,
  transition: 'background 0.15s',
};
const ghostBtn = {
  padding: '10px 22px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)',
  background: 'transparent', color: 'rgba(255,255,255,0.78)',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
};
