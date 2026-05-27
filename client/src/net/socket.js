import { io } from 'socket.io-client';

// 개발 모드: localhost:3002, 배포: 환경변수 또는 빌드된 URL
const SERVER_URL =
  process.env.REACT_APP_SERVER_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://YOUR-RAILWAY-URL.up.railway.app'
    : 'http://localhost:3002');

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
    });
  }
  return socket;
}

export function connect() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export { SERVER_URL };
