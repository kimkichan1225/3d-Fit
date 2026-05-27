const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3002;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// ── PostgreSQL ──
const hasDb = !!process.env.DATABASE_URL;
const pool = hasDb
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: false })
  : null;

async function initDB() {
  if (!pool) {
    console.log('DATABASE_URL이 없어서 채팅 기록을 메모리에만 유지합니다.');
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        nickname TEXT PRIMARY KEY,
        last_seen TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        nickname TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('DB 테이블 초기화 완료');
  } catch (err) {
    console.error('DB 초기화 실패:', err.message);
  }
}

async function saveProfile(nickname) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO profiles (nickname, last_seen) VALUES ($1, NOW())
       ON CONFLICT (nickname) DO UPDATE SET last_seen = NOW()`,
      [nickname]
    );
  } catch (err) {
    console.error('프로필 저장 실패:', err.message);
  }
}

async function saveChat(nickname, message) {
  if (!pool) return;
  try {
    await pool.query(
      'INSERT INTO chat_history (nickname, message) VALUES ($1, $2)',
      [nickname, message]
    );
  } catch (err) {
    console.error('채팅 저장 실패:', err.message);
  }
}

async function getRecentChats(limit = 50) {
  if (!pool) return [];
  try {
    const r = await pool.query(
      'SELECT nickname, message, created_at FROM chat_history ORDER BY id DESC LIMIT $1',
      [limit]
    );
    return r.rows.reverse();
  } catch (err) {
    console.error('채팅 불러오기 실패:', err.message);
    return [];
  }
}

// ── 메모리 상태 ──
// players: socketId -> { id, nickname, x, y, z, ry, anim, color, character, colors, level }
const players = new Map();

const SPAWN_POSITION = { x: 0, y: 1.7, z: 0 };

// 레벨(맵) 개수. 같은 레벨에 있는 플레이어끼리만 서로 보인다.
const LEVEL_COUNT = 4;
const roomName = (level) => `level:${level}`;
// 지정한 레벨에 있는 플레이어 목록
const playersInLevel = (level) =>
  Array.from(players.values()).filter((p) => p.level === level);

// 캐릭터 부위별 색 (클라이언트가 지정하지 않은 경우 기본값)
const CHARACTER_KEYS = ['male', 'female'];
const DEFAULT_CHARACTER = 'male';
const COLOR_PART_KEYS = ['Skin', 'Hair', 'Face', 'Shirt', 'Pants', 'Belt'];
const DEFAULT_COLORS = {
  Skin: '#e8a87c', Hair: '#3b2417', Face: '#3b2417',
  Shirt: '#5b8def', Pants: '#3b3f5c', Belt: '#5c3a21',
};

// ── 테트리스 1:1 대결 ──
let tetrisWaiting = null; // 매칭 대기 중인 socketId (1명)
const matches = new Map(); // matchId -> { players: [id1, id2] }
let matchSeq = 0;

// 매치에서 상대 socketId 반환
function opponentOf(matchId, socketId) {
  const m = matches.get(matchId);
  if (!m) return null;
  return m.players.find((id) => id !== socketId) || null;
}

// 사용자별 색상 자동 부여 (닉네임 해시) - 클라이언트가 색을 지정하지 않은 경우의 fallback
function colorFromNickname(nickname) {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

// 색상 문자열 검증 (#rrggbb 또는 #rgb)
function isValidColor(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c);
}

// 부위별 색 객체 검증 (유효하지 않은 값은 기본값으로 대체)
function sanitizeColors(input) {
  const out = { ...DEFAULT_COLORS };
  if (input && typeof input === 'object') {
    for (const k of COLOR_PART_KEYS) {
      if (isValidColor(input[k])) out[k] = input[k];
    }
  }
  return out;
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('player:join', async (data, ack) => {
    const nickname = (data?.nickname || '').toString().trim().slice(0, 16);
    if (!nickname) {
      ack && ack({ ok: false, error: '닉네임이 필요합니다' });
      return;
    }
    // 중복 닉네임 체크 (접속 중인 사용자 중에서만)
    for (const p of players.values()) {
      if (p.nickname === nickname) {
        ack && ack({ ok: false, error: '이미 사용 중인 닉네임입니다' });
        return;
      }
    }

    const color = isValidColor(data?.color) ? data.color : colorFromNickname(nickname);
    const character = CHARACTER_KEYS.includes(data?.character) ? data.character : DEFAULT_CHARACTER;
    const colors = sanitizeColors(data?.colors);
    const player = {
      id: socket.id,
      nickname,
      color,
      character,
      colors,
      level: 1, // 처음엔 항상 Level1(마을)에서 시작
      x: SPAWN_POSITION.x,
      y: SPAWN_POSITION.y,
      z: SPAWN_POSITION.z,
      ry: 0,
      anim: 'Idle',
    };
    players.set(socket.id, player);
    socket.join(roomName(player.level));

    await saveProfile(nickname);
    const recentChats = await getRecentChats(30);

    // 본인에게 초기 상태 전달 (같은 레벨 플레이어만)
    ack &&
      ack({
        ok: true,
        self: player,
        players: playersInLevel(player.level),
        recentChats,
      });

    // 같은 레벨에 있는 다른 사람들에게만 알림
    socket.to(roomName(player.level)).emit('player:joined', player);

    // 시스템 메시지 (같은 레벨에만)
    io.to(roomName(player.level)).emit('chat:message', {
      nickname: 'system',
      message: `${nickname}님이 접속했습니다`,
      type: 'system',
      created_at: new Date().toISOString(),
    });
  });

  // 레벨(맵) 이동: 문 상호작용 시 호출. 기존 레벨 룸에서 나가고 새 레벨 룸으로 이동한다.
  socket.on('player:changeLevel', (data, ack) => {
    const p = players.get(socket.id);
    if (!p) {
      ack && ack({ ok: false, error: '플레이어를 찾을 수 없습니다' });
      return;
    }
    let level = Number(data?.level);
    if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) {
      ack && ack({ ok: false, error: '잘못된 레벨입니다' });
      return;
    }

    // 스폰 좌표 (사용한 문 기준). 유효하지 않으면 기본 스폰 위치 사용.
    const s = data?.spawn;
    const spawn =
      Array.isArray(s) && s.length === 3 && s.every((n) => typeof n === 'number' && Number.isFinite(n))
        ? { x: s[0], y: s[1], z: s[2] }
        : SPAWN_POSITION;

    const oldLevel = p.level;
    // 기존 레벨 사람들에게 퇴장 알림
    socket.leave(roomName(oldLevel));
    socket.to(roomName(oldLevel)).emit('player:left', { id: socket.id });

    // 새 레벨로 이동 + 스폰 위치 설정
    p.level = level;
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.ry = 0;
    p.anim = 'Idle';
    socket.join(roomName(level));

    // 새 레벨 사람들에게 등장 알림
    socket.to(roomName(level)).emit('player:joined', p);

    // 본인에게 새 레벨의 플레이어 목록 전달
    ack && ack({ ok: true, self: p, players: playersInLevel(level) });
  });

  socket.on('player:move', (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = Number(data.x) || 0;
    p.y = Number(data.y) || 0;
    p.z = Number(data.z) || 0;
    p.ry = Number(data.ry) || 0;
    p.anim = (data.anim || 'Idle').toString();
    // 같은 레벨에 있는 사람들에게만 위치 전송
    socket.to(roomName(p.level)).volatile.emit('player:moved', {
      id: socket.id,
      x: p.x,
      y: p.y,
      z: p.z,
      ry: p.ry,
      anim: p.anim,
    });
  });

  socket.on('chat:send', async (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    const text = (data?.message || '').toString().slice(0, 200);
    if (!text.trim()) return;
    await saveChat(p.nickname, text);
    // 같은 레벨에 있는 사람들에게만 채팅 전송
    io.to(roomName(p.level)).emit('chat:message', {
      id: socket.id,
      nickname: p.nickname,
      message: text,
      type: 'user',
      created_at: new Date().toISOString(),
    });
  });

  // ── 테트리스 대결 ──
  // 매칭 대기열 등록. 대기자가 있으면 즉시 매치 성사.
  socket.on('tetris:queue', (data, ack) => {
    const p = players.get(socket.id);
    if (!p) {
      ack && ack({ ok: false });
      return;
    }
    if (tetrisWaiting === socket.id) return; // 이미 대기 중

    if (tetrisWaiting && players.has(tetrisWaiting) && tetrisWaiting !== socket.id) {
      // 상대와 매치 성사
      const oppId = tetrisWaiting;
      tetrisWaiting = null;
      const opp = players.get(oppId);
      const matchId = `m${++matchSeq}`;
      matches.set(matchId, { players: [oppId, socket.id] });
      io.to(oppId).emit('tetris:start', { matchId, opponent: { id: socket.id, nickname: p.nickname } });
      io.to(socket.id).emit('tetris:start', { matchId, opponent: { id: oppId, nickname: opp.nickname } });
      ack && ack({ ok: true, matched: true });
    } else {
      // 대기열 등록
      tetrisWaiting = socket.id;
      ack && ack({ ok: true, waiting: true });
    }
  });

  // 매칭 취소
  socket.on('tetris:cancel', () => {
    if (tetrisWaiting === socket.id) tetrisWaiting = null;
  });

  // 보드 상태 중계 (상대 미니뷰용)
  socket.on('tetris:board', (data) => {
    const oppId = opponentOf(data?.matchId, socket.id);
    if (oppId) io.to(oppId).volatile.emit('tetris:board', { board: data.board });
  });

  // 공격 줄 전송
  socket.on('tetris:attack', (data) => {
    const oppId = opponentOf(data?.matchId, socket.id);
    const lines = Math.max(0, Math.min(20, Number(data?.lines) || 0));
    if (oppId && lines > 0) io.to(oppId).emit('tetris:attack', { lines });
  });

  // 내가 게임오버 → 상대 승리
  socket.on('tetris:over', (data) => {
    const matchId = data?.matchId;
    if (!matches.has(matchId)) return;
    const oppId = opponentOf(matchId, socket.id);
    io.to(socket.id).emit('tetris:result', { win: false });
    if (oppId) io.to(oppId).emit('tetris:result', { win: true });
    matches.delete(matchId);
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    players.delete(socket.id);

    // 테트리스 매칭/매치 정리
    if (tetrisWaiting === socket.id) tetrisWaiting = null;
    for (const [mid, m] of matches) {
      if (m.players.includes(socket.id)) {
        const oppId = m.players.find((id) => id !== socket.id);
        if (oppId) io.to(oppId).emit('tetris:result', { win: true, reason: 'opponent_left' });
        matches.delete(mid);
      }
    }
    if (p) {
      // 같은 레벨에 있던 사람들에게만 퇴장 알림
      socket.to(roomName(p.level)).emit('player:left', { id: socket.id });
      io.to(roomName(p.level)).emit('chat:message', {
        nickname: 'system',
        message: `${p.nickname}님이 퇴장했습니다`,
        type: 'system',
        created_at: new Date().toISOString(),
      });
    }
    console.log('disconnected:', socket.id);
  });
});

app.get('/', (_, res) => {
  res.type('text/plain').send(`3d-fit server\nplayers: ${players.size}`);
});

app.get('/health', (_, res) => res.json({ ok: true, players: players.size }));

server.listen(PORT, () => {
  console.log(`3d-fit server listening on :${PORT}`);
  initDB();
});
