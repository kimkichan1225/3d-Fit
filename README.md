# 3d-fit

데스크탑 3D 동료 소통 앱.

- **client/** — Electron + React 19 + React Three Fiber 기반 데스크탑 앱
- **server/** — Railway 배포용 Socket.io + PostgreSQL 서버

## 개발

서버 (별도 터미널):
```
cd server
npm install
npm start
```

클라이언트:
```
cd client
npm install
npm start          # 브라우저(http://localhost:3000)에서 미리 보기
npm run electron   # Electron 셸로 실행
```

## 배포

- 서버: Railway에 `server/` 디렉터리 연결. `DATABASE_URL` 환경변수 설정.
- 클라이언트: `npm run build` 후 `electron-builder`로 패키징.
