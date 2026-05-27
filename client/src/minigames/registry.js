import { TetrisGame } from './TetrisGame';
import { OmokGame } from './OmokGame';
import { Game2048 } from './Game2048';

// 미니게임 등록표. 게임을 추가하려면 여기에 모듈을 등록한다.
// kind: '2d' | '3d', mode: 'single' | 'multi' | 'both'
export const MINIGAMES = {
  tetris: {
    id: 'tetris',
    title: '테트리스',
    kind: '2d',
    mode: 'both',
    component: TetrisGame,
  },
  omok: {
    id: 'omok',
    title: '오목',
    kind: '2d',
    mode: 'multi',
    component: OmokGame,
  },
  game2048: {
    id: 'game2048',
    title: '2048',
    kind: '2d',
    mode: 'single',
    component: Game2048,
  },
};
