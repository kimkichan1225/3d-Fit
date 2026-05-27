import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';

import { connect, getSocket } from './net/socket';
import { SetupScreen } from './ui/SetupScreen';
import { ChatPanel } from './ui/ChatPanel';
import { Sky } from './scene/Sky';
import { Level1Map } from './scene/Level1Map';
import { LocalCharacter } from './scene/LocalCharacter';
import { RemotePlayer } from './scene/RemotePlayer';
import { CameraController } from './scene/CameraController';

const MAX_CHAT = 80;

export default function App() {
  const [self, setSelf] = useState(null); // { id, nickname, color, x, y, z }
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [players, setPlayers] = useState({}); // id -> player
  const [messages, setMessages] = useState([]);

  const characterRef = useRef(null);

  // ── 닉네임 입력 → 서버 join ──
  const handleJoin = useCallback((nickname, color, skinColor, faceColor) => {
    setError('');
    setConnecting(true);
    const sock = connect();

    const tryJoin = () => {
      sock.emit('player:join', { nickname, color, skinColor, faceColor }, (resp) => {
        setConnecting(false);
        if (!resp?.ok) {
          setError(resp?.error || '접속 실패');
          return;
        }
        setSelf(resp.self);
        const m = {};
        for (const p of resp.players) {
          if (p.id !== resp.self.id) m[p.id] = p;
        }
        setPlayers(m);
        setMessages(
          (resp.recentChats || []).map((c) => ({
            nickname: c.nickname,
            message: c.message,
            type: 'user',
            created_at: c.created_at,
          }))
        );
      });
    };

    if (sock.connected) tryJoin();
    else sock.once('connect', tryJoin);

    sock.once('connect_error', (err) => {
      setConnecting(false);
      setError(`서버 연결 실패: ${err.message}`);
    });
  }, []);

  // ── 서버 이벤트 구독 ──
  useEffect(() => {
    if (!self) return;
    const sock = getSocket();

    const onJoined = (p) => setPlayers((prev) => ({ ...prev, [p.id]: p }));
    const onMoved = (data) =>
      setPlayers((prev) => {
        const p = prev[data.id];
        if (!p) return prev;
        return { ...prev, [data.id]: { ...p, ...data } };
      });
    const onLeft = ({ id }) =>
      setPlayers((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    const onChat = (m) => {
      setMessages((prev) => {
        const next = [...prev, m].slice(-MAX_CHAT);
        return next;
      });
      // 본인이 아닌 사람이 보낸 메시지는 머리 위 말풍선으로
      if (m.type !== 'system' && m.id && m.id !== self.id) {
        setPlayers((prev) => {
          const p = prev[m.id];
          if (!p) return prev;
          return {
            ...prev,
            [m.id]: { ...p, lastMessage: { text: m.message, at: Date.now() } },
          };
        });
      }
    };

    sock.on('player:joined', onJoined);
    sock.on('player:moved', onMoved);
    sock.on('player:left', onLeft);
    sock.on('chat:message', onChat);

    return () => {
      sock.off('player:joined', onJoined);
      sock.off('player:moved', onMoved);
      sock.off('player:left', onLeft);
      sock.off('chat:message', onChat);
    };
  }, [self]);

  // ── 본인 위치 송신 ──
  const handleNetUpdate = useCallback((data) => {
    getSocket().emit('player:move', data);
  }, []);

  const handleSendChat = useCallback((text) => {
    getSocket().emit('chat:send', { message: text });
  }, []);

  const spawnPos = useMemo(() => {
    if (!self) return [0, 1.7, -60];
    return [self.x, self.y, self.z];
  }, [self]);

  if (!self) {
    return <SetupScreen onSubmit={handleJoin} error={error} connecting={connecting} />;
  }

  return (
    <>
      <Canvas
        shadows
        camera={{ position: [-0.0, 28.35, 19.76], fov: 75 }}
        gl={{ antialias: true }}
      >
        <Sky />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[50, 80, 50]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-200}
          shadow-camera-right={200}
          shadow-camera-top={200}
          shadow-camera-bottom={-200}
          shadow-camera-near={0.5}
          shadow-camera-far={400}
          shadow-bias={-0.0005}
        />

        <Physics gravity={[0, -9.81, 0]}>
          <Level1Map />
          <LocalCharacter
            characterRef={characterRef}
            spawnPosition={spawnPos}
            onNetUpdate={handleNetUpdate}
            nickname={self.nickname}
            color={self.color}
            skinColor={self.skinColor}
            faceColor={self.faceColor}
          />
        </Physics>

        {/* 다른 플레이어들 */}
        {Object.values(players).map((p) => (
          <RemotePlayer key={p.id} player={p} />
        ))}

        <CameraController characterRef={characterRef} />
      </Canvas>

      <TopBar self={self} count={Object.keys(players).length + 1} />
      <ChatPanel messages={messages} onSend={handleSendChat} myNickname={self.nickname} />
      <HelpHint />
    </>
  );
}

function TopBar({ self, count }) {
  return (
    <div style={topBarStyle}>
      <div>
        <span style={{ opacity: 0.6 }}>나: </span>
        <span style={{ color: self.color, fontWeight: 600 }}>{self.nickname}</span>
      </div>
      <div style={{ opacity: 0.7 }}>접속 인원 {count}명</div>
    </div>
  );
}

function HelpHint() {
  return (
    <div style={hintStyle}>
      <kbd>W/A/S/D</kbd> 이동 · <kbd>Shift</kbd> 달리기 · <kbd>Enter</kbd> 채팅
    </div>
  );
}

const topBarStyle = {
  position: 'fixed',
  top: 14,
  left: 14,
  right: 14,
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 16px',
  borderRadius: 12,
  background: 'rgba(10, 12, 30, 0.65)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(14px)',
  color: '#fff',
  fontSize: 13,
  pointerEvents: 'none',
  zIndex: 50,
};

const hintStyle = {
  position: 'fixed',
  bottom: 14,
  right: 14,
  padding: '8px 14px',
  borderRadius: 999,
  background: 'rgba(10, 12, 30, 0.65)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.8)',
  fontSize: 12,
  zIndex: 50,
};
