/**
 * CONNECTLY - Modern Real-Time Messaging & Social Platform Server
 * Zero-dependency Node.js HTTP, REST API & RFC-6455 WebSocket Server
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const DB_FILE = path.join(DATA_DIR, 'connectly-db.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- PASSWORD & SECURITY HELPERS ---
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

// --- DATABASE PERSISTENCE ---
function getInitialDB() {
  const saltFaraz = 'salt_faraz_001';
  const saltAhmed = 'salt_ahmed_002';
  const saltSarah = 'salt_sarah_003';

  const userFaraz = {
    id: 'usr_faraz123',
    username: 'faraz123',
    full_name: 'Faraz Ahmed',
    email: 'faraz@connectly.app',
    password_salt: saltFaraz,
    password_hash: hashPassword('Password123!', saltFaraz).hash,
    profile_picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    bio: 'Product Designer & Tech Explorer 🚀 | Connectly Founder & Owner',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    last_seen: new Date().toISOString(),
    account_status: 'active',
    is_owner: true,
    role: 'owner'
  };

  const userAhmed = {
    id: 'usr_ahmed456',
    username: 'ahmed456',
    full_name: 'Ahmed Khan',
    email: 'ahmed@connectly.app',
    password_salt: saltAhmed,
    password_hash: hashPassword('Password123!', saltAhmed).hash,
    profile_picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    bio: 'Full Stack Engineer | Coffee lover ☕ | Building realtime apps',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    last_seen: new Date().toISOString(),
    account_status: 'active',
    is_test: true,
    is_demo: true
  };

  const userSarah = {
    id: 'usr_sarah789',
    username: 'sarah_dev',
    full_name: 'Sarah Connor',
    email: 'sarah@connectly.app',
    password_salt: saltSarah,
    password_hash: hashPassword('Password123!', saltSarah).hash,
    profile_picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    bio: 'UI/UX enthusiast & open-source advocate ✨',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    last_seen: new Date().toISOString(),
    account_status: 'active',
    is_test: true,
    is_demo: true
  };

  const convId1 = 'conv_faraz_ahmed';
  const convId2 = 'conv_faraz_sarah';

  const conversations = [
    {
      id: convId1,
      conversation_type: 'direct',
      members: ['usr_faraz123', 'usr_ahmed456'],
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      pinned: false
    },
    {
      id: convId2,
      conversation_type: 'direct',
      members: ['usr_faraz123', 'usr_sarah789'],
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      pinned: false
    }
  ];

  const messages = [
    {
      id: 'msg_001',
      conversation_id: convId1,
      sender_id: 'usr_ahmed456',
      message_type: 'text',
      message_content: 'Hey Faraz! Welcome to Connectly 🚀',
      media_url: null,
      reply_to_message_id: null,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      edited_at: null,
      deleted_at: null,
      reactions: { '👍': ['usr_faraz123'] },
      receipts: { usr_faraz123: { delivered_at: new Date().toISOString(), read_at: new Date().toISOString() } }
    },
    {
      id: 'msg_002',
      conversation_id: convId1,
      sender_id: 'usr_faraz123',
      message_type: 'text',
      message_content: 'Hey Ahmed! The UI looks super clean and snappy. Real-time messaging works like a charm! 💬',
      media_url: null,
      reply_to_message_id: 'msg_001',
      created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
      edited_at: null,
      deleted_at: null,
      reactions: { '❤️': ['usr_ahmed456'] },
      receipts: { usr_ahmed456: { delivered_at: new Date().toISOString(), read_at: new Date().toISOString() } }
    },
    {
      id: 'msg_003',
      conversation_id: convId1,
      sender_id: 'usr_ahmed456',
      message_type: 'text',
      message_content: 'Try testing camera capture, audio voice notes, stickers and chat lock with PIN! 🔒',
      media_url: null,
      reply_to_message_id: null,
      created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      edited_at: null,
      deleted_at: null,
      reactions: {},
      receipts: { usr_faraz123: { delivered_at: new Date().toISOString(), read_at: new Date().toISOString() } }
    },
    {
      id: 'msg_004',
      conversation_id: convId2,
      sender_id: 'usr_sarah789',
      message_type: 'text',
      message_content: 'Hi Faraz! Check out the new 24h stories feature when you have a moment ✨',
      media_url: null,
      reply_to_message_id: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      edited_at: null,
      deleted_at: null,
      reactions: {},
      receipts: { usr_faraz123: { delivered_at: new Date().toISOString() } }
    }
  ];

  const stories = [
    {
      id: 'sty_001',
      user_id: 'usr_ahmed456',
      media_url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80',
      story_type: 'image',
      caption: 'Coding Connectly backend late into the night 💻✨',
      privacy_type: 'everyone',
      created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      expires_at: new Date(Date.now() + 3600000 * 20).toISOString(),
      views: [
        { viewer_id: 'usr_faraz123', viewed_at: new Date(Date.now() - 3600000 * 2).toISOString() }
      ]
    },
    {
      id: 'sty_002',
      user_id: 'usr_sarah789',
      media_url: null,
      story_type: 'text',
      bg_color: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 50%, #EC4899 100%)',
      caption: 'Excited for the official Connectly launch today! 🚀 Welcome all new users!',
      privacy_type: 'everyone',
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      expires_at: new Date(Date.now() + 3600000 * 22).toISOString(),
      views: []
    }
  ];

  return {
    users: [userFaraz, userAhmed, userSarah],
    conversations,
    messages,
    stories,
    chat_locks: {}, // { `${userId}_${conversationId}`: pinHash }
    blocked_users: [], // { blocker_id, blocked_user_id, created_at }
    reports: [], // { reporter_id, reported_id, reason, created_at }
    user_settings: {}, // { userId: { theme, notifications, etc. } }
    follows: [
      { id: 'flw_init_1', follower_id: 'usr_ahmed456', following_id: 'usr_faraz123', created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'flw_init_2', follower_id: 'usr_sarah789', following_id: 'usr_faraz123', created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
      { id: 'flw_init_3', follower_id: 'usr_faraz123', following_id: 'usr_ahmed456', created_at: new Date(Date.now() - 86400000 * 2).toISOString() }
    ],
    story_likes: []
  };
}

let db = null;
function loadDB() {
  if (db) return db;
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(content);
    } else {
      db = getInitialDB();
      saveDB();
    }
  } catch (err) {
    console.error('Error loading DB, initializing new:', err);
    db = getInitialDB();
    saveDB();
  }
  if (!db.follows) {
    db.follows = [
      { id: 'flw_init_1', follower_id: 'usr_ahmed456', following_id: 'usr_faraz123', created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'flw_init_2', follower_id: 'usr_sarah789', following_id: 'usr_faraz123', created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
      { id: 'flw_init_3', follower_id: 'usr_faraz123', following_id: 'usr_ahmed456', created_at: new Date(Date.now() - 86400000 * 2).toISOString() }
    ];
    saveDB();
  }
  if (!db.story_likes) db.story_likes = [];
  return db;
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

// Active sessions: token -> { userId, expiresAt }
const sessions = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  sessions.set(token, { userId, expiresAt });
  return token;
}

function getUserIdFromReq(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.userId;
}

// Pre-populate some static sessions for seed users so test scripts or auto-login works
const FARAZ_TOKEN = 'tok_faraz_demo_session_12345';
const AHMED_TOKEN = 'tok_ahmed_demo_session_67890';
sessions.set(FARAZ_TOKEN, { userId: 'usr_faraz123', expiresAt: Date.now() + 365 * 86400000 });
sessions.set(AHMED_TOKEN, { userId: 'usr_ahmed456', expiresAt: Date.now() + 365 * 86400000 });

// --- REALTIME CONNECTIONS (WebSocket & SSE) ---
// userId -> Set of connection objects: { type: 'ws'|'sse', send(msg), socket }
const clients = new Map();

function registerClient(userId, conn) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(conn);
  broadcastPresence(userId, 'online');
}

function removeClient(userId, conn) {
  const userConns = clients.get(userId);
  if (userConns) {
    userConns.delete(conn);
    if (userConns.size === 0) {
      clients.delete(userId);
      broadcastPresence(userId, 'offline');
    }
  }
}

function sendToUser(userId, eventName, payload) {
  const userConns = clients.get(userId);
  if (!userConns) return;
  const data = JSON.stringify({ event: eventName, data: payload });
  for (const conn of userConns) {
    try {
      conn.send(data);
    } catch (e) {
      console.error('Error sending message to user:', userId, e);
    }
  }
}

function broadcastToUsers(userIds, eventName, payload) {
  for (const uid of userIds) {
    sendToUser(uid, eventName, payload);
  }
}

function broadcastPresence(userId, status) {
  const currentDb = loadDB();
  const user = currentDb.users.find(u => u.id === userId);
  if (user) {
    user.last_seen = new Date().toISOString();
    saveDB();
  }
  const payload = { userId, status, last_seen: new Date().toISOString() };
  for (const [uid, userConns] of clients.entries()) {
    if (uid !== userId) {
      const data = JSON.stringify({ event: 'presence_update', data: payload });
      for (const conn of userConns) conn.send(data);
    }
  }
}

// --- RFC-6455 WEBSOCKET PROTOCOL IMPLEMENTATION ---
function handleWebSocketUpgrade(req, socket, head) {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  const token = parsed.query.token;
  const session = sessions.get(token);
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  const userId = session.userId;

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`
  ];
  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

  function sendWsFrame(dataString) {
    const payload = Buffer.from(dataString, 'utf8');
    const length = payload.length;
    let header;

    if (length <= 125) {
      header = Buffer.from([0x81, length]);
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    socket.write(Buffer.concat([header, payload]));
  }

  const connObj = {
    type: 'ws',
    send: sendWsFrame,
    socket
  };

  registerClient(userId, connObj);

  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const isFinal = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) break;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) break;
        payloadLength = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (isMasked) {
        if (buffer.length < offset + 4) break;
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLength) break;

      const payload = buffer.slice(offset, offset + payloadLength);
      buffer = buffer.slice(offset + payloadLength);

      // Close frame
      if (opcode === 0x08) {
        socket.end();
        break;
      }
      // Ping frame
      if (opcode === 0x09) {
        // Pong
        const pong = Buffer.from([0x8a, 0x00]);
        socket.write(pong);
        continue;
      }

      // Unmask payload if masked
      if (isMasked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      // Text frame
      if (opcode === 0x01) {
        try {
          const rawText = payload.toString('utf8');
          const msg = JSON.parse(rawText);
          handleClientMessage(userId, msg);
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      }
    }
  });

  socket.on('close', () => {
    removeClient(userId, connObj);
  });

  socket.on('error', () => {
    removeClient(userId, connObj);
  });
}

function handleClientMessage(userId, msg) {
  const { event, data } = msg;
  const currentDb = loadDB();

  if (event === 'typing') {
    const { conversation_id, is_typing } = data;
    const conv = currentDb.conversations.find(c => c.id === conversation_id);
    if (conv && conv.members.includes(userId)) {
      const recipientIds = conv.members.filter(m => m !== userId);
      broadcastToUsers(recipientIds, 'user_typing', {
        conversation_id,
        user_id: userId,
        is_typing
      });
    }
  } else if (event === 'call_signal') {
    // WebRTC Real-Time Voice & Video Calling Signaling
    const targetUserId = data.target_user_id;
    if (targetUserId) {
      sendToUser(targetUserId, 'call_signal', {
        ...data,
        from_user_id: userId
      });
    }
  }
}

// --- HTTP REQUEST HELPERS ---
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

// --- HTTP SERVER & ROUTING ---
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
    });
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const currentDb = loadDB();

  try {
    // -------------------------------------------------------------
    // API: AUTHENTICATION
    // -------------------------------------------------------------
    // Direct ID Entry (No Password - Instant UI Access)
    if (pathname === '/api/auth/quick-join' && req.method === 'POST') {
      const { username, full_name, bio, profile_picture } = await readBody(req);
      const rawUsername = (username || '').trim();
      const cleanUsername = (rawUsername.startsWith('@') ? rawUsername.slice(1) : rawUsername)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');

      if (!cleanUsername || cleanUsername.length < 2) {
        return sendJSON(res, 400, { error: 'Please enter an ID name (at least 2 characters).' });
      }

      let user = currentDb.users.find(u => u.username.toLowerCase() === cleanUsername);

      if (!user) {
        const displayName = (full_name || '').trim() || (rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1));
        const defaultAvatar = profile_picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`;
        const { salt, hash } = hashPassword('quick_pass_' + cleanUsername);

        user = {
          id: 'usr_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
          full_name: displayName,
          email: `${cleanUsername}@connectly.app`,
          username: cleanUsername,
          password_salt: salt,
          password_hash: hash,
          profile_picture: defaultAvatar,
          bio: bio || 'Using Connectly to connect and communicate ✨',
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          account_status: 'active'
        };

        currentDb.users.push(user);
        saveDB();
      } else {
        user.last_seen = new Date().toISOString();
        if (full_name && full_name.trim()) user.full_name = full_name.trim();
        saveDB();
      }

      const token = createSession(user.id);
      const userSafe = { ...user };
      delete userSafe.password_hash;
      delete userSafe.password_salt;
      userSafe.followers_count = (currentDb.follows || []).filter(f => f.following_id === user.id).length;
      userSafe.following_count = (currentDb.follows || []).filter(f => f.follower_id === user.id).length;

      return sendJSON(res, 200, {
        message: 'Welcome to Connectly!',
        token,
        user: userSafe
      });
    }

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const { full_name, email, username, password, profile_picture, bio } = await readBody(req);
      if (!full_name || !email || !username || !password) {
        return sendJSON(res, 400, { error: 'Please provide full_name, email, username, and password.' });
      }

      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUsername.length < 3) {
        return sendJSON(res, 400, { error: 'Connectly ID must be at least 3 characters and alphanumeric.' });
      }

      const existingUser = currentDb.users.find(
        u => u.email.toLowerCase() === email.trim().toLowerCase() || u.username.toLowerCase() === cleanUsername
      );
      if (existingUser) {
        if (existingUser.username.toLowerCase() === cleanUsername) {
          return sendJSON(res, 409, { error: 'Connectly ID is already taken. Please choose another.' });
        }
        return sendJSON(res, 409, { error: 'Email address is already registered.' });
      }

      const { salt, hash } = hashPassword(password);
      const newUser = {
        id: 'usr_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        username: cleanUsername,
        password_salt: salt,
        password_hash: hash,
        profile_picture: profile_picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`,
        bio: bio || 'Hey there! I am using Connectly 🚀',
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        account_status: 'active'
      };

      currentDb.users.push(newUser);
      saveDB();

      const token = createSession(newUser.id);
      const userSafe = { ...newUser };
      delete userSafe.password_hash;
      delete userSafe.password_salt;

      return sendJSON(res, 201, {
        message: 'Account created successfully!',
        token,
        user: userSafe
      });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const { identifier, email, password } = await readBody(req);
      const loginId = (identifier || email || '').trim().toLowerCase();

      if (!loginId || !password) {
        return sendJSON(res, 400, { error: 'Email/Connectly ID and password are required.' });
      }

      const user = currentDb.users.find(
        u => u.email.toLowerCase() === loginId || u.username.toLowerCase() === loginId
      );

      if (!user) {
        return sendJSON(res, 401, { error: 'Invalid credentials. User not found.' });
      }

      if (!verifyPassword(password, user.password_salt, user.password_hash)) {
        return sendJSON(res, 401, { error: 'Invalid credentials. Incorrect password.' });
      }

      user.last_seen = new Date().toISOString();
      saveDB();

      const token = createSession(user.id);
      const userSafe = { ...user };
      delete userSafe.password_hash;
      delete userSafe.password_salt;

      return sendJSON(res, 200, {
        message: 'Login successful!',
        token,
        user: userSafe
      });
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const user = currentDb.users.find(u => u.id === userId);
      if (!user) return sendJSON(res, 404, { error: 'User not found.' });

      const userSafe = { ...user };
      delete userSafe.password_hash;
      delete userSafe.password_salt;
      userSafe.followers_count = (currentDb.follows || []).filter(f => f.following_id === userId).length;
      userSafe.following_count = (currentDb.follows || []).filter(f => f.follower_id === userId).length;
      return sendJSON(res, 200, { user: userSafe });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        sessions.delete(token);
      }
      return sendJSON(res, 200, { message: 'Logged out successfully.' });
    }

    // Server-Sent Events (SSE) Fallback endpoint for Real-Time
    if (pathname === '/api/events' && req.method === 'GET') {
      const token = parsedUrl.query.token;
      const session = sessions.get(token);
      if (!session) {
        return sendJSON(res, 401, { error: 'Unauthorized' });
      }
      const userId = session.userId;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');

      const sseConn = {
        type: 'sse',
        send: (dataString) => res.write(`data: ${dataString}\n\n`)
      };
      registerClient(userId, sseConn);

      req.on('close', () => {
        removeClient(userId, sseConn);
      });
      return;
    }

    // -------------------------------------------------------------
    // API: USERS & SEARCH (PRD Section 5 & 8)
    // -------------------------------------------------------------
    if (pathname === '/api/users/search' && req.method === 'GET') {
      const currentUserId = getUserIdFromReq(req);
      const currentUser = currentDb.users.find(u => u.id === currentUserId);
      const isOwner = currentUser && (currentUser.is_owner || currentUser.username === 'faraz123');
      const rawQuery = (parsedUrl.query.q || '').trim();
      const query = rawQuery.toLowerCase();
      const cleanQuery = query.startsWith('@') ? query.slice(1).trim() : query;

      // Filter users: all real registered users are always visible.
      // If someone searches for an ID, allow finding the user so they can chat.
      const isVisibleUser = (u) => {
        if (u.id === currentUserId) return false;
        if (!isOwner && (u.is_test || u.is_demo)) {
          if (cleanQuery && (u.username.toLowerCase() === cleanQuery || u.username.toLowerCase().includes(cleanQuery))) {
            return true;
          }
          return false;
        }
        return true;
      };

      let results;
      if (!cleanQuery) {
        // Return suggested / active registered users
        results = currentDb.users.filter(isVisibleUser).slice(0, 15);
      } else {
        // Filter by Connectly ID (username) or Full Name or Email
        results = currentDb.users.filter(u => {
          if (!isVisibleUser(u)) return false;
          return u.username.toLowerCase().includes(cleanQuery) ||
                 u.full_name.toLowerCase().includes(cleanQuery) ||
                 (u.email && u.email.toLowerCase().includes(cleanQuery));
        });
      }

      const mapped = results.map(u => ({
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        profile_picture: u.profile_picture,
        bio: u.bio,
        last_seen: u.last_seen,
        is_owner: Boolean(u.is_owner),
        is_online: clients.has(u.id),
        followers_count: (currentDb.follows || []).filter(f => f.following_id === u.id).length,
        is_following: currentUserId ? (currentDb.follows || []).some(f => f.follower_id === currentUserId && f.following_id === u.id) : false
      }));

      return sendJSON(res, 200, { users: mapped });
    }

    if (pathname === '/api/users/profile' && req.method === 'PATCH') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const user = currentDb.users.find(u => u.id === userId);
      if (!user) return sendJSON(res, 404, { error: 'User not found.' });

      const { full_name, bio, profile_picture } = await readBody(req);
      if (full_name) user.full_name = full_name.trim();
      if (bio !== undefined) user.bio = bio.trim();
      if (profile_picture) user.profile_picture = profile_picture;
      user.updated_at = new Date().toISOString();
      saveDB();

      const userSafe = { ...user };
      delete userSafe.password_hash;
      delete userSafe.password_salt;
      userSafe.followers_count = (currentDb.follows || []).filter(f => f.following_id === userId).length;
      userSafe.following_count = (currentDb.follows || []).filter(f => f.follower_id === userId).length;
      return sendJSON(res, 200, { user: userSafe });
    }

    // -------------------------------------------------------------
    // API: SOCIAL PROFILES & FOLLOW SYSTEM
    // -------------------------------------------------------------
    // Get full user profile by ID or username
    const userProfileMatch = pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
    if (userProfileMatch && req.method === 'GET') {
      const currentUserId = getUserIdFromReq(req);
      const targetId = userProfileMatch[1];
      const targetUser = currentDb.users.find(u => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
      if (!targetUser) return sendJSON(res, 404, { error: 'User not found.' });

      const followersCount = (currentDb.follows || []).filter(f => f.following_id === targetUser.id).length;
      const followingCount = (currentDb.follows || []).filter(f => f.follower_id === targetUser.id).length;
      const isFollowing = currentUserId ? (currentDb.follows || []).some(f => f.follower_id === currentUserId && f.following_id === targetUser.id) : false;

      return sendJSON(res, 200, {
        user: {
          id: targetUser.id,
          username: targetUser.username,
          full_name: targetUser.full_name,
          profile_picture: targetUser.profile_picture,
          bio: targetUser.bio,
          created_at: targetUser.created_at,
          last_seen: targetUser.last_seen,
          is_owner: Boolean(targetUser.is_owner),
          is_online: clients.has(targetUser.id)
        },
        followers_count: followersCount,
        following_count: followingCount,
        is_following: isFollowing
      });
    }

    // Follow or unfollow a user
    const userFollowMatch = pathname.match(/^\/api\/users\/([^/]+)\/follow$/);
    if (userFollowMatch && req.method === 'POST') {
      const currentUserId = getUserIdFromReq(req);
      if (!currentUserId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const targetId = userFollowMatch[1];
      const targetUser = currentDb.users.find(u => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
      if (!targetUser) return sendJSON(res, 404, { error: 'User not found.' });
      if (targetUser.id === currentUserId) return sendJSON(res, 400, { error: 'Cannot follow yourself.' });

      if (!currentDb.follows) currentDb.follows = [];
      const existingIdx = currentDb.follows.findIndex(f => f.follower_id === currentUserId && f.following_id === targetUser.id);
      let isFollowing = false;

      if (existingIdx !== -1) {
        currentDb.follows.splice(existingIdx, 1);
        isFollowing = false;
      } else {
        currentDb.follows.push({
          id: 'flw_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
          follower_id: currentUserId,
          following_id: targetUser.id,
          created_at: new Date().toISOString()
        });
        isFollowing = true;
      }
      saveDB();

      const followersCount = currentDb.follows.filter(f => f.following_id === targetUser.id).length;
      const followingCount = currentDb.follows.filter(f => f.follower_id === targetUser.id).length;

      sendToUser(targetUser.id, 'follow_updated', {
        user_id: currentUserId,
        target_user_id: targetUser.id,
        is_following: isFollowing,
        followers_count: followersCount
      });

      return sendJSON(res, 200, {
        is_following: isFollowing,
        followers_count: followersCount,
        following_count: followingCount
      });
    }

    // Get followers list for a user
    const userFollowersMatch = pathname.match(/^\/api\/users\/([^/]+)\/followers$/);
    if (userFollowersMatch && req.method === 'GET') {
      const currentUserId = getUserIdFromReq(req);
      const targetId = userFollowersMatch[1];
      const targetUser = currentDb.users.find(u => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
      if (!targetUser) return sendJSON(res, 404, { error: 'User not found.' });

      const records = (currentDb.follows || []).filter(f => f.following_id === targetUser.id);
      const followers = records.map(f => {
        const u = currentDb.users.find(user => user.id === f.follower_id);
        if (!u) return null;
        const isFollowing = currentUserId ? (currentDb.follows || []).some(x => x.follower_id === currentUserId && x.following_id === u.id) : false;
        return {
          id: u.id,
          username: u.username,
          full_name: u.full_name,
          profile_picture: u.profile_picture,
          bio: u.bio,
          is_following: isFollowing,
          is_online: clients.has(u.id)
        };
      }).filter(Boolean);

      return sendJSON(res, 200, { followers });
    }

    // Get following list for a user
    const userFollowingMatch = pathname.match(/^\/api\/users\/([^/]+)\/following$/);
    if (userFollowingMatch && req.method === 'GET') {
      const currentUserId = getUserIdFromReq(req);
      const targetId = userFollowingMatch[1];
      const targetUser = currentDb.users.find(u => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
      if (!targetUser) return sendJSON(res, 404, { error: 'User not found.' });

      const records = (currentDb.follows || []).filter(f => f.follower_id === targetUser.id);
      const following = records.map(f => {
        const u = currentDb.users.find(user => user.id === f.following_id);
        if (!u) return null;
        const isFollowing = currentUserId ? (currentDb.follows || []).some(x => x.follower_id === currentUserId && x.following_id === u.id) : false;
        return {
          id: u.id,
          username: u.username,
          full_name: u.full_name,
          profile_picture: u.profile_picture,
          bio: u.bio,
          is_following: isFollowing,
          is_online: clients.has(u.id)
        };
      }).filter(Boolean);

      return sendJSON(res, 200, { following });
    }

    // -------------------------------------------------------------
    // API: CONVERSATIONS (PRD Section 4 & 6)
    // -------------------------------------------------------------
    if (pathname === '/api/conversations' && req.method === 'GET') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const userConvs = currentDb.conversations.filter(c => c.members.includes(userId));

      const enriched = userConvs.map(conv => {
        const otherUserId = conv.members.find(m => m !== userId);
        const otherUser = currentDb.users.find(u => u.id === otherUserId) || {
          id: otherUserId,
          full_name: 'Unknown User',
          username: 'unknown',
          profile_picture: ''
        };

        // Last message
        const convMessages = currentDb.messages.filter(m => m.conversation_id === conv.id && !m.deleted_at);
        const lastMessage = convMessages.length > 0 ? convMessages[convMessages.length - 1] : null;

        // Unread count
        const unreadCount = convMessages.filter(
          m => m.sender_id !== userId && (!m.receipts || !m.receipts[userId] || !m.receipts[userId].read_at)
        ).length;

        // Check if locked
        const lockKey = `${userId}_${conv.id}`;
        const isLocked = Boolean(currentDb.chat_locks && currentDb.chat_locks[lockKey]);

        return {
          id: conv.id,
          conversation_type: conv.conversation_type,
          recipient: {
            id: otherUser.id,
            username: otherUser.username,
            full_name: otherUser.full_name,
            profile_picture: otherUser.profile_picture,
            last_seen: otherUser.last_seen,
            is_online: clients.has(otherUser.id)
          },
          last_message: lastMessage,
          unread_count: unreadCount,
          is_locked: isLocked,
          created_at: conv.created_at,
          updated_at: conv.updated_at
        };
      });

      // Sort by latest message or updated_at
      enriched.sort((a, b) => {
        const timeA = a.last_message ? new Date(a.last_message.created_at).getTime() : new Date(a.updated_at).getTime();
        const timeB = b.last_message ? new Date(b.last_message.created_at).getTime() : new Date(b.updated_at).getTime();
        return timeB - timeA;
      });

      return sendJSON(res, 200, { conversations: enriched });
    }

    if (pathname === '/api/conversations' && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const { recipient_id, recipient_username } = await readBody(req);
      let targetUser = null;

      if (recipient_id) {
        targetUser = currentDb.users.find(u => u.id === recipient_id);
      } else if (recipient_username) {
        targetUser = currentDb.users.find(u => u.username.toLowerCase() === recipient_username.trim().toLowerCase());
      }

      if (!targetUser) return sendJSON(res, 404, { error: 'Recipient user not found.' });
      if (targetUser.id === userId) return sendJSON(res, 400, { error: 'Cannot create conversation with yourself.' });

      // Check if conversation already exists
      let conv = currentDb.conversations.find(
        c => c.members.length === 2 && c.members.includes(userId) && c.members.includes(targetUser.id)
      );

      if (!conv) {
        conv = {
          id: 'conv_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
          conversation_type: 'direct',
          members: [userId, targetUser.id],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pinned: false
        };
        currentDb.conversations.push(conv);
        saveDB();

        // Notify recipient if connected
        sendToUser(targetUser.id, 'conversation_created', { conversation: conv });
      }

      return sendJSON(res, 200, {
        conversation: {
          id: conv.id,
          recipient: {
            id: targetUser.id,
            username: targetUser.username,
            full_name: targetUser.full_name,
            profile_picture: targetUser.profile_picture,
            bio: targetUser.bio,
            last_seen: targetUser.last_seen,
            is_online: clients.has(targetUser.id)
          }
        }
      });
    }

    // -------------------------------------------------------------
    // API: MESSAGES (PRD Section 6)
    // -------------------------------------------------------------
    const convMsgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (convMsgMatch && req.method === 'GET') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const convId = convMsgMatch[1];
      const conv = currentDb.conversations.find(c => c.id === convId);
      if (!conv || !conv.members.includes(userId)) {
        return sendJSON(res, 403, { error: 'Access denied.' });
      }

      // Check chat lock
      const lockKey = `${userId}_${convId}`;
      if (currentDb.chat_locks && currentDb.chat_locks[lockKey]) {
        const pinHeader = req.headers['x-chat-pin'];
        if (!pinHeader || hashPin(pinHeader) !== currentDb.chat_locks[lockKey]) {
          return sendJSON(res, 423, { error: 'Chat is locked. PIN required.', is_locked: true });
        }
      }

      // Mark unread messages as read
      let updatedReceipts = false;
      const msgs = currentDb.messages.filter(m => m.conversation_id === convId);
      for (const m of msgs) {
        if (m.sender_id !== userId) {
          if (!m.receipts) m.receipts = {};
          if (!m.receipts[userId] || !m.receipts[userId].read_at) {
            m.receipts[userId] = {
              delivered_at: m.receipts[userId]?.delivered_at || new Date().toISOString(),
              read_at: new Date().toISOString()
            };
            updatedReceipts = true;
          }
        }
      }

      if (updatedReceipts) {
        saveDB();
        const otherUserId = conv.members.find(m => m !== userId);
        sendToUser(otherUserId, 'messages_read', { conversation_id: convId, reader_id: userId });
      }

      return sendJSON(res, 200, { messages: msgs });
    }

    if (pathname === '/api/messages' && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const {
        conversation_id,
        message_type,
        message_content,
        media_url,
        reply_to_message_id,
        file_name,
        file_size
      } = await readBody(req);

      if (!conversation_id) return sendJSON(res, 400, { error: 'conversation_id is required.' });

      const conv = currentDb.conversations.find(c => c.id === conversation_id);
      if (!conv || !conv.members.includes(userId)) {
        return sendJSON(res, 403, { error: 'Access denied.' });
      }

      const otherUserId = conv.members.find(m => m !== userId);
      const isRecipientOnline = clients.has(otherUserId);

      const newMsg = {
        id: 'msg_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        conversation_id,
        sender_id: userId,
        message_type: message_type || 'text', // text, image, video, audio, file, sticker
        message_content: message_content || '',
        media_url: media_url || null,
        file_name: file_name || null,
        file_size: file_size || null,
        reply_to_message_id: reply_to_message_id || null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reactions: {},
        receipts: {
          [otherUserId]: {
            delivered_at: isRecipientOnline ? new Date().toISOString() : null,
            read_at: null
          }
        }
      };

      currentDb.messages.push(newMsg);
      conv.updated_at = new Date().toISOString();
      saveDB();

      // Real-time broadcast
      broadcastToUsers(conv.members, 'new_message', { message: newMsg });

      return sendJSON(res, 201, { message: newMsg });
    }

    // Message reactions
    const reactMatch = pathname.match(/^\/api\/messages\/([^/]+)\/react$/);
    if (reactMatch && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const msgId = reactMatch[1];
      const { emoji } = await readBody(req);
      const msg = currentDb.messages.find(m => m.id === msgId);
      if (!msg) return sendJSON(res, 404, { error: 'Message not found.' });

      const conv = currentDb.conversations.find(c => c.id === msg.conversation_id);
      if (!conv || !conv.members.includes(userId)) return sendJSON(res, 403, { error: 'Access denied.' });

      if (!msg.reactions) msg.reactions = {};

      // Toggle emoji reaction
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      const index = msg.reactions[emoji].indexOf(userId);
      if (index > -1) {
        msg.reactions[emoji].splice(index, 1);
        if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
      } else {
        msg.reactions[emoji].push(userId);
      }

      saveDB();
      broadcastToUsers(conv.members, 'message_updated', { message: msg });
      return sendJSON(res, 200, { reactions: msg.reactions });
    }

    // Edit message
    const msgEditMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (msgEditMatch && req.method === 'PATCH') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const msgId = msgEditMatch[1];
      const { message_content } = await readBody(req);
      const msg = currentDb.messages.find(m => m.id === msgId);
      if (!msg) return sendJSON(res, 404, { error: 'Message not found.' });
      if (msg.sender_id !== userId) return sendJSON(res, 403, { error: 'You can only edit your own messages.' });

      msg.message_content = message_content;
      msg.edited_at = new Date().toISOString();
      saveDB();

      const conv = currentDb.conversations.find(c => c.id === msg.conversation_id);
      if (conv) broadcastToUsers(conv.members, 'message_updated', { message: msg });

      return sendJSON(res, 200, { message: msg });
    }

    // Delete message
    if (msgEditMatch && req.method === 'DELETE') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const msgId = msgEditMatch[1];
      const msg = currentDb.messages.find(m => m.id === msgId);
      if (!msg) return sendJSON(res, 404, { error: 'Message not found.' });
      if (msg.sender_id !== userId) return sendJSON(res, 403, { error: 'You can only delete your own messages.' });

      msg.deleted_at = new Date().toISOString();
      msg.message_content = 'This message was deleted';
      msg.media_url = null;
      saveDB();

      const conv = currentDb.conversations.find(c => c.id === msg.conversation_id);
      if (conv) broadcastToUsers(conv.members, 'message_deleted', { message_id: msgId, message: msg });

      return sendJSON(res, 200, { message: 'Message deleted.' });
    }

    // -------------------------------------------------------------
    // API: STORIES & STATUS (PRD Section 9)
    // -------------------------------------------------------------
    if (pathname === '/api/stories' && req.method === 'GET') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const currentUser = currentDb.users.find(u => u.id === userId);
      const isOwner = currentUser && (currentUser.is_owner || currentUser.username === 'faraz123');

      // Expire old stories (> 24h)
      const now = new Date().getTime();
      let activeStories = currentDb.stories.filter(s => new Date(s.expires_at).getTime() > now);

      // If not owner, filter out stories created by testing personas unless they belong to current user
      if (!isOwner) {
        const testUserIds = new Set(currentDb.users.filter(u => u.is_test || u.is_demo).map(u => u.id));
        activeStories = activeStories.filter(s => !testUserIds.has(s.user_id) || s.user_id === userId);
      }

      // Group stories by user
      const grouped = {};
      for (const story of activeStories) {
        if (!grouped[story.user_id]) {
          const user = currentDb.users.find(u => u.id === story.user_id) || {};
          grouped[story.user_id] = {
            user: {
              id: user.id,
              username: user.username,
              full_name: user.full_name,
              profile_picture: user.profile_picture
            },
            stories: []
          };
        }
        const hasLiked = (story.likes || []).some(l => (typeof l === 'string' ? l : l.user_id) === userId);
        grouped[story.user_id].stories.push({
          ...story,
          views: story.views || [],
          views_count: (story.views || []).length,
          likes: story.likes || [],
          likes_count: (story.likes || []).length,
          has_liked: hasLiked
        });
      }

      return sendJSON(res, 200, {
        story_groups: Object.values(grouped),
        current_user_id: userId
      });
    }

    if (pathname === '/api/stories' && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const { media_url, story_type, caption, privacy_type, bg_color } = await readBody(req);

      const newStory = {
        id: 'sty_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        user_id: userId,
        media_url: media_url || null,
        story_type: story_type || 'image', // text, image, video
        bg_color: bg_color || null,
        caption: caption || '',
        privacy_type: privacy_type || 'everyone',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        views: [],
        likes: []
      };

      currentDb.stories.push(newStory);
      saveDB();

      // Broadcast story update
      for (const [uid] of clients.entries()) {
        sendToUser(uid, 'new_story', { story: newStory });
      }

      return sendJSON(res, 201, { story: newStory });
    }

    // View story
    const storyViewMatch = pathname.match(/^\/api\/stories\/([^/]+)\/view$/);
    if (storyViewMatch && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const storyId = storyViewMatch[1];
      const story = currentDb.stories.find(s => s.id === storyId);
      if (!story) return sendJSON(res, 404, { error: 'Story not found.' });

      if (story.user_id !== userId) {
        if (!story.views) story.views = [];
        const existingView = story.views.find(v => v.viewer_id === userId);
        if (!existingView) {
          const viewerUser = currentDb.users.find(u => u.id === userId);
          story.views.push({
            viewer_id: userId,
            viewer_name: viewerUser ? viewerUser.full_name : 'Connectly User',
            viewer_username: viewerUser ? viewerUser.username : 'user',
            viewer_avatar: viewerUser ? viewerUser.profile_picture : '',
            viewed_at: new Date().toISOString()
          });
          saveDB();
          sendToUser(story.user_id, 'story_viewed', {
            story_id: storyId,
            viewer_id: userId,
            views_count: story.views.length
          });
        }
      }

      return sendJSON(res, 200, {
        views_count: story.views ? story.views.length : 0,
        views: story.views || []
      });
    }

    // Like / Unlike story
    const storyLikeMatch = pathname.match(/^\/api\/stories\/([^/]+)\/like$/);
    if (storyLikeMatch && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const storyId = storyLikeMatch[1];
      const story = currentDb.stories.find(s => s.id === storyId);
      if (!story) return sendJSON(res, 404, { error: 'Story not found.' });

      if (!story.likes) story.likes = [];
      const existingIdx = story.likes.findIndex(l => (typeof l === 'string' ? l : l.user_id) === userId);
      let liked = false;
      const currentUser = currentDb.users.find(u => u.id === userId);

      if (existingIdx !== -1) {
        story.likes.splice(existingIdx, 1);
        liked = false;
      } else {
        story.likes.push({
          user_id: userId,
          user_name: currentUser ? currentUser.full_name : 'User',
          user_username: currentUser ? currentUser.username : 'user',
          user_avatar: currentUser ? currentUser.profile_picture : '',
          created_at: new Date().toISOString()
        });
        liked = true;
      }
      saveDB();

      sendToUser(story.user_id, 'story_liked', {
        story_id: storyId,
        user_id: userId,
        liked,
        likes_count: story.likes.length
      });

      return sendJSON(res, 200, {
        liked,
        likes_count: story.likes.length,
        likes: story.likes
      });
    }

    // Delete story
    const storyDelMatch = pathname.match(/^\/api\/stories\/([^/]+)$/);
    if (storyDelMatch && req.method === 'DELETE') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const storyId = storyDelMatch[1];
      const storyIndex = currentDb.stories.findIndex(s => s.id === storyId);
      if (storyIndex === -1) return sendJSON(res, 404, { error: 'Story not found.' });

      if (currentDb.stories[storyIndex].user_id !== userId) {
        return sendJSON(res, 403, { error: 'Can only delete own stories.' });
      }

      currentDb.stories.splice(storyIndex, 1);
      saveDB();

      return sendJSON(res, 200, { message: 'Story deleted.' });
    }

    // -------------------------------------------------------------
    // API: CHAT LOCK & SECURITY (PRD Section 10)
    // -------------------------------------------------------------
    const lockMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/lock$/);
    if (lockMatch && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const convId = lockMatch[1];
      const { pin } = await readBody(req);
      if (!pin || String(pin).length < 4) {
        return sendJSON(res, 400, { error: 'PIN must be at least 4 digits.' });
      }

      if (!currentDb.chat_locks) currentDb.chat_locks = {};
      const lockKey = `${userId}_${convId}`;
      currentDb.chat_locks[lockKey] = hashPin(pin);
      saveDB();

      return sendJSON(res, 200, { message: 'Chat locked successfully.' });
    }

    const unlockMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/unlock$/);
    if (unlockMatch && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const convId = unlockMatch[1];
      const { pin, disable } = await readBody(req);

      const lockKey = `${userId}_${convId}`;
      const storedHash = currentDb.chat_locks ? currentDb.chat_locks[lockKey] : null;

      if (!storedHash) {
        return sendJSON(res, 200, { message: 'Chat is not locked.' });
      }

      if (hashPin(pin) !== storedHash) {
        return sendJSON(res, 401, { error: 'Incorrect PIN.' });
      }

      if (disable) {
        delete currentDb.chat_locks[lockKey];
        saveDB();
        return sendJSON(res, 200, { message: 'Chat Lock disabled.' });
      }

      return sendJSON(res, 200, { message: 'PIN verified successfully.' });
    }

    // Block & Report
    const blockMatch = pathname.match(/^\/api\/users\/([^/]+)\/block$/);
    if (blockMatch && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const targetId = blockMatch[1];
      if (!currentDb.blocked_users) currentDb.blocked_users = [];
      const existing = currentDb.blocked_users.find(b => b.blocker_id === userId && b.blocked_user_id === targetId);
      if (!existing) {
        currentDb.blocked_users.push({ blocker_id: userId, blocked_user_id: targetId, created_at: new Date().toISOString() });
        saveDB();
      }
      return sendJSON(res, 200, { message: 'User blocked.' });
    }

    const reportMatch = pathname.match(/^\/api\/users\/([^/]+)\/report$/);
    if (reportMatch && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const targetId = reportMatch[1];
      const { reason } = await readBody(req);
      if (!currentDb.reports) currentDb.reports = [];
      currentDb.reports.push({
        reporter_id: userId,
        reported_id: targetId,
        reason: reason || 'Inappropriate content',
        created_at: new Date().toISOString()
      });
      saveDB();
      return sendJSON(res, 200, { message: 'Report submitted for review.' });
    }

    // -------------------------------------------------------------
    // API: MEDIA UPLOAD (PRD Section 7)
    // -------------------------------------------------------------
    if (pathname === '/api/upload' && req.method === 'POST') {
      const userId = getUserIdFromReq(req);
      if (!userId) return sendJSON(res, 401, { error: 'Unauthorized.' });

      const { data_url, filename, file_type } = await readBody(req);
      if (!data_url) return sendJSON(res, 400, { error: 'data_url is required.' });

      // Parse data URL
      const matches = data_url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return sendJSON(res, 400, { error: 'Invalid data URL format.' });
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      let ext = '.bin';
      if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) ext = '.jpg';
      else if (mimeType.includes('image/png')) ext = '.png';
      else if (mimeType.includes('image/webp')) ext = '.webp';
      else if (mimeType.includes('image/gif')) ext = '.gif';
      else if (mimeType.includes('video/mp4')) ext = '.mp4';
      else if (mimeType.includes('video/webm')) ext = '.webm';
      else if (mimeType.includes('audio/webm')) ext = '.webm';
      else if (mimeType.includes('audio/mp3') || mimeType.includes('audio/mpeg')) ext = '.mp3';
      else if (mimeType.includes('audio/wav')) ext = '.wav';
      else if (mimeType.includes('application/pdf')) ext = '.pdf';

      const safeName = (filename ? filename.replace(/[^a-zA-Z0-9.-]/g, '_') : 'file') + '_' + Date.now() + ext;
      const filePath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(filePath, buffer);

      const publicUrl = '/uploads/' + safeName;
      return sendJSON(res, 201, {
        url: publicUrl,
        file_name: filename || safeName,
        file_size: buffer.length,
        mime_type: mimeType
      });
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING
    // -------------------------------------------------------------
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);

    // Support clean uploads routing
    if (pathname.startsWith('/uploads/')) {
      filePath = path.join(__dirname, 'public', pathname);
    }

    // Security check to avoid directory traversal
    const relative = path.relative(path.join(__dirname, 'public'), filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for SPA client-side routing
        const indexPath = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        }
        return;
      }

      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.pdf': 'application/pdf'
      };

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });

  } catch (error) {
    console.error('API Error:', error);
    sendJSON(res, 500, { error: 'Internal Server Error' });
  }
});

// Upgrade to WebSocket
server.on('upgrade', handleWebSocketUpgrade);

// Initialize DB on boot
loadDB();

server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let lanIp = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
  }

  console.log(`=======================================================`);
  console.log(`🚀 CONNECTLY SERVER IS RUNNING LOCALLY`);
  console.log(`📡 Local:  http://localhost:${PORT}`);
  console.log(`📱 Mobile: http://${lanIp}:${PORT} (Connect from phone on same Wi-Fi)`);
  console.log(`💬 Real-Time Messaging: WebSocket (/ws) & SSE (/api/events)`);
  console.log(`📞 WebRTC Audio & Video Calling: Enabled`);
  console.log(`=======================================================`);
});
