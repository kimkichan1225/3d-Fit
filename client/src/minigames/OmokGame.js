import { useEffect, useState } from 'react';
import { getSocket } from '../net/socket';

const SIZE = 15;
const CELL = 26;
const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

// 단색 버튼 (hover 피드백)
function Button({ children, onClick, variant = 'primary', disabled }) {
  const [hover, setHover] = useState(false);
  const base = variant === 'primary' ? primaryBtn : ghostBtn;
  const hov = variant === 'primary'
    ? { background: '#4a7ce0' }
    : { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.3)' };
  return (
    <button
      style={{ ...base, ...(hover && !disabled ? hov : null), ...(disabled ? { opacity: 0.45, cursor: 'default' } : null) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// 오목 1:1 대결 — 로비 → 방 → 대결 → 결과
export function OmokGame({ onExit }) {
  const [phase, setPhase] = useState('lobby');
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [match, setMatch] = useState(null); // { matchId, color, opponent }
  const [board, setBoard] = useState(emptyBoard);
  const [turn, setTurn] = useState('black');
  const [last, setLast] = useState(null); // 마지막 착수 위치
  const [result, setResult] = useState(null);

  useEffect(() => {
    const sock = getSocket();
    sock.emit('omok:lobby:enter', {}, (resp) => { if (resp?.rooms) setRooms(resp.rooms); });

    const onLobby = ({ rooms: list }) => setRooms(list);
    const onRoomUpdate = (room) => setCurrentRoom(room);
    const onRoomClosed = () => { setCurrentRoom(null); setPhase('lobby'); };
    const onStart = (m) => {
      sock.emit('omok:lobby:leave');
      setMatch(m);
      setBoard(emptyBoard());
      setTurn('black');
      setLast(null);
      setCurrentRoom(null);
      setResult(null);
      setPhase('playing');
    };
    const onUpdate = ({ x, y, color, turn: t }) => {
      setBoard((b) => {
        const nb = b.map((row) => row.slice());
        nb[y][x] = color;
        return nb;
      });
      setTurn(t);
      setLast({ x, y });
    };
    const onResult = (r) => { setResult(r); setPhase('result'); };

    sock.on('omok:lobby:update', onLobby);
    sock.on('omok:room:update', onRoomUpdate);
    sock.on('omok:room:closed', onRoomClosed);
    sock.on('omok:start', onStart);
    sock.on('omok:update', onUpdate);
    sock.on('omok:result', onResult);
    return () => {
      sock.emit('omok:lobby:leave');
      sock.off('omok:lobby:update', onLobby);
      sock.off('omok:room:update', onRoomUpdate);
      sock.off('omok:room:closed', onRoomClosed);
      sock.off('omok:start', onStart);
      sock.off('omok:update', onUpdate);
      sock.off('omok:result', onResult);
    };
  }, []);

  const enterLobby = () => {
    getSocket().emit('omok:lobby:enter', {}, (resp) => { if (resp?.rooms) setRooms(resp.rooms); });
    setPhase('lobby');
  };
  const createRoom = () => getSocket().emit('omok:room:create', {}, (resp) => {
    if (resp?.ok) { setCurrentRoom(resp.room); setPhase('room'); }
  });
  const joinRoom = (roomId) => getSocket().emit('omok:room:join', { roomId }, (resp) => {
    if (resp?.ok) { setCurrentRoom(resp.room); setPhase('room'); }
  });
  const leaveRoom = () => { getSocket().emit('omok:room:leave'); setCurrentRoom(null); setPhase('lobby'); };
  const startGame = () => { if (currentRoom) getSocket().emit('omok:room:start', { roomId: currentRoom.id }, () => {}); };
  const place = (x, y) => {
    if (!match || phase !== 'playing' || turn !== match.color || board[y][x]) return;
    getSocket().emit('omok:move', { matchId: match.matchId, x, y });
  };
  const resign = () => { if (match) getSocket().emit('omok:leave', { matchId: match.matchId }); enterLobby(); };

  // ── 대결 ──
  if (phase === 'playing' && match) {
    const myTurn = turn === match.color;
    return (
      <div style={playWrap}>
        <div style={topInfo}>
          <span>내 돌: <b>{match.color === 'black' ? '⚫ 흑' : '⚪ 백'}</b></span>
          <span style={{ color: myTurn ? '#7bd96e' : 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
            {myTurn ? '내 차례' : `${match.opponent.nickname} 차례`}
          </span>
        </div>
        <div style={{ ...omokBoardStyle, cursor: myTurn ? 'pointer' : 'default' }}>
          {board.map((row, y) =>
            row.map((cell, x) => (
              <div key={`${x}-${y}`} style={cellStyle} onClick={() => place(x, y)}>
                {cell && (
                  <div style={{
                    ...stoneStyle,
                    background: cell === 'black'
                      ? 'radial-gradient(circle at 35% 30%, #555, #111)'
                      : 'radial-gradient(circle at 35% 30%, #fff, #c4c4c4)',
                    outline: last && last.x === x && last.y === y ? '2px solid #ef5b5b' : 'none',
                  }} />
                )}
              </div>
            ))
          )}
        </div>
        <Button variant="ghost" onClick={resign}>기권하고 나가기</Button>
      </div>
    );
  }

  // ── 결과 ──
  if (phase === 'result') {
    const win = result?.win;
    return (
      <div style={centerBox}>
        <div style={{ fontSize: 28, fontWeight: 800, color: win ? '#7bd96e' : '#ef6b5b' }}>
          {win ? '승리!' : '패배'}
        </div>
        {result?.reason === 'opponent_left' && <div style={{ opacity: 0.7 }}>상대가 나갔습니다</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Button onClick={enterLobby}>로비로</Button>
          <Button variant="ghost" onClick={onExit}>나가기</Button>
        </div>
      </div>
    );
  }

  // ── 방 대기 ──
  if (phase === 'room' && currentRoom) {
    const cr = currentRoom;
    return (
      <div style={centerBox}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{cr.hostName}의 방</div>
        <div style={roomSlots}>
          <div style={slot}>👑 {cr.hostName} (흑)</div>
          <div style={{ ...slot, opacity: cr.guestName ? 1 : 0.5 }}>
            {cr.guestName ? `${cr.guestName} (백)` : '상대 대기 중…'}
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

  // ── 로비 ──
  return (
    <div style={centerBox}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>오목 대결</div>
      <div style={lobbyListStyle}>
        {rooms.length === 0 ? (
          <div style={emptyText}>열린 방이 없어요. 방을 만들어보세요!</div>
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
      <Button variant="ghost" onClick={onExit}>나가기</Button>
    </div>
  );
}

// ── 스타일 ──
const playWrap = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 };

const topInfo = {
  display: 'flex', justifyContent: 'space-between', width: SIZE * CELL,
  color: '#fff', fontSize: 14,
};

const omokBoardStyle = {
  display: 'grid',
  gridTemplateColumns: `repeat(${SIZE}, ${CELL}px)`,
  gridTemplateRows: `repeat(${SIZE}, ${CELL}px)`,
  background: '#d9a86c',
  borderRadius: 6,
  border: '3px solid #a9743f',
};

const cellStyle = {
  width: CELL, height: CELL,
  boxSizing: 'border-box',
  border: '1px solid rgba(60,40,20,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const stoneStyle = {
  width: CELL - 6, height: CELL - 6, borderRadius: '50%',
  boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
};

const centerBox = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 12, padding: '34px 40px', minWidth: 300,
  background: 'rgba(22, 26, 50, 0.7)', borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)', color: '#fff',
};

const lobbyListStyle = {
  width: 300, minHeight: 120, maxHeight: 260, overflowY: 'auto',
  background: 'rgba(0,0,0,0.25)', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)', padding: 10,
  margin: '6px 0 14px', display: 'flex', flexDirection: 'column', gap: 6,
};
const roomRow = {
  display: 'flex', alignItems: 'center', gap: 10,
  background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px',
  fontSize: 14, color: '#fff',
};
const roomSlots = { display: 'flex', flexDirection: 'column', gap: 8, width: 280, margin: '4px 0 14px' };
const slot = {
  background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '12px 14px',
  fontSize: 15, fontWeight: 600, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)',
};
const emptyText = { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '8px 0' };

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
