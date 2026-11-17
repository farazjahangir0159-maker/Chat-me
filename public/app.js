/**
 * CONNECTLY - Modern Real-Time Messaging & Social Platform
 * Frontend Client Application
 * Supports both:
 * 1. Full Node.js REST API + WebSocket Server (http://localhost:3000)
 * 2. Standalone file-based mode (direct index.html) with BroadcastChannel real-time sync
 */

// --- GLOBAL APP STATE ---
const state = {
  currentUser: null,
  token: localStorage.getItem('connectly_token') || null,
  activeConversation: null,
  conversations: [],
  messages: [],
  stories: [],
  unlockedChats: new Set(),
  replyingTo: null,
  searchDebounce: null,
  sidebarSearchDebounce: null,
  typingDebounce: null,
  ws: null,
  sse: null,
  mediaStream: null,
  mediaRecorder: null,
  recordedAudioChunks: [],
  isRecordingAudio: false,
  storyViewerInterval: null,
  currentStoryGroupIndex: 0,
  currentStoryIndex: 0,
  activeTab: 'chats',
  theme: localStorage.getItem('connectly_theme') || 'system',
  soundEnabled: localStorage.getItem('connectly_sound') !== 'false',
  standaloneMode: window.location.protocol === 'file:'
};

// --- WEBRTC CALLING STATE ---
const callState = {
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  callType: 'voice', // 'voice' | 'video'
  callRole: null, // 'caller' | 'callee'
  remoteUser: null, // { id, full_name, username, profile_picture }
  status: 'idle', // 'idle' | 'calling' | 'incoming' | 'connected'
  isMuted: false,
  isVideoOff: false,
  facingMode: 'user',
  callStartTime: null,
  callTimerInterval: null,
  ringTimeout: null,
  offerSdp: null,
  pendingCandidates: []
};

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Cross-tab broadcast channel for instant multi-tab sync (works even offline or in standalone mode)
const syncChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('connectly_sync') : null;
if (syncChannel) {
  syncChannel.onmessage = (event) => {
    const { action, payload, senderId } = event.data || {};
    if (state.currentUser && senderId === state.currentUser.id) return;

    if (action === 'NEW_MESSAGE') {
      if (state.activeConversation && payload.conversation_id === state.activeConversation.id) {
        appendOrUpdateMessage(payload);
        playNotificationSound('receive');
        markMessagesAsRead(payload.conversation_id);
      } else {
        playNotificationSound('receive');
      }
      loadConversations();
    } else if (action === 'MESSAGE_UPDATED' || action === 'MESSAGE_DELETED') {
      if (state.activeConversation && payload.conversation_id === state.activeConversation.id) {
        appendOrUpdateMessage(payload);
      }
      loadConversations();
    } else if (action === 'TYPING') {
      if (state.activeConversation && payload.conversation_id === state.activeConversation.id) {
        showTypingIndicator(payload.is_typing);
      }
    } else if (action === 'NEW_STORY') {
      loadStories();
    } else if (action === 'REFRESH_CONVERSATIONS') {
      loadConversations();
    } else if (action === 'CALL_SIGNAL') {
      if (payload && payload.target_user_id === state.currentUser?.id) {
        handleIncomingCallSignal(payload);
      }
    }
  };
}

// --- WEB AUDIO API SOUND & RINGTONE SYNTHESIZER ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let callRingtoneInterval = null;

function playNotificationSound(type = 'receive') {
  if (!state.soundEnabled) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'send') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'receive') {
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'call') {
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(450, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.setValueAtTime(0, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (e) {}
}

function playCallRingtone(type = 'incoming') {
  stopCallRingtone();
  if (!state.soundEnabled) return;

  const playPulse = () => {
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      if (type === 'incoming') {
        // WhatsApp-style rhythmic melodic chime: E5 (659Hz) -> G#5 (830Hz) -> B5 (987Hz)
        [659.25, 830.61, 987.77].forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.14);
          gain.gain.setValueAtTime(0, now + idx * 0.14);
          gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.14 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.38);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + idx * 0.14);
          osc.stop(now + idx * 0.14 + 0.4);
        });
      } else if (type === 'outgoing') {
        // Standard telecom ringback tone: 440Hz + 480Hz
        [440, 480].forEach(freq => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.1, now + 0.04);
          gain.gain.setValueAtTime(0.1, now + 1.2);
          gain.gain.linearRampToValueAtTime(0, now + 1.25);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 1.26);
        });
      }
    } catch (e) {}
  };

  playPulse();
  callRingtoneInterval = setInterval(playPulse, type === 'incoming' ? 1800 : 3500);
}

function stopCallRingtone() {
  if (callRingtoneInterval) {
    clearInterval(callRingtoneInterval);
    callRingtoneInterval = null;
  }
}

// --- CLIENT-SIDE LOCAL DB FOR STANDALONE & FALLBACK MODE ---
const LocalDB = {
  get() {
    let data = localStorage.getItem('connectly_local_db');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (parsed && parsed.users) {
          parsed.users.forEach(u => {
            if (u.username === 'faraz123') { u.is_owner = true; u.role = 'owner'; }
            if (u.username === 'ahmed456' || u.username === 'sarah_dev') { u.is_test = true; u.is_demo = true; }
          });
          localStorage.setItem('connectly_local_db', JSON.stringify(parsed));
          return parsed;
        }
      } catch (e) {}
    }
    if (!data) {
      data = JSON.stringify({
        users: [
          {
            id: 'usr_faraz123',
            username: 'faraz123',
            full_name: 'Faraz Ahmed',
            email: 'faraz@connectly.app',
            password: 'Password123!',
            profile_picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
            bio: 'Product Designer & Tech Explorer 🚀 | Connectly Founder & Owner',
            created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
            last_seen: new Date().toISOString(),
            is_owner: true,
            role: 'owner'
          },
          {
            id: 'usr_ahmed456',
            username: 'ahmed456',
            full_name: 'Ahmed Khan',
            email: 'ahmed@connectly.app',
            password: 'Password123!',
            profile_picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
            bio: 'Full Stack Engineer | Coffee lover ☕ | Building realtime apps',
            created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
            last_seen: new Date().toISOString(),
            is_test: true,
            is_demo: true
          },
          {
            id: 'usr_sarah789',
            username: 'sarah_dev',
            full_name: 'Sarah Connor',
            email: 'sarah@connectly.app',
            password: 'Password123!',
            profile_picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
            bio: 'UI/UX enthusiast & open-source advocate ✨',
            created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
            last_seen: new Date().toISOString(),
            is_test: true,
            is_demo: true
          }
        ],
        conversations: [
          {
            id: 'conv_faraz_ahmed',
            conversation_type: 'direct',
            members: ['usr_faraz123', 'usr_ahmed456'],
            created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        messages: [
          {
            id: 'msg_001',
            conversation_id: 'conv_faraz_ahmed',
            sender_id: 'usr_ahmed456',
            message_type: 'text',
            message_content: 'Hey Faraz! Welcome to Connectly 🚀',
            media_url: null,
            reply_to_message_id: null,
            created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            reactions: { '👍': ['usr_faraz123'] }
          },
          {
            id: 'msg_002',
            conversation_id: 'conv_faraz_ahmed',
            sender_id: 'usr_faraz123',
            message_type: 'text',
            message_content: 'Hey Ahmed! The real-time messaging interface is so smooth! 💬',
            media_url: null,
            reply_to_message_id: 'msg_001',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            reactions: { '❤️': ['usr_ahmed456'] }
          }
        ],
        stories: [
          {
            id: 'sty_001',
            user_id: 'usr_ahmed456',
            media_url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80',
            story_type: 'image',
            caption: 'Working on Connectly late into the night 💻✨',
            created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
            expires_at: new Date(Date.now() + 3600000 * 20).toISOString(),
            views: [{ viewer_id: 'usr_faraz123', viewer_name: 'Faraz Ahmed', viewer_username: 'faraz123', viewed_at: new Date().toISOString() }],
            likes: [{ user_id: 'usr_faraz123', user_name: 'Faraz Ahmed', user_username: 'faraz123', created_at: new Date().toISOString() }]
          },
          {
            id: 'sty_002',
            user_id: 'usr_sarah789',
            media_url: null,
            story_type: 'text',
            bg_color: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 50%, #EC4899 100%)',
            caption: 'Excited for the official Connectly release today! 🚀',
            created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            expires_at: new Date(Date.now() + 3600000 * 22).toISOString(),
            views: [],
            likes: []
          }
        ],
        chat_locks: {},
        follows: [
          { id: 'flw_1', follower_id: 'usr_ahmed456', following_id: 'usr_faraz123', created_at: new Date().toISOString() },
          { id: 'flw_2', follower_id: 'usr_sarah789', following_id: 'usr_faraz123', created_at: new Date().toISOString() },
          { id: 'flw_3', follower_id: 'usr_faraz123', following_id: 'usr_ahmed456', created_at: new Date().toISOString() }
        ],
        story_likes: []
      });
      localStorage.setItem('connectly_local_db', data);
    }
    const parsed = JSON.parse(data);
    if (!parsed.follows) {
      parsed.follows = [
        { id: 'flw_1', follower_id: 'usr_ahmed456', following_id: 'usr_faraz123', created_at: new Date().toISOString() },
        { id: 'flw_2', follower_id: 'usr_sarah789', following_id: 'usr_faraz123', created_at: new Date().toISOString() },
        { id: 'flw_3', follower_id: 'usr_faraz123', following_id: 'usr_ahmed456', created_at: new Date().toISOString() }
      ];
      localStorage.setItem('connectly_local_db', JSON.stringify(parsed));
    }
    if (!parsed.story_likes) parsed.story_likes = [];
    return parsed;
  },
  save(db) {
    localStorage.setItem('connectly_local_db', JSON.stringify(db));
  }
};

// --- UNIFIED API CLIENT (HTTP with LocalDB Fallback) ---
async function api(path, options = {}) {
  if (state.standaloneMode) {
    return handleLocalAPI(path, options);
  }

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch (netErr) {
    console.warn('Network error reaching ' + path + '. Falling back to local offline store.', netErr);
    if (window.location.protocol === 'file:') {
      state.standaloneMode = true;
    }
    return handleLocalAPI(path, options);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// Standalone LocalDB handler to guarantee 100% operation even without running a server
function handleLocalAPI(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const db = LocalDB.get();

  // Auth: Quick Join (Direct ID Name Entry - No Password)
  if (path === '/api/auth/quick-join' && method === 'POST') {
    const rawUsername = (body.username || '').trim();
    const cleanUsername = (rawUsername.startsWith('@') ? rawUsername.slice(1) : rawUsername)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    if (!cleanUsername || cleanUsername.length < 2) {
      throw new Error('Please enter an ID name (at least 2 characters).');
    }

    let user = db.users.find(u => u.username.toLowerCase() === cleanUsername);
    if (!user) {
      const displayName = (body.full_name || '').trim() || (rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1));
      user = {
        id: 'usr_' + Date.now(),
        username: cleanUsername,
        full_name: displayName,
        email: `${cleanUsername}@connectly.app`,
        profile_picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`,
        bio: body.bio || 'Using Connectly to connect and communicate ✨',
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };
      db.users.push(user);
      LocalDB.save(db);
    }
    const token = 'tok_' + user.id;
    return { token, user };
  }

  // Auth: Login
  if (path === '/api/auth/login' && method === 'POST') {
    const id = (body.identifier || body.email || '').toLowerCase().trim();
    const user = db.users.find(u => u.username.toLowerCase() === id || u.email.toLowerCase() === id);
    if (!user || user.password !== body.password) {
      throw new Error('Invalid credentials');
    }
    const token = 'tok_' + user.id;
    return { token, user };
  }

  // Auth: Register
  if (path === '/api/auth/register' && method === 'POST') {
    const cleanId = body.username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (db.users.some(u => u.username.toLowerCase() === cleanId)) {
      throw new Error('Connectly ID is already taken');
    }
    const newUser = {
      id: 'usr_' + Date.now(),
      username: cleanId,
      full_name: body.full_name,
      email: body.email,
      password: body.password,
      profile_picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + cleanId,
      bio: body.bio || 'Hey there! I am using Connectly 🚀',
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };
    db.users.push(newUser);
    LocalDB.save(db);
    return { token: 'tok_' + newUser.id, user: newUser };
  }

  // Auth: Me
  if (path === '/api/auth/me' && method === 'GET') {
    const token = state.token;
    const userId = token ? token.replace('tok_', '') : null;
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error('Unauthorized');
    const userSafe = { ...user };
    userSafe.followers_count = (db.follows || []).filter(f => f.following_id === user.id).length;
    userSafe.following_count = (db.follows || []).filter(f => f.follower_id === user.id).length;
    return { user: userSafe };
  }

  // Search Users
  if (path.startsWith('/api/users/search')) {
    const rawQuery = new URLSearchParams(path.split('?')[1] || '').get('q') || '';
    const q = rawQuery.toLowerCase().trim();
    const cleanQ = q.startsWith('@') ? q.slice(1).trim() : q;
    const isOwner = state.currentUser && (state.currentUser.is_owner || state.currentUser.username === 'faraz123');
    const users = db.users
      .filter(u => !state.currentUser || u.id !== state.currentUser.id)
      .filter(u => {
        if (!isOwner && (u.is_test || u.is_demo)) {
          if (cleanQ && (u.username.toLowerCase() === cleanQ || u.username.toLowerCase().includes(cleanQ))) return true;
          return false;
        }
        return true;
      })
      .filter(u => !cleanQ || u.username.toLowerCase().includes(cleanQ) || u.full_name.toLowerCase().includes(cleanQ) || (u.email && u.email.toLowerCase().includes(cleanQ)))
      .map(u => ({
        ...u,
        is_online: true,
        followers_count: (db.follows || []).filter(f => f.following_id === u.id).length,
        is_following: state.currentUser ? (db.follows || []).some(f => f.follower_id === state.currentUser.id && f.following_id === u.id) : false
      }));
    return { users };
  }

  // User Profile
  const userProfileMatch = path.match(/^\/api\/users\/([^/]+)\/profile$/);
  if (userProfileMatch && method === 'GET') {
    const targetId = userProfileMatch[1];
    const target = db.users.find(u => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
    if (!target) throw new Error('User not found');
    const followersCount = (db.follows || []).filter(f => f.following_id === target.id).length;
    const followingCount = (db.follows || []).filter(f => f.follower_id === target.id).length;
    const isFollowing = state.currentUser ? (db.follows || []).some(f => f.follower_id === state.currentUser.id && f.following_id === target.id) : false;
    return {
      user: { ...target, is_online: true },
      followers_count: followersCount,
      following_count: followingCount,
      is_following: isFollowing
    };
  }

  // Follow User
  const userFollowMatch = path.match(/^\/api\/users\/([^/]+)\/follow$/);
  if (userFollowMatch && method === 'POST') {
    if (!state.currentUser) throw new Error('Unauthorized');
    const targetId = userFollowMatch[1];
    const target = db.users.find(u => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
    if (!target) throw new Error('User not found');
    if (!db.follows) db.follows = [];
    const idx = db.follows.findIndex(f => f.follower_id === state.currentUser.id && f.following_id === target.id);
    let isFollowing = false;
    if (idx !== -1) {
      db.follows.splice(idx, 1);
      isFollowing = false;
    } else {
      db.follows.push({
        id: 'flw_' + Date.now(),
        follower_id: state.currentUser.id,
        following_id: target.id,
        created_at: new Date().toISOString()
      });
      isFollowing = true;
    }
    LocalDB.save(db);
    const followersCount = db.follows.filter(f => f.following_id === target.id).length;
    const followingCount = db.follows.filter(f => f.follower_id === target.id).length;
    if (syncChannel) syncChannel.postMessage({ action: 'FOLLOW_UPDATED', payload: { target_user_id: target.id, user_id: state.currentUser.id, is_following: isFollowing, followers_count: followersCount } });
    return { is_following: isFollowing, followers_count: followersCount, following_count: followingCount };
  }

  // Followers list
  const userFollowersMatch = path.match(/^\/api\/users\/([^/]+)\/followers$/);
  if (userFollowersMatch && method === 'GET') {
    const targetId = userFollowersMatch[1];
    const target = db.users.find(u => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
    if (!target) throw new Error('User not found');
    const records = (db.follows || []).filter(f => f.following_id === target.id);
    const followers = records.map(f => {
      const u = db.users.find(x => x.id === f.follower_id);
      if (!u) return null;
      const isFollowing = state.currentUser ? (db.follows || []).some(x => x.follower_id === state.currentUser.id && x.following_id === u.id) : false;
      return { ...u, is_following: isFollowing, is_online: true };
    }).filter(Boolean);
    return { followers };
  }

  // Following list
  const userFollowingMatch = path.match(/^\/api\/users\/([^/]+)\/following$/);
  if (userFollowingMatch && method === 'GET') {
    const targetId = userFollowingMatch[1];
    const target = db.users.find(u => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
    if (!target) throw new Error('User not found');
    const records = (db.follows || []).filter(f => f.follower_id === target.id);
    const following = records.map(f => {
      const u = db.users.find(x => x.id === f.following_id);
      if (!u) return null;
      const isFollowing = state.currentUser ? (db.follows || []).some(x => x.follower_id === state.currentUser.id && x.following_id === u.id) : false;
      return { ...u, is_following: isFollowing, is_online: true };
    }).filter(Boolean);
    return { following };
  }

  // Update Profile
  if (path === '/api/users/profile' && method === 'PATCH') {
    const user = db.users.find(u => u.id === state.currentUser.id);
    if (user) {
      if (body.full_name) user.full_name = body.full_name;
      if (body.bio !== undefined) user.bio = body.bio;
      if (body.profile_picture) user.profile_picture = body.profile_picture;
      LocalDB.save(db);
      return { user };
    }
    throw new Error('User not found');
  }

  // Get Conversations
  if (path === '/api/conversations' && method === 'GET') {
    const uid = state.currentUser ? state.currentUser.id : null;
    const convs = db.conversations.filter(c => c.members.includes(uid));
    const enriched = convs.map(c => {
      const otherId = c.members.find(m => m !== uid);
      const otherUser = db.users.find(u => u.id === otherId) || { full_name: 'User', username: 'user', profile_picture: '' };
      const msgs = db.messages.filter(m => m.conversation_id === c.id);
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      const isLocked = Boolean(db.chat_locks && db.chat_locks[uid + '_' + c.id]);
      return {
        id: c.id,
        conversation_type: c.conversation_type,
        recipient: { ...otherUser, is_online: true },
        last_message: lastMsg,
        unread_count: 0,
        is_locked: isLocked
      };
    });
    return { conversations: enriched };
  }

  // Create Conversation
  if (path === '/api/conversations' && method === 'POST') {
    const uid = state.currentUser.id;
    let target = db.users.find(u => u.id === body.recipient_id || u.username.toLowerCase() === (body.recipient_username || '').toLowerCase());
    if (!target) throw new Error('User not found');

    let conv = db.conversations.find(c => c.members.includes(uid) && c.members.includes(target.id));
    if (!conv) {
      conv = {
        id: 'conv_' + Date.now(),
        conversation_type: 'direct',
        members: [uid, target.id],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.conversations.push(conv);
      LocalDB.save(db);
    }
    return { conversation: { id: conv.id, recipient: target } };
  }

  // Get Messages
  const msgMatch = path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (msgMatch && method === 'GET') {
    const cid = msgMatch[1];
    const msgs = db.messages.filter(m => m.conversation_id === cid);
    return { messages: msgs };
  }

  // Send Message
  if (path === '/api/messages' && method === 'POST') {
    const newMsg = {
      id: 'msg_' + Date.now(),
      conversation_id: body.conversation_id,
      sender_id: state.currentUser.id,
      message_type: body.message_type || 'text',
      message_content: body.message_content || '',
      media_url: body.media_url || null,
      file_name: body.file_name || null,
      file_size: body.file_size || null,
      reply_to_message_id: body.reply_to_message_id || null,
      created_at: new Date().toISOString(),
      reactions: {}
    };
    db.messages.push(newMsg);
    LocalDB.save(db);

    if (syncChannel) {
      syncChannel.postMessage({
        action: 'NEW_MESSAGE',
        payload: newMsg,
        senderId: state.currentUser.id
      });
    }

    return { message: newMsg };
  }

  // Edit Message
  const editMatch = path.match(/^\/api\/messages\/([^/]+)$/);
  if (editMatch && method === 'PATCH') {
    const msg = db.messages.find(m => m.id === editMatch[1]);
    if (msg) {
      msg.message_content = body.message_content;
      msg.edited_at = new Date().toISOString();
      LocalDB.save(db);
      if (syncChannel) syncChannel.postMessage({ action: 'MESSAGE_UPDATED', payload: msg, senderId: state.currentUser.id });
      return { message: msg };
    }
  }

  // Delete Message
  if (editMatch && method === 'DELETE') {
    const msg = db.messages.find(m => m.id === editMatch[1]);
    if (msg) {
      msg.deleted_at = new Date().toISOString();
      msg.message_content = 'This message was deleted';
      msg.media_url = null;
      LocalDB.save(db);
      if (syncChannel) syncChannel.postMessage({ action: 'MESSAGE_DELETED', payload: msg, senderId: state.currentUser.id });
      return { message: 'Deleted' };
    }
  }

  // React to Message
  const reactMatch = path.match(/^\/api\/messages\/([^/]+)\/react$/);
  if (reactMatch && method === 'POST') {
    const msg = db.messages.find(m => m.id === reactMatch[1]);
    if (msg) {
      if (!msg.reactions) msg.reactions = {};
      const em = body.emoji;
      if (!msg.reactions[em]) msg.reactions[em] = [];
      const idx = msg.reactions[em].indexOf(state.currentUser.id);
      if (idx > -1) msg.reactions[em].splice(idx, 1);
      else msg.reactions[em].push(state.currentUser.id);
      LocalDB.save(db);
      if (syncChannel) syncChannel.postMessage({ action: 'MESSAGE_UPDATED', payload: msg, senderId: state.currentUser.id });
      return { reactions: msg.reactions };
    }
  }

  // Stories
  if (path === '/api/stories' && method === 'GET') {
    const isOwner = state.currentUser && (state.currentUser.is_owner || state.currentUser.username === 'faraz123');
    const grouped = {};
    for (const story of db.stories) {
      const u = db.users.find(user => user.id === story.user_id) || {};
      if (!isOwner && (u.is_test || u.is_demo) && story.user_id !== state.currentUser?.id) {
        continue;
      }
      if (!grouped[story.user_id]) {
        grouped[story.user_id] = { user: u, stories: [] };
      }
      const hasLiked = (story.likes || []).some(l => (typeof l === 'string' ? l : l.user_id) === state.currentUser?.id);
      grouped[story.user_id].stories.push({
        ...story,
        views: story.views || [],
        views_count: (story.views || []).length,
        likes: story.likes || [],
        likes_count: (story.likes || []).length,
        has_liked: hasLiked
      });
    }
    return { story_groups: Object.values(grouped) };
  }

  if (path === '/api/stories' && method === 'POST') {
    const newStory = {
      id: 'sty_' + Date.now(),
      user_id: state.currentUser.id,
      media_url: body.media_url || null,
      story_type: body.story_type || 'text',
      bg_color: body.bg_color || null,
      caption: body.caption || '',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      views: [],
      likes: []
    };
    db.stories.push(newStory);
    LocalDB.save(db);
    if (syncChannel) syncChannel.postMessage({ action: 'NEW_STORY', payload: newStory });
    return { story: newStory };
  }

  // View Story
  const storyViewMatch = path.match(/^\/api\/stories\/([^/]+)\/view$/);
  if (storyViewMatch && method === 'POST') {
    const storyId = storyViewMatch[1];
    const story = db.stories.find(s => s.id === storyId);
    if (!story) throw new Error('Story not found');
    if (!story.views) story.views = [];
    if (state.currentUser && story.user_id !== state.currentUser.id) {
      if (!story.views.some(v => v.viewer_id === state.currentUser.id)) {
        story.views.push({
          viewer_id: state.currentUser.id,
          viewer_name: state.currentUser.full_name,
          viewer_username: state.currentUser.username,
          viewer_avatar: state.currentUser.profile_picture,
          viewed_at: new Date().toISOString()
        });
        LocalDB.save(db);
        if (syncChannel) syncChannel.postMessage({ action: 'STORY_VIEWED', payload: { story_id: storyId, views_count: story.views.length } });
      }
    }
    return { views_count: story.views.length, views: story.views };
  }

  // Like Story
  const storyLikeMatch = path.match(/^\/api\/stories\/([^/]+)\/like$/);
  if (storyLikeMatch && method === 'POST') {
    const storyId = storyLikeMatch[1];
    const story = db.stories.find(s => s.id === storyId);
    if (!story) throw new Error('Story not found');
    if (!story.likes) story.likes = [];
    const idx = story.likes.findIndex(l => (typeof l === 'string' ? l : l.user_id) === state.currentUser?.id);
    let liked = false;
    if (idx !== -1) {
      story.likes.splice(idx, 1);
      liked = false;
    } else {
      story.likes.push({
        user_id: state.currentUser.id,
        user_name: state.currentUser.full_name,
        user_username: state.currentUser.username,
        user_avatar: state.currentUser.profile_picture,
        created_at: new Date().toISOString()
      });
      liked = true;
    }
    LocalDB.save(db);
    if (syncChannel) syncChannel.postMessage({ action: 'STORY_LIKED', payload: { story_id: storyId, likes_count: story.likes.length, liked } });
    return { liked, likes_count: story.likes.length, likes: story.likes };
  }

  // Chat Lock
  const lockMatch = path.match(/^\/api\/conversations\/([^/]+)\/lock$/);
  if (lockMatch && method === 'POST') {
    const key = state.currentUser.id + '_' + lockMatch[1];
    if (!db.chat_locks) db.chat_locks = {};
    db.chat_locks[key] = String(body.pin);
    LocalDB.save(db);
    return { message: 'Locked' };
  }

  const unlockMatch = path.match(/^\/api\/conversations\/([^/]+)\/unlock$/);
  if (unlockMatch && method === 'POST') {
    const key = state.currentUser.id + '_' + unlockMatch[1];
    const stored = db.chat_locks ? db.chat_locks[key] : null;
    if (stored && stored !== String(body.pin)) throw new Error('Incorrect PIN');
    if (body.disable && db.chat_locks) {
      delete db.chat_locks[key];
      LocalDB.save(db);
    }
    return { message: 'Unlocked' };
  }

  // Direct media upload data url
  if (path === '/api/upload' && method === 'POST') {
    return {
      url: body.data_url,
      file_name: body.filename,
      file_size: 1024
    };
  }

  return {};
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(state.theme);
  setupEventHandlers();

  if (state.token) {
    try {
      const data = await api('/api/auth/me');
      state.currentUser = data.user;
      initApp();
    } catch (err) {
      logout();
    }
  } else {
    showAuthModal(true);
  }
});

function initApp() {
  showAuthModal(false);
  updateCurrentUserUI();
  if (!state.standaloneMode) connectRealtime();
  loadConversations();
  loadStories();
}

// --- THEME MANAGEMENT ---
function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('connectly_theme', theme);
  const root = document.documentElement;

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }

  const themeSelect = document.getElementById('setting-theme');
  if (themeSelect) themeSelect.value = theme;
}

// --- REAL-TIME WEBSOCKET & SSE CONNECTION ---
function connectRealtime() {
  if (!state.token || state.standaloneMode) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = protocol + '//' + window.location.host + '/ws?token=' + encodeURIComponent(state.token);

  try {
    state.ws = new WebSocket(wsUrl);
    state.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleRealtimeEvent(payload.event, payload.data);
      } catch (e) {}
    };
    state.ws.onclose = () => {
      if (!state.standaloneMode) setTimeout(connectRealtime, 4000);
    };
    state.ws.onerror = () => {
      setupSSEFallback();
    };
  } catch (err) {
    setupSSEFallback();
  }
}

function setupSSEFallback() {
  if (state.sse || state.standaloneMode) return;
  try {
    state.sse = new EventSource('/api/events?token=' + encodeURIComponent(state.token));
    state.sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleRealtimeEvent(payload.event, payload.data);
      } catch (e) {}
    };
  } catch (e) {}
}

function sendWsEvent(event, data) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ event, data }));
  } else if (syncChannel && state.currentUser) {
    syncChannel.postMessage({ action: event.toUpperCase(), payload: data, senderId: state.currentUser.id });
  }
}

function handleRealtimeEvent(event, data) {
  switch (event) {
    case 'conversation_created': {
      loadConversations();
      break;
    }
    case 'new_message': {
      const msg = data.message;
      if (state.activeConversation && msg.conversation_id === state.activeConversation.id) {
        appendOrUpdateMessage(msg);
        if (msg.sender_id !== state.currentUser.id) {
          playNotificationSound('receive');
          markMessagesAsRead(msg.conversation_id);
        }
      } else {
        if (msg.sender_id !== state.currentUser.id) playNotificationSound('receive');
      }
      loadConversations();
      break;
    }
    case 'message_updated':
    case 'message_deleted': {
      const msg = data.message;
      if (state.activeConversation && msg.conversation_id === state.activeConversation.id) {
        appendOrUpdateMessage(msg);
      }
      loadConversations();
      break;
    }
    case 'messages_read': {
      if (state.activeConversation && data.conversation_id === state.activeConversation.id) {
        document.querySelectorAll('.message-status-ticks').forEach(el => {
          el.classList.add('read');
          el.innerHTML = '✓✓';
        });
      }
      break;
    }
    case 'user_typing': {
      if (state.activeConversation && data.conversation_id === state.activeConversation.id) {
        showTypingIndicator(data.is_typing);
      }
      break;
    }
    case 'new_story': {
      loadStories();
      break;
    }
    case 'story_viewed': {
      const storyId = data.story_id;
      const countEl = document.getElementById('story-owner-views-count');
      if (countEl && state.currentViewingStoryId === storyId) {
        countEl.textContent = data.views_count;
      }
      break;
    }
    case 'story_liked': {
      const storyId = data.story_id;
      if (state.currentViewingStoryId === storyId) {
        const viewerLikeEl = document.getElementById('story-like-count');
        const ownerLikeEl = document.getElementById('story-owner-likes-count');
        if (viewerLikeEl) viewerLikeEl.textContent = data.likes_count;
        if (ownerLikeEl) ownerLikeEl.textContent = data.likes_count;
      }
      break;
    }
    case 'follow_updated': {
      if (state.viewingProfileUserId === data.target_user_id || state.viewingProfileUserId === data.user_id) {
        openUserProfileModal(state.viewingProfileUserId, false);
      }
      if (state.currentUser && (state.currentUser.id === data.target_user_id || state.currentUser.id === data.user_id)) {
        updateCurrentUserUI();
      }
      break;
    }
    case 'call_signal': {
      handleIncomingCallSignal(data);
      break;
    }
  }
}

// --- AUTHENTICATION (Direct ID Name Entry - No Password Page) ---
function showAuthModal(show) {
  const el = document.getElementById('auth-modal');
  if (el) el.style.display = show ? 'flex' : 'none';
  if (show) {
    setTimeout(() => {
      const input = document.getElementById('quick-join-username');
      if (input) input.focus();
    }, 150);
  }
}

function updateQuickJoinAvatar() {
  const input = document.getElementById('quick-join-username');
  const avatar = document.getElementById('quick-join-avatar-img');
  if (input && avatar) {
    const seed = input.value.trim().replace(/^@/, '') || 'connectly';
    avatar.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
  }
}

async function handleQuickJoin(e) {
  if (e) e.preventDefault();
  const usernameInput = document.getElementById('quick-join-username');
  const nameInput = document.getElementById('quick-join-fullname');
  const errBox = document.getElementById('quick-join-error');
  if (errBox) errBox.textContent = '';

  const username = usernameInput ? usernameInput.value.trim() : '';
  const full_name = nameInput ? nameInput.value.trim() : '';

  if (!username) {
    if (errBox) errBox.textContent = 'Apna ID name enter karein.';
    return;
  }

  try {
    const res = await api('/api/auth/quick-join', {
      method: 'POST',
      body: JSON.stringify({ username, full_name })
    });
    state.token = res.token;
    state.currentUser = res.user;
    localStorage.setItem('connectly_token', res.token);
    showAuthModal(false);
    initApp();
  } catch (err) {
    if (errBox) errBox.textContent = err.message;
  }
}

function quickSelectId(username) {
  const input = document.getElementById('quick-join-username');
  if (input) {
    input.value = username;
    updateQuickJoinAvatar();
    handleQuickJoin();
  }
}

function logout() {
  if (state.ws) state.ws.close();
  if (state.sse) state.sse.close();
  localStorage.removeItem('connectly_token');
  state.token = null;
  state.currentUser = null;
  state.activeConversation = null;
  showAuthModal(true);
}

// --- CONVERSATIONS ---
async function loadConversations() {
  if (!state.currentUser) return;
  try {
    const res = await api('/api/conversations');
    state.conversations = res.conversations;
    renderConversationList();
  } catch (err) {
    console.error('Failed to load conversations', err);
  }
}

function renderConvCardHTML(conv) {
  const isActive = state.activeConversation && state.activeConversation.id === conv.id;
  const isLocked = conv.is_locked;
  const lastMsgText = conv.last_message ? getMessagePreview(conv.last_message) : 'Start chatting';
  const lastMsgTime = conv.last_message ? formatRelativeTime(conv.last_message.created_at) : '';

  return `
    <div class="conversation-card ${isActive ? 'active' : ''}" onclick="selectConversation('${conv.id}')">
      <div class="conv-avatar-wrap">
        <img src="${conv.recipient.profile_picture}" alt="${conv.recipient.full_name}">
        <span class="online-status-dot" style="display: ${conv.recipient.is_online ? 'block' : 'none'};"></span>
      </div>
      <div class="conv-info">
        <div class="conv-header-row">
          <span class="conv-name">${escapeHTML(conv.recipient.full_name)}</span>
          <span class="conv-time">${lastMsgTime}</span>
        </div>
        <div class="conv-message-row">
          <div class="conv-last-msg ${conv.unread_count > 0 ? 'unread' : ''}">
            ${isLocked && !state.unlockedChats.has(conv.id) ? '🔒 <i>Locked Conversation</i>' : lastMsgText}
          </div>
          <div class="conv-badges">
            ${isLocked ? '<span class="locked-badge" title="PIN Protected">🔒</span>' : ''}
            ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderConversationList() {
  const container = document.getElementById('conversation-list');
  if (!container) return;

  if (state.conversations.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
        <p style="font-weight: 600; margin-bottom: 6px;">No conversations yet</p>
        <p style="font-size: 13px;">Search users by their Connectly ID to start chatting!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.conversations.map(conv => renderConvCardHTML(conv)).join('');
}

// Sidebar live search across both conversations AND all registered users!
async function handleSidebarSearch(e) {
  clearTimeout(state.sidebarSearchDebounce);
  const q = (e.target.value || '').trim().toLowerCase();

  state.sidebarSearchDebounce = setTimeout(async () => {
    const convContainer = document.getElementById('conversation-list');
    if (!convContainer) return;

    if (!q) {
      renderConversationList();
      return;
    }

    // Filter existing conversations
    const filteredConvs = state.conversations.filter(c => {
      const name = (c.recipient.full_name || '').toLowerCase();
      const uname = (c.recipient.username || '').toLowerCase();
      return name.includes(q) || uname.includes(q);
    });

    // Query registered users matching query
    let newUsers = [];
    try {
      const res = await api('/api/users/search?q=' + encodeURIComponent(q));
      const existingIds = new Set(filteredConvs.map(c => c.recipient.id));
      newUsers = (res.users || []).filter(u => !existingIds.has(u.id));
    } catch (err) {}

    let html = '';

    if (filteredConvs.length > 0) {
      html += filteredConvs.map(conv => renderConvCardHTML(conv)).join('');
    }

    if (newUsers.length > 0) {
      html += `
        <div style="padding: 12px 14px 6px; font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em;">
          Registered Connectly Users
        </div>
      `;
      html += newUsers.map(u => `
        <div class="conversation-card" onclick="startChatWithUser('${u.id}', '${u.username}')" style="background: var(--bg-hover); margin-bottom: 4px; border: 1px dashed var(--border);">
          <div class="conv-avatar-wrap">
            <img src="${u.profile_picture}" alt="${u.full_name}">
          </div>
          <div class="conv-info">
            <div class="conv-header-row">
              <span class="conv-name">${escapeHTML(u.full_name)}</span>
              <span style="font-size: 11px; color: var(--primary); font-weight: 600;">@${escapeHTML(u.username)}</span>
            </div>
            <div class="conv-message-row">
              <div class="conv-last-msg" style="color: var(--primary); font-weight: 500;">
                💬 Click to start conversation
              </div>
            </div>
          </div>
        </div>
      `).join('');
    }

    if (filteredConvs.length === 0 && newUsers.length === 0) {
      html = `
        <div style="text-align: center; padding: 30px 16px; color: var(--text-muted);">
          <p style="font-weight: 600;">No conversations or users found for "${escapeHTML(q)}"</p>
          <p style="font-size: 12px; margin-top: 4px;">Search by exact Connectly ID</p>
        </div>
      `;
    }

    convContainer.innerHTML = html;
  }, 250);
}

async function selectConversation(convId) {
  const conv = state.conversations.find(c => c.id === convId);
  if (!conv) return;

  if (conv.is_locked && !state.unlockedChats.has(conv.id)) {
    promptChatLockPIN(conv.id, () => openConversationDirectly(conv));
    return;
  }

  openConversationDirectly(conv);
}

async function openConversationDirectly(conv) {
  state.activeConversation = conv;
  renderConversationList();

  const chatPane = document.getElementById('chat-pane');
  if (chatPane) chatPane.classList.add('mobile-open');

  document.getElementById('empty-chat-screen').style.display = 'none';
  document.getElementById('active-chat-content').style.display = 'flex';

  const avatarEl = document.getElementById('chat-header-avatar');
  const nameEl = document.getElementById('chat-header-name');
  const handleEl = document.getElementById('chat-header-handle');
  avatarEl.src = conv.recipient.profile_picture;
  avatarEl.style.cursor = 'pointer';
  avatarEl.onclick = () => openUserProfileModal(conv.recipient.id);
  nameEl.textContent = conv.recipient.full_name;
  nameEl.style.cursor = 'pointer';
  nameEl.onclick = () => openUserProfileModal(conv.recipient.id);
  handleEl.textContent = `@${conv.recipient.username}`;
  handleEl.style.cursor = 'pointer';
  handleEl.onclick = () => openUserProfileModal(conv.recipient.id);
  updateActiveChatPresence(conv.recipient.is_online);

  await loadMessages(conv.id);
  markMessagesAsRead(conv.id);
}

function updateActiveChatPresence(isOnline) {
  const statusEl = document.getElementById('chat-header-status');
  if (!statusEl) return;
  statusEl.textContent = isOnline ? 'Online' : 'Offline';
  statusEl.className = isOnline ? 'chat-user-status online' : 'chat-user-status';
}

// --- MESSAGES ---
async function loadMessages(convId) {
  try {
    const headers = {};
    const pin = sessionStorage.getItem(`pin_${convId}`);
    if (pin) headers['x-chat-pin'] = pin;

    const res = await api(`/api/conversations/${convId}/messages`, { headers });
    state.messages = res.messages || [];
    renderMessageFeed();
    scrollChatToBottom();
  } catch (err) {
    if (err.message.includes('locked')) {
      promptChatLockPIN(convId, () => loadMessages(convId));
    }
  }
}

function renderMessageFeed() {
  const container = document.getElementById('message-feed');
  if (!container) return;

  if (state.messages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; margin: auto; color: var(--text-muted);">
        <p style="font-weight: 600;">No messages yet.</p>
        <p style="font-size: 13px;">Say hello to start communicating! 👋</p>
      </div>
    `;
    return;
  }

  let html = '';
  let lastDateStr = '';

  for (const msg of state.messages) {
    const msgDate = new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (msgDate !== lastDateStr) {
      html += `<div class="date-divider">${formatDateDivider(msg.created_at)}</div>`;
      lastDateStr = msgDate;
    }

    const isOutgoing = msg.sender_id === state.currentUser.id;
    const isDeleted = Boolean(msg.deleted_at);

    let replySnippetHtml = '';
    if (msg.reply_to_message_id) {
      const orig = state.messages.find(m => m.id === msg.reply_to_message_id);
      if (orig) {
        replySnippetHtml = `
          <div class="bubble-reply-snippet" onclick="scrollToMessage('${orig.id}')">
            <div class="bubble-reply-sender">${orig.sender_id === state.currentUser.id ? 'You' : state.activeConversation.recipient.full_name}</div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${getMessagePreview(orig)}</div>
          </div>
        `;
      }
    }

    let mediaHtml = '';
    if (msg.media_url && !isDeleted) {
      if (msg.message_type === 'image') {
        mediaHtml = `<img src="${msg.media_url}" class="bubble-media-img" onclick="openMediaLightbox('${msg.media_url}')" alt="Photo">`;
      } else if (msg.message_type === 'video') {
        mediaHtml = `
          <video src="${msg.media_url}" controls class="bubble-media-video" playsinline preload="metadata"></video>
        `;
      } else if (msg.message_type === 'audio') {
        mediaHtml = `
          <div class="bubble-audio-player">
            <button class="audio-play-btn" onclick="togglePlayAudio('${msg.id}', '${msg.media_url}')">▶</button>
            <div class="audio-waveform-bars">
              <span class="audio-bar" style="height: 12px;"></span>
              <span class="audio-bar" style="height: 20px;"></span>
              <span class="audio-bar" style="height: 14px;"></span>
              <span class="audio-bar" style="height: 24px;"></span>
              <span class="audio-bar" style="height: 18px;"></span>
              <span class="audio-bar" style="height: 8px;"></span>
            </div>
            <audio id="audio_${msg.id}" src="${msg.media_url}" preload="none"></audio>
          </div>
        `;
      } else if (msg.message_type === 'file') {
        mediaHtml = `
          <a href="${msg.media_url}" download="${msg.file_name || 'document'}" class="bubble-file-card">
            <div class="bubble-file-icon">📄</div>
            <div class="bubble-file-details">
              <div class="bubble-file-name">${escapeHTML(msg.file_name || 'Document')}</div>
              <div class="bubble-file-size">${formatBytes(msg.file_size || 0)}</div>
            </div>
          </a>
        `;
      }
    }

    let stickerHtml = '';
    if (msg.message_type === 'sticker' && !isDeleted) {
      stickerHtml = `<div style="max-width: 130px; margin-bottom: 4px;">${msg.message_content}</div>`;
    }

    let reactionsHtml = '';
    if (msg.reactions && Object.keys(msg.reactions).length > 0 && !isDeleted) {
      reactionsHtml = `<div class="bubble-reactions-row">`;
      for (const [emoji, uids] of Object.entries(msg.reactions)) {
        if (!uids || uids.length === 0) continue;
        const hasReacted = uids.includes(state.currentUser.id);
        reactionsHtml += `
          <div class="bubble-reaction-chip ${hasReacted ? 'user-reacted' : ''}" onclick="reactToMessage('${msg.id}', '${emoji}')">
            <span>${emoji}</span>
            <span>${uids.length}</span>
          </div>
        `;
      }
      reactionsHtml += `</div>`;
    }

    let statusTicks = '';
    if (isOutgoing && !isDeleted) {
      statusTicks = `<span class="message-status-ticks read" title="Delivered & Read">✓✓</span>`;
    }

    const toolbar = !isDeleted ? `
      <div class="message-actions-toolbar">
        <button class="toolbar-action-btn" title="React with 👍" onclick="reactToMessage('${msg.id}', '👍')">👍</button>
        <button class="toolbar-action-btn" title="React with ❤️" onclick="reactToMessage('${msg.id}', '❤️')">❤️</button>
        <button class="toolbar-action-btn" title="Reply" onclick="initiateReply('${msg.id}')">↩</button>
        <button class="toolbar-action-btn" title="Copy Text" onclick="copyMessageText('${msg.id}')">📋</button>
        ${isOutgoing ? `<button class="toolbar-action-btn" title="Edit" onclick="editMessagePrompt('${msg.id}')">✏️</button>` : ''}
        ${isOutgoing ? `<button class="toolbar-action-btn" title="Delete" onclick="deleteMessage('${msg.id}')">🗑️</button>` : ''}
      </div>
    ` : '';

    html += `
      <div class="message-row ${isOutgoing ? 'outgoing' : 'incoming'}" id="msg-el-${msg.id}">
        <div class="message-bubble">
          ${toolbar}
          ${replySnippetHtml}
          ${mediaHtml}
          ${stickerHtml}
          ${msg.message_type !== 'sticker' ? `<div class="bubble-text" style="${isDeleted ? 'font-style: italic; opacity: 0.7;' : ''}">${escapeHTML(msg.message_content)}</div>` : ''}
          <div class="bubble-meta">
            <span>${formatTime(msg.created_at)}</span>
            ${msg.edited_at ? '<span style="font-size: 10px; margin-left: 2px;">(edited)</span>' : ''}
            ${statusTicks}
          </div>
          ${reactionsHtml}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function appendOrUpdateMessage(msg) {
  const index = state.messages.findIndex(m => m.id === msg.id);
  if (index > -1) {
    state.messages[index] = msg;
  } else {
    state.messages.push(msg);
  }
  renderMessageFeed();
  scrollChatToBottom();
}

async function handleSendMessage(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('chat-text-input');
  const content = input.value.trim();
  if (!content || !state.activeConversation) return;

  const replyToId = state.replyingTo ? state.replyingTo.id : null;
  input.value = '';
  cancelReply();

  try {
    playNotificationSound('send');
    const res = await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: state.activeConversation.id,
        message_type: 'text',
        message_content: content,
        reply_to_message_id: replyToId
      })
    });

    appendOrUpdateMessage(res.message);
  } catch (err) {
    alert('Failed to send message: ' + err.message);
  }
}

async function reactToMessage(msgId, emoji) {
  try {
    await api(`/api/messages/${msgId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji })
    });
    if (state.standaloneMode) {
      const msg = state.messages.find(m => m.id === msgId);
      if (msg) appendOrUpdateMessage(msg);
    }
  } catch (err) {
    console.error('Failed to react', err);
  }
}

function initiateReply(msgId) {
  const msg = state.messages.find(m => m.id === msgId);
  if (!msg) return;
  state.replyingTo = msg;

  const banner = document.getElementById('reply-banner');
  const title = document.getElementById('reply-banner-title');
  const text = document.getElementById('reply-banner-text');

  title.textContent = msg.sender_id === state.currentUser.id ? 'Replying to yourself' : `Replying to ${state.activeConversation.recipient.full_name}`;
  text.textContent = getMessagePreview(msg);
  banner.style.display = 'flex';

  document.getElementById('chat-text-input').focus();
}

function cancelReply() {
  state.replyingTo = null;
  const banner = document.getElementById('reply-banner');
  if (banner) banner.style.display = 'none';
}

function copyMessageText(msgId) {
  const msg = state.messages.find(m => m.id === msgId);
  if (msg && msg.message_content) {
    navigator.clipboard.writeText(msg.message_content).then(() => {
      showToast('Message copied to clipboard');
    });
  }
}

async function editMessagePrompt(msgId) {
  const msg = state.messages.find(m => m.id === msgId);
  if (!msg) return;
  const newContent = prompt('Edit your message:', msg.message_content);
  if (newContent !== null && newContent.trim() !== '') {
    try {
      const res = await api(`/api/messages/${msgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ message_content: newContent.trim() })
      });
      appendOrUpdateMessage(res.message);
    } catch (err) {
      alert('Error editing message: ' + err.message);
    }
  }
}

async function deleteMessage(msgId) {
  if (!confirm('Are you sure you want to delete this message?')) return;
  try {
    await api(`/api/messages/${msgId}`, { method: 'DELETE' });
    const msg = state.messages.find(m => m.id === msgId);
    if (msg) {
      msg.deleted_at = new Date().toISOString();
      msg.message_content = 'This message was deleted';
      msg.media_url = null;
      appendOrUpdateMessage(msg);
    }
  } catch (err) {
    alert('Error deleting message: ' + err.message);
  }
}

async function markMessagesAsRead(convId) {
  try {
    await api(`/api/conversations/${convId}/messages`);
  } catch (e) {}
}

function handleTypingInput() {
  if (!state.activeConversation) return;

  sendWsEvent('typing', {
    conversation_id: state.activeConversation.id,
    is_typing: true
  });

  clearTimeout(state.typingDebounce);
  state.typingDebounce = setTimeout(() => {
    sendWsEvent('typing', {
      conversation_id: state.activeConversation.id,
      is_typing: false
    });
  }, 2000);
}

function showTypingIndicator(isTyping) {
  const bar = document.getElementById('typing-indicator-bar');
  if (bar) bar.style.display = isTyping ? 'flex' : 'none';
}

function togglePlayAudio(id, url) {
  const audio = document.getElementById(`audio_${id}`);
  if (!audio) return;
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

// --- MEDIA SHARING (Camera, Gallery, Files, Voice Notes) ---

// 1. Camera Capture
async function openCameraModal() {
  const modal = document.getElementById('camera-modal');
  const video = document.getElementById('camera-video');
  modal.classList.add('active');

  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = state.mediaStream;
    document.getElementById('camera-preview-img').style.display = 'none';
    video.style.display = 'block';
    document.getElementById('camera-shutter-btn').style.display = 'flex';
    document.getElementById('camera-send-btn').style.display = 'none';
  } catch (err) {
    alert('Could not access camera: ' + err.message);
    closeCameraModal();
  }
}

function captureCameraPhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const previewImg = document.getElementById('camera-preview-img');
  previewImg.src = dataUrl;
  previewImg.style.display = 'block';
  video.style.display = 'none';

  document.getElementById('camera-shutter-btn').style.display = 'none';
  document.getElementById('camera-send-btn').style.display = 'flex';
  state.capturedPhotoData = dataUrl;
}

async function sendCameraPhoto() {
  if (!state.capturedPhotoData || !state.activeConversation) return;
  closeCameraModal();

  try {
    playNotificationSound('send');
    const uploadRes = await api('/api/upload', {
      method: 'POST',
      body: JSON.stringify({
        data_url: state.capturedPhotoData,
        filename: 'camera_capture.jpg',
        file_type: 'image/jpeg'
      })
    });

    const res = await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: state.activeConversation.id,
        message_type: 'image',
        message_content: 'Photo',
        media_url: uploadRes.url
      })
    });

    appendOrUpdateMessage(res.message);
  } catch (err) {
    alert('Failed to send photo: ' + err.message);
  }
}

function closeCameraModal() {
  const modal = document.getElementById('camera-modal');
  modal.classList.remove('active');
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
    state.mediaStream = null;
  }
}

// 2. Gallery / File Upload
function triggerFileInput(acceptType) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = acceptType;
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadAndSendFile(file);
  };
  input.click();
}

async function uploadAndSendFile(file) {
  if (!state.activeConversation) return;

  showToast(`Uploading ${file.name}...`);
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    try {
      playNotificationSound('send');
      let mediaUrl = dataUrl;
      if (!state.standaloneMode) {
        try {
          const uploadRes = await api('/api/upload', {
            method: 'POST',
            body: JSON.stringify({
              data_url: dataUrl,
              filename: file.name,
              file_type: file.type
            })
          });
          if (uploadRes && uploadRes.url) mediaUrl = uploadRes.url;
        } catch (upErr) {
          console.warn('Direct upload fallback', upErr);
        }
      }

      let msgType = 'file';
      if (file.type.startsWith('image/')) msgType = 'image';
      else if (file.type.startsWith('video/')) msgType = 'video';
      else if (file.type.startsWith('audio/')) msgType = 'audio';

      const res = await api('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: state.activeConversation.id,
          message_type: msgType,
          message_content: file.name,
          media_url: mediaUrl,
          file_name: file.name,
          file_size: file.size
        })
      });

      appendOrUpdateMessage(res.message);
      showToast('Sent successfully!');
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };
  reader.readAsDataURL(file);
}

// 3. Voice Notes Recording (MediaRecorder API)
async function toggleVoiceRecording() {
  if (state.isRecordingAudio) {
    stopVoiceRecording(true);
  } else {
    startVoiceRecording();
  }
}

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream);
    state.recordedAudioChunks = [];

    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.recordedAudioChunks.push(e.data);
    };

    state.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(state.recordedAudioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        try {
          playNotificationSound('send');
          let mediaUrl = dataUrl;
          if (!state.standaloneMode) {
            try {
              const uploadRes = await api('/api/upload', {
                method: 'POST',
                body: JSON.stringify({
                  data_url: dataUrl,
                  filename: 'voice_note.webm',
                  file_type: 'audio/webm'
                })
              });
              if (uploadRes && uploadRes.url) mediaUrl = uploadRes.url;
            } catch (e) {}
          }

          const res = await api('/api/messages', {
            method: 'POST',
            body: JSON.stringify({
              conversation_id: state.activeConversation.id,
              message_type: 'audio',
              message_content: 'Voice note',
              media_url: mediaUrl
            })
          });

          appendOrUpdateMessage(res.message);
        } catch (err) {
          alert('Failed to send voice note: ' + err.message);
        }
      };
      reader.readAsDataURL(audioBlob);
      stream.getTracks().forEach(track => track.stop());
    };

    state.mediaRecorder.start();
    state.isRecordingAudio = true;
    const micBtn = document.getElementById('chat-mic-btn');
    micBtn.classList.add('recording');
    showToast('Recording voice note... Click mic again to send.');
  } catch (err) {
    alert('Microphone access denied: ' + err.message);
  }
}

function stopVoiceRecording(send = true) {
  if (!state.isRecordingAudio || !state.mediaRecorder) return;
  state.isRecordingAudio = false;
  const micBtn = document.getElementById('chat-mic-btn');
  micBtn.classList.remove('recording');

  if (send) {
    state.mediaRecorder.stop();
  } else {
    state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
}

// --- STICKERS & EMOJIS (PRD Section 6.3) ---
const EMOJI_LIST = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
  '😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨',
  '😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕',
  '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
  '🔥','✨','🎉','🚀','💯','⭐','🌟','🍕','🍔','🍟','☕','🍩','🍦','🍻','🥂','⚽'
];

const STICKER_LIST = [
  { id: 'cat_happy', title: 'Happy Cat', svg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#FBBF24"/><polygon points="25,25 35,5 45,25" fill="#FBBF24"/><polygon points="55,25 65,5 75,25" fill="#FBBF24"/><circle cx="38" cy="45" r="5" fill="#1F2937"/><circle cx="62" cy="45" r="5" fill="#1F2937"/><path d="M40,62 Q50,72 60,62" stroke="#1F2937" stroke-width="4" fill="none"/></svg>` },
  { id: 'cool_blob', title: 'Cool Shades', svg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#6C63FF"/><rect x="25" y="38" width="22" height="14" rx="4" fill="#111"/><rect x="53" y="38" width="22" height="14" rx="4" fill="#111"/><line x1="47" y1="44" x2="53" y2="44" stroke="#111" stroke-width="4"/><path d="M42,65 Q50,74 58,65" stroke="#FFF" stroke-width="3" fill="none"/></svg>` },
  { id: 'party_popper', title: 'Party', svg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#EC4899"/><text x="50" y="62" font-size="34" text-anchor="middle">🎉</text></svg>` },
  { id: 'mind_blown', title: 'Mind Blown', svg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#3B82F6"/><text x="50" y="62" font-size="34" text-anchor="middle">🤯</text></svg>` },
  { id: 'fire_heart', title: 'Fire Heart', svg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#EF4444"/><text x="50" y="62" font-size="34" text-anchor="middle">❤️‍🔥</text></svg>` },
  { id: 'rocket_launch', title: 'To the Moon', svg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#10B981"/><text x="50" y="62" font-size="34" text-anchor="middle">🚀</text></svg>` }
];

function toggleEmojiPicker() {
  const panel = document.getElementById('emoji-picker-panel');
  const stickerPanel = document.getElementById('sticker-picker-panel');
  if (stickerPanel) stickerPanel.classList.remove('show');

  const willShow = !panel.classList.contains('show');
  panel.classList.toggle('show', willShow);

  if (willShow) {
    const grid = document.getElementById('emoji-grid');
    grid.innerHTML = EMOJI_LIST.map(em => `<div class="emoji-cell" onclick="insertEmoji('${em}')">${em}</div>`).join('');
  }
}

function insertEmoji(emoji) {
  const input = document.getElementById('chat-text-input');
  input.value += emoji;
  input.focus();
}

function toggleStickerPicker() {
  const panel = document.getElementById('sticker-picker-panel');
  const emojiPanel = document.getElementById('emoji-picker-panel');
  if (emojiPanel) emojiPanel.classList.remove('show');

  const willShow = !panel.classList.contains('show');
  panel.classList.toggle('show', willShow);

  if (willShow) {
    const grid = document.getElementById('sticker-grid');
    grid.innerHTML = STICKER_LIST.map(stk => `
      <div class="sticker-item" title="${stk.title}" onclick="sendSticker('${stk.id}')">
        ${stk.svg}
      </div>
    `).join('');
  }
}

async function sendSticker(stickerId) {
  const stk = STICKER_LIST.find(s => s.id === stickerId);
  if (!stk || !state.activeConversation) return;

  document.getElementById('sticker-picker-panel').classList.remove('show');
  playNotificationSound('send');

  try {
    const res = await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: state.activeConversation.id,
        message_type: 'sticker',
        message_content: stk.svg
      })
    });
    appendOrUpdateMessage(res.message);
  } catch (err) {
    alert('Failed to send sticker: ' + err.message);
  }
}

// --- USER SEARCH SYSTEM (PRD Section 5) ---
function openUserSearchModal() {
  const modal = document.getElementById('user-search-modal');
  modal.classList.add('active');
  const input = document.getElementById('user-search-input');
  input.value = '';
  input.focus();
  searchUsers('');
}

function closeUserSearchModal() {
  document.getElementById('user-search-modal').classList.remove('active');
}

function handleUserSearchInput(e) {
  clearTimeout(state.searchDebounce);
  const q = e.target.value.trim();
  state.searchDebounce = setTimeout(() => searchUsers(q), 300);
}

async function searchUsers(query) {
  const resultsContainer = document.getElementById('user-search-results');
  resultsContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Searching Connectly users...</div>`;

  try {
    const cleanQ = (query || '').trim();
    const res = await api('/api/users/search?q=' + encodeURIComponent(cleanQ));
    if (!res.users || res.users.length === 0) {
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 36px 20px; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 10px;">🔍</div>
          <p style="font-weight: 700; font-size: 15px; color: var(--text-main);">No users found</p>
          <p style="font-size: 12.5px; margin-top: 4px;">Search by Connectly ID (e.g. faraz123, jerry, ahmed456)</p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = res.users.map(u => `
      <div class="user-search-card" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-hover); border-radius: var(--radius-lg); margin-bottom: 8px; border: 1px solid var(--border);">
        <div class="user-search-left" onclick="openUserProfileModal('${u.id}')" style="display: flex; align-items: center; gap: 12px; cursor: pointer; flex: 1; min-width: 0;">
          <div style="position: relative; flex-shrink: 0;">
            <img src="${u.profile_picture}" class="user-search-avatar" alt="${escapeHTML(u.full_name)}" style="width: 46px; height: 46px; border-radius: var(--radius-full); object-fit: cover;">
            ${u.is_online ? '<span style="position: absolute; bottom: 2px; right: 2px; width: 11px; height: 11px; background: var(--success); border-radius: 50%; border: 2px solid var(--bg-card);"></span>' : ''}
          </div>
          <div style="min-width: 0;">
            <div style="font-weight: 700; color: var(--text-main); font-size: 14.5px; display: flex; align-items: center; gap: 6px;">
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(u.full_name)}</span>
              ${u.is_owner ? '<span class="owner-pill">Owner</span>' : ''}
            </div>
            <div class="user-search-id" style="color: var(--primary); font-size: 12.5px; font-weight: 600;">@${escapeHTML(u.username)}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHTML(u.bio || 'Using Connectly')} · 👥 ${u.followers_count || 0} followers
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0; margin-left: 10px;">
          <button class="btn-secondary" style="width: auto; padding: 6px 12px; font-size: 12px;" onclick="openUserProfileModal('${u.id}')">
            Profile
          </button>
          <button class="btn-primary" style="width: auto; padding: 6px 16px; font-size: 13px;" onclick="startChatWithUser('${u.id}', '${u.username}')">
            💬 Message
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    resultsContainer.innerHTML = `<div style="color: var(--danger); padding: 12px;">${err.message}</div>`;
  }
}

async function startChatWithUser(recipientId, recipientUsername) {
  closeUserSearchModal();
  closeUserProfileModal();
  closeFollowsModal();
  try {
    switchViewTab('chats');
    const res = await api('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ recipient_id: recipientId, recipient_username: recipientUsername })
    });
    await loadConversations();
    if (res && res.conversation && res.conversation.id) {
      if (!state.conversations.find(c => c.id === res.conversation.id)) {
        state.conversations.unshift(res.conversation);
      }
      selectConversation(res.conversation.id);
    }
    setTimeout(() => {
      const input = document.getElementById('chat-text-input');
      if (input) input.focus();
    }, 150);
  } catch (err) {
    alert('Error starting conversation: ' + err.message);
  }
}

// --- STATUS & STORIES SYSTEM (PRD Section 9) ---
async function loadStories() {
  if (!state.currentUser) return;
  try {
    const res = await api('/api/stories');
    state.stories = res.story_groups || [];
    renderStoriesTray();
  } catch (err) {
    console.error('Failed to load stories', err);
  }
}

let currentSelectedStatusMedia = null;
let currentSelectedStatusMediaType = 'image';

function openStatusGalleryPicker() {
  const input = document.getElementById('status-gallery-file-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

function handleStatusMediaSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    currentSelectedStatusMedia = reader.result;
    currentSelectedStatusMediaType = file.type.startsWith('video/') ? 'video' : 'image';

    const modal = document.getElementById('status-media-preview-modal');
    const imgEl = document.getElementById('status-preview-media-img');
    const vidEl = document.getElementById('status-preview-media-vid');
    const captionInput = document.getElementById('status-caption-input');

    if (captionInput) captionInput.value = '';

    if (currentSelectedStatusMediaType === 'video') {
      imgEl.style.display = 'none';
      vidEl.style.display = 'block';
      vidEl.src = currentSelectedStatusMedia;
      vidEl.play().catch(() => {});
    } else {
      vidEl.style.display = 'none';
      imgEl.style.display = 'block';
      imgEl.src = currentSelectedStatusMedia;
    }

    modal.classList.add('active');
  };
  reader.readAsDataURL(file);
}

function closeStatusMediaPreviewModal() {
  const modal = document.getElementById('status-media-preview-modal');
  if (modal) modal.classList.remove('active');
  const vidEl = document.getElementById('status-preview-media-vid');
  if (vidEl) vidEl.pause();
  currentSelectedStatusMedia = null;
}

async function submitStatusMedia() {
  if (!currentSelectedStatusMedia) return;
  const captionInput = document.getElementById('status-caption-input');
  const caption = captionInput ? captionInput.value.trim() : '';

  showToast('Publishing status...');
  closeStatusMediaPreviewModal();

  try {
    let mediaUrl = currentSelectedStatusMedia;
    if (!state.standaloneMode) {
      try {
        const uploadRes = await api('/api/upload', {
          method: 'POST',
          body: JSON.stringify({
            data_url: currentSelectedStatusMedia,
            filename: 'status_' + Date.now() + (currentSelectedStatusMediaType === 'video' ? '.mp4' : '.jpg'),
            file_type: currentSelectedStatusMediaType === 'video' ? 'video/mp4' : 'image/jpeg'
          })
        });
        if (uploadRes && uploadRes.url) mediaUrl = uploadRes.url;
      } catch (e) {
        console.warn('Upload API fallback to data URL', e);
      }
    }

    await api('/api/stories', {
      method: 'POST',
      body: JSON.stringify({
        story_type: currentSelectedStatusMediaType,
        media_url: mediaUrl,
        caption: caption
      })
    });

    playNotificationSound('send');
    showToast('Status published! Visible to everyone for 24 hours. 📱✨');
    loadStories();
  } catch (err) {
    alert('Failed to share status: ' + err.message);
  }
}

function handleMyStatusClick() {
  const myGroup = state.stories.find(g => g.user.id === state.currentUser?.id);
  if (myGroup && myGroup.stories.length > 0) {
    const choice = confirm('You have an active status!\n\nClick "OK" to choose a new Photo/Video from Gallery.\nClick "Cancel" to view your current status.');
    if (choice) {
      openStatusGalleryPicker();
    } else {
      const myIndex = state.stories.findIndex(g => g.user.id === state.currentUser?.id);
      if (myIndex > -1) openStoryViewer(myIndex);
    }
  } else {
    openStatusGalleryPicker();
  }
}

function renderStoriesTray() {
  const tray = document.getElementById('stories-tray');
  if (!tray) return;

  const myGroup = state.stories.find(g => g.user.id === state.currentUser?.id);
  const hasMyStory = myGroup && myGroup.stories.length > 0;

  let html = `
    <div class="story-tray-item" onclick="handleMyStatusClick()">
      <div class="story-ring ${hasMyStory ? '' : 'add-story'}" title="Tap to select photo/video from gallery">
        <img src="${state.currentUser.profile_picture}" alt="My Status">
        <span class="add-story-plus" onclick="event.stopPropagation(); openStatusGalleryPicker();" title="Add photo/video from gallery">+</span>
      </div>
      <span class="story-username">My Status</span>
    </div>
  `;

  state.stories.forEach((group, index) => {
    if (group.user.id === state.currentUser.id) return;
    html += `
      <div class="story-tray-item" onclick="openStoryViewer(${index})">
        <div class="story-ring">
          <img src="${group.user.profile_picture}" alt="${group.user.full_name}">
        </div>
        <span class="story-username">${escapeHTML(group.user.full_name.split(' ')[0])}</span>
      </div>
    `;
  });

  tray.innerHTML = html;
}

function openAddStoryModal() {
  document.getElementById('add-story-modal').classList.add('active');
}

function closeAddStoryModal() {
  document.getElementById('add-story-modal').classList.remove('active');
}

async function handleCreateStory(type) {
  if (type === 'text') {
    const text = document.getElementById('story-text-input').value.trim();
    if (!text) return;
    const bg = document.getElementById('story-bg-select').value;
    try {
      await api('/api/stories', {
        method: 'POST',
        body: JSON.stringify({
          story_type: 'text',
          caption: text,
          bg_color: bg
        })
      });
      closeAddStoryModal();
      showToast('Status published! Expiring in 24 hours.');
      loadStories();
    } catch (err) {
      alert('Error creating status: ' + err.message);
    }
  }
}

function openStoryViewer(groupIndex) {
  state.currentStoryGroupIndex = groupIndex;
  state.currentStoryIndex = 0;
  const modal = document.getElementById('story-viewer-modal-wrap');
  modal.classList.add('active');
  renderCurrentStory();
}

function closeStoryViewer() {
  clearInterval(state.storyViewerInterval);
  const activeVid = document.getElementById('story-active-video');
  if (activeVid) {
    try { activeVid.pause(); } catch (e) {}
  }
  document.getElementById('story-viewer-modal-wrap').classList.remove('active');
  state.currentViewingStoryId = null;
}

function renderCurrentStory() {
  clearInterval(state.storyViewerInterval);
  const group = state.stories[state.currentStoryGroupIndex];
  if (!group || !group.stories[state.currentStoryIndex]) {
    closeStoryViewer();
    return;
  }

  const story = group.stories[state.currentStoryIndex];
  state.currentViewingStoryId = story.id;
  const total = group.stories.length;

  const progressBarsContainer = document.getElementById('story-progress-bars');
  progressBarsContainer.innerHTML = Array.from({ length: total }).map((_, i) => `
    <div class="story-progress-track">
      <div class="story-progress-fill" id="story-progress-${i}" style="width: ${i < state.currentStoryIndex ? '100%' : '0%'};"></div>
    </div>
  `).join('');

  document.getElementById('story-viewer-avatar').src = group.user.profile_picture;
  document.getElementById('story-viewer-name').textContent = group.user.full_name;
  document.getElementById('story-viewer-time').textContent = formatRelativeTime(story.created_at);

  const userChip = document.querySelector('.story-user-chip');
  if (userChip) {
    userChip.style.cursor = 'pointer';
    userChip.onclick = (e) => {
      e.stopPropagation();
      openUserProfileModal(group.user.id);
    };
  }

  const contentArea = document.getElementById('story-viewer-content');
  if (story.story_type === 'text') {
    contentArea.innerHTML = `
      <div class="story-text-display" style="background: ${story.bg_color || '#6C63FF'}; color: white;">
        ${escapeHTML(story.caption)}
      </div>
    `;
    startStoryProgressTimer(6000);
  } else if (story.story_type === 'image') {
    contentArea.innerHTML = `<img src="${story.media_url}" alt="Story" style="width: 100%; height: 100%; object-fit: contain;">`;
    startStoryProgressTimer(6000);
  } else if (story.story_type === 'video') {
    contentArea.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000;">
        <video id="story-active-video" src="${story.media_url}" playsinline webkit-playsinline style="width: 100%; height: 100%; object-fit: contain; cursor: pointer;" onclick="toggleStoryPlayPause(event)"></video>
        <button id="story-sound-badge" class="story-sound-badge" onclick="toggleStorySound(event)">
          🔊 Sound On
        </button>
      </div>
    `;
    const vid = document.getElementById('story-active-video');
    if (vid) {
      vid.onended = () => { nextStory(); };
      vid.ontimeupdate = () => {
        if (vid.duration && !isNaN(vid.duration)) {
          const pct = (vid.currentTime / vid.duration) * 100;
          const currentFill = document.getElementById(`story-progress-${state.currentStoryIndex}`);
          if (currentFill) currentFill.style.width = `${pct}%`;
        }
      };

      // Autoplay: First try unmuted; if modern browser restricts unmuted audio, switch to muted autoplay with tap-for-sound pill!
      vid.muted = false;
      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          updateStorySoundBadge(false);
        }).catch((err) => {
          console.warn('Autoplay unmuted blocked by browser policy, switching to muted:', err);
          vid.muted = true;
          vid.play().then(() => {
            updateStorySoundBadge(true);
          }).catch((playErr) => {
            console.error('Video autoplay failed completely, waiting for user tap:', playErr);
            updateStorySoundBadge(true);
            startStoryProgressTimer(10000);
          });
        });
      }
    }
  }

  const captionOverlay = document.getElementById('story-caption-overlay');
  if (story.caption && story.story_type !== 'text') {
    captionOverlay.textContent = story.caption;
    captionOverlay.style.display = 'block';
  } else {
    captionOverlay.style.display = 'none';
  }

  // Auto-record story view if viewing someone else's story
  if (state.currentUser && story.user_id !== state.currentUser.id) {
    api(`/api/stories/${story.id}/view`, { method: 'POST' }).then(res => {
      if (res && res.views_count !== undefined) {
        story.views = res.views || story.views || [];
        const viewEl = document.getElementById('story-view-count');
        if (viewEl) viewEl.textContent = res.views_count;
      }
    }).catch(() => {});
  }

  // Update Footer actions (Views & Likes)
  renderStoryFooterActions(story, group);
}

function updateStorySoundBadge(isMuted) {
  const badge = document.getElementById('story-sound-badge');
  if (!badge) return;
  if (isMuted) {
    badge.innerHTML = '🔇 Tap for Sound';
    badge.classList.add('muted');
  } else {
    badge.innerHTML = '🔊 Sound On';
    badge.classList.remove('muted');
  }
}

function toggleStorySound(e) {
  if (e) e.stopPropagation();
  const vid = document.getElementById('story-active-video');
  if (!vid) return;
  vid.muted = !vid.muted;
  updateStorySoundBadge(vid.muted);
}

function toggleStoryPlayPause(e) {
  if (e) e.stopPropagation();
  const vid = document.getElementById('story-active-video');
  if (!vid) return;
  if (vid.paused) {
    vid.play().catch(() => {});
  } else {
    vid.pause();
  }
}

function renderStoryFooterActions(story, group) {
  const isOwner = state.currentUser && story.user_id === state.currentUser.id;
  const viewerActions = document.getElementById('story-actions-viewer');
  const ownerActions = document.getElementById('story-actions-owner');

  const viewsCount = story.views ? story.views.length : (story.views_count || 0);
  const likesCount = story.likes ? story.likes.length : (story.likes_count || 0);
  const hasLiked = story.has_liked || (story.likes && story.likes.some(l => (typeof l === 'string' ? l : l.user_id) === state.currentUser?.id));

  if (isOwner) {
    if (viewerActions) viewerActions.style.display = 'none';
    if (ownerActions) {
      ownerActions.style.display = 'flex';
      const ownerViewsEl = document.getElementById('story-owner-views-count');
      const ownerLikesEl = document.getElementById('story-owner-likes-count');
      if (ownerViewsEl) ownerViewsEl.textContent = viewsCount;
      if (ownerLikesEl) ownerLikesEl.textContent = likesCount;
    }
  } else {
    if (ownerActions) ownerActions.style.display = 'none';
    if (viewerActions) {
      viewerActions.style.display = 'flex';
      const likeBtn = document.getElementById('story-like-btn');
      const likeIcon = document.getElementById('story-like-icon');
      const likeText = document.getElementById('story-like-text');
      const likeCountEl = document.getElementById('story-like-count');
      const viewCountEl = document.getElementById('story-view-count');

      if (likeBtn) likeBtn.className = hasLiked ? 'story-like-btn liked' : 'story-like-btn';
      if (likeIcon) likeIcon.textContent = hasLiked ? '❤️' : '🤍';
      if (likeText) likeText.textContent = hasLiked ? 'Liked' : 'Like';
      if (likeCountEl) likeCountEl.textContent = likesCount;
      if (viewCountEl) viewCountEl.textContent = viewsCount;
    }
  }
}

async function toggleStoryLike(e) {
  if (e) e.stopPropagation();
  const group = state.stories[state.currentStoryGroupIndex];
  if (!group || !group.stories[state.currentStoryIndex]) return;
  const story = group.stories[state.currentStoryIndex];

  try {
    const res = await api(`/api/stories/${story.id}/like`, { method: 'POST' });
    story.has_liked = res.liked;
    story.likes = res.likes || [];
    story.likes_count = res.likes_count;
    renderStoryFooterActions(story, group);
  } catch (err) {
    console.error('Failed to toggle like', err);
  }
}

function openStoryViewersModal(e) {
  if (e) e.stopPropagation();
  const activeVid = document.getElementById('story-active-video');
  if (activeVid) activeVid.pause();
  clearInterval(state.storyViewerInterval);

  const group = state.stories[state.currentStoryGroupIndex];
  if (!group || !group.stories[state.currentStoryIndex]) return;
  const story = group.stories[state.currentStoryIndex];

  const modal = document.getElementById('story-viewers-modal');
  const listEl = document.getElementById('story-viewers-list');
  const countEl = document.getElementById('story-viewers-modal-count');

  const views = story.views || [];
  if (countEl) countEl.textContent = views.length;

  if (views.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
        <div style="font-size: 28px; margin-bottom: 6px;">👀</div>
        <p style="font-weight: 600;">No views yet</p>
        <p style="font-size: 12px; margin-top: 4px;">When friends view your status, they will appear here.</p>
      </div>
    `;
  } else {
    listEl.innerHTML = views.map(v => `
      <div class="follows-user-row" onclick="closeStoryViewersModal(); openUserProfileModal('${v.viewer_id}');">
        <div class="follows-user-left">
          <img src="${v.viewer_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}" class="follows-user-avatar" alt="${escapeHTML(v.viewer_name || 'User')}">
          <div>
            <div style="font-weight: 700; color: var(--text-main); font-size: 14px;">${escapeHTML(v.viewer_name || 'User')}</div>
            <div style="font-size: 12px; color: var(--primary); font-weight: 600;">@${escapeHTML(v.viewer_username || 'user')}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${formatRelativeTime(v.viewed_at || new Date())}</div>
          </div>
        </div>
        <button class="btn-secondary" style="width: auto; padding: 4px 10px; font-size: 12px;">Profile</button>
      </div>
    `).join('');
  }

  modal.classList.add('active');
}

function closeStoryViewersModal() {
  const modal = document.getElementById('story-viewers-modal');
  if (modal) modal.classList.remove('active');
  const activeVid = document.getElementById('story-active-video');
  if (activeVid) activeVid.play().catch(() => {});
}

// ==========================================================================
// SOCIAL USER PROFILE & FOLLOW / FOLLOWING SYSTEM
// ==========================================================================
async function openUserProfileModal(userId, showLoading = true) {
  state.viewingProfileUserId = userId;
  const modal = document.getElementById('user-profile-modal');
  if (!modal) return;
  modal.classList.add('active');

  if (showLoading) {
    document.getElementById('profile-modal-name').textContent = 'Loading...';
    document.getElementById('profile-modal-handle').textContent = '@...';
    document.getElementById('profile-modal-bio').textContent = '';
  }

  try {
    const data = await api(`/api/users/${userId}/profile`);
    const u = data.user;
    state.viewingProfileUser = u;

    document.getElementById('profile-modal-avatar').src = u.profile_picture;
    document.getElementById('profile-modal-name').textContent = u.full_name;
    document.getElementById('profile-modal-handle').textContent = `@${u.username}`;
    document.getElementById('profile-modal-bio').textContent = u.bio || 'Using Connectly to connect and communicate.';
    document.getElementById('profile-modal-followers-count').textContent = data.followers_count || 0;
    document.getElementById('profile-modal-following-count').textContent = data.following_count || 0;

    const isSelf = state.currentUser && state.currentUser.id === u.id;
    const actionsContainer = document.getElementById('profile-modal-actions');

    if (isSelf) {
      actionsContainer.innerHTML = `
        <button class="btn-primary" style="flex: 1;" onclick="closeUserProfileModal(); switchViewTab('settings');">
          ⚙️ Edit Profile & Settings
        </button>
      `;
    } else {
      const isFollowing = data.is_following;
      actionsContainer.innerHTML = `
        <button id="profile-follow-btn" class="${isFollowing ? 'btn-secondary' : 'btn-primary'}" onclick="toggleFollowUser('${u.id}')">
          ${isFollowing ? '✓ Following' : '+ Follow'}
        </button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%);" onclick="startChatWithUser('${u.id}', '${u.username}')">
          💬 Message
        </button>
        <button class="icon-btn" style="background: var(--bg-hover); color: var(--text-main); width: 44px; height: 44px;" title="Voice Call" onclick="closeUserProfileModal(); startOutgoingCall('${u.id}', 'audio')">
          📞
        </button>
        <button class="icon-btn" style="background: var(--bg-hover); color: var(--text-main); width: 44px; height: 44px;" title="Video Call" onclick="closeUserProfileModal(); startOutgoingCall('${u.id}', 'video')">
          🎥
        </button>
      `;
    }
  } catch (err) {
    alert('Failed to load profile: ' + err.message);
    closeUserProfileModal();
  }
}

function closeUserProfileModal() {
  const modal = document.getElementById('user-profile-modal');
  if (modal) modal.classList.remove('active');
  state.viewingProfileUserId = null;
}

async function toggleFollowUser(userId) {
  try {
    const res = await api(`/api/users/${userId}/follow`, { method: 'POST' });
    const btn = document.getElementById('profile-follow-btn');
    if (btn) {
      btn.className = res.is_following ? 'btn-secondary' : 'btn-primary';
      btn.textContent = res.is_following ? '✓ Following' : '+ Follow';
    }
    const followersEl = document.getElementById('profile-modal-followers-count');
    if (followersEl) followersEl.textContent = res.followers_count;

    if (state.currentUser) {
      updateCurrentUserUI();
    }
    showToast(res.is_following ? 'Followed successfully!' : 'Unfollowed');
  } catch (err) {
    alert('Error updating follow: ' + err.message);
  }
}

async function openFollowsModal(userId, activeTab = 'followers') {
  const modal = document.getElementById('follows-list-modal');
  if (!modal) return;
  modal.classList.add('active');

  state.activeFollowsUserId = userId || (state.viewingProfileUserId || state.currentUser?.id);
  state.activeFollowsTab = activeTab;

  switchFollowsTab(activeTab);
}

function closeFollowsModal() {
  const modal = document.getElementById('follows-list-modal');
  if (modal) modal.classList.remove('active');
}

async function switchFollowsTab(tab) {
  state.activeFollowsTab = tab;
  const tabFollowers = document.getElementById('tab-btn-followers');
  const tabFollowing = document.getElementById('tab-btn-following');
  if (tabFollowers) tabFollowers.classList.toggle('active', tab === 'followers');
  if (tabFollowing) tabFollowing.classList.toggle('active', tab === 'following');

  const container = document.getElementById('follows-list-content');
  container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Loading...</div>`;

  try {
    const endpoint = tab === 'followers'
      ? `/api/users/${state.activeFollowsUserId}/followers`
      : `/api/users/${state.activeFollowsUserId}/following`;

    const res = await api(endpoint);
    const list = tab === 'followers' ? (res.followers || []) : (res.following || []);

    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
          <p style="font-weight: 600;">No ${tab} yet</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(u => `
      <div class="follows-user-row">
        <div class="follows-user-left" onclick="closeFollowsModal(); openUserProfileModal('${u.id}')">
          <img src="${u.profile_picture}" class="follows-user-avatar" alt="${escapeHTML(u.full_name)}">
          <div style="min-width: 0;">
            <div style="font-weight: 700; color: var(--text-main); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHTML(u.full_name)}
            </div>
            <div style="font-size: 12px; color: var(--primary); font-weight: 600;">@${escapeHTML(u.username)}</div>
            <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHTML(u.bio || 'Using Connectly')}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
          <button class="btn-secondary" style="width: auto; padding: 5px 10px; font-size: 12px;" onclick="closeFollowsModal(); openUserProfileModal('${u.id}')">
            Profile
          </button>
          <button class="btn-primary" style="width: auto; padding: 5px 12px; font-size: 12px;" onclick="startChatWithUser('${u.id}', '${u.username}')">
            💬
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 12px;">${err.message}</div>`;
  }
}

function startStoryProgressTimer(durationMs) {
  let progress = 0;
  const stepMs = 50;
  const increment = (stepMs / durationMs) * 100;
  const currentFill = document.getElementById(`story-progress-${state.currentStoryIndex}`);

  state.storyViewerInterval = setInterval(() => {
    progress += increment;
    if (currentFill) currentFill.style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(state.storyViewerInterval);
      nextStory();
    }
  }, stepMs);
}

function nextStory() {
  const group = state.stories[state.currentStoryGroupIndex];
  if (!group) return;
  if (state.currentStoryIndex < group.stories.length - 1) {
    state.currentStoryIndex++;
    renderCurrentStory();
  } else if (state.currentStoryGroupIndex < state.stories.length - 1) {
    state.currentStoryGroupIndex++;
    state.currentStoryIndex = 0;
    renderCurrentStory();
  } else {
    closeStoryViewer();
  }
}

function prevStory() {
  if (state.currentStoryIndex > 0) {
    state.currentStoryIndex--;
    renderCurrentStory();
  } else if (state.currentStoryGroupIndex > 0) {
    state.currentStoryGroupIndex--;
    const prevGroup = state.stories[state.currentStoryGroupIndex];
    state.currentStoryIndex = prevGroup.stories.length - 1;
    renderCurrentStory();
  }
}

// --- CHAT LOCK & PIN SECURITY (PRD Section 10) ---
let currentPinBuffer = '';
let pinSuccessCallback = null;
let currentPinConvId = null;

function promptChatLockPIN(convId, onSuccess) {
  currentPinBuffer = '';
  currentPinConvId = convId;
  pinSuccessCallback = onSuccess;
  updatePinDots();

  const modal = document.getElementById('pin-lock-modal');
  modal.classList.add('active');
  document.getElementById('pin-modal-title').textContent = 'Enter 4-Digit Chat PIN';
  document.getElementById('pin-error-msg').textContent = '';
}

function handlePinPress(digit) {
  if (currentPinBuffer.length < 4) {
    currentPinBuffer += digit;
    updatePinDots();
    if (currentPinBuffer.length === 4) {
      verifyOrSetPIN();
    }
  }
}

function handlePinDelete() {
  if (currentPinBuffer.length > 0) {
    currentPinBuffer = currentPinBuffer.slice(0, -1);
    updatePinDots();
  }
}

function updatePinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`pin-dot-${i}`);
    if (dot) {
      dot.classList.toggle('filled', i <= currentPinBuffer.length);
    }
  }
}

async function verifyOrSetPIN() {
  const convId = currentPinConvId;
  const pin = currentPinBuffer;
  const errBox = document.getElementById('pin-error-msg');

  try {
    await api(`/api/conversations/${convId}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ pin })
    });

    state.unlockedChats.add(convId);
    sessionStorage.setItem(`pin_${convId}`, pin);
    document.getElementById('pin-lock-modal').classList.remove('active');
    if (pinSuccessCallback) pinSuccessCallback();
  } catch (err) {
    errBox.textContent = 'Incorrect PIN. Try again.';
    currentPinBuffer = '';
    updatePinDots();
  }
}

async function lockCurrentChatPrompt() {
  if (!state.activeConversation) return;
  const convId = state.activeConversation.id;

  if (state.activeConversation.is_locked) {
    const pin = prompt('Enter existing 4-digit PIN to remove Chat Lock:');
    if (!pin) return;
    try {
      await api(`/api/conversations/${convId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ pin, disable: true })
      });
      state.unlockedChats.delete(convId);
      sessionStorage.removeItem(`pin_${convId}`);
      showToast('Chat Lock removed.');
      loadConversations();
    } catch (err) {
      alert(err.message);
    }
  } else {
    const pin = prompt('Set a 4-digit PIN for this conversation:');
    if (!pin || pin.length < 4) return alert('PIN must be at least 4 digits');
    try {
      await api(`/api/conversations/${convId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ pin })
      });
      state.unlockedChats.add(convId);
      sessionStorage.setItem(`pin_${convId}`, pin);
      showToast('Chat Locked successfully with PIN!');
      loadConversations();
    } catch (err) {
      alert(err.message);
    }
  }
}

// --- WEBRTC REAL-TIME CALLING (VOICE & VIDEO) ---
function sendCallSignal(targetUserId, payload) {
  const signalMsg = {
    target_user_id: targetUserId,
    sender_id: state.currentUser ? state.currentUser.id : null,
    caller: state.currentUser ? {
      id: state.currentUser.id,
      full_name: state.currentUser.full_name,
      username: state.currentUser.username,
      profile_picture: state.currentUser.profile_picture
    } : null,
    ...payload
  };

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ event: 'call_signal', data: signalMsg }));
  }
  if (syncChannel && state.currentUser) {
    syncChannel.postMessage({
      action: 'CALL_SIGNAL',
      payload: signalMsg,
      senderId: state.currentUser.id
    });
  }
}

async function startCall(type = 'voice') {
  if (!state.activeConversation) return;
  const recipient = state.activeConversation.recipient;
  if (!recipient || !recipient.id) return;

  if (callState.status !== 'idle') {
    showToast('A call is already in progress.');
    return;
  }

  callState.status = 'calling';
  callState.callRole = 'caller';
  callState.callType = type;
  callState.remoteUser = recipient;
  callState.isMuted = false;
  callState.isVideoOff = false;
  callState.pendingCandidates = [];

  showCallModalUI('outgoing');
  playCallRingtone('outgoing');

  try {
    const constraints = {
      audio: true,
      video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
    };

    try {
      callState.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (mediaErr) {
      if (type === 'video') {
        showToast('Camera access denied, switching to voice-only call.');
        callState.callType = 'voice';
        callState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw mediaErr;
      }
    }

    const localVideo = document.getElementById('call-local-video');
    if (localVideo) {
      if (callState.callType === 'video') {
        localVideo.srcObject = callState.localStream;
        localVideo.style.display = 'block';
      } else {
        localVideo.style.display = 'none';
      }
    }

    callState.peerConnection = new RTCPeerConnection(rtcConfig);

    callState.localStream.getTracks().forEach(track => {
      callState.peerConnection.addTrack(track, callState.localStream);
    });

    callState.peerConnection.ontrack = (event) => {
      callState.remoteStream = event.streams[0];
      const remoteVideo = document.getElementById('call-remote-video');
      const remoteAudio = document.getElementById('call-remote-audio');
      if (remoteVideo) remoteVideo.srcObject = callState.remoteStream;
      if (remoteAudio) remoteAudio.srcObject = callState.remoteStream;
    };

    callState.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal(recipient.id, {
          signal_type: 'ice_candidate',
          candidate: event.candidate
        });
      }
    };

    const offer = await callState.peerConnection.createOffer();
    await callState.peerConnection.setLocalDescription(offer);

    sendCallSignal(recipient.id, {
      signal_type: 'offer',
      call_type: callState.callType,
      sdp: offer
    });

    callState.ringTimeout = setTimeout(() => {
      if (callState.status === 'calling') {
        showToast('No answer.');
        endCall(true);
      }
    }, 45000);

  } catch (err) {
    showToast('Could not start call: ' + err.message);
    endCall(false);
  }
}

async function handleIncomingCallSignal(data) {
  const signalType = data.signal_type;

  if (signalType === 'offer') {
    if (callState.status !== 'idle') {
      sendCallSignal(data.from_user_id || data.sender_id, { signal_type: 'busy' });
      return;
    }

    callState.status = 'incoming';
    callState.callRole = 'callee';
    callState.callType = data.call_type || 'voice';
    callState.remoteUser = data.caller || { id: data.from_user_id || data.sender_id, full_name: 'Caller', username: 'user' };
    callState.offerSdp = data.sdp;
    callState.pendingCandidates = [];

    showCallModalUI('incoming');
    playCallRingtone('incoming');
  } else if (signalType === 'answer') {
    if (callState.peerConnection && callState.status === 'calling') {
      stopCallRingtone();
      if (callState.ringTimeout) clearTimeout(callState.ringTimeout);

      await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

      while (callState.pendingCandidates.length > 0) {
        const cand = callState.pendingCandidates.shift();
        try {
          await callState.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {}
      }

      callState.status = 'connected';
      showCallModalUI('connected');
      startCallTimer();
      playNotificationSound('receive');
    }
  } else if (signalType === 'ice_candidate') {
    if (data.candidate) {
      if (callState.peerConnection && callState.peerConnection.remoteDescription) {
        try {
          await callState.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {}
      } else {
        callState.pendingCandidates.push(data.candidate);
      }
    }
  } else if (signalType === 'decline') {
    stopCallRingtone();
    showToast(`${callState.remoteUser?.full_name || 'User'} declined the call.`);
    endCall(false);
  } else if (signalType === 'busy') {
    stopCallRingtone();
    showToast(`${callState.remoteUser?.full_name || 'User'} is busy on another call.`);
    endCall(false);
  } else if (signalType === 'end') {
    stopCallRingtone();
    showToast('Call ended.');
    endCall(false);
  }
}

async function acceptIncomingCall() {
  stopCallRingtone();
  if (callState.status !== 'incoming') return;

  try {
    const constraints = {
      audio: true,
      video: callState.callType === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
    };

    try {
      callState.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (mediaErr) {
      callState.callType = 'voice';
      callState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const localVideo = document.getElementById('call-local-video');
    if (localVideo) {
      if (callState.callType === 'video') {
        localVideo.srcObject = callState.localStream;
        localVideo.style.display = 'block';
      } else {
        localVideo.style.display = 'none';
      }
    }

    callState.peerConnection = new RTCPeerConnection(rtcConfig);

    callState.localStream.getTracks().forEach(track => {
      callState.peerConnection.addTrack(track, callState.localStream);
    });

    callState.peerConnection.ontrack = (event) => {
      callState.remoteStream = event.streams[0];
      const remoteVideo = document.getElementById('call-remote-video');
      const remoteAudio = document.getElementById('call-remote-audio');
      if (remoteVideo) remoteVideo.srcObject = callState.remoteStream;
      if (remoteAudio) remoteAudio.srcObject = callState.remoteStream;
    };

    callState.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal(callState.remoteUser.id, {
          signal_type: 'ice_candidate',
          candidate: event.candidate
        });
      }
    };

    await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(callState.offerSdp));

    while (callState.pendingCandidates.length > 0) {
      const cand = callState.pendingCandidates.shift();
      try {
        await callState.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {}
    }

    const answer = await callState.peerConnection.createAnswer();
    await callState.peerConnection.setLocalDescription(answer);

    sendCallSignal(callState.remoteUser.id, {
      signal_type: 'answer',
      sdp: answer
    });

    callState.status = 'connected';
    showCallModalUI('connected');
    startCallTimer();
  } catch (err) {
    showToast('Failed to accept call: ' + err.message);
    declineIncomingCall();
  }
}

function declineIncomingCall() {
  stopCallRingtone();
  if (callState.remoteUser) {
    sendCallSignal(callState.remoteUser.id, { signal_type: 'decline' });
  }
  endCall(false);
}

function endCall(notifyRemote = true) {
  stopCallRingtone();
  if (callState.ringTimeout) clearTimeout(callState.ringTimeout);
  if (callState.callTimerInterval) clearInterval(callState.callTimerInterval);

  if (notifyRemote && callState.remoteUser && callState.status !== 'idle') {
    sendCallSignal(callState.remoteUser.id, { signal_type: 'end' });
  }

  if (callState.localStream) {
    callState.localStream.getTracks().forEach(track => track.stop());
    callState.localStream = null;
  }

  if (callState.peerConnection) {
    callState.peerConnection.close();
    callState.peerConnection = null;
  }

  const remoteVideo = document.getElementById('call-remote-video');
  const localVideo = document.getElementById('call-local-video');
  const remoteAudio = document.getElementById('call-remote-audio');
  if (remoteVideo) remoteVideo.srcObject = null;
  if (localVideo) localVideo.srcObject = null;
  if (remoteAudio) remoteAudio.srcObject = null;

  callState.status = 'idle';
  callState.remoteUser = null;
  callState.offerSdp = null;
  callState.pendingCandidates = [];

  const modal = document.getElementById('call-modal');
  if (modal) modal.classList.remove('active');
  const dialog = document.getElementById('call-dialog');
  if (dialog) dialog.classList.remove('video-active');
}

function showCallModalUI(phase) {
  const modal = document.getElementById('call-modal');
  const dialog = document.getElementById('call-dialog');
  const avatar = document.getElementById('call-contact-avatar');
  const nameEl = document.getElementById('call-contact-name');
  const handleEl = document.getElementById('call-contact-handle');
  const statusEl = document.getElementById('call-status-label');
  const timerBadge = document.getElementById('call-timer-badge');
  const incomingButtons = document.getElementById('call-incoming-buttons');
  const activeButtons = document.getElementById('call-active-buttons');
  const cameraBtn = document.getElementById('call-camera-btn');
  const switchCamBtn = document.getElementById('call-switch-cam-btn');
  const waves = document.getElementById('call-audio-waves');

  if (!modal) return;
  modal.classList.add('active');

  const u = callState.remoteUser || { full_name: 'Contact', username: 'user', profile_picture: '' };
  if (avatar) avatar.src = u.profile_picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.username;
  if (nameEl) nameEl.textContent = u.full_name;
  if (handleEl) handleEl.textContent = `@${u.username}`;

  if (callState.callType === 'video' && phase === 'connected') {
    if (dialog) dialog.classList.add('video-active');
  } else {
    if (dialog) dialog.classList.remove('video-active');
  }

  if (cameraBtn) cameraBtn.style.display = callState.callType === 'video' ? 'flex' : 'none';
  if (switchCamBtn) switchCamBtn.style.display = callState.callType === 'video' ? 'flex' : 'none';

  if (phase === 'incoming') {
    if (statusEl) statusEl.textContent = `Incoming ${callState.callType === 'video' ? 'Video' : 'Voice'} Call...`;
    if (timerBadge) timerBadge.style.display = 'none';
    if (waves) waves.style.display = 'none';
    if (incomingButtons) incomingButtons.style.display = 'flex';
    if (activeButtons) activeButtons.style.display = 'none';
  } else if (phase === 'outgoing') {
    if (statusEl) statusEl.textContent = `Calling ${u.full_name}... Ringing`;
    if (timerBadge) timerBadge.style.display = 'none';
    if (waves) waves.style.display = 'none';
    if (incomingButtons) incomingButtons.style.display = 'none';
    if (activeButtons) activeButtons.style.display = 'flex';
  } else if (phase === 'connected') {
    if (statusEl) statusEl.textContent = callState.callType === 'video' ? 'Video Connected' : 'Voice Call in progress';
    if (timerBadge) {
      timerBadge.style.display = 'inline-flex';
      timerBadge.textContent = '00:00';
    }
    if (waves) waves.style.display = callState.callType === 'voice' ? 'flex' : 'none';
    if (incomingButtons) incomingButtons.style.display = 'none';
    if (activeButtons) activeButtons.style.display = 'flex';
  }
}

function startCallTimer() {
  callState.callStartTime = Date.now();
  const timerBadge = document.getElementById('call-timer-badge');
  if (callState.callTimerInterval) clearInterval(callState.callTimerInterval);

  callState.callTimerInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - callState.callStartTime) / 1000);
    const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    if (timerBadge) timerBadge.textContent = `${m}:${s}`;
  }, 1000);
}

function toggleCallMute() {
  if (!callState.localStream) return;
  const audioTrack = callState.localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    callState.isMuted = !audioTrack.enabled;
    const btn = document.getElementById('call-mute-btn');
    if (btn) btn.classList.toggle('active', callState.isMuted);
    showToast(callState.isMuted ? 'Microphone muted' : 'Microphone unmuted');
  }
}

function toggleCallVideo() {
  if (!callState.localStream) return;
  const videoTrack = callState.localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    callState.isVideoOff = !videoTrack.enabled;
    const btn = document.getElementById('call-camera-btn');
    if (btn) btn.classList.toggle('active', callState.isVideoOff);
    showToast(callState.isVideoOff ? 'Camera turned off' : 'Camera turned on');
  }
}

async function switchCallCamera() {
  if (!callState.localStream || callState.callType !== 'video') return;
  callState.facingMode = callState.facingMode === 'user' ? 'environment' : 'user';
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: callState.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const newVideoTrack = newStream.getVideoTracks()[0];
    const oldVideoTrack = callState.localStream.getVideoTracks()[0];
    if (callState.peerConnection) {
      const sender = callState.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(newVideoTrack);
    }
    callState.localStream.removeTrack(oldVideoTrack);
    oldVideoTrack.stop();
    callState.localStream.addTrack(newVideoTrack);
    const localVideo = document.getElementById('call-local-video');
    if (localVideo) localVideo.srcObject = callState.localStream;
    showToast('Switched camera');
  } catch (e) {
    showToast('Could not flip camera');
  }
}

// --- SETTINGS & PROFILE VIEW ---
function switchViewTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.rail-item').forEach(el => el.classList.remove('active'));
  const btn = document.getElementById(`rail-tab-${tab}`);
  if (btn) btn.classList.add('active');

  const chatContainer = document.getElementById('sidebar-chats-container');
  const settingsContainer = document.getElementById('sidebar-settings-container');

  if (chatContainer) chatContainer.style.display = tab === 'chats' ? 'flex' : 'none';
  if (settingsContainer) settingsContainer.style.display = tab === 'settings' ? 'flex' : 'none';
}

function updateCurrentUserUI() {
  if (!state.currentUser) return;
  const avatar = document.getElementById('rail-user-avatar');
  if (avatar) {
    avatar.src = state.currentUser.profile_picture;
    avatar.style.cursor = 'pointer';
    avatar.onclick = () => openUserProfileModal(state.currentUser.id);
  }

  const settingsAvatar = document.getElementById('settings-avatar-preview');
  if (settingsAvatar) settingsAvatar.src = state.currentUser.profile_picture;

  const profileName = document.getElementById('settings-profile-name');
  const profileId = document.getElementById('settings-profile-id');
  const profileBio = document.getElementById('settings-profile-bio');

  if (profileName) profileName.value = state.currentUser.full_name;
  if (profileId) profileId.value = state.currentUser.username;
  if (profileBio) profileBio.value = state.currentUser.bio || '';

  const followsStatsEl = document.getElementById('settings-follows-stats');
  if (followsStatsEl) {
    const fCount = state.currentUser.followers_count || 0;
    const fgCount = state.currentUser.following_count || 0;
    followsStatsEl.innerHTML = `
      <div style="display: flex; gap: 10px; margin-top: 10px; justify-content: center;">
        <span class="user-profile-handle-badge" onclick="openFollowsModal('${state.currentUser.id}', 'followers')" style="cursor: pointer;">
          👥 <b>${fCount}</b> Followers
        </span>
        <span class="user-profile-handle-badge" onclick="openFollowsModal('${state.currentUser.id}', 'following')" style="cursor: pointer;">
          ✨ <b>${fgCount}</b> Following
        </span>
      </div>
    `;
  }
}

function triggerProfilePictureUpload() {
  const input = document.getElementById('profile-picture-gallery-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function handleProfilePictureSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  showToast('Updating profile picture from gallery...');
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    try {
      let photoUrl = dataUrl;
      if (!state.standaloneMode) {
        try {
          const uploadRes = await api('/api/upload', {
            method: 'POST',
            body: JSON.stringify({
              data_url: dataUrl,
              filename: 'avatar_' + Date.now() + '.jpg',
              file_type: file.type
            })
          });
          if (uploadRes.url) photoUrl = uploadRes.url;
        } catch (err) {
          console.warn('Upload API fallback to data URL', err);
        }
      }

      const res = await api('/api/users/profile', {
        method: 'PATCH',
        body: JSON.stringify({ profile_picture: photoUrl })
      });

      if (res && res.user) {
        state.currentUser = res.user;
      } else {
        state.currentUser.profile_picture = photoUrl;
      }

      updateCurrentUserUI();
      showToast('Profile photo updated from gallery! 📷✨');
    } catch (err) {
      alert('Failed to update picture: ' + err.message);
    }
  };
  reader.readAsDataURL(file);
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const full_name = document.getElementById('settings-profile-name').value;
  const bio = document.getElementById('settings-profile-bio').value;

  try {
    const res = await api('/api/users/profile', {
      method: 'PATCH',
      body: JSON.stringify({ full_name, bio })
    });
    state.currentUser = res.user;
    updateCurrentUserUI();
    showToast('Profile updated successfully!');
  } catch (err) {
    alert('Failed to update profile: ' + err.message);
  }
}

// --- DOM EVENT LISTENERS & HELPERS ---
function setupEventHandlers() {
  const backBtn = document.getElementById('chat-back-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      document.getElementById('chat-pane').classList.remove('mobile-open');
    };
  }

  const chatForm = document.getElementById('chat-input-form');
  if (chatForm) {
    chatForm.onsubmit = handleSendMessage;
  }

  const chatInput = document.getElementById('chat-text-input');
  if (chatInput) {
    chatInput.oninput = handleTypingInput;
    chatInput.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    };
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #1E293B; color: #FFF; padding: 10px 20px; border-radius: 9999px;
    font-size: 13px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 200; animation: fadeInScale 0.2s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function openMediaLightbox(url) {
  window.open(url, '_blank');
}

function scrollChatToBottom() {
  const feed = document.getElementById('message-feed');
  if (feed) feed.scrollTop = feed.scrollHeight;
}

function scrollToMessage(msgId) {
  const el = document.getElementById(`msg-el-${msgId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.backgroundColor = 'rgba(108, 99, 255, 0.2)';
    setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 1500);
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

function getMessagePreview(msg) {
  if (msg.deleted_at) return '🚫 <i>This message was deleted</i>';
  if (msg.message_type === 'image') return '📷 Photo';
  if (msg.message_type === 'video') return '🎥 Video';
  if (msg.message_type === 'audio') return '🎤 Voice message';
  if (msg.message_type === 'file') return '📄 ' + (msg.file_name || 'Document');
  if (msg.message_type === 'sticker') return '🎨 Sticker';
  return escapeHTML(msg.message_content || '');
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return '';
  const now = Date.now();
  const diff = now - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(isoStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateDivider(isoStr) {
  const date = new Date(isoStr);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
