import { useState } from 'react';

const COLOR_PALETTE = [
  '#5b8def', // 파랑
  '#8a5bef', // 보라
  '#ef5b8d', // 핑크
  '#ef6b5b', // 다홍
  '#efb35b', // 주황
  '#efe05b', // 노랑
  '#7bd96e', // 연두
  '#5bcfa0', // 민트
  '#5bc6ef', // 하늘
  '#9aa0a6', // 회색
];

// 피부색 팔레트 (밝은 톤 → 어두운 톤, 핑크빛~황빛 다양하게)
const SKIN_PALETTE = ['#ffe4d0', '#f6cba6', '#e8a87c', '#cd8552', '#a3633a', '#6e4327'];
// 눈·눈썹색 팔레트 (검정~갈색~금발 + 포인트 컬러)
const FACE_PALETTE = ['#1c1c1c', '#3b2417', '#6e4327', '#a3633a', '#c9a35b', '#8a3a2a', '#3a6ea5', '#3a8a5f', '#7a4fa3', '#d96a9a'];

const DEFAULT_SKIN = '#e8a87c';
const DEFAULT_FACE = '#3b2417';

// 색상 선택기: 팔레트 버튼 + 직접 선택(color picker)
function SwatchPicker({ palette, value, onChange }) {
  return (
    <div style={swatchRow}>
      {palette.map((c) => (
        <button
          type="button"
          key={c}
          onClick={() => onChange(c)}
          style={{
            ...swatch,
            background: c,
            outline: value.toLowerCase() === c.toLowerCase() ? '2px solid #fff' : '2px solid transparent',
            transform: value.toLowerCase() === c.toLowerCase() ? 'scale(1.1)' : 'scale(1)',
          }}
          aria-label={c}
        />
      ))}
      <label style={customSwatchWrap} title="직접 선택">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}
        />
        <span style={{ ...swatch, background: value, border: '2px dashed rgba(255,255,255,0.5)' }} />
      </label>
    </div>
  );
}

export function SetupScreen({ onSubmit, error, connecting }) {
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [skinColor, setSkinColor] = useState(DEFAULT_SKIN);
  const [faceColor, setFaceColor] = useState(DEFAULT_FACE);

  const submit = (e) => {
    e.preventDefault();
    const n = nickname.trim();
    if (!n) return;
    onSubmit(n, color, skinColor, faceColor);
  };

  return (
    <div style={overlay}>
      <form style={card} onSubmit={submit}>
        <h1 style={title}>3d-fit</h1>
        <p style={subtitle}>가상 사무실에서 동료와 만나세요</p>

        <input
          style={input}
          placeholder="닉네임을 입력하세요"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
          autoFocus
        />

        <div style={{ marginTop: 4 }}>
          <div style={label}>배지 색상</div>
          <SwatchPicker palette={COLOR_PALETTE} value={color} onChange={setColor} />
        </div>

        <div>
          <div style={label}>피부색</div>
          <SwatchPicker palette={SKIN_PALETTE} value={skinColor} onChange={setSkinColor} />
        </div>

        <div>
          <div style={label}>눈·눈썹색</div>
          <SwatchPicker palette={FACE_PALETTE} value={faceColor} onChange={setFaceColor} />
        </div>

        <div style={preview}>
          <span style={{ ...colorDot, background: skinColor }} title="피부색" />
          <span style={{ ...colorDot, background: faceColor }} title="눈·눈썹색" />
          <span style={{ ...badge, background: color }}>{nickname.trim() || '닉네임'}</span>
        </div>

        {error && <div style={errorBox}>{error}</div>}
        <button type="submit" style={button} disabled={connecting || !nickname.trim()}>
          {connecting ? '접속 중…' : '입장'}
        </button>
      </form>
    </div>
  );
}

const overlay = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(ellipse at center, #1a1f4a 0%, #0a0d22 100%)',
  zIndex: 100,
};

const card = {
  width: 360,
  padding: 32,
  borderRadius: 16,
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(20px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
};

const title = {
  fontSize: 32,
  fontWeight: 700,
  letterSpacing: -1,
  textAlign: 'center',
  color: '#fff',
};

const subtitle = {
  fontSize: 14,
  color: 'rgba(255, 255, 255, 0.7)',
  textAlign: 'center',
  marginBottom: 8,
};

const input = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255, 255, 255, 0.15)',
  background: 'rgba(255, 255, 255, 0.08)',
  color: '#fff',
  fontSize: 16,
  outline: 'none',
};

const button = {
  width: '100%',
  padding: '12px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, #5b8def, #8a5bef)',
  color: '#fff',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
};

const errorBox = {
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(255, 80, 80, 0.15)',
  color: '#ffb4b4',
  fontSize: 13,
};

const label = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.6)',
  marginBottom: 8,
};

const swatchRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const swatch = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  transition: 'transform 0.15s',
  display: 'inline-block',
};

const customSwatchWrap = {
  position: 'relative',
  display: 'inline-flex',
  cursor: 'pointer',
};

const preview = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  marginTop: 4,
};

const colorDot = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.35)',
  display: 'inline-block',
};

const badge = {
  padding: '6px 14px',
  borderRadius: 14,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.35)',
  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
};
