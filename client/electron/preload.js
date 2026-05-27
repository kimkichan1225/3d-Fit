const { contextBridge } = require('electron');

// 향후 데스크탑 전용 기능(트레이, 자동 시작 등)을 노출할 자리
contextBridge.exposeInMainWorld('appBridge', {
  platform: process.platform,
  version: process.versions.electron,
});
