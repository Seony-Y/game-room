# 🎲 Game Room

실시간 마피아 / 이미지 게임 방. ADMIN이 방을 만들고, 사용자는 방 코드로 입장합니다.

| 경로 | 설명 |
|---|---|
| `/admin` | ADMIN: 방 생성 |
| `/admin/:code` | ADMIN: 방 관리 (참가자, START, 결과 공유) |
| `/join`, `/join/:code` | 사용자 입장 / 게임 화면 |

## 구조

- `client/` — React + Vite + TypeScript → **Vercel**
- `server/` — Node + Express + Socket.IO (방 상태는 메모리) → **Railway**

## 로컬 실행

```bash
cd server && npm install && npm run dev      # http://localhost:3001
cd client && npm install && npm run dev      # http://localhost:5173
```

## 배포

### 1. Railway (server)
1. New Project → Deploy from GitHub repo → **Root Directory: `server`**
2. Variables: `CLIENT_ORIGIN=https://<vercel 도메인>`
3. Settings → Networking → Generate Domain → 주소 복사
4. 방 상태가 메모리에 있으므로 **인스턴스(replica)는 1개**로 유지

### 2. Vercel (client)
1. Import Project → **Root Directory: `client`** (Framework: Vite 자동 인식)
2. Environment Variables: `VITE_SERVER_URL=https://<railway 도메인>`
3. Deploy (`vercel.json`이 SPA 라우팅 처리)

> 서버가 재시작되면 진행 중인 방은 사라집니다.
