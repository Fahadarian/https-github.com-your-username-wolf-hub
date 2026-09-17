/**
 * ============================================================================
 * Wolf Hub — Supabase Authentication & Website Gatekeeper Controller
 * Senior Web Developer Architecture:
 * - Gatekeeper Screen: Displayed FIRST before site access
 * - Real-time Supabase Auth: signUp, signInWithPassword, signOut, getSession
 * - Username & Email Dual-Resolver
 * - Profile Synchronization with Supabase Database (public.profiles)
 * - State Persistence & Dynamic Navigation Updates
 * ============================================================================
 */

// Supabase Project Configuration
const SUPABASE_CONFIG = {
  url: 'https://qtdunbztzfvtmmjkmwux.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0ZHVuYnp0emZ2dG1tamttd3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzM3NDUsImV4cCI6MjEwNTIwOTc0NX0.rq5s5spxzWwSOrXqdV215GQgVUF9tfvxx_c082wCbl0'
};

// Initialize Supabase Client
let sbClient = null;
if (window.supabase && window.supabase.createClient) {
  sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
} else {
  console.warn('[WolfHub Auth] Supabase library loading deferred. Retrying initialization.');
}

// Global active user state
let currentAuthUser = null;
let currentProfile = null;

/**
 * 1. UI Tab Switcher (Sign In <-> Create Account)
 */
function switchGkTab(tab) {
  const tabSignIn = document.getElementById('gk-tab-signin');
  const tabSignUp = document.getElementById('gk-tab-signup');
  const formSignIn = document.getElementById('gk-signin-form');
  const formSignUp = document.getElementById('gk-signup-form');
  const alertBox = document.getElementById('gk-alert');

  if (alertBox) {
    alertBox.style.display = 'none';
    alertBox.className = 'auth-alert-box';
    alertBox.textContent = '';
  }

  if (tab === 'signin') {
    tabSignIn?.classList.add('active');
    tabSignUp?.classList.remove('active');
    if (formSignIn) formSignIn.style.display = 'block';
    if (formSignUp) formSignUp.style.display = 'none';
  } else {
    tabSignUp?.classList.add('active');
    tabSignIn?.classList.remove('active');
    if (formSignIn) formSignIn.style.display = 'none';
    if (formSignUp) formSignUp.style.display = 'block';
  }
}

/**
 * Helper to display alerts in the Gatekeeper modal
 */
function showGkAlert(message, type = 'error') {
  const alertBox = document.getElementById('gk-alert');
  if (!alertBox) return;
  alertBox.className = `auth-alert-box ${type}`;
  alertBox.innerHTML = message;
  alertBox.style.display = 'block';
}

/**
 * Toggle password visibility
 */
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🔒';
    btn.title = 'Hide password';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
    btn.title = 'Show password';
  }
}

/**
 * Set button loading state
 */
function setButtonLoading(btnId, isLoading, defaultText, loadingText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = isLoading;
  const textSpan = btn.querySelector('.btn-text');
  const spinnerSpan = btn.querySelector('.btn-spinner');
  if (textSpan && spinnerSpan) {
    if (isLoading) {
      textSpan.style.display = 'none';
      spinnerSpan.style.display = 'inline-flex';
      spinnerSpan.textContent = loadingText;
    } else {
      textSpan.style.display = 'inline';
      spinnerSpan.style.display = 'none';
    }
  } else {
    btn.textContent = isLoading ? loadingText : defaultText;
  }
}

/**
 * 2. Handle Gatekeeper Sign In
 */
async function handleGkSignIn(e) {
  if (e) e.preventDefault();

  if (!sbClient && window.supabase) {
    sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }

  if (!sbClient) {
    showGkAlert('Supabase client initialize nahi ho saka. Barah-e-karam internet connection check karein.', 'error');
    return;
  }

  const identifier = document.getElementById('gk-signin-email')?.value.trim();
  const password = document.getElementById('gk-signin-password')?.value;

  if (!identifier || !password) {
    showGkAlert('Barah-e-karam Email/Username aur Password enter karein.', 'error');
    return;
  }

  setButtonLoading('gk-signin-submit', true, 'Sign In & Enter Wolf Hub', '⏳ Authenticating...');

  try {
    let resolvedEmail = identifier;

    // If identifier is not an email, resolve username from Supabase 'profiles' table
    if (!identifier.includes('@')) {
      try {
        const { data: userProfile, error: profileErr } = await sbClient
          .from('profiles')
          .select('email')
          .eq('username', identifier)
          .maybeSingle();

        if (userProfile && userProfile.email) {
          resolvedEmail = userProfile.email;
        } else {
          // If profile lookup returns null, still try identifier or fallback
          resolvedEmail = identifier;
        }
      } catch (lookupErr) {
        console.warn('Username lookup error, attempting direct sign in:', lookupErr);
      }
    }

    // Call Supabase signInWithPassword
    const { data, error } = await sbClient.auth.signInWithPassword({
      email: resolvedEmail,
      password: password
    });

    if (error) {
      let errText = error.message;
      if (errText.includes('Invalid login credentials')) {
        errText = 'Galat Email ya Password! Barah-e-karam credentials check karein.';
      } else if (errText.includes('Email not confirmed')) {
        errText = 'Aap ka email confirm nahi hua. Apnay email inbox main verification link check karein.';
      }
      showGkAlert(`⚠️ Login Failed: ${errText}`, 'error');
      setButtonLoading('gk-signin-submit', false, 'Sign In & Enter Wolf Hub', '⏳ Authenticating...');
      return;
    }

    if (data?.user) {
      showGkAlert('✔ Authentication Kamiyab! Wolf Hub main khush-amdeed...', 'success');
      setTimeout(async () => {
        await unlockWebsite(data.user);
        setButtonLoading('gk-signin-submit', false, 'Sign In & Enter Wolf Hub', '⏳ Authenticating...');
      }, 700);
    }
  } catch (err) {
    console.error('Sign in exception:', err);
    showGkAlert(`Ghalti aayi: ${err.message || 'Server error'}`, 'error');
    setButtonLoading('gk-signin-submit', false, 'Sign In & Enter Wolf Hub', '⏳ Authenticating...');
  }
}

/**
 * 3. Handle Gatekeeper Sign Up
 */
async function handleGkSignUp(e) {
  if (e) e.preventDefault();

  if (!sbClient && window.supabase) {
    sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }

  if (!sbClient) {
    showGkAlert('Supabase client initialize nahi ho saka. Barah-e-karam refresh karein.', 'error');
    return;
  }

  const fullName = document.getElementById('gk-signup-fullname')?.value.trim();
  const email = document.getElementById('gk-signup-email')?.value.trim();
  const username = document.getElementById('gk-signup-username')?.value.trim();
  const password = document.getElementById('gk-signup-password')?.value;
  const role = document.getElementById('gk-signup-role')?.value;

  if (!fullName || !email || !username || !password) {
    showGkAlert('Tamam fields bharna lazmi hain.', 'error');
    return;
  }

  if (password.length < 6) {
    showGkAlert('Password kam az kam 6 characters ka hona chahiye.', 'error');
    return;
  }

  setButtonLoading('gk-signup-submit', true, 'Register With Supabase & Enter', '⏳ Creating Account...');

  try {
    const { data, error } = await sbClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName,
          username: username,
          role: role
        }
      }
    });

    if (error) {
      let errText = error.message;
      if (errText.includes('User already registered')) {
        errText = 'Yeh email pehlay se registered hai. Barah-e-karam "Sign In" tab par jayein.';
      }
      showGkAlert(`⚠️ Registration Ghalti: ${errText}`, 'error');
      setButtonLoading('gk-signup-submit', false, 'Register With Supabase & Enter', '⏳ Creating Account...');
      return;
    }

    // Success response
    if (data?.session && data?.user) {
      showGkAlert('🎉 Account kamiyabi se ban gaya! Wolf Hub website khul rahi hai...', 'success');
      setTimeout(async () => {
        await unlockWebsite(data.user);
        setButtonLoading('gk-signup-submit', false, 'Register With Supabase & Enter', '⏳ Creating Account...');
      }, 900);
    } else if (data?.user) {
      // Email confirmation requirement notice
      showGkAlert(
        `🎉 Account register ho gaya!<br><span style="font-size:0.84rem;color:#fff;">Ek confirmation link <strong>${email}</strong> par bheja gaya hai. Link click karnay kay baad aap login kar saktay hain.</span>`,
        'success'
      );
      setTimeout(() => {
        switchGkTab('signin');
        const signinEmailInput = document.getElementById('gk-signin-email');
        if (signinEmailInput) signinEmailInput.value = email;
      }, 4000);
      setButtonLoading('gk-signup-submit', false, 'Register With Supabase & Enter', '⏳ Creating Account...');
    }
  } catch (err) {
    console.error('Sign up exception:', err);
    showGkAlert(`Registration error: ${err.message || 'Server error'}`, 'error');
    setButtonLoading('gk-signup-submit', false, 'Register With Supabase & Enter', '⏳ Creating Account...');
  }
}

/**
 * 4. Unlock Website (Hide Gatekeeper, Reveal Website Content)
 */
async function unlockWebsite(user) {
  currentAuthUser = user;

  // Retrieve user metadata and profiles record
  let fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Field Member';
  let role = user?.user_metadata?.role || 'Canid Specialist';
  let username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'member';

  // Attempt fetch from public.profiles
  if (sbClient && user?.id) {
    try {
      const { data: profile } = await sbClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        currentProfile = profile;
        if (profile.full_name) fullName = profile.full_name;
        if (profile.role) role = profile.role;
        if (profile.username) username = profile.username;
      }
    } catch (e) {
      console.warn('Profile fetch note:', e);
    }
  }

  // Update Navigation User Pill
  const navPill = document.getElementById('nav-user-pill');
  const navName = document.getElementById('nav-username-text');
  const navAvatar = document.getElementById('nav-avatar-letter');
  const btnSignOut = document.getElementById('btn-signout');
  const btnNavLogin = document.getElementById('btn-nav-login');

  if (navName) navName.textContent = fullName.split(' ')[0] || fullName;
  if (navAvatar) navAvatar.textContent = (fullName[0] || 'W').toUpperCase();
  if (navPill) {
    navPill.style.display = 'inline-flex';
    navPill.title = `${fullName} (${role}) — Click to open Dashboard`;
  }
  if (btnSignOut) btnSignOut.style.display = 'inline-flex';
  if (btnNavLogin) btnNavLogin.style.display = 'none';

  // Update Dashboard Profile Info
  const dashAvatar = document.getElementById('dash-avatar');
  const dashFullName = document.getElementById('dash-full-name');
  const dashRole = document.getElementById('dash-role-badge');
  const dashCode = document.getElementById('dash-code-display');

  if (dashAvatar) dashAvatar.textContent = (fullName[0] || 'W').toUpperCase();
  if (dashFullName) dashFullName.textContent = fullName;
  if (dashRole) dashRole.textContent = role;
  if (dashCode) dashCode.textContent = (user?.id ? user.id.substring(0, 8).toUpperCase() : 'VERIFIED');

  // Smoothly Unlock Website UI
  const gatekeeper = document.getElementById('gatekeeper-portal');
  const websiteContent = document.getElementById('website-content');

  if (gatekeeper) {
    gatekeeper.classList.add('unlocked');
  }

  if (websiteContent) {
    websiteContent.classList.remove('website-locked');
    websiteContent.classList.add('website-unlocked');
  }

  document.body.style.overflow = 'auto';

  // Trigger 3D Background resize if exists
  if (typeof onWindowResize === 'function') {
    onWindowResize();
  }
}

/**
 * 5. Lock Website (Show Gatekeeper, Hide Website Content)
 */
function lockWebsite() {
  currentAuthUser = null;
  currentProfile = null;

  const gatekeeper = document.getElementById('gatekeeper-portal');
  const websiteContent = document.getElementById('website-content');
  const navPill = document.getElementById('nav-user-pill');
  const btnSignOut = document.getElementById('btn-signout');

  if (navPill) navPill.style.display = 'none';
  if (btnSignOut) btnSignOut.style.display = 'none';
  const btnNavLogin = document.getElementById('btn-nav-login');
  if (btnNavLogin) btnNavLogin.style.display = 'inline-flex';

  if (websiteContent) {
    websiteContent.classList.remove('website-unlocked');
    websiteContent.classList.add('website-locked');
  }

  if (gatekeeper) {
    gatekeeper.classList.remove('unlocked');
    gatekeeper.style.display = 'flex';
  }

  document.body.style.overflow = 'hidden';
  window.scrollTo(0, 0);
}

/**
 * 6. Sign Out
 */
async function handleSupabaseSignOut() {
  if (sbClient) {
    try {
      await sbClient.auth.signOut();
    } catch (e) {
      console.warn('Sign out notice:', e);
    }
  }

  // Clear local storage items
  try {
    localStorage.removeItem('sb-qtdunbztzfvtmmjkmwux-auth-token');
  } catch (e) {}

  lockWebsite();
  closeDashboard();
  switchGkTab('signin');
  showGkAlert('Aap kamiyabi se sign out ho gaye hain. Dobara access kay liye login karein.', 'success');
}

/**
 * 7. Check Active Session on Page Load
 */
async function checkCurrentSession() {
  if (!sbClient && window.supabase) {
    sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }

  if (!sbClient) {
    console.warn('[WolfHub Auth] Supabase not ready yet.');
    lockWebsite();
    return;
  }

  try {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session && session.user) {
      console.log('[WolfHub Auth] Active Supabase session restored for:', session.user.email);
      await unlockWebsite(session.user);
    } else {
      console.log('[WolfHub Auth] No active session found. Presenting Gatekeeper Login.');
      lockWebsite();
    }
  } catch (err) {
    console.error('[WolfHub Auth] Session check error:', err);
    lockWebsite();
  }

  // Setup live auth state change listener
  sbClient.auth.onAuthStateChange(async (event, session) => {
    console.log('[WolfHub Auth] Auth Event:', event);
    if (event === 'SIGNED_IN' && session?.user) {
      await unlockWebsite(session.user);
    } else if (event === 'SIGNED_OUT') {
      lockWebsite();
    }
  });
}

/**
 * 8. Member Dashboard & Live Supabase Users List
 */
function openDashboard() {
  const dashModal = document.getElementById('dashboard-modal');
  if (dashModal) {
    dashModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    refreshUsersTable();
  }
}

function closeDashboard() {
  const dashModal = document.getElementById('dashboard-modal');
  if (dashModal) {
    dashModal.classList.remove('active');
    if (currentAuthUser) {
      document.body.style.overflow = 'auto';
    }
  }
}

function closeDashboardOnOverlay(e) {
  if (e.target.id === 'dashboard-modal') {
    closeDashboard();
  }
}

function switchDashTab(tabName) {
  const tabs = ['overview', 'users', 'journal'];
  tabs.forEach(t => {
    const btn = document.getElementById(`dash-tab-${t}`);
    const sec = document.getElementById(`sec-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (sec) sec.classList.toggle('active', t === tabName);
  });

  if (tabName === 'users') {
    refreshUsersTable();
  }
}

async function refreshUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 24px;">
        ⏳ Loading registered members from Supabase Cloud...
      </td>
    </tr>
  `;

  if (!sbClient) return;

  try {
    const { data: profiles, error } = await sbClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !profiles || profiles.length === 0) {
      if (currentAuthUser) {
        tbody.innerHTML = `
          <tr>
            <td style="font-weight: 600; color: #fff;">${currentAuthUser.user_metadata?.full_name || 'Current User'}</td>
            <td>${currentAuthUser.email}</td>
            <td>${currentAuthUser.user_metadata?.role || 'Canid Specialist'}</td>
            <td><span class="code-badge-pill">${currentAuthUser.id.substring(0, 6)}</span></td>
            <td><span class="status-badge verified">● Authenticated</span></td>
            <td>${new Date().toLocaleDateString()}</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
              No registered profiles found in database yet.
            </td>
          </tr>
        `;
      }
      return;
    }

    tbody.innerHTML = profiles.map(p => {
      const isCurrent = currentAuthUser && currentAuthUser.id === p.id;
      const joinedDate = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Active';
      return `
        <tr style="${isCurrent ? 'background: rgba(255, 127, 36, 0.1);' : ''}">
          <td style="font-weight: 600; color: #fff;">
            ${p.full_name || 'Member'} ${isCurrent ? '<span style="color:var(--amber-bright);font-size:0.75rem;">(You)</span>' : ''}
          </td>
          <td>${p.email || p.username || '—'}</td>
          <td>${p.role || 'Canid Specialist'}</td>
          <td><span class="code-badge-pill">${(p.id || '').substring(0, 6).toUpperCase()}</span></td>
          <td><span class="status-badge verified">● Active</span></td>
          <td>${joinedDate}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Table fetch error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #ff9999; padding: 20px;">
          Failed to load table: ${err.message}
        </td>
      </tr>
    `;
  }
}

function addNewJournalNote() {
  const title = prompt('Enter Field Note Title (e.g. "Pack Migration Sighting"):');
  if (!title) return;
  const desc = prompt('Enter observation details:');
  if (!desc) return;

  const container = document.getElementById('journal-notes-container');
  if (container) {
    const card = document.createElement('div');
    card.className = 'dash-note-card';
    card.innerHTML = `
      <h4>${title}</h4>
      <p>${desc}</p>
      <span class="dash-note-date">Field Log • Recorded Today by ${currentAuthUser?.email || 'Member'}</span>
    `;
    container.prepend(card);
  }
}

// Global initialization on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  checkCurrentSession();
});
