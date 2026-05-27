import { Billboard, Html } from '@react-three/drei';

const DEFAULT_BG = 'rgba(20, 22, 50, 0.85)';

// 캐릭터 머리 위 닉네임 + 선택적 말풍선. Billboard로 항상 카메라 방향.
export function NameTag({ nickname, message, color, isSelf }) {
  const style = {
    ...nameStyle,
    background: color || DEFAULT_BG,
    border: isSelf ? '1px solid rgba(255,255,255,0.45)' : '1px solid rgba(255,255,255,0.2)',
    textShadow: color ? '0 1px 2px rgba(0,0,0,0.35)' : 'none',
  };
  return (
    <Billboard position={[0, 8.4, 0]}>
      <Html
        center
        sprite
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div style={style}>{nickname}</div>
        {message && <div style={bubbleStyle}>{message}</div>}
      </Html>
    </Billboard>
  );
}

const nameStyle = {
  padding: '5px 12px',
  borderRadius: 14,
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  textAlign: 'center',
  letterSpacing: 0.2,
  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
};

const bubbleStyle = {
  marginTop: 6,
  padding: '6px 12px',
  borderRadius: 14,
  background: '#fff',
  color: '#222',
  fontSize: 13,
  maxWidth: 220,
  textAlign: 'center',
  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
