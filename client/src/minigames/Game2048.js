import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../net/socket';

const GAME_ID = 'game2048';
const SIZE = 4;
const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

// 빈 칸에 새 타일(2 또는 4) 추가
function addTile(board) {
  const empty = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) if (board[y][x] === 0) empty.push([x, y]);
  }
  if (empty.length === 0) return board;
  const [x, y] = empty[Math.floor(Math.random() * empty.length)];
  const nb = board.map((r) => r.slice());
  nb[y][x] = Math.random() < 0.9 ? 2 : 4;
  return nb;
}

// 한 줄을 왼쪽으로 압축 + 병합
function slideRow(row) {
  const vals = row.filter((v) => v !== 0);
  let gained = 0;
  const merged = [];
  for (let i = 0; i < vals.length; i++) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      const m = vals[i] * 2;
      merged.push(m);
      gained += m;
      i++;
    } else {
      merged.push(vals[i]);
    }
  }
  while (merged.length < SIZE) merged.push(0);
  return { row: merged, gained };
}

// 보드를 dir 방향으로 이동
function move(board, dir) {
  let moved = false;
  let gained = 0;
  const nb = emptyBoard();
  if (dir === 'left' || dir === 'right') {
    for (let y = 0; y < SIZE; y++) {
      const row = board[y].slice();
      if (dir === 'right') row.reverse();
      const res = slideRow(row);
      if (dir === 'right') res.row.reverse();
      gained += res.gained;
      nb[y] = res.row;
      for (let x = 0; x < SIZE; x++) if (nb[y][x] !== board[y][x]) moved = true;
    }
  } else {
    for (let x = 0; x < SIZE; x++) {
      const col = board.map((r) => r[x]);
      if (dir === 'down') col.reverse();
      const res = slideRow(col);
      if (dir === 'down') res.row.reverse();
      gained += res.gained;
      for (let y = 0; y < SIZE; y++) {
        nb[y][x] = res.row[y];
        if (nb[y][x] !== board[y][x]) moved = true;
      }
    }
  }
  return { board: nb, moved, gained };
}

function isGameOver(board) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] === 0) return false;
      if (x + 1 < SIZE && board[y][x] === board[y][x + 1]) return false;
      if (y + 1 < SIZE && board[y][x] === board[y + 1][x]) return false;
    }
  }
  return true;
}

const TILE_COLORS = {
  0: 'rgba(255,255,255,0.06)', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179',
  16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
  512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
};
const tileText = (v) => (v <= 4 ? '#776e65' : '#f9f6f2');
const CELL = 76;

function Button({ children, onClick, variant = 'primary' }) {
  const [hover, setHover] = useState(false);
  const base = variant === 'primary' ? primaryBtn : ghostBtn;
  const hov = variant === 'primary'
    ? { background: '#4a7ce0' }
    : { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.3)' };
  return (
    <button
      style={{ ...base, ...(hover ? hov : null) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Game2048({ onExit }) {
  const [phase, setPhase] = useState('menu');
  const [board, setBoard] = useState(emptyBoard);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [ranking, setRanking] = useState([]);
  const scoreRef = useRef(0);

  useEffect(() => {
    if (phase !== 'menu') return;
    getSocket().emit('score:ranking', { game: GAME_ID }, (resp) => {
      if (resp?.ranking) setRanking(resp.ranking);
    });
  }, [phase]);

  const start = () => {
    const b = addTile(addTile(emptyBoard()));
    setBoard(b);
    setScore(0);
    scoreRef.current = 0;
    setOver(false);
    setPhase('playing');
  };

  // 방향키 입력
  useEffect(() => {
    if (phase !== 'playing' || over) return;
    const dirMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const onKey = (e) => {
      const dir = dirMap[e.key];
      if (!dir) return;
      e.preventDefault();
      const { board: nb, moved, gained } = move(board, dir);
      if (!moved) return;
      const withTile = addTile(nb);
      const newScore = scoreRef.current + gained;
      scoreRef.current = newScore;
      setScore(newScore);
      setBoard(withTile);
      if (isGameOver(withTile)) {
        setOver(true);
        getSocket().emit('score:submit', { game: GAME_ID, score: newScore });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, board, over]);

  // ── 게임 화면 ──
  if (phase === 'playing') {
    return (
      <div style={playWrap}>
        <div style={topInfo}>
          <span style={{ fontSize: 14 }}>방향키로 합치세요</span>
          <span>점수 <b style={{ fontSize: 18 }}>{score}</b></span>
        </div>
        <div style={boardWrap}>
          {board.map((row, y) =>
            row.map((v, x) => (
              <div
                key={`${x}-${y}`}
                style={{
                  width: CELL, height: CELL, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: TILE_COLORS[v] || '#3c3a32',
                  color: tileText(v),
                  fontSize: v >= 1024 ? 24 : v >= 128 ? 28 : 32,
                  fontWeight: 800,
                }}
              >
                {v !== 0 ? v : ''}
              </div>
            ))
          )}
          {over && (
            <div style={boardOverlay}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>게임 오버</div>
              <div style={{ opacity: 0.85, margin: '6px 0 14px' }}>점수 {score}</div>
              <Button onClick={start}>다시 하기</Button>
              <Button variant="ghost" onClick={() => setPhase('menu')}>메뉴</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 메뉴 (+ 랭킹) ──
  return (
    <div style={menuWrap}>
      <div style={centerBox}>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#edc22e' }}>2048</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
          같은 숫자를 합쳐 2048을 만드세요
        </div>
        <Button onClick={start}>시작</Button>
        <Button variant="ghost" onClick={onExit}>나가기</Button>
      </div>
      <div style={rankPanel}>
        <div style={rankHeader}>🏆 랭킹</div>
        {ranking.length === 0 ? (
          <div style={emptyText}>아직 기록이 없어요</div>
        ) : (
          ranking.slice(0, 10).map((r, i) => (
            <div key={i} style={rankRow}>
              <span style={{ width: 20, color: i < 3 ? '#ffd45b' : 'rgba(255,255,255,0.45)', fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</span>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nickname}</span>
              <span style={{ fontWeight: 700, color: '#9ec1ff' }}>{r.score}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── 스타일 ──
const playWrap = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 };
const topInfo = { display: 'flex', justifyContent: 'space-between', width: SIZE * CELL + (SIZE + 1) * 8, color: '#fff' };
const boardWrap = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: `repeat(${SIZE}, ${CELL}px)`,
  gridTemplateRows: `repeat(${SIZE}, ${CELL}px)`,
  gap: 8, padding: 8,
  background: 'rgba(0,0,0,0.35)', borderRadius: 8,
  border: '2px solid rgba(255,255,255,0.12)',
};
const boardOverlay = {
  position: 'absolute', inset: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: 'rgba(0,0,0,0.72)', borderRadius: 8, color: '#fff',
};

const menuWrap = { display: 'flex', alignItems: 'stretch', gap: 16 };
const centerBox = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  padding: '34px 40px', minWidth: 260,
  background: 'rgba(22, 26, 50, 0.7)', borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 60px rgba(0,0,0,0.45)', color: '#fff',
};
const rankPanel = {
  width: 230, background: 'rgba(11, 16, 48, 0.85)', borderRadius: 16,
  border: '2px solid rgba(91,141,239,0.35)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  padding: '20px 18px', display: 'flex', flexDirection: 'column', color: '#fff',
  overflowY: 'auto', maxHeight: '80vh',
};
const rankHeader = { fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 14, textAlign: 'center' };
const emptyText = { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '4px 0' };
const rankRow = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.85)', padding: '3px 0' };

const primaryBtn = {
  padding: '11px 22px', borderRadius: 10, border: 'none',
  background: '#5b8def', color: '#fff', fontSize: 15, fontWeight: 600,
  cursor: 'pointer', minWidth: 160, transition: 'background 0.15s',
};
const ghostBtn = {
  padding: '9px 22px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)',
  background: 'transparent', color: 'rgba(255,255,255,0.78)', fontSize: 13,
  fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
};
