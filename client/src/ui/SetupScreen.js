import { useState } from 'react';
import { CHARACTERS, COLOR_PARTS, DEFAULT_COLORS, DEFAULT_CHARACTER } from '../scene/characters';
import { CharacterPreview } from './CharacterPreview';

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

// 부위별 추천 팔레트 (직접 선택도 가능)
const PALETTES = {
  Skin: ['#ffe4d0', '#f6cba6', '#e8a87c', '#cd8552', '#a3633a', '#6e4327'],
  Hair: ['#1c1c1c', '#3b2417', '#6e4327', '#a3633a', '#c9a35b', '#d96a9a', '#5b8def', '#9aa0a6'],
  Face: ['#1c1c1c', '#3b2417', '#6e4327', '#a3633a', '#c9a35b', '#8a3a2a'],
  Shirt: ['#5b8def', '#ef5b8d', '#7bd96e', '#efb35b', '#a855f7', '#ef6b5b', '#22d3ee', '#f1f1f1', '#3b3f5c', '#1c1c1c'],
  Pants: ['#3b3f5c', '#1c1c1c', '#5c3a21', '#2c5f8a', '#6e4327', '#9aa0a6', '#4a4a4a', '#222222'],
  Belt: ['#5c3a21', '#1c1c1c', '#6e4327', '#9aa0a6', '#3b3f5c', '#a3633a'],
};

// 색 선택 탭 (캐릭터 부위 + 배지)
const COLOR_TABS = [...COLOR_PARTS, { key: 'badge', label: '배지' }];

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
  const [character, setCharacter] = useState(DEFAULT_CHARACTER);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [activeTab, setActiveTab] = useState(COLOR_PARTS[0].key);

  const setPart = (key, value) => setColors((c) => ({ ...c, [key]: value }));

  const submit = (e) => {
    e.preventDefault();
    const n = nickname.trim();
    if (!n) return;
    onSubmit(n, color, character, colors);
  };

  return (
    <div style={overlay}>
      <div style={container}>
        <div style={previewPane}>
          <CharacterPreview character={character} colors={colors} />
          <div style={previewHint}>{CHARACTERS[character]?.label} 미리보기</div>
        </div>
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
          <div style={label}>캐릭터</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(CHARACTERS).map(([key, c]) => (
              <button
                type="button"
                key={key}
                onClick={() => setCharacter(key)}
                style={{ ...charBtn, ...(character === key ? charBtnActive : null) }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={label}>색상</div>
          <div style={tabBar}>
            {COLOR_TABS.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{ ...tab, ...(activeTab === t.key ? tabActive : null) }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            {activeTab === 'badge' ? (
              <SwatchPicker palette={COLOR_PALETTE} value={color} onChange={setColor} />
            ) : (
              <SwatchPicker
                palette={PALETTES[activeTab]}
                value={colors[activeTab]}
                onChange={(v) => setPart(activeTab, v)}
              />
            )}
          </div>
        </div>

        <div style={preview}>
          <span style={{ ...badge, background: color }}>{nickname.trim() || '닉네임'}</span>
        </div>

          {error && <div style={errorBox}>{error}</div>}
          <button type="submit" style={button} disabled={connecting || !nickname.trim()}>
            {connecting ? '접속 중…' : '입장'}
          </button>
        </form>
      </div>
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

const container = {
  display: 'flex',
  maxHeight: '90vh',
  borderRadius: 16,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
};

const previewPane = {
  position: 'relative',
  width: 300,
  background: 'radial-gradient(ellipse at 50% 35%, #2e3878 0%, #11142e 75%)',
  display: 'flex',
};

const previewHint = {
  position: 'absolute',
  bottom: 14,
  left: 0,
  right: 0,
  textAlign: 'center',
  color: 'rgba(255,255,255,0.55)',
  fontSize: 12,
  pointerEvents: 'none',
};

const card = {
  width: 340,
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: 32,
  background: 'rgba(18, 22, 44, 0.9)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const charBtn = {
  flex: 1,
  padding: '10px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.8)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const charBtnActive = {
  background: '#5b8def',
  borderColor: '#5b8def',
  color: '#fff',
};

const tabBar = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 5,
};

const tab = {
  padding: '6px 11px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.65)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const tabActive = {
  background: '#5b8def',
  borderColor: '#5b8def',
  color: '#fff',
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

const badge = {
  padding: '6px 14px',
  borderRadius: 14,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.35)',
  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
};
