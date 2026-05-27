import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';

import { connect, getSocket } from './net/socket';
import { SetupScreen } from './ui/SetupScreen';
import { ChatPanel } from './ui/ChatPanel';
import { Sky } from './scene/Sky';
import { GameMap, LEVEL_MAPS } from './scene/GameMap';
import { DoorInteraction } from './scene/DoorInteraction';
import { Arcades, LEVEL_ARCADES } from './scene/Arcade';
import { LocalCharacter } from './scene/LocalCharacter';
import { RemotePlayer } from './scene/RemotePlayer';
import { CameraController } from './scene/CameraController';
import { MinigameOverlay } from './minigames/MinigameOverlay';

const MAX_CHAT = 80;

// 레벨별 문 연결 정보: 문 노드 이름 → { target: 이동할 레벨, label: 안내 문구 }
// (문의 실제 위치는 맵 GLB 안의 door 노드에서 자동으로 읽어온다)
// spawn: 그 문으로 이동했을 때 목적지에서 등장할 좌표 (Portfolio 기준)
const LEVEL_DOORS = {
  1: {
    door001: { target: 2, label: '프로젝트 갤러리', spawn: [0, 2, 0] },
    door: { target: 3, label: '기술 스택 사무실', spawn: [0, 2, 0] },
  },
  2: {
    door001: { target: 1, label: '마을', spawn: [9.96, 0.29, -61.47] },
  },
  3: {
    door: { target: 1, label: '마을', spawn: [-41.16, 0.29, -26.0] },
    door002: { target: 4, label: '다음 사무실', spawn: [0, 2, 0] },
  },
  4: {
    door002: { target: 3, label: '이전 사무실', spawn: [-40.53, 0.32, -16.26] },
  },
};

export default function App() {
  const [self, setSelf] = useState(null); // { id, nickname, color, x, y, z }
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [players, setPlayers] = useState({}); // id -> player
  const [messages, setMessages] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [doors, setDoors] = useState({}); // 현재 레벨 문들의 위치 { name: Vector3 }
  const [nearDoor, setNearDoor] = useState(null); // 가까이 있는 문 { name, target, label }
  const [nearArcade, setNearArcade] = useState(null); // 가까이 있는 게임기
  const [activeGame, setActiveGame] = useState(null); // 실행 중인 미니게임 id

  const characterRef = useRef(null);
  const nearDoorRef = useRef(null); // E키 핸들러에서 최신값 참조용
  const nearArcadeRef = useRef(null);
  const activeGameRef = useRef(null);
  const changingLevelRef = useRef(false); // 레벨 전환 중복 방지

  // ── 닉네임 입력 → 서버 join ──
  const handleJoin = useCallback((nickname, color, character, colors) => {
    setError('');
    setConnecting(true);
    const sock = connect();

    const tryJoin = () => {
      sock.emit('player:join', { nickname, color, character, colors }, (resp) => {
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

  // ── 레벨(맵) 이동 ──
  const changeLevel = useCallback((door) => {
    if (!door || changingLevelRef.current) return;
    changingLevelRef.current = true;
    getSocket().emit('player:changeLevel', { level: door.target, spawn: door.spawn }, (resp) => {
      changingLevelRef.current = false;
      if (!resp?.ok) return;
      const m = {};
      for (const p of resp.players) {
        if (p.id !== resp.self.id) m[p.id] = p;
      }
      setPlayers(m);
      setSelf(resp.self);
      setCurrentLevel(resp.self.level);
      setDoors({});
      setNearDoor(null);
      nearDoorRef.current = null;
      setNearArcade(null);
      nearArcadeRef.current = null;
    });
  }, []);

  const handleNearDoorChange = useCallback((door) => {
    nearDoorRef.current = door;
    setNearDoor(door);
  }, []);

  const handleNearArcadeChange = useCallback((arcade) => {
    nearArcadeRef.current = arcade;
    setNearArcade(arcade);
  }, []);

  const openGame = useCallback((id) => {
    activeGameRef.current = id;
    setActiveGame(id);
  }, []);

  const closeGame = useCallback(() => {
    activeGameRef.current = null;
    setActiveGame(null);
  }, []);

  // E키: 게임기 > 문 순으로 상호작용 (게임 중엔 무시)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'e') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (activeGameRef.current) return;
      const na = nearArcadeRef.current;
      if (na) {
        openGame(na.id);
        return;
      }
      const nd = nearDoorRef.current;
      if (nd) changeLevel(nd);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeLevel, openGame]);

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
          <GameMap key={`map-${currentLevel}`} url={LEVEL_MAPS[currentLevel]} onDoorsFound={setDoors} />
          <LocalCharacter
            key={`char-${currentLevel}`}
            characterRef={characterRef}
            spawnPosition={spawnPos}
            onNetUpdate={handleNetUpdate}
            nickname={self.nickname}
            color={self.color}
            character={self.character}
            colors={self.colors}
            paused={!!activeGame}
          />
          <DoorInteraction
            characterRef={characterRef}
            doors={doors}
            doorConfig={LEVEL_DOORS[currentLevel] || {}}
            onNearDoorChange={handleNearDoorChange}
          />
          <Arcades
            key={`arcade-${currentLevel}`}
            characterRef={characterRef}
            arcades={LEVEL_ARCADES[currentLevel] || []}
            onNearChange={handleNearArcadeChange}
          />
        </Physics>

        {/* 다른 플레이어들 */}
        {Object.values(players).map((p) => (
          <RemotePlayer key={p.id} player={p} />
        ))}

        <CameraController characterRef={characterRef} />
      </Canvas>

      <TopBar self={self} count={Object.keys(players).length + 1} level={currentLevel} />
      <ChatPanel messages={messages} onSend={handleSendChat} myNickname={self.nickname} />
      <HelpHint />
      {!activeGame && nearArcade && (
        <div style={doorPromptStyle}>
          🎮 <kbd>E</kbd> 키를 눌러 {nearArcade.title} 플레이
        </div>
      )}
      {!activeGame && !nearArcade && nearDoor && (
        <div style={doorPromptStyle}>
          🚪 <kbd>E</kbd> 키를 눌러 {nearDoor.label}{nearDoor.label === '마을' ? '으로 가기' : ' 입장'}
        </div>
      )}
      {activeGame && <MinigameOverlay gameId={activeGame} onExit={closeGame} />}
    </>
  );
}

function TopBar({ self, count, level }) {
  return (
    <div style={topBarStyle}>
      <div>
        <span style={{ opacity: 0.6 }}>나: </span>
        <span style={{ color: self.color, fontWeight: 600 }}>{self.nickname}</span>
        <span style={{ opacity: 0.5, marginLeft: 10 }}>Level {level}</span>
      </div>
      <div style={{ opacity: 0.7 }}>이 레벨 {count}명</div>
    </div>
  );
}

function HelpHint() {
  return (
    <div style={hintStyle}>
      <kbd>W/A/S/D</kbd> 이동 · <kbd>Shift</kbd> 달리기 · <kbd>E</kbd> 문 입장 · <kbd>Enter</kbd> 채팅
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

const doorPromptStyle = {
  position: 'fixed',
  bottom: 90,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '12px 22px',
  borderRadius: 12,
  background: 'rgba(10, 12, 30, 0.8)',
  border: '1px solid rgba(255,255,255,0.2)',
  backdropFilter: 'blur(14px)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  zIndex: 60,
  pointerEvents: 'none',
};
