const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const VOTE_MS = Number(process.env.VOTE_MS) || 60 * 1000; // 이미지 게임 질문당 투표 시간
// 콤마로 구분된 허용 Origin 목록 (예: https://game-room.vercel.app,http://localhost:5173). 비우면 전체 허용
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOrigin = CLIENT_ORIGIN.length ? CLIENT_ORIGIN : '*';

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/', (req, res) => res.json({ ok: true, rooms: rooms.size }));
app.get('/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin } });

/** @type {Map<string, any>} */
const rooms = new Map();

const ROLE = { MAFIA: 'mafia', DOCTOR: 'doctor', POLICE: 'police', CITIZEN: 'citizen' };

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toInt(v, min = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= min ? n : NaN;
}

function cleanText(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

// 설정 검증. 성공 시 { settings }, 실패 시 { error }
function validateSettings(gameType, capacity, input) {
  if (!Number.isFinite(capacity) || capacity < 2 || capacity > 50) {
    return { error: '참가 인원은 2~50명이에요.' };
  }
  if (gameType === 'mafia') {
    const mafia = toInt(input.mafia, 1);
    const doctor = toInt(input.doctor);
    const police = toInt(input.police);
    if ([mafia, doctor, police].some(Number.isNaN)) {
      return { error: '역할 인원 수를 확인해주세요.' };
    }
    if (mafia + doctor + police > capacity) {
      return { error: '역할 수가 참가 인원보다 많아요.' };
    }
    if (mafia >= capacity - mafia) {
      return { error: '마피아는 나머지보다 적어야 해요.' };
    }
    const missions = Array.isArray(input.missions) ? input.missions.map((m) => cleanText(m)) : [];
    if (missions.length !== mafia || missions.some((m) => !m)) {
      return { error: `미션을 ${mafia}개 모두 입력해주세요.` };
    }
    return { settings: { mafia, doctor, police, missions } };
  }
  if (gameType === 'image') {
    const question = cleanText(input.question);
    if (!question) return { error: '질문을 입력해주세요.' };
    return { settings: { question } };
  }
  return { error: '게임 종류를 선택해주세요.' };
}

function playerList(room) {
  return [...room.players.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected, alive: p.alive }));
}

// 마피아 승패 자동 판정. 아직 결판이 안 났으면 null
//  citizen      : 마피아 전원 탈락
//  mafia        : 생존 마피아 >= 생존 시민팀 + 모든 미션 성공
//  mission-fail : 생존 마피아 >= 생존 시민팀 이지만 미션 미완료 → 시민 승리
function mafiaOutcome(room) {
  const players = [...room.players.values()];
  const mafias = players.filter((p) => p.role === ROLE.MAFIA);
  const aliveMafia = mafias.filter((p) => p.alive).length;
  const aliveOthers = players.filter((p) => p.alive && p.role !== ROLE.MAFIA).length;
  const missionsDone = mafias.filter((p) => p.missionSuccess).length;
  const base = { aliveMafia, aliveOthers, missionsDone, missionsTotal: mafias.length };
  if (aliveMafia === 0) return { ...base, type: 'citizen', winner: ROLE.CITIZEN };
  if (aliveMafia >= aliveOthers) {
    return missionsDone === mafias.length
      ? { ...base, type: 'mafia', winner: ROLE.MAFIA }
      : { ...base, type: 'mission-fail', winner: ROLE.CITIZEN };
  }
  return { ...base, type: null, winner: null };
}

function mafiaReveals(room) {
  return [...room.players.values()]
    .filter((p) => p.role !== ROLE.CITIZEN)
    .map((p) => ({
      name: p.name,
      role: p.role,
      alive: p.alive,
      ...(p.role === ROLE.MAFIA && { mission: p.mission, missionSuccess: p.missionSuccess }),
    }));
}

// 득표 순위 (공동 순위: 1,1,3 ...)
function imageResults(room) {
  const counts = new Map();
  for (const p of room.players.values()) counts.set(p.id, 0);
  for (const target of Object.values(room.image.votes)) {
    if (counts.has(target)) counts.set(target, counts.get(target) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([id, votes]) => ({ id, name: room.players.get(id).name, votes }))
    .sort((a, b) => b.votes - a.votes);
  return sorted.map((r) => ({ ...r, rank: 1 + sorted.filter((o) => o.votes > r.votes).length }));
}

// 사용자 공개용: 3위까지 (동률 포함, 0표 제외)
function topRanking(room) {
  return imageResults(room).filter((r) => r.votes > 0 && r.rank <= 3);
}

function adminState(room) {
  return {
    serverNow: Date.now(),
    code: room.code,
    gameType: room.gameType,
    capacity: room.capacity,
    settings: room.settings,
    status: room.status,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      role: p.role,
      mission: p.mission,
      alive: p.alive,
      missionSuccess: p.missionSuccess,
      votedFor: room.image?.votes[p.id] ?? null,
    })),
    mafia:
      room.gameType === 'mafia' && room.status === 'playing'
        ? { outcome: mafiaOutcome(room), resultShared: room.resultShared }
        : null,
    image: room.image && {
      round: room.image.round,
      question: room.image.question,
      votedCount: Object.keys(room.image.votes).length,
      endsAt: room.image.endsAt,
      durationMs: VOTE_MS,
      closed: imageClosed(room),
      revealed: room.image.revealed,
      results: imageResults(room),
    },
    history: room.history,
  };
}

function playerState(room, player) {
  const base = {
    serverNow: Date.now(),
    code: room.code,
    gameType: room.gameType,
    capacity: room.capacity,
    status: room.status,
    me: { id: player.id, name: player.name },
    players: playerList(room),
  };
  if (room.status === 'lobby') return base;
  if (room.status === 'ended') return { ...base, history: room.history };

  if (room.gameType === 'mafia') {
    base.role = player.role;
    base.alive = player.alive;
    if (player.role === ROLE.MAFIA) {
      // 미션은 본인 것만, 팀원은 이름만
      base.mission = player.mission;
      base.missionSuccess = player.missionSuccess;
      base.mafiaTeam = [...room.players.values()]
        .filter((p) => p.role === ROLE.MAFIA && p.id !== player.id)
        .map((p) => p.name);
    }
    const outcome = room.resultShared ? mafiaOutcome(room) : null;
    if (outcome?.type) {
      base.result = { type: outcome.type, winner: outcome.winner, reveals: mafiaReveals(room) };
    }
  } else {
    base.image = {
      round: room.image.round,
      question: room.image.question,
      myVote: room.image.votes[player.id] ?? null,
      votedCount: Object.keys(room.image.votes).length,
      endsAt: room.image.endsAt,
      durationMs: VOTE_MS,
      closed: imageClosed(room),
      revealed: room.image.revealed,
      ranking: room.image.revealed ? topRanking(room) : null,
    };
  }
  return base;
}

function broadcast(room) {
  room.updatedAt = Date.now();
  // 결과 공유 후 탈락 취소 등으로 승패가 다시 미정이 되면 공유 상태 해제
  if (room.resultShared && room.gameType === 'mafia' && !mafiaOutcome(room).type) room.resultShared = false;
  io.to(`admin:${room.code}`).emit('admin:state', adminState(room));
  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('player:state', playerState(room, p));
  }
}

function getAdminRoom(socket, cb) {
  const room = rooms.get(socket.data.adminCode);
  if (!room) {
    cb?.({ ok: false, error: '방 관리 권한이 없어요.' });
    return null;
  }
  return room;
}

// 투표 마감 여부 (시간 종료 또는 결과 공개)
function imageClosed(room) {
  return !!room.image && (room.image.revealed || Date.now() >= room.image.endsAt);
}

function clearImageTimer(room) {
  if (room.image?.timer) clearTimeout(room.image.timer);
}

function startImageRound(room, question) {
  clearImageTimer(room);
  const image = {
    round: (room.image?.round ?? 0) + 1,
    question,
    votes: {},
    revealed: false,
    endsAt: Date.now() + VOTE_MS,
    timer: null,
  };
  // 시간이 끝나면 마감 상태를 모두에게 알림 (결과 공개는 관리자가 진행)
  image.timer = setTimeout(() => {
    if (rooms.get(room.code) === room && room.image === image) broadcast(room);
  }, VOTE_MS + 50);
  room.image = image;
}

io.on('connection', (socket) => {
  // ───────────── ADMIN ─────────────
  socket.on('admin:create', (input = {}, cb) => {
    const gameType = input.gameType;
    const capacity = toInt(input.capacity, 2);
    const { settings, error } = validateSettings(gameType, capacity, input);
    if (error) return cb?.({ ok: false, error });

    const code = makeCode();
    const room = {
      code,
      adminToken: crypto.randomBytes(16).toString('hex'),
      gameType,
      capacity,
      settings,
      status: 'lobby',
      players: new Map(),
      image: null,
      resultShared: false,
      history: [], // 이미지 게임: 결과 공개된 질문별 1위 기록
      banned: new Set(), // 내보낸 기기 ID (스스로 나간 경우는 제외)
      updatedAt: Date.now(),
    };
    rooms.set(code, room);
    socket.data.adminCode = code;
    socket.join(`admin:${code}`);
    cb?.({ ok: true, code, adminToken: room.adminToken });
    broadcast(room);
  });

  socket.on('admin:join', ({ code, adminToken } = {}, cb) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.adminToken !== adminToken) {
      return cb?.({ ok: false, error: '방이 없거나 권한이 없어요.' });
    }
    socket.data.adminCode = room.code;
    socket.join(`admin:${room.code}`);
    cb?.({ ok: true });
    socket.emit('admin:state', adminState(room));
  });

  socket.on('admin:update', (input = {}, cb) => {
    const room = getAdminRoom(socket, cb);
    if (!room) return;
    if (room.status !== 'lobby') return cb?.({ ok: false, error: '진행 중엔 설정을 바꿀 수 없어요.' });
    const capacity = toInt(input.capacity ?? room.capacity, 2);
    if (capacity < room.players.size) {
      return cb?.({ ok: false, error: `이미 ${room.players.size}명이 입장했어요.` });
    }
    const { settings, error } = validateSettings(room.gameType, capacity, { ...room.settings, ...input });
    if (error) return cb?.({ ok: false, error });
    room.capacity = capacity;
    room.settings = settings;
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('admin:start', (_, cb) => {
    const room = getAdminRoom(socket, cb);
    if (!room) return;
    if (room.status !== 'lobby') return cb?.({ ok: false, error: '이미 시작된 게임이에요.' });
    const players = [...room.players.values()];
    if (players.length < 2) return cb?.({ ok: false, error: '2명 이상 입장해야 해요.' });

    if (room.gameType === 'mafia') {
      const { mafia, doctor, police, missions } = room.settings;
      if (players.length !== room.capacity) {
        return cb?.({ ok: false, error: `${room.capacity}명이 모두 입장해야 해요. (현재 ${players.length}명)` });
      }
      const roles = [
        ...Array(mafia).fill(ROLE.MAFIA),
        ...Array(doctor).fill(ROLE.DOCTOR),
        ...Array(police).fill(ROLE.POLICE),
      ];
      while (roles.length < players.length) roles.push(ROLE.CITIZEN);
      const shuffledRoles = shuffle(roles);
      const shuffledMissions = shuffle(missions);
      let missionIdx = 0;
      players.forEach((p, i) => {
        p.role = shuffledRoles[i];
        p.mission = p.role === ROLE.MAFIA ? shuffledMissions[missionIdx++] : null;
        p.alive = true;
        p.missionSuccess = false;
      });
      room.resultShared = false;
    } else {
      startImageRound(room, room.settings.question);
    }
    room.status = 'playing';
    cb?.({ ok: true });
    broadcast(room);
  });

  function getMafiaPlaying(socket, cb) {
    const room = getAdminRoom(socket, cb);
    if (!room) return null;
    if (room.gameType !== 'mafia' || room.status !== 'playing') {
      cb?.({ ok: false, error: '마피아 게임 중에만 가능해요.' });
      return null;
    }
    return room;
  }

  // 탈락 / 탈락 취소
  socket.on('admin:toggle-dead', ({ playerId } = {}, cb) => {
    const room = getMafiaPlaying(socket, cb);
    const p = room?.players.get(playerId);
    if (!room) return;
    if (!p) return cb?.({ ok: false, error: '없는 참가자예요.' });
    p.alive = !p.alive;
    cb?.({ ok: true });
    broadcast(room);
  });

  // 마피아 미션 성공 / 취소
  socket.on('admin:toggle-mission', ({ playerId } = {}, cb) => {
    const room = getMafiaPlaying(socket, cb);
    const p = room?.players.get(playerId);
    if (!room) return;
    if (!p || p.role !== ROLE.MAFIA) return cb?.({ ok: false, error: '마피아가 아니에요.' });
    p.missionSuccess = !p.missionSuccess;
    cb?.({ ok: true });
    broadcast(room);
  });

  // 마피아 결과 공유: 자동 판정 결과 + 시민 제외 역할 공개
  socket.on('admin:mafia-result', (_, cb) => {
    const room = getMafiaPlaying(socket, cb);
    if (!room) return;
    if (!mafiaOutcome(room).type) return cb?.({ ok: false, error: '아직 승패가 나지 않았어요.' });
    room.resultShared = true;
    cb?.({ ok: true });
    broadcast(room);
  });

  // 이미지 결과 공유: 3위까지 공개
  socket.on('admin:reveal', (_, cb) => {
    const room = getAdminRoom(socket, cb);
    if (!room) return;
    if (room.gameType !== 'image' || !room.image || room.status !== 'playing') {
      return cb?.({ ok: false, error: '진행 중인 질문이 없어요.' });
    }
    if (!room.image.revealed) {
      room.image.revealed = true;
      const winners = topRanking(room).filter((r) => r.rank === 1);
      room.history.push({
        round: room.image.round,
        question: room.image.question,
        winners: winners.map((r) => r.name),
        votes: winners[0]?.votes ?? 0,
      });
    }
    clearImageTimer(room);
    cb?.({ ok: true });
    broadcast(room);
  });

  // 이미지 게임 전체 종료: 마지막으로 종료 화면(질문별 1위)을 보내고 방을 삭제
  socket.on('admin:end-game', (_, cb) => {
    const room = getAdminRoom(socket, cb);
    if (!room) return;
    if (room.gameType !== 'image' || room.status !== 'playing') {
      return cb?.({ ok: false, error: '진행 중인 이미지 게임이 없어요.' });
    }
    clearImageTimer(room);
    room.status = 'ended';
    broadcast(room);
    rooms.delete(room.code);
    cb?.({ ok: true });
  });

  socket.on('admin:next-question', ({ question } = {}, cb) => {
    const room = getAdminRoom(socket, cb);
    if (!room) return;
    if (room.gameType !== 'image') return cb?.({ ok: false, error: '이미지 게임이 아니에요.' });
    if (room.status !== 'playing') return cb?.({ ok: false, error: '진행 중인 게임이 없어요.' });
    const q = cleanText(question);
    if (!q) return cb?.({ ok: false, error: '질문을 입력해주세요.' });
    room.settings.question = q;
    startImageRound(room, q);
    room.status = 'playing';
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('admin:reset', (_, cb) => {
    const room = getAdminRoom(socket, cb);
    if (!room) return;
    room.status = 'lobby';
    clearImageTimer(room);
    room.image = null;
    room.history = [];
    room.resultShared = false;
    for (const p of room.players.values()) {
      p.role = null;
      p.mission = null;
      p.alive = true;
      p.missionSuccess = false;
    }
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('admin:kick', ({ playerId } = {}, cb) => {
    const room = getAdminRoom(socket, cb);
    if (!room) return;
    const p = room.players.get(playerId);
    if (!p) return cb?.({ ok: false, error: '없는 참가자예요.' });
    if (p.socketId) io.to(p.socketId).emit('player:kicked');
    if (p.deviceId) room.banned.add(p.deviceId);
    room.players.delete(playerId);
    if (room.image) {
      delete room.image.votes[playerId];
      for (const [voter, target] of Object.entries(room.image.votes)) {
        if (target === playerId) delete room.image.votes[voter];
      }
    }
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('admin:close', (_, cb) => {
    const room = getAdminRoom(socket, cb);
    if (!room) return;
    for (const p of room.players.values()) {
      if (p.socketId) io.to(p.socketId).emit('player:closed');
    }
    io.to(`admin:${room.code}`).emit('admin:closed');
    clearImageTimer(room);
    rooms.delete(room.code);
    cb?.({ ok: true });
  });

  // ───────────── PLAYER ─────────────
  socket.on('player:join', ({ code, name, playerId, deviceId } = {}, cb) => {
    const room = rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return cb?.({ ok: false, error: '없는 방 코드예요.' });
    const device = cleanText(deviceId, 64);
    if (device && room.banned.has(device)) {
      return cb?.({ ok: false, error: '내보내진 방이라 입장할 수 없어요.' });
    }

    // 재접속 (새로고침 등)
    const existing = playerId && room.players.get(playerId);
    if (existing) {
      existing.socketId = socket.id;
      existing.connected = true;
      socket.data.room = room.code;
      socket.data.playerId = existing.id;
      cb?.({ ok: true, playerId: existing.id, code: room.code, name: existing.name });
      return broadcast(room);
    }

    const nickname = cleanText(name, 8);
    if (!nickname) return cb?.({ ok: false, error: '닉네임을 입력해주세요.' });
    if (room.status !== 'lobby') return cb?.({ ok: false, error: '이미 게임이 시작된 방이에요.' });
    if (room.players.size >= room.capacity) return cb?.({ ok: false, error: '방 인원이 가득 찼어요.' });
    if ([...room.players.values()].some((p) => p.name === nickname)) {
      return cb?.({ ok: false, error: '이미 사용 중인 닉네임이에요.' });
    }

    const player = {
      id: crypto.randomUUID(),
      name: nickname,
      socketId: socket.id,
      connected: true,
      role: null,
      mission: null,
      alive: true,
      missionSuccess: false,
      deviceId: device || null,
    };
    room.players.set(player.id, player);
    socket.data.room = room.code;
    socket.data.playerId = player.id;
    cb?.({ ok: true, playerId: player.id, code: room.code, name: player.name });
    broadcast(room);
  });

  socket.on('player:vote', ({ targetId } = {}, cb) => {
    const room = rooms.get(socket.data.room);
    const me = room?.players.get(socket.data.playerId);
    if (!room || !me || room.gameType !== 'image' || room.status !== 'playing' || !room.image) {
      return cb?.({ ok: false, error: '지금은 투표할 수 없어요.' });
    }
    if (room.image.revealed) return cb?.({ ok: false, error: '이미 결과가 공개됐어요.' });
    if (imageClosed(room)) return cb?.({ ok: false, error: '투표 시간이 끝났어요.' });
    if (!room.players.has(targetId)) return cb?.({ ok: false, error: '잘못된 선택이에요.' });
    room.image.votes[me.id] = targetId;
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('player:leave', () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    if (room.status === 'lobby') room.players.delete(socket.data.playerId);
    socket.data.room = null;
    broadcast(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room);
    const me = room?.players.get(socket.data.playerId);
    if (!me || me.socketId !== socket.id) return;
    me.connected = false;
    me.socketId = null;
    broadcast(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_TTL_MS) {
      clearImageTimer(room);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Game room server listening on :${PORT} (CORS: ${CLIENT_ORIGIN.join(', ') || '*'})`);
});
