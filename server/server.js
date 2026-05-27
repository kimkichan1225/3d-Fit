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
// players: socketId -> { id, nickname, x, y, z, ry, anim, color, skinColor, faceColor }
const players = new Map();

const SPAWN_POSITION = { x: 0, y: 1.7, z: 0 };

// 피부색/얼굴색 기본값 (클라이언트가 지정하지 않은 경우)
const DEFAULT_SKIN = '#e8a87c';
const DEFAULT_FACE = '#3b2417';

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
    const skinColor = isValidColor(data?.skinColor) ? data.skinColor : DEFAULT_SKIN;
    const faceColor = isValidColor(data?.faceColor) ? data.faceColor : DEFAULT_FACE;
    const player = {
      id: socket.id,
      nickname,
      color,
      skinColor,
      faceColor,
      x: SPAWN_POSITION.x,
      y: SPAWN_POSITION.y,
      z: SPAWN_POSITION.z,
      ry: 0,
      anim: 'Idle',
    };
    players.set(socket.id, player);

    await saveProfile(nickname);
    const recentChats = await getRecentChats(30);

    // 본인에게 초기 상태 전달
    ack &&
      ack({
        ok: true,
        self: player,
        players: Array.from(players.values()),
        recentChats,
      });

    // 다른 사람들에게 알림
    socket.broadcast.emit('player:joined', player);

    // 시스템 메시지
    io.emit('chat:message', {
      nickname: 'system',
      message: `${nickname}님이 접속했습니다`,
      type: 'system',
      created_at: new Date().toISOString(),
    });
  });

  socket.on('player:move', (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = Number(data.x) || 0;
    p.y = Number(data.y) || 0;
    p.z = Number(data.z) || 0;
    p.ry = Number(data.ry) || 0;
    p.anim = (data.anim || 'Idle').toString();
    socket.broadcast.volatile.emit('player:moved', {
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
    io.emit('chat:message', {
      id: socket.id,
      nickname: p.nickname,
      message: text,
      type: 'user',
      created_at: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    players.delete(socket.id);
    io.emit('player:left', { id: socket.id });
    if (p) {
      io.emit('chat:message', {
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
