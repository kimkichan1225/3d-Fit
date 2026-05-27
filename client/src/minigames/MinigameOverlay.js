import { MINIGAMES } from './registry';

// 미니게임을 3D 씬 위에 전체화면 오버레이로 띄운다.
export function MinigameOverlay({ gameId, onExit }) {
  const game = MINIGAMES[gameId];
  if (!game) return null;
  const GameComponent = game.component;

  return (
    <div style={overlay}>
      <button style={closeBtn} onClick={onExit} aria-label="닫기">✕</button>
      <div style={body}>
        <GameComponent onExit={onExit} />
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(ellipse at center, rgba(20,24,52,0.96) 0%, rgba(6,8,20,0.97) 100%)',
  backdropFilter: 'blur(10px)',
};

const closeBtn = {
  position: 'absolute',
  top: 20,
  right: 20,
  width: 40,
  height: 40,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.75)',
  fontSize: 16,
  cursor: 'pointer',
};

const body = { display: 'flex', alignItems: 'center', justifyContent: 'center' };
