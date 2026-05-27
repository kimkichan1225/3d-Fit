import { useEffect, useState } from 'react';

const keyActionMap = {
  w: 'forward',
  s: 'backward',
  a: 'left',
  d: 'right',
};

// 채팅 입력 중에는 캐릭터 조작 입력을 무시
const isTypingInForm = () => {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
};

export const useKeyboardControls = () => {
  const [controls, setControls] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
    shift: false,
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isTypingInForm()) return;
      const key = e.key.toLowerCase();
      if (key === 'shift') setControls((c) => ({ ...c, shift: true }));
      const action = keyActionMap[key];
      if (action) setControls((c) => ({ ...c, [action]: true }));
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'shift') setControls((c) => ({ ...c, shift: false }));
      const action = keyActionMap[key];
      if (action) setControls((c) => ({ ...c, [action]: false }));
    };

    // 포커스가 input으로 빠지면 키 상태를 초기화 (안눌렸는데 눌린 채로 남는 문제 방지)
    const handleBlur = () =>
      setControls({ forward: false, backward: false, left: false, right: false, shift: false });

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return controls;
};
