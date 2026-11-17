const fs = require('fs');
const path = require('path');

const origHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const head = origHtml.slice(0, origHtml.indexOf('<style>'));
const styleEnd = origHtml.indexOf('</style>') + '</style>'.length;
const scriptStart = origHtml.indexOf('<script>');
let body = origHtml.slice(styleEnd, scriptStart);
const tail = origHtml.slice(origHtml.lastIndexOf('</script>') + '</script>'.length);

// 1. Add settings-follows-stats if not present
if (!body.includes('id="settings-follows-stats"')) {
  const target = '<input type="file" id="profile-picture-gallery-input" accept="image/*" style="display: none;" onchange="handleProfilePictureSelected(event)">';
  const replacement = target + '\n            <div id="settings-follows-stats"></div>';
  body = body.replace(target, replacement);
  console.log('Added settings-follows-stats');
}

// 2. Add story footer actions if not present
if (!body.includes('class="story-footer-actions"')) {
  const target = '<div class="story-caption-overlay" id="story-caption-overlay" style="display: none;"></div>';
  const replacement = `<div class="story-caption-overlay" id="story-caption-overlay" style="display: none;"></div>

      <!-- Story Footer Actions (Views & Likes) -->
      <div class="story-footer-actions">
        <!-- Viewer View: Like button & Views pill -->
        <div id="story-actions-viewer" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <button class="story-like-btn" id="story-like-btn" onclick="toggleStoryLike(event)">
            <span class="story-like-icon" id="story-like-icon">🤍</span>
            <span id="story-like-text">Like</span>
            <span class="story-badge-count" id="story-like-count">0</span>
          </button>
          <div class="story-view-pill">
            👁 <span id="story-view-count">0</span> views
          </div>
        </div>

        <!-- Owner View: Viewers list button & Likes pill -->
        <div id="story-actions-owner" style="display: none; align-items: center; justify-content: space-between; width: 100%;">
          <button class="story-viewers-btn" onclick="openStoryViewersModal(event)">
            👁 <span id="story-owner-views-count">0</span> views · View List
          </button>
          <div class="story-owner-likes-pill">
            ❤️ <span id="story-owner-likes-count">0</span> likes
          </div>
        </div>
      </div>`;
  body = body.replace(target, replacement);
  console.log('Added story footer actions');
}

// 3. Add modals if not present
if (!body.includes('id="user-profile-modal"')) {
  const modalsHTML = `
  <!-- STORY VIEWERS LIST MODAL -->
  <div class="modal-overlay" id="story-viewers-modal">
    <div class="modal-dialog" style="max-width: 400px; width: 95%;">
      <div class="modal-header">
        <h3 class="modal-title">Status Views (<span id="story-viewers-modal-count">0</span>)</h3>
        <button class="icon-btn" onclick="closeStoryViewersModal()">✕</button>
      </div>
      <div class="modal-body" id="story-viewers-list" style="max-height: 360px; overflow-y: auto;">
        <!-- Dynamic viewer rows -->
      </div>
    </div>
  </div>

  <!-- SOCIAL USER PROFILE MODAL -->
  <div class="modal-overlay" id="user-profile-modal">
    <div class="user-profile-dialog">
      <div class="user-profile-banner">
        <button class="user-profile-close-btn" onclick="closeUserProfileModal()">✕</button>
      </div>
      <div class="user-profile-body">
        <div class="user-profile-avatar-wrap">
          <img id="profile-modal-avatar" src="" alt="User Avatar">
          <span class="user-profile-online-badge"></span>
        </div>
        <h2 class="user-profile-name" id="profile-modal-name">User Name</h2>
        <div class="user-profile-handle-badge" id="profile-modal-handle" onclick="navigator.clipboard.writeText(this.textContent.replace('@','')); showToast('Connectly ID copied!');" title="Click to copy ID">@username</div>
        <p class="user-profile-bio" id="profile-modal-bio">Bio</p>
        
        <div class="user-profile-stats-row">
          <div class="user-profile-stat-box" onclick="openFollowsModal(state.viewingProfileUserId, 'followers')">
            <div class="user-profile-stat-count" id="profile-modal-followers-count">0</div>
            <div class="user-profile-stat-label">Followers</div>
          </div>
          <div class="user-profile-stat-box" onclick="openFollowsModal(state.viewingProfileUserId, 'following')">
            <div class="user-profile-stat-count" id="profile-modal-following-count">0</div>
            <div class="user-profile-stat-label">Following</div>
          </div>
        </div>

        <div class="user-profile-actions" id="profile-modal-actions">
          <!-- Dynamic action buttons -->
        </div>
      </div>
    </div>
  </div>

  <!-- FOLLOWERS & FOLLOWING LIST MODAL -->
  <div class="modal-overlay" id="follows-list-modal">
    <div class="modal-dialog follows-modal-dialog">
      <div class="modal-header">
        <div class="follows-modal-tabs" style="width: 100%;">
          <button class="follows-tab-btn active" id="tab-btn-followers" onclick="switchFollowsTab('followers')">Followers</button>
          <button class="follows-tab-btn" id="tab-btn-following" onclick="switchFollowsTab('following')">Following</button>
        </div>
        <button class="icon-btn" onclick="closeFollowsModal()">✕</button>
      </div>
      <div class="modal-body" id="follows-list-content" style="max-height: 400px; overflow-y: auto;">
        <!-- Dynamic user rows -->
      </div>
    </div>
  </div>
`;
  body = body.replace('<!-- CALLING OVERLAY MODAL', modalsHTML + '\n  <!-- CALLING OVERLAY MODAL');
  console.log('Added modals');
}

// 4. Replace the old login/register page with the new direct ID Name entry modal!
const authIdx = body.indexOf('<!-- AUTH MODAL -->');
const nextModalIdx = body.indexOf('<!-- USER SEARCH MODAL -->');

if (authIdx !== -1 && nextModalIdx !== -1) {
  const newAuthModal = `<!-- QUICK ID NAME ENTRY MODAL (Direct ID Name Entry - No Login/Password Page) -->
  <div class="auth-wrapper" id="auth-modal" style="display: none;">
    <div class="auth-card" style="max-width: 440px; text-align: center; padding: 36px 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border-radius: var(--radius-xl);">
      <div class="auth-header" style="margin-bottom: 20px;">
        <div class="auth-logo" style="margin: 0 auto 12px; width: 60px; height: 60px; border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); display: flex; align-items: center; justify-content: center; color: white;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 34px; height: 34px;">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
          </svg>
        </div>
        <h2 class="auth-title" style="font-size: 26px; margin-bottom: 4px; font-weight: 800;">Connectly</h2>
        <p class="auth-subtitle" style="font-size: 14px; color: var(--text-muted);">Apna ID Name banayein aur direct chatting shuru karein</p>
      </div>

      <!-- Live Dynamic Avatar Preview -->
      <div style="margin-bottom: 18px;">
        <div style="width: 82px; height: 82px; margin: 0 auto; border-radius: 50%; border: 3px solid var(--primary); padding: 3px; background: var(--bg-hover); box-shadow: 0 4px 14px rgba(var(--primary-rgb), 0.25);">
          <img id="quick-join-avatar-img" src="https://api.dicebear.com/7.x/bottts/svg?seed=connectly" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" alt="Avatar">
        </div>
      </div>

      <!-- Quick Join Form -->
      <form id="quick-join-form" onsubmit="handleQuickJoin(event)">
        <div id="quick-join-error" style="color: var(--danger); font-size: 13px; margin-bottom: 12px; font-weight: 600;"></div>

        <div class="form-group" style="text-align: left; margin-bottom: 16px;">
          <label class="form-label" style="font-weight: 700; font-size: 13.5px; color: var(--text-main);">Apna ID Name Enter Karein (Connectly ID)</label>
          <div class="input-with-icon">
            <span class="input-icon" style="color: var(--primary); font-weight: 800; font-size: 16px;">@</span>
            <input type="text" id="quick-join-username" placeholder="e.g. faraz123, ali, jerry, hamza" required autofocus oninput="updateQuickJoinAvatar()" style="font-weight: 600; font-size: 15px;">
          </div>
          <span style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px; display: block;">Koi bhi unique ID name likhein. Agar ID pehle se bani hai to wahi open hogi, warna nayi ID create ho jayegi.</span>
        </div>

        <div class="form-group" style="text-align: left; margin-bottom: 22px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: var(--text-main);">Full Name / Display Name (Optional)</label>
          <div class="input-with-icon">
            <span class="input-icon">👤</span>
            <input type="text" id="quick-join-fullname" placeholder="e.g. Faraz Ahmed">
          </div>
        </div>

        <button type="submit" class="btn-primary" style="height: 48px; font-size: 15px; font-weight: 700; border-radius: var(--radius-lg); letter-spacing: 0.02em; box-shadow: 0 4px 14px rgba(var(--primary-rgb), 0.35);">
          Direct Interface Kholen 🚀
        </button>
      </form>

      <!-- Quick Suggested IDs -->
      <div style="margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border);">
        <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Ya 1-Click ID Select Karein:</div>
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn-secondary" style="width: auto; padding: 6px 14px; font-size: 12.5px; font-weight: 600;" onclick="quickSelectId('faraz123')">
            👑 Faraz (Owner)
          </button>
          <button type="button" class="btn-secondary" style="width: auto; padding: 6px 14px; font-size: 12.5px; font-weight: 600;" onclick="quickSelectId('jerry')">
            ⚡ Jerry
          </button>
          <button type="button" class="btn-secondary" style="width: auto; padding: 6px 14px; font-size: 12.5px; font-weight: 600;" onclick="quickSelectId('ahmed456')">
            🧪 Ahmed
          </button>
        </div>
      </div>
    </div>
  </div>\n\n  `;

  body = body.slice(0, authIdx) + newAuthModal + body.slice(nextModalIdx);
  console.log('Replaced login/register page with Direct ID Name Entry modal');
}

const stylesCss = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

const finalHtml = head + '<style>\n' + stylesCss + '\n</style>' + body + '<script>\n' + appJs + '\n</script>' + tail;

fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), finalHtml, 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), finalHtml, 'utf8');
console.log('Successfully bundled public/index.html and index.html! File size:', finalHtml.length);
