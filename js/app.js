/* =========================================================
   Secret Santa — app
   Everything sensitive lives on the server. This file only ever
   receives: your own profile, the groups you're in, their member
   names + wishlists, and (after the draw) YOUR OWN giftee.
   ========================================================= */
'use strict';

const CFG = window.SANTA_CONFIG || {};
const METHODS = Object.assign({ email: false, phone: false, google: true }, CFG.LOGIN_METHODS || {});
const OTP_LEN = Number(CFG.OTP_LENGTH) || 6;
const CONFIGURED = typeof CFG.SUPABASE_URL === 'string' && /^https:\/\//.test(CFG.SUPABASE_URL)
  && !/YOUR-PROJECT/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_KEY && !/YOUR-/.test(CFG.SUPABASE_KEY);

// Use only the project address, even if extra bits like /rest/v1/ were pasted.
const SB_URL = (() => { try { return new URL(String(CFG.SUPABASE_URL).trim()).origin; } catch { return CFG.SUPABASE_URL; } })();
const sb = CONFIGURED && window.supabase
  ? window.supabase.createClient(SB_URL, String(CFG.SUPABASE_KEY).trim(), {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

const AVATARS = ['🎅', '🤶', '🧝', '🦌', '⛄', '🎄', '🎁', '⭐', '🍪', '🧸', '🐧', '🦊', '🐻‍❄️', '🦉', '🐱', '🐶', '🔔', '🧣', '☃️', '🍭'];
const WAIT_LINES = ['Shaking the Santa hat…', 'Folding the name slips…', 'Checking the list twice…', 'The elves are shuffling names…', 'Sprinkling a little magic…', 'Almost there — stay cozy ☕'];

const app = document.getElementById('app');
const S = { session: null, profile: null, page: null, timers: [], timeouts: [], cleanups: [], channel: null, tab: {}, renderId: 0, notices: [] };

/* ---------------- tiny DOM helpers ---------------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (['value', 'checked', 'disabled', 'selected', 'hidden'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const ICONS = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  logout: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  gift: '<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/>',
  chat: '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  replay: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  cog: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  megaphone: '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>'
};
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}
const GOOGLE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';

function mount(...nodes) { app.replaceChildren(...nodes); window.scrollTo({ top: 0 }); }
function isTyping() {
  const a = document.activeElement;
  return a && app.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.value;
}

/* ---------------- storage (never throws) ---------------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};

/* ---------------- feedback ---------------- */
function toast(msg, type = '') {
  const t = h('div', { class: `toast ${type}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, type === 'error' ? 4200 : 2600);
}
async function busy(btn, fn) {
  if (btn.disabled) return;
  const old = [...btn.childNodes];
  btn.disabled = true;
  btn.replaceChildren(h('span', { class: 'spinner' }));
  try { return await fn(); }
  catch (e) { toast(e.message || 'Something went wrong', 'error'); }
  finally { if (btn.isConnected) { btn.disabled = false; btn.replaceChildren(...old); } }
}
function friendly(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Network problem — check your connection and try again.';
  if (/JWT expired|invalid JWT|not authenticated/i.test(m)) return 'Your session expired. Please log in again.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts — please wait a minute and try again.';
  if (/Token has expired or is invalid/i.test(m)) return 'That code is wrong or has expired.';
  return m;
}
async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(friendly(error));
  return data;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = text;
    document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
  }
  toast('Copied!', 'ok');
}
function haptic(p) {
  try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch { /* ignore */ }
}
function firstName(n) { const f = String(n || '').trim().split(/\s+/)[0] || n; return f.length > 14 ? f.slice(0, 13) + '…' : f; }

/* ---------------- sheets & dialogs ---------------- */
function sheet(title, body, { tall = false, onClose } = {}) {
  let closed = false;
  const prevFocus = document.activeElement;
  const close = () => {
    if (closed) return; closed = true;
    overlay.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 260);
    onClose && onClose();
    prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: `sheet${tall ? ' tall' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-handle' }),
    h('div', { class: 'sheet-head' }, h('h3', null, title),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Close', onclick: close }, icon('x'))),
    body);
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, box);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => overlay.classList.add('open'));
  setTimeout(() => { const f = box.querySelector('input,textarea'); if (f && window.matchMedia('(min-width: 640px)').matches) f.focus(); }, 300);
  return close;
}
function confirmBox({ title, text, ok = 'Yes', danger = false, emoji = '🎁' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); close(); };
    const body = h('div', { class: 'stack' },
      h('div', { class: 'center', style: { fontSize: '54px' } }, emoji),
      h('p', { class: 'center', style: { color: 'var(--ink-2)' } }, text),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => finish(false) }, 'Not yet'),
        h('button', { class: `btn ${danger ? 'red' : 'green'}`, onclick: () => finish(true) }, ok)));
    const close = sheet(title, body, { onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

/* ---------------- formatting ---------------- */
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysUntil(d) {
  if (!d) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + 'T00:00:00') - t) / 86400000);
}
function countdownText(d) {
  const n = daysUntil(d);
  if (n == null) return null;
  if (n > 1) return `🎁 ${n} days to the gift exchange`;
  if (n === 1) return '🎁 Gift exchange is tomorrow!';
  if (n === 0) return '🎉 Gift exchange is today!';
  return `🎄 Exchanged on ${fmtDate(d)}`;
}
function timeShort(ts) {
  const d = new Date(ts);
  const same = new Date().toDateString() === d.toDateString();
  return same ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
              : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function statusChip(st) {
  if (st === 'started') return h('span', { class: 'chip green flat' }, '🎉 Names drawn');
  if (st === 'starting') return h('span', { class: 'chip gold flat' }, '✨ Drawing names');
  return h('span', { class: 'chip lav flat' }, '🕒 Gathering players');
}
function inviteLink(code) { return `${location.origin}${location.pathname}#/join/${code}`; }
function safeUrl(u) {
  try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null; } catch { return null; }
}
function shortHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; } }

/* ---------------- lifecycle ---------------- */
function cleanup() {
  S.timers.forEach(clearInterval); S.timers = [];
  S.timeouts.forEach(clearTimeout); S.timeouts = [];
  S.cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } }); S.cleanups = [];
  if (S.channel) { try { sb.removeChannel(S.channel); } catch { /* ignore */ } S.channel = null; }
  S.page = null;
}
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [r, arg] = raw.split('/');
  return { r: r || 'home', arg: arg ? decodeURIComponent(arg) : null };
}

async function loadProfile() {
  const uid = S.session?.user?.id;
  if (!uid) { S.profile = null; return; }
  const { data } = await sb.from('profiles').select('display_name, avatar').eq('id', uid).maybeSingle();
  S.profile = data || null;
}

async function render() {
  cleanup();
  const id = ++S.renderId;
  if (!CONFIGURED) return renderNotConfigured();
  const { r, arg } = parseRoute();
  if (r === 'join' && arg) store.set('ss.pendingJoin', arg.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
  if (!S.session) return renderAuth();
  if (!S.profile) return renderProfileSetup();
  const pending = store.get('ss.pendingJoin');
  if (pending && r !== 'join') { location.hash = '#/join/' + pending; return; }
  if (id !== S.renderId) return;
  if (r === 'join') return renderJoin(arg || pending);
  if (r === 'g' && arg) return renderGroup(arg);
  return renderHome();
}

/* ---------------- screens: setup / auth ---------------- */
function renderNotConfigured() {
  mount(h('div', { class: 'center-screen' }, h('div', { class: 'card narrow stack center' },
    h('div', { style: { fontSize: '54px' } }, '🛠️'),
    h('h2', null, 'Almost ready!'),
    h('p', { class: 'muted' }, 'Add your Supabase project URL and anon key to js/config.js, then reload this page.'))));
}

function topbarSimple(right) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, h('div', { class: 'brand-badge' }, '🎁'), h('span', { class: 'brand-name' }, 'Secret Santa')),
    h('div', { class: 'grow' }), h('span', { 'data-bell': '' }), right || null);
}

function renderAuth() {
  const pending = store.get('ss.pendingJoin');
  const methods = ['email', 'phone'].filter((m) => METHODS[m]);
  let mode = methods[0] || null;
  let step = 'enter';     // 'enter' | 'code'
  let target = '';
  let resendAt = 0;

  const invite = h('div');
  if (pending) {
    invite.append(h('div', { class: 'banner card tint-gold fade-in' }, h('div', { class: 'emo' }, '💌'),
      h('div', null, h('b', null, 'You’re invited!'), h('div', { class: 'small', 'data-inv': '' }, 'Log in to join the group.'))));
    sb.rpc('group_preview', { p_code: pending }).then(({ data }) => {
      const el = invite.querySelector('[data-inv]');
      if (data && el) el.textContent = `Log in to join “${data.name}” · ${data.members} ${data.members === 1 ? 'player' : 'players'} so far`;
    });
  }

  const formBox = h('div', { class: 'stack' });
  const seg = methods.length > 1 ? h('div', { class: 'seg', role: 'tablist' },
    methods.map((m) => h('button', { role: 'tab', 'aria-selected': String(m === mode), 'data-m': m, onclick: () => { mode = m; step = 'enter'; paint(); } },
      icon(m === 'email' ? 'mail' : 'phone'), m === 'email' ? 'Email' : 'Mobile'))) : null;

  function paint() {
    if (seg) seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === mode)));
    formBox.replaceChildren(step === 'enter' ? enterForm() : codeForm());
  }

  function enterForm() {
    if (!mode) return h('div');
    let input, cc;
    const send = h('button', { class: 'btn red block', type: 'submit' }, 'Send me a code ', icon('send'));
    const form = h('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault();
      busy(send, async () => {
        if (mode === 'email') {
          const email = input.value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
          const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
          if (error) throw new Error(friendly(error));
          target = email;
        } else {
          let num = input.value.replace(/[^\d+]/g, '');
          if (!num.startsWith('+')) num = (cc.value.trim().startsWith('+') ? cc.value.trim() : '+' + cc.value.trim()) + num.replace(/^0+/, '');
          if (!/^\+\d{8,15}$/.test(num)) throw new Error('Please enter a valid mobile number.');
          const { error } = await sb.auth.signInWithOtp({ phone: num });
          if (error) throw new Error(friendly(error));
          target = num;
        }
        resendAt = Date.now() + 60000;
        step = 'code'; paint();
        toast('Code sent! Check your ' + (mode === 'email' ? 'inbox (and spam folder).' : 'messages.'), 'ok');
      });
    } });
    if (mode === 'email') {
      input = h('input', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
      form.append(h('label', { class: 'field' }, h('span', null, 'Email address'), input));
    } else {
      cc = h('input', { type: 'text', inputmode: 'tel', value: CFG.DEFAULT_COUNTRY_CODE || '+91', 'aria-label': 'Country code', maxlength: '5' });
      input = h('input', { type: 'tel', inputmode: 'tel', autocomplete: 'tel-national', placeholder: '98765 43210', required: true });
      form.append(h('div', { class: 'field' }, h('span', null, 'Mobile number'), h('div', { class: 'phone-row' }, cc, input)));
    }
    form.append(send);
    return form;
  }

  function codeForm() {
    const input = h('input', { class: 'otp-input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code',
      pattern: '[0-9]*', maxlength: String(Math.max(OTP_LEN, 10)), placeholder: '•'.repeat(OTP_LEN), 'aria-label': 'Verification code' });
    const verify = h('button', { class: 'btn green block', type: 'submit' }, 'Verify & continue ', icon('check'));
    const resend = h('button', { class: 'link-btn', type: 'button' });
    const tick = () => {
      const s = Math.ceil((resendAt - Date.now()) / 1000);
      resend.disabled = s > 0; resend.textContent = s > 0 ? `Resend code in ${s}s` : 'Resend code';
    };
    tick(); const iv = setInterval(() => { if (!resend.isConnected) return clearInterval(iv); tick(); }, 1000);
    resend.onclick = () => busy(resend, async () => {
      const { error } = await sb.auth.signInWithOtp(mode === 'email' ? { email: target } : { phone: target });
      if (error) throw new Error(friendly(error));
      resendAt = Date.now() + 60000; toast('New code sent', 'ok');
    });
    const doVerify = () => busy(verify, async () => {
      const token = input.value.replace(/\D/g, '');
      if (token.length < 6) throw new Error('Enter the code you received.');
      const { error } = await sb.auth.verifyOtp(mode === 'email' ? { email: target, token, type: 'email' } : { phone: target, token, type: 'sms' });
      if (error) throw new Error(friendly(error));
    });
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '');
      if (input.value.length === OTP_LEN) doVerify();
    });
    setTimeout(() => input.focus(), 50);
    return h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); doVerify(); } },
      h('p', { class: 'center small' }, 'We sent a code to ', h('b', null, target)),
      input, verify,
      h('div', { class: 'row spread' },
        h('button', { class: 'link-btn', type: 'button', onclick: () => { step = 'enter'; paint(); } }, 'Change ' + (mode === 'email' ? 'email' : 'number')),
        resend));
  }

  const google = METHODS.google ? h('button', { class: 'btn btn-google block', onclick: (e) => busy(e.currentTarget, async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw new Error(friendly(error));
    await new Promise((r) => setTimeout(r, 4000));
  }) }) : null;
  if (google) { const g = h('span'); g.innerHTML = GOOGLE_SVG; google.append(g.firstChild, 'Continue with Google'); }

  paint();
  mount(h('div', { class: 'narrow stack fade-in' },
    h('section', { class: 'hero' }, h('div', { class: 'hero-gift' }, '🎁'), h('h1', null, 'Secret Santa'),
      h('p', null, 'Draw names, share wishlists and keep the magic a secret.')),
    invite,
    h('div', { class: 'card stack' }, h('h2', { class: 'center' }, 'Log in or sign up'), seg, mode ? formBox : null,
      (google && mode) ? h('div', { class: 'divider' }, 'or') : null, google,
      google ? h('p', { class: 'small muted center' }, 'Use your own Google account. When you ask to join a group, its admin sees your Google name and email, so nobody can pretend to be someone else.') : null),
    h('footer', { class: 'foot' }, 'Only you will ever see who you’re buying for. 🤫')));
}

function renderProfileSetup() {
  const md = S.session.user.user_metadata || {};
  const guess = (md.full_name || md.name || (S.session.user.email || '').split('@')[0] || '').slice(0, 40);
  profileForm({ initialName: guess, initialAvatar: '🎅', title: 'Nice to meet you!', subtitle: 'What should your group call you?', cta: 'Let’s go! 🎄',
    container: (form) => mount(h('div', { class: 'narrow stack fade-in' },
      h('section', { class: 'hero' }, h('div', { class: 'hero-gift' }, '👋')), h('div', { class: 'card' }, form))) });
}

function profileForm({ initialName, initialAvatar, title, subtitle, cta, container, onSaved }) {
  let avatar = initialAvatar;
  const name = h('input', { type: 'text', maxlength: '40', autocomplete: 'nickname', placeholder: 'Your name', value: initialName || '', required: true });
  const preview = h('div', { class: 'avatar xl' }, avatar);
  const grid = h('div', { class: 'avatar-grid' }, AVATARS.map((a) => h('button', { type: 'button', 'aria-pressed': String(a === avatar), 'aria-label': 'Avatar ' + a,
    onclick: (e) => { avatar = a; preview.textContent = a; grid.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, a)));
  const save = h('button', { class: 'btn red block', type: 'submit' }, cta);
  const form = h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    busy(save, async () => {
      const n = name.value.trim();
      if (!n) throw new Error('Please enter your name.');
      await rpc('upsert_profile', { p_name: n, p_avatar: avatar });
      S.profile = { display_name: n, avatar };
      if (onSaved) onSaved(); else render();
    });
  } },
    title ? h('div', { class: 'center stack-sm' }, h('h2', null, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null) : null,
    h('div', { style: { display: 'grid', justifyItems: 'center' } }, preview),
    h('label', { class: 'field' }, h('span', null, 'Display name'), name),
    h('div', { class: 'field' }, h('span', null, 'Pick an avatar'), grid),
    save);
  container(form);
}

function openProfile() {
  const u = S.session.user;
  const body = h('div', { class: 'stack' });
  profileForm({ initialName: S.profile.display_name, initialAvatar: S.profile.avatar, cta: 'Save changes',
    container: (form) => body.append(form), onSaved: () => { close(); toast('Profile updated', 'ok'); render(); } });
  body.append(
    h('p', { class: 'center small muted' }, 'Signed in as ', h('b', null, u.email || u.phone || 'Google account')),
    h('button', { class: 'btn ghost block', onclick: async () => { close(); await sb.auth.signOut(); } }, icon('logout'), 'Sign out'));
  const close = sheet('Your profile', body);
}

/* ---------------- screens: home ---------------- */
async function renderHome() {
  const id = S.renderId;
  const list = h('div', { class: 'groups' });
  const header = topbarSimple(h('button', { class: 'icon-btn avatar-btn', 'aria-label': 'Your profile', onclick: openProfile }, S.profile.avatar));
  mount(h('div', { class: 'stack fade-in' }, header,
    h('section', { class: 'greet' }, h('h1', null, `Hi, ${S.profile.display_name}! 👋`), h('p', null, 'Ready to spread some holiday cheer?')),
    h('div', { class: 'actions' },
      h('button', { class: 'action-tile red', onclick: openCreate }, h('div', { class: 'emo' }, '🎄'), h('div', null, h('b', null, 'New group'), h('small', null, 'Be the organiser'))),
      h('button', { class: 'action-tile green', onclick: openJoin }, h('div', { class: 'emo' }, '🎟️'), h('div', null, h('b', null, 'Join group'), h('small', null, 'Got a code?')))),
    h('div', { class: 'row spread' }, h('h2', null, 'Your groups')), list));
  list.append(h('div', { class: 'card center muted' }, 'Loading your groups…'));

  const load = async () => {
    let groups;
    try { groups = await rpc('my_groups'); } catch (e) { if (id === S.renderId) list.replaceChildren(h('div', { class: 'card center' }, e.message)); return; }
    if (id !== S.renderId) return;
    if (groups.some((x) => x.is_admin)) fetchNotices(); else { S.notices = []; paintBell(); }
    if (!groups.length) {
      list.replaceChildren(h('div', { class: 'card empty', style: { gridColumn: '1 / -1' } }, h('div', { class: 'big' }, '🧦'),
        h('h3', null, 'No groups yet'), h('p', { class: 'muted' }, 'Create one for your friends, family or office — or join with an invite code.')));
      return;
    }
    list.replaceChildren(...groups.map((g) => {
      if (g.pending) {
        return h('a', { class: 'card group-card', href: `#/join/${g.code}` },
          h('div', { class: 'row spread' }, h('div', { class: 'gname ellipsis grow' }, g.name), icon('right')),
          h('div', { class: 'meta' }, h('span', { class: 'chip gold flat' }, '⏳ Waiting for approval'), h('span', { class: 'chip flat' }, `👥 ${g.member_count}`)),
          h('div', { class: 'small muted' }, 'The admin needs to let you in.'));
      }
      const cd = countdownText(g.exchange_date);
      const fresh = g.status === 'started' && !store.get(`ss.opened.${g.id}`);
      return h('a', { class: 'card group-card', href: `#/g/${g.id}` },
        h('div', { class: 'row spread' }, h('div', { class: 'gname ellipsis grow' }, g.name), icon('right')),
        h('div', { class: 'meta' }, statusChip(g.status), g.is_admin ? h('span', { class: 'chip gold flat' }, '👑 Admin') : null,
          h('span', { class: 'chip flat' }, `👥 ${g.member_count}`), g.budget ? h('span', { class: 'chip flat' }, `💸 ${g.budget}`) : null,
          g.requests ? h('span', { class: 'chip red flat' }, `🙋 ${g.requests} waiting`) : null),
        fresh ? h('div', { class: 'banner tint-red card', style: { padding: '10px 14px' } }, h('span', { class: 'emo', style: { fontSize: '22px' } }, '🎁'), h('b', null, 'Tap to see who you got!')) : null,
        cd ? h('div', { class: 'small muted countdown' }, cd) : null);
    }));
  };
  await load();
  S.timers.push(setInterval(() => { if (!document.hidden) load(); }, 20000));
}

function openCreate() {
  const name = h('input', { type: 'text', maxlength: '60', placeholder: 'e.g. Sharma Family Christmas', required: true });
  const budget = h('input', { type: 'text', maxlength: '30', placeholder: 'e.g. ₹500' });
  const date = h('input', { type: 'date' });
  const note = h('textarea', { maxlength: '500', placeholder: 'Rules, theme, venue… (optional)' });
  const go = h('button', { class: 'btn red block', type: 'submit' }, 'Create group 🎄');
  const close = sheet('New Secret Santa group', h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    busy(go, async () => {
      const r = await rpc('create_group', { p_name: name.value, p_budget: budget.value, p_date: date.value || null, p_note: note.value });
      close(); toast('Group created! Now invite your people 💌', 'ok');
      location.hash = `#/g/${r.id}`;
    });
  } },
    h('label', { class: 'field' }, h('span', null, 'Group name'), name),
    h('div', { class: 'btn-row' }, h('label', { class: 'field' }, h('span', null, 'Budget'), budget), h('label', { class: 'field' }, h('span', null, 'Exchange date'), date)),
    h('label', { class: 'field' }, h('span', null, 'Note for everyone'), note),
    h('p', { class: 'small muted' }, 'You’ll be the admin: you invite people, can remove players and decide when the names are drawn.'),
    go));
}

function openJoin() {
  const code = h('input', { class: 'code-input', type: 'text', maxlength: '6', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'ABC123', required: true });
  code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const go = h('button', { class: 'btn green block', type: 'submit' }, 'Find group');
  const close = sheet('Join a group', h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    const c = code.value.trim();
    if (c.length < 4) return toast('Enter the 6-character code', 'error');
    close(); location.hash = `#/join/${c}`;
  } }, h('p', { class: 'muted' }, 'Ask your group admin for the invite code or link.'),
    h('label', { class: 'field' }, h('span', null, 'Invite code'), code), go));
}

/* ---------------- screens: join via link/code ---------------- */
async function renderJoin(code) {
  const id = S.renderId;
  const header = topbarSimple(h('button', { class: 'icon-btn avatar-btn', 'aria-label': 'Your profile', onclick: openProfile }, S.profile.avatar));
  mount(header, h('div', { class: 'center-screen' }, h('div', { class: 'loader-gift' }, '💌')));
  const clear = () => store.del('ss.pendingJoin');
  let p = null;
  try { p = await rpc('group_preview', { p_code: code }); } catch (e) { toast(e.message, 'error'); }
  if (id !== S.renderId) return;
  const back = () => { clear(); location.hash = '#/'; };
  if (!p) {
    return mount(header, h('div', { class: 'narrow card stack center fade-in' }, h('div', { style: { fontSize: '54px' } }, '🔍'),
      h('h2', null, 'Group not found'), h('p', { class: 'muted' }, `No group matches the code “${code}”. Double-check it with your admin.`),
      h('button', { class: 'btn block', onclick: back }, 'Back home')));
  }
  if (p.already && p.id) { clear(); location.replace(`#/g/${p.id}`); return; }
  if (!p.joinable) {
    return mount(header, h('div', { class: 'narrow card stack center fade-in' }, h('div', { style: { fontSize: '54px' } }, '🔒'),
      h('h2', null, p.name), h('p', { class: 'muted' }, p.status === 'lobby' ? 'The admin has closed this group to new players.' : 'This group has already drawn names.'),
      h('button', { class: 'btn block', onclick: back }, 'Back home')));
  }
  if (p.pending) return renderPending(p, code, header);
  const join = h('button', { class: 'btn red block', onclick: () => busy(join, async () => {
    const r = await rpc('join_group', { p_code: code });
    clear();
    if (r && r.status === 'member') { toast('You’re in! 🎉', 'ok'); location.replace(`#/g/${r.id}`); }
    else { toast('Request sent! 📨', 'ok'); renderJoin(code); }
  }) }, p.approval ? 'Ask to join 🙋' : 'Join the fun 🎉');
  mount(header, h('div', { class: 'narrow stack fade-in' }, h('div', { class: 'card tint-gold stack center' },
    h('div', { class: 'hero-gift', style: { margin: '0 auto' } }, '💌'),
    h('p', { class: 'muted' }, 'You’re invited to'), h('h1', null, p.name),
    h('p', null, `${p.members} ${p.members === 1 ? 'player' : 'players'} so far`),
    p.approval ? h('p', { class: 'small muted' }, `👑 ${p.admin || 'The admin'} will approve you. They’ll see your Google name and email to check it’s really you.`) : null,
    h('p', { class: 'small' }, 'You’ll join as ', h('b', null, `${S.profile.avatar} ${S.profile.display_name}`), ' · ',
      h('button', { class: 'link-btn', onclick: openProfile }, 'change')),
    join, h('button', { class: 'btn ghost block', onclick: back }, 'Not now'))));
}

function renderPending(p, code, header) {
  store.del('ss.pendingJoin');
  const cancel = h('button', { class: 'btn danger-text block', onclick: () => busy(cancel, async () => {
    await rpc('cancel_join_request', { p_code: code }); toast('Request cancelled'); location.hash = '#/';
  }) }, 'Cancel request');
  mount(header, h('div', { class: 'narrow stack fade-in' }, h('div', { class: 'card tint-gold waiting' },
    h('div', { class: 'hat', 'aria-hidden': 'true' }, '⏳'),
    h('h2', null, 'Request sent!'),
    h('p', null, 'Waiting for ', h('b', null, `👑 ${p.admin || 'the admin'}`), ' to let you into ', h('b', null, p.name), '.'),
    h('p', { class: 'small muted' }, 'This page updates by itself, or come back later from your home screen.'),
    h('button', { class: 'btn block', onclick: () => { location.hash = '#/'; } }, 'Back home'), cancel)));
  const id = S.renderId;
  S.timers.push(setInterval(async () => {
    if (document.hidden || id !== S.renderId) return;
    let q; try { q = await rpc('group_preview', { p_code: code }); } catch { return; }
    if (id !== S.renderId || !q) return;
    if (q.already && q.id) { toast('You’re in! 🎉', 'ok'); location.replace(`#/g/${q.id}`); }
    else if (!q.pending) {
      mount(header, h('div', { class: 'narrow card stack center fade-in' }, h('div', { style: { fontSize: '54px' } }, '🙅'),
        h('h2', null, 'Not approved'), h('p', { class: 'muted' }, `The admin of “${q.name}” didn’t approve this request. If that’s a mistake, ask them and try the link again.`),
        h('button', { class: 'btn block', onclick: () => { location.hash = '#/'; } }, 'Back home')));
      S.timers.forEach(clearInterval); S.timers = [];
    }
  }, 5000));
}

/* ---------------- screens: group ---------------- */
async function renderGroup(gid) {
  const id = S.renderId;
  mount(h('div', { class: 'center-screen' }, h('div', { class: 'loader-gift' }, '🎄')));
  let bundle;
  try { bundle = await rpc('group_bundle', { p_gid: gid }); }
  catch (e) { toast(e.message, 'error'); location.replace('#/'); return; }
  if (id !== S.renderId) return;
  S.page = { kind: 'group', gid, bundle, assignment: null, unread: { santa: 0, giftee: 0 }, threads: {} };
  store.set(`ss.opened.${gid}`, '1');
  if (bundle.group.status === 'started') S.page.assignment = await rpc('my_assignment', { p_gid: gid }).catch(() => null);
  if (id !== S.renderId) return;
  drawGroup();
  maybeAutoReveal();
  liveGroup(gid);
  if (bundle.group.is_admin) fetchNotices(); else { S.notices = []; paintBell(); }
}

function liveGroup(gid) {
  const tick = async () => {
    if (!S.page || S.page.gid !== gid) return;
    if (!document.hidden) {
      await refreshGroup();
      if (S.page && S.page.pendingDraw && !isTyping()) { S.page.pendingDraw = false; drawGroup(); maybeAutoReveal(); }
      if (S.page && S.page.assignment) pollUnread();
      if (S.page && S.page.bundle.group.is_admin) fetchNotices();
    }
    if (!S.page || S.page.gid !== gid) return;
    const st = S.page.bundle.group.status;
    S.timeouts.push(setTimeout(tick, st === 'starting' ? 3000 : 12000));
  };
  S.timeouts.push(setTimeout(tick, 3000));
  try {
    S.channel = sb.channel('grp-' + gid)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${gid}` }, () => refreshGroup())
      .subscribe();
  } catch { /* polling still works */ }
  if (S.page.assignment) pollUnread();
  const onVis = () => { if (!document.hidden && S.page && S.page.gid === gid) refreshGroup(); };
  document.addEventListener('visibilitychange', onVis);
  S.cleanups.push(() => document.removeEventListener('visibilitychange', onVis));
}

async function refreshGroup(force = false) {
  const p = S.page;
  if (!p || p.kind !== 'group' || p.refreshing) return;
  p.refreshing = true;
  try {
    let b;
    try { b = await rpc('group_bundle', { p_gid: p.gid }); }
    catch (e) {
      if (/not in this group/i.test(e.message)) { toast('You are no longer in this group'); location.replace('#/'); }
      return;
    }
    if (S.page !== p) return;
    const prev = p.bundle.group;
    const changed = force || b.group.updated_at !== prev.updated_at || b.group.status !== prev.status || b.members.length !== p.bundle.members.length;
    if (!changed) return;
    p.bundle = b;
    if (b.group.status === 'started') {
      if (!p.assignment || prev.status !== 'started') p.assignment = await rpc('my_assignment', { p_gid: p.gid }).catch(() => null);
    } else p.assignment = null;
    if (S.page !== p) return;
    if (prev.status !== 'started' && b.group.status === 'started') S.tab[p.gid] = 'giftee';
    if (isTyping() && !force) { p.pendingDraw = true; return; }
    drawGroup();
    maybeAutoReveal();
    if (b.group.is_admin) fetchNotices();
  } finally { p.refreshing = false; }
}

function seenKey(gid, uid) { return `ss.seen.${gid}.${uid}`; }
function maybeAutoReveal() {
  const p = S.page;
  if (!p || !p.assignment || document.querySelector('.reveal')) return;
  const k = seenKey(p.gid, p.assignment.user_id);
  if (store.get(k)) return;
  store.set(k, '1');
  S.tab[p.gid] = 'giftee';
  drawGroup();
  playReveal();
}

function drawGroup() {
  const p = S.page; if (!p) return;
  const { group: g, members } = p.bundle;
  const started = g.status === 'started';
  let tab = S.tab[p.gid] || (started ? 'giftee' : 'group');
  if (tab === 'giftee' && !started) tab = 'group';
  if (tab === 'admin' && !g.is_admin) tab = 'group';
  S.tab[p.gid] = tab;

  const header = h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Back to my groups', onclick: () => { location.hash = '#/'; } }, icon('back')),
    h('div', { class: 'title grow ellipsis' }, g.name),
    g.is_admin ? h('button', { class: 'icon-btn', 'aria-label': 'Edit group details', onclick: openEditGroup }, icon('pencil')) : null,
    h('span', { 'data-bell': '' }),
    h('button', { class: 'icon-btn avatar-btn', 'aria-label': 'Your profile', onclick: openProfile }, S.profile.avatar));

  const cd = countdownText(g.exchange_date);
  const hero = h('section', { class: 'card tint-red group-hero stack-sm' },
    h('div', { class: 'deco', 'aria-hidden': 'true' }, '🎄'),
    h('div', { class: 'row wrap' }, statusChip(g.status), g.budget ? h('span', { class: 'chip' }, `💸 Budget ${g.budget}`) : null,
      g.exchange_date ? h('span', { class: 'chip' }, `📅 ${fmtDate(g.exchange_date)}`) : null),
    h('h1', null, g.name),
    cd ? h('div', { class: 'countdown' }, cd) : null,
    g.note ? h('p', { class: 'note mt' }, g.note) : null);

  const admin = members.find((m) => m.is_admin);
  const announce = g.announcement ? h('section', { class: 'card tint-sky announce fade-in' },
    h('div', { class: 'emo', 'aria-hidden': 'true' }, '📢'),
    h('div', { class: 'grow' },
      h('div', { class: 'tiny muted' }, `👑 ${admin ? admin.name : 'Admin'} · ${g.announcement_at ? timeShort(g.announcement_at) : ''}`),
      h('p', { class: 'announce-text' }, g.announcement))) : null;

  const tabs = [['group', 'Group', 'users'], ['wishes', 'Wishlists', 'gift']];
  if (started) tabs.unshift(['giftee', 'My giftee', 'eye']);
  if (g.is_admin) tabs.push(['admin', 'Admin', 'crown']);
  const four = tabs.length >= 4;
  const short = { giftee: 'Giftee', wishes: 'Wishes' };
  const seg = h('div', { class: `seg${four ? ' four' : ''}`, role: 'tablist' }, tabs.map(([k, label, ic]) =>
    h('button', { role: 'tab', 'aria-selected': String(k === tab), onclick: () => { S.tab[p.gid] = k; drawGroup(); } }, icon(ic), (four && short[k]) || label,
      k === 'giftee' && (p.unread.santa + p.unread.giftee) > 0 ? h('span', { class: 'dot', 'data-unread-tab': '' }) : null,
      k === 'admin' && (p.bundle.requests || []).length ? h('span', { class: 'dot' }) : null)));

  let content;
  if (tab === 'giftee') content = gifteeTab();
  else if (tab === 'wishes') content = wishesTab();
  else if (tab === 'admin') content = adminTab();
  else content = groupTab();

  const keepScroll = window.scrollY;
  const noticeSlot = g.is_admin ? h('div', { class: 'stack', 'data-group-notices': '' }) : null;
  app.replaceChildren(h('div', { class: 'stack' }, header, noticeSlot, hero, announce, seg, content));
  window.scrollTo({ top: keepScroll });
  paintBell();
  if (g.is_admin) paintGroupNotices();
}

/* name with a small crown in front of the group admin */
function personName(m, cls = 'name ellipsis') {
  return h('div', { class: cls }, m.is_admin ? h('span', { class: 'crown', title: 'Group admin', 'aria-label': 'Admin:' }, '👑') : null, m.name);
}

function memberRow(m, g, { manage = false } = {}) {
  const extra = [];
  if (m.is_admin) extra.push(h('span', { class: 'badge admin' }, 'Admin'));
  if (m.is_me) extra.push(h('span', { class: 'badge you' }, 'You'));
  if (g.is_admin && m.wish_locked) extra.push(h('span', { class: 'badge locked' }, '🔒 Wishlist locked'));
  if (g.is_admin && m.chat_blocked) extra.push(h('span', { class: 'badge locked' }, '🔇 Chat blocked'));
  if (g.is_admin && g.status === 'started') extra.push(m.gift_ready ? h('span', { class: 'badge ready' }, '✅ Gift ready') : h('span', { class: 'badge notyet' }, '⏳ No gift yet'));
  const btn = manage && g.is_admin && !m.is_me
    ? h('button', { class: 'icon-btn sm', 'aria-label': `Manage ${m.name}`, onclick: () => openMemberSheet(m) }, icon('cog'))
    : null;
  return h('div', { class: 'list-item' }, h('div', { class: 'avatar' }, m.avatar || '🎅'),
    h('div', { class: 'grow' }, personName(m),
      extra.length ? h('div', { class: 'row wrap', style: { gap: '6px', marginTop: '3px' } }, extra) : null),
    btn);
}

function openMemberSheet(m) {
  const g = S.page.bundle.group;
  const lock = h('input', { type: 'checkbox', checked: !!m.wish_locked, onchange: async () => {
    try {
      await rpc('set_member_wish_lock', { p_gid: g.id, p_uid: m.user_id, p_locked: lock.checked });
      toast(lock.checked ? `${m.name} can’t add more wishes 🔒` : `${m.name} can add wishes again 🔓`); refreshGroup(true);
    } catch (e) { lock.checked = !lock.checked; toast(e.message, 'error'); }
  } });
  const chatBlock = h('input', { type: 'checkbox', checked: !!m.chat_blocked, onchange: async () => {
    try {
      await rpc('set_member_chat_block', { p_gid: g.id, p_uid: m.user_id, p_blocked: chatBlock.checked });
      toast(chatBlock.checked ? `${m.name} can’t send chat messages 🔇` : `${m.name} can chat again 💬`); refreshGroup(true);
    } catch (e) { chatBlock.checked = !chatBlock.checked; toast(e.message, 'error'); }
  } });
  const body = h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('div', { class: 'avatar lg' }, m.avatar || '🎅'),
      h('div', { class: 'grow' }, h('h2', null, m.name), h('p', { class: 'small muted' }, 'Player in “' + g.name + '”'),
        m.account_name || m.account_email ? h('p', { class: 'small muted', style: { wordBreak: 'break-all' } }, '🔐 ', m.account_name || 'Account', m.account_email ? ` · ${m.account_email}` : '') : null)),
    h('label', { class: 'switch card', style: { padding: '14px 16px' } },
      h('span', null, h('b', null, 'Lock wishlist'), h('div', { class: 'small muted' }, 'Stop them adding more items. You can still remove items from the Wishlists tab.')), lock),
    h('label', { class: 'switch card', style: { padding: '14px 16px' } },
      h('span', null, h('b', null, 'Block from chat'), h('div', { class: 'small muted' }, 'They won’t be able to send anonymous messages in this group.')), chatBlock),
    h('button', { class: 'btn gold block', onclick: () => { close(); S.tab[g.id] = 'wishes'; drawGroup(); } }, icon('gift'), 'View their wishlist'),
    h('button', { class: 'btn block', onclick: async () => {
      if (!await confirmBox({ title: 'Make them admin?', emoji: '👑', ok: 'Hand over',
        text: `${m.name} becomes the admin of “${g.name}”. You’ll become a regular player and lose these controls.` })) return;
      try { await rpc('transfer_admin', { p_gid: g.id, p_uid: m.user_id }); close(); toast(`${m.name} is now the admin 👑`); S.tab[g.id] = 'group'; refreshGroup(true); }
      catch (e) { toast(e.message, 'error'); }
    } }, icon('crown'), 'Make admin'),
    g.status === 'lobby'
      ? h('button', { class: 'btn danger-text block', onclick: async () => {
          if (!await confirmBox({ title: 'Remove player?', text: `${m.name} will be removed from “${g.name}” and their wishlist deleted.`, ok: 'Remove', danger: true, emoji: '🧹' })) return;
          try { await rpc('remove_member', { p_gid: g.id, p_uid: m.user_id }); close(); toast(`${m.name} was removed`); refreshGroup(true); }
          catch (e) { toast(e.message, 'error'); }
        } }, icon('trash'), 'Remove from group')
      : h('p', { class: 'small muted center' }, 'Players can’t be removed once the draw has begun.'));
  const close = sheet('Manage player', body);
}

function giftProgress(g, members) {
  const n = members.length, r = g.gifts_ready || 0;
  return h('div', { class: 'stack-sm' },
    h('div', { class: 'row spread small' }, h('b', null, '🎁 Gifts ready'), h('b', null, `${r} / ${n}`)),
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(r) },
      h('span', { style: { width: `${n ? Math.round((r / n) * 100) : 0}%` } })));
}

function inviteCard(g) {
  const link = inviteLink(g.code);
  return h('div', { class: 'card tint-lav stack' },
    h('div', { class: 'card-head', style: { marginBottom: 0 } }, h('h2', null, 'Invite people 💌'), g.locked ? h('span', { class: 'chip red flat' }, '🔒 Locked') : null),
    h('p', { class: 'small muted' }, g.locked ? 'Joining is locked. Unlock it in the Admin tab to let more people in.' : 'Share the link (or the code) with everyone who’s playing.'),
    h('div', { class: 'inset invite-code', 'aria-label': 'Invite code' }, g.code),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => copyText(link) }, icon('link'), 'Copy link'),
      navigator.share
        ? h('button', { class: 'btn lav', onclick: () => navigator.share({ title: `Secret Santa: ${g.name}`, text: `Join my Secret Santa “${g.name}” 🎅 Code: ${g.code}`, url: link }).catch(() => {}) }, icon('share'), 'Share')
        : h('button', { class: 'btn lav', onclick: () => copyText(g.code) }, icon('copy'), 'Copy code')));
}

function startButton(g, members) {
  const enough = members.length >= 3;
  const start = h('button', { class: 'btn red block', disabled: !enough, onclick: async () => {
    const ok = await confirmBox({ title: 'Start the draw?', emoji: '🎅',
      text: `All ${members.length} players will get a name. Once the draw starts, nobody can join, leave or be removed.`, ok: 'Yes, start!' });
    if (!ok) return;
    await busy(start, async () => {
      await rpc('request_start', { p_gid: g.id });
      await refreshGroup(true);
    });
  } }, '✨ Start the draw');
  return start;
}

function requestsCard(g, reqs) {
  if (!g.is_admin || !reqs || !reqs.length) return null;
  const firstWord = (x) => String(x || '').trim().split(/\s+/)[0].toLowerCase();
  return h('div', { class: 'card tint-sky stack fade-in' },
    h('div', { class: 'card-head', style: { marginBottom: 0 } }, h('h2', null, '🙋 Join requests'), h('span', { class: 'count' }, String(reqs.length))),
    h('p', { class: 'small muted' }, 'Make sure it’s really them: compare the name they typed with their Google account.'),
    h('div', { class: 'list' }, reqs.map((r) => {
      const approve = h('button', { class: 'btn green sm', disabled: g.status !== 'lobby' || r.name_clash, title: r.name_clash ? 'Ask them to change their name first' : null, onclick: () => busy(approve, async () => {
        await rpc('approve_request', { p_gid: g.id, p_uid: r.user_id }); toast(`${r.name} joined 🎉`, 'ok'); await refreshGroup(true);
      }) }, icon('check'), 'Approve');
      const reject = h('button', { class: 'btn sm danger-text', onclick: async () => {
        if (!await confirmBox({ title: 'Reject request?', text: `${r.name} won’t be added to “${g.name}”.`, ok: 'Reject', danger: true, emoji: '🙅' })) return;
        try { await rpc('reject_request', { p_gid: g.id, p_uid: r.user_id }); toast('Request rejected'); refreshGroup(true); } catch (e) { toast(e.message, 'error'); }
      } }, 'Reject');
      const pic = h('div', { class: 'avatar' }, r.avatar || '🎅');
      let face = pic;
      if (r.photo && /^https:\/\//.test(r.photo)) {
        const img = h('img', { class: 'req-photo', src: r.photo, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
        img.addEventListener('error', () => img.replaceWith(pic), { once: true });
        face = img;
      }
      const differs = r.account_name && !r.account_name.toLowerCase().includes(firstWord(r.name));
      return h('div', { class: 'req' },
        h('div', { class: 'row', style: { alignItems: 'flex-start' } }, face,
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, `${r.avatar || ''} ${r.name}`, h('span', { class: 'tiny muted' }, `  ·  ${timeShort(r.at)}`)),
            h('div', { class: 'small muted', style: { wordBreak: 'break-all' } }, '🔐 ', r.account_name || 'Google account', r.account_email ? ` · ${r.account_email}` : ''),
            r.name_clash ? h('div', { class: 'tiny warn-line' }, '⚠ Someone in the group already has this name') : null,
            differs ? h('div', { class: 'tiny warn-line' }, 'ℹ The name they typed is different from their Google name') : null)),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, reject, approve));
    })),
    g.status !== 'lobby' ? h('p', { class: 'tiny muted' }, 'The draw has begun, so nobody new can join. You can only reject these.') : null);
}

function groupTab() {
  const p = S.page; const { group: g, members } = p.bundle;
  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });

  const reqCard = requestsCard(g, p.bundle.requests);
  if (reqCard) left.append(reqCard);
  if (g.status === 'starting') left.append(waitingCard(g));
  if (g.status === 'started') {
    left.append(h('div', { class: 'card tint-green stack center' }, h('div', { style: { fontSize: '48px' } }, '🎉'),
      h('h2', null, 'Names have been drawn!'), h('p', { class: 'muted' }, 'Open “My giftee” to see who you’re gifting. Keep it secret!'),
      h('button', { class: 'btn green block', onclick: () => { S.tab[g.id] = 'giftee'; drawGroup(); } }, icon('eye'), 'See my giftee'),
      h('div', { style: { textAlign: 'left' } }, giftProgress(g, members))));
  }

  if (g.status === 'lobby') {
    if (!g.locked || g.is_admin) left.append(inviteCard(g));
    if (g.is_admin) {
      left.append(h('div', { class: 'card tint-gold stack' },
        h('div', { class: 'card-head', style: { marginBottom: 0 } }, h('h2', null, '👑 You’re the admin')),
        h('p', { class: 'small muted' }, members.length >= 3
          ? 'When everyone has joined, start the draw. Players, wishlists, announcements and settings are in the Admin tab.'
          : `You need at least 3 players to start (you have ${members.length}).`),
        startButton(g, members),
        h('button', { class: 'btn block', onclick: () => { S.tab[g.id] = 'admin'; drawGroup(); } }, icon('crown'), 'Open admin tools')));
    } else {
      left.append(h('div', { class: 'card stack center' }, h('div', { style: { fontSize: '44px' } }, '⏳'),
        h('h3', null, 'Waiting for the draw'),
        h('p', { class: 'muted small' }, `👑 ${(members.find((m) => m.is_admin) || {}).name || 'The admin'} will start the draw once everyone has joined. Meanwhile, add your wishlist!`),
        h('button', { class: 'btn gold block', onclick: () => { S.tab[g.id] = 'wishes'; drawGroup(); } }, icon('gift'), 'Edit my wishlist'),
        h('button', { class: 'btn danger-text block', onclick: async () => {
          if (!await confirmBox({ title: 'Leave group?', text: `You’ll leave “${g.name}” and your wishlist will be removed.`, ok: 'Leave', danger: true, emoji: '👋' })) return;
          try { await rpc('leave_group', { p_gid: g.id }); toast('You left the group'); location.hash = '#/'; } catch (e) { toast(e.message, 'error'); }
        } }, 'Leave group')));
    }
  }

  right.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Players'), h('span', { class: 'count' }, `${members.length}`)),
    h('div', { class: 'list' }, members.map((m) => memberRow(m, g, { manage: true })))));

  return h('div', { class: 'grid-2 fade-in' }, left, right);
}

/* ---------------- admin tab (group admin only — no access to the draw) ---------------- */
function adminTab() {
  const p = S.page; const { group: g, members, wishes } = p.bundle;
  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });

  // 1. The draw
  const noWishes = members.filter((m) => !wishes.some((w) => w.user_id === m.user_id));
  const draw = h('div', { class: 'card tint-gold stack' }, h('h2', null, '🎩 The draw'));
  if (g.status === 'lobby') {
    draw.append(
      h('div', { class: 'row wrap' }, h('span', { class: 'chip flat' }, `👥 ${members.length} players`),
        h('span', { class: 'chip flat' }, `🎁 ${members.length - noWishes.length} with wishlists`)),
      noWishes.length ? h('p', { class: 'small muted' }, 'No wishes yet: ' + noWishes.map((m) => m.name).join(', ')) : h('p', { class: 'small muted' }, 'Everyone has added wishes. 🎉'),
      startButton(g, members),
      h('p', { class: 'tiny muted' }, members.length >= 3 ? 'Once started, nobody can join, leave or be removed.' : 'At least 3 players are needed.'));
  } else if (g.status === 'starting') {
    draw.append(h('p', null, '✨ The draw is under way. Everyone’s screen will spin automatically.'),
      h('button', { class: 'btn block', onclick: async () => {
        if (!await confirmBox({ title: 'Back to the lobby?', text: 'This pauses the draw so you can make changes. You can start again any time.', ok: 'Go back', emoji: '↩️' })) return;
        try { await rpc('cancel_start', { p_gid: g.id }); refreshGroup(true); } catch (e) { toast(e.message, 'error'); }
      } }, '↩️ Back to the lobby'));
  } else {
    draw.append(h('p', null, '🎉 Names have been drawn. Only each Santa knows their own person, and that includes you.'),
      giftProgress(g, members),
      h('p', { class: 'tiny muted' }, 'Players tap “I’ve got my gift” in their Giftee tab. You can see who’s ready in the list.'));
  }
  left.append(draw);

  // 2. Announcement
  const ann = h('textarea', { class: 'input', maxlength: '300', rows: '3', placeholder: 'e.g. Gift exchange moved to 7pm at Nani’s 🎄', 'aria-label': 'Announcement' });
  ann.value = g.announcement || '';
  const post = h('button', { class: 'btn lav', onclick: () => busy(post, async () => {
    await rpc('set_announcement', { p_gid: g.id, p_text: ann.value });
    toast(ann.value.trim() ? 'Announcement posted 📢' : 'Announcement cleared'); ann.value = ''; ann.blur(); await refreshGroup(true);
  }) }, icon('megaphone'), 'Post');
  left.append(h('div', { class: 'card tint-sky stack' },
    h('h2', null, '📢 Announcement'),
    h('p', { class: 'small muted' }, 'Pinned at the top of the group for everyone.'),
    ann,
    h('div', { class: 'row' }, post, g.announcement ? h('button', { class: 'btn ghost', onclick: async () => {
      try { await rpc('set_announcement', { p_gid: g.id, p_text: '' }); toast('Announcement cleared'); refreshGroup(true); } catch (e) { toast(e.message, 'error'); }
    } }, 'Clear') : null)));

  // 3. Invites & joining
  if (g.status !== 'started') {
    const lock = h('input', { type: 'checkbox', checked: g.locked, onchange: async () => {
      try {
        await rpc('update_group', { p_gid: g.id, p_name: g.name, p_budget: g.budget || '', p_date: g.exchange_date || null, p_note: g.note || '', p_locked: lock.checked });
        toast(lock.checked ? 'Joining locked 🔒' : 'Joining unlocked 🔓'); refreshGroup(true);
      } catch (e) { lock.checked = !lock.checked; toast(e.message, 'error'); }
    } });
    const approval = h('input', { type: 'checkbox', checked: g.require_approval !== false, onchange: async () => {
      try { await rpc('set_require_approval', { p_gid: g.id, p_on: approval.checked });
        toast(approval.checked ? 'New players need your approval 🙋' : 'Anyone with the link can join'); refreshGroup(true);
      } catch (e) { approval.checked = !approval.checked; toast(e.message, 'error'); }
    } });
    left.append(h('div', { class: 'card stack' },
      h('h2', null, '🎟️ Invites'),
      h('div', { class: 'row spread' }, h('span', { class: 'small muted' }, 'Current code'), h('b', { class: 'mono-code' }, g.code)),
      h('label', { class: 'switch' }, h('span', null, h('b', null, 'Approve new players'), h('div', { class: 'small muted' }, 'New people wait until you approve them. You’ll see their Google name and email.')), approval),
      h('label', { class: 'switch' }, h('span', null, h('b', null, 'Lock joining'), h('div', { class: 'small muted' }, 'Nobody new can join, even with the link')), lock),
      h('button', { class: 'btn block', onclick: async () => {
        if (!await confirmBox({ title: 'New invite code?', emoji: '🔑', ok: 'Make new code',
          text: 'The old link and code will stop working. Players already in the group stay in.' })) return;
        try { const c = await rpc('regenerate_code', { p_gid: g.id }); toast(`New code: ${c}`, 'ok'); refreshGroup(true); } catch (e) { toast(e.message, 'error'); }
      } }, icon('key'), 'Make a new invite code')));
  }

  // 4. Join requests + players
  const reqCard2 = requestsCard(g, p.bundle.requests);
  if (reqCard2) right.append(reqCard2);
  right.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, '👥 Manage players'), h('span', { class: 'count' }, `${members.length}`)),
    h('p', { class: 'small muted', style: { marginBottom: '12px' } }, 'Tap ⚙️ to lock a wishlist, make someone admin, or remove them.'),
    h('div', { class: 'list' }, members.map((m) => memberRow(m, g, { manage: true })))));

  // 5. Wishlist rules
  const freeze = h('input', { type: 'checkbox', checked: !!g.wishes_locked, onchange: async () => {
    try { await rpc('set_group_options', { p_gid: g.id, p_wishes_locked: freeze.checked, p_max_wishes: null });
      toast(freeze.checked ? 'All wishlists frozen 🧊' : 'Wishlists open again'); refreshGroup(true);
    } catch (e) { freeze.checked = !freeze.checked; toast(e.message, 'error'); }
  } });
  const maxSel = h('select', { class: 'input', 'aria-label': 'Max wishes per person', style: { width: 'auto' }, onchange: async () => {
    try { await rpc('set_group_options', { p_gid: g.id, p_wishes_locked: null, p_max_wishes: Number(maxSel.value) });
      toast(`Max ${maxSel.value} wishes per person`); refreshGroup(true);
    } catch (e) { toast(e.message, 'error'); }
  } }, [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30].concat(g.max_wishes ? [g.max_wishes] : [])
    .filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)
    .map((n) => h('option', { value: String(n), selected: n === g.max_wishes }, String(n))));
  right.append(h('div', { class: 'card stack' },
    h('h2', null, '🎁 Wishlist rules'),
    h('label', { class: 'switch' }, h('span', null, h('b', null, 'Freeze all wishlists'), h('div', { class: 'small muted' }, 'Nobody can add new items')), freeze),
    h('div', { class: 'row spread' }, h('span', null, h('b', null, 'Max wishes per person'), h('div', { class: 'small muted' }, 'Existing items are kept')), maxSel),
    h('p', { class: 'tiny muted' }, 'To remove any item, open the Wishlists tab and tap 🗑️ next to it.')));

  // 5b. Anonymous chat switch (whole group at once)
  const chatSw = h('input', { type: 'checkbox', checked: g.chat_enabled !== false, onchange: async () => {
    try { await rpc('set_chat_enabled', { p_gid: g.id, p_on: chatSw.checked });
      toast(chatSw.checked ? 'Chats are on 💬' : 'Chats turned off for everyone 🔕'); refreshGroup(true);
    } catch (e) { chatSw.checked = !chatSw.checked; toast(e.message, 'error'); }
  } });
  right.append(h('div', { class: 'card stack' },
    h('h2', null, '💬 Anonymous chat'),
    h('label', { class: 'switch' }, h('span', null, h('b', null, 'Santa ⇄ giftee chats'),
      h('div', { class: 'small muted' }, 'Lets everyone message their giftee and their own Secret Santa without revealing who they are. Turn off to pause all chats in this group.')), chatSw),
    h('p', { class: 'tiny muted' }, g.status === 'started' ? (g.chat_enabled !== false ? 'Chats are open.' : 'Chats are paused. Old messages stay hidden until you turn them back on.') : 'Chats open after the names are drawn.')));

  // 6. Group
  right.append(h('div', { class: 'card stack' },
    h('h2', null, '⚙️ Group'),
    h('button', { class: 'btn block', onclick: openEditGroup }, icon('pencil'), 'Edit name, budget, date & note'),
    g.status !== 'started' ? h('button', { class: 'btn danger-text block', onclick: async () => {
      if (!await confirmBox({ title: 'Delete group?', text: `“${g.name}” and all its wishlists will be deleted for everyone.`, ok: 'Delete', danger: true, emoji: '🗑️' })) return;
      try { await rpc('delete_group', { p_gid: g.id }); toast('Group deleted'); location.hash = '#/'; } catch (e) { toast(e.message, 'error'); }
    } }, icon('trash'), 'Delete group') : null));

  return h('div', { class: 'grid-2 fade-in' }, left, right);
}

function waitingCard(g) {
  const msg = h('div', { class: 'msg' }, WAIT_LINES[0]);
  let i = 0;
  const iv = setInterval(() => {
    if (!msg.isConnected) return clearInterval(iv);
    i = (i + 1) % WAIT_LINES.length; msg.style.opacity = '0';
    setTimeout(() => { msg.textContent = WAIT_LINES[i]; msg.style.opacity = '1'; }, 300);
  }, 2800);
  return h('div', { class: 'card tint-gold waiting' },
    h('div', { class: 'sparkles', 'aria-hidden': 'true' }, h('span', null, '✨'), h('span', null, '⭐'), h('span', null, '✨')),
    h('div', { class: 'hat', 'aria-hidden': 'true' }, '🎩'),
    h('h2', null, 'The draw is under way!'), msg,
    h('p', { class: 'small muted' }, 'Keep this page open. Your name will pop up automatically, or you can come back later.'),
    g.is_admin ? h('button', { class: 'link-btn small', onclick: async () => {
      if (!await confirmBox({ title: 'Back to the lobby?', text: 'This pauses the draw so you can make changes. You can start again any time.', ok: 'Go back', emoji: '↩️' })) return;
      try { await rpc('cancel_start', { p_gid: g.id }); refreshGroup(true); } catch (e) { toast(e.message, 'error'); }
    } }, 'Need to make changes? Back to the lobby') : null);
}

/* ---------------- link pictures ---------------- */
// Short share-links → real shop, so the right logo shows.
const SHORT_HOSTS = { 'amzn.in': 'amazon.in', 'amzn.to': 'amazon.com', 'a.co': 'amazon.com', 'amzn.eu': 'amazon.co.uk',
  'fkrt.it': 'flipkart.com', 'fkrt.co': 'flipkart.com', 'dl.flipkart.com': 'flipkart.com', 'myntr.it': 'myntra.com',
  'ajiio.in': 'ajio.com', 'ajio.page.link': 'ajio.com', 'msho.in': 'meesho.com', 'nykaa.me': 'nykaa.com' };
function siteHost(u) {
  try { const host = new URL(u).hostname.replace(/^www\./, '').toLowerCase(); return SHORT_HOSTS[host] || host; } catch { return null; }
}
function faviconUrl(u) { const host = siteHost(u); return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : null; }
function cleanTitle(t) {
  return String(t || '').replace(/\s+/g, ' ').trim()
    .replace(/^(amazon\.[a-z.]+|flipkart\.com)\s*:\s*/i, '')
    .replace(/^buy\s+/i, '')
    .replace(/\s+[-–]\s+buy\s.*$/i, '')
    .replace(/\s+online at (best|low(est)?) prices?.*$/i, '')
    .replace(/\s+\|.*$/, '')
    .replace(/\s*[:–-]\s*(amazon\.[a-z.]+|flipkart(\.com)?|myntra|ajio|meesho|nykaa)\b.*$/i, '')
    .replace(/\s+:\s+[^:]{1,30}$/, '')
    .trim().slice(0, 120);
}
// Free preview service, called once from the player's own browser when they add a link.
async function linkPreview(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url), { signal: ctrl.signal });
    const j = await r.json();
    if (!j || j.status !== 'success' || !j.data) return null;
    const d = j.data;
    const pick = (x) => (x && typeof x.url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(x.url) && x.url.length <= 1000) ? x.url : null;
    return { title: cleanTitle(d.title), image: pick(d.image) || pick(d.logo), site: (d.publisher || '').slice(0, 60) || null };
  } catch { return null; } finally { clearTimeout(t); }
}
// Picture for a wish: product photo → shop logo → 🎁
function thumb(w, href) {
  const box = h(href ? 'a' : 'div', href ? { class: 'thumb', href, target: '_blank', rel: 'noopener noreferrer nofollow', 'aria-label': 'Open link', tabindex: '-1' } : { class: 'thumb', 'aria-hidden': 'true' });
  const sources = [];
  if (w.image && /^https:\/\//.test(w.image)) sources.push(['photo', w.image]);
  if (w.link) { const f = faviconUrl(w.link); if (f) sources.push(['logo', f]); }
  const next = () => {
    const s = sources.shift();
    if (!s) { box.className = 'thumb emoji'; box.replaceChildren('🎁'); return; }
    const img = h('img', { src: s[1], alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', next, { once: true });
    box.className = 'thumb ' + s[0];
    box.replaceChildren(img);
  };
  next();
  return box;
}

function wishItem(w, { canDelete = false, owner = null } = {}) {
  const url = w.link ? safeUrl(w.link) : null;
  return h('div', { class: 'wish' }, thumb(w, url),
    h('div', { class: 'grow' }, h('div', { class: 't' }, w.title),
      url ? h('a', { class: 'site-link', href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('ext'), w.site || siteHost(url) || 'link') : null),
    canDelete ? h('button', { class: 'icon-btn sm danger', 'aria-label': `Remove ${w.title}`, onclick: async (e) => {
      const b = e.currentTarget;
      if (owner && !await confirmBox({ title: 'Remove this wish?', emoji: '🧹', ok: 'Remove', danger: true,
        text: `“${w.title}” will be removed from ${owner}’s wishlist.` })) return;
      b.disabled = true;
      try { await rpc('delete_wish', { p_id: w.id }); if (owner) toast('Removed'); refreshGroup(true); } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    } }, icon('trash')) : null);
}

function wishesTab() {
  const p = S.page; const { group: g, members, wishes } = p.bundle;
  const me = members.find((m) => m.is_me) || {};
  const mine = wishes.filter((w) => w.user_id === me.user_id);
  const max = g.max_wishes || 30;

  let addArea;
  if (g.wishes_locked) {
    addArea = h('div', { class: 'notice' }, '🧊 The admin has frozen all wishlists for now.');
  } else if (me.wish_locked) {
    addArea = h('div', { class: 'notice' }, '🔒 The admin has locked your wishlist, so you can’t add more items right now.');
  } else if (mine.length >= max) {
    addArea = h('div', { class: 'notice' }, `✅ Your wishlist is full (${max} items max in this group).`);
  } else {
    const title = h('input', { class: 'input', type: 'text', maxlength: '120', placeholder: 'Gift name, e.g. “Blue hoodie, size M”', 'aria-label': 'Gift name' });
    const link = h('input', { class: 'input', type: 'url', inputmode: 'url', maxlength: '500', placeholder: 'Paste a link (optional)', 'aria-label': 'Link (optional)' });
    const add = h('button', { class: 'btn gold', type: 'submit' }, icon('plus'), 'Add');
    const previewBox = h('div', { class: 'link-preview', hidden: true });
    let preview = null, pending = null, pendingUrl = null, timer = null, seq = 0;
    const fetchPreview = (url) => {
      const my = ++seq;
      previewBox.hidden = false;
      previewBox.replaceChildren(thumb({ link: url }), h('div', { class: 'grow' }, h('div', { class: 'small muted' }, 'Getting a picture for this link…')));
      pendingUrl = url;
      pending = linkPreview(url).then((pv) => {
        if (my !== seq) return;
        preview = { url, image: pv && pv.image, site: (pv && pv.site) || siteHost(url), title: pv && pv.title };
        previewBox.replaceChildren(thumb({ link: url, image: preview.image }),
          h('div', { class: 'grow' }, h('div', { class: 't clamp2' }, preview.title || siteHost(url)), h('div', { class: 'tiny muted' }, preview.site || '')));
        if (!title.value.trim() && preview.title) title.value = preview.title;
      });
      return pending;
    };
    const onLink = () => {
      clearTimeout(timer);
      const url = safeUrl(link.value.trim());
      if (!url) { preview = null; pending = null; seq++; previewBox.hidden = true; return; }
      if (preview && preview.url === url) return;
      timer = setTimeout(() => fetchPreview(url), 450);
    };
    link.addEventListener('input', onLink);
    addArea = h('form', { class: 'stack-sm', onsubmit: (e) => {
      e.preventDefault();
      busy(add, async () => {
        const l = link.value.trim();
        const url = l ? safeUrl(l) : null;
        if (l && !url) throw new Error('Links must start with https://');
        if (url && (!preview || preview.url !== url)) {          // still loading → wait a moment for the picture
          clearTimeout(timer);
          const job = (pending && pendingUrl === url) ? pending : fetchPreview(url);
          await Promise.race([job, new Promise((r) => setTimeout(r, 5000))]);
        }
        const t = title.value.trim();
        if (!t) throw new Error('Write the gift name first.');
        const pv = url && preview && preview.url === url ? preview : null;
        await rpc('add_wish', { p_gid: g.id, p_title: t, p_link: url, p_image: pv ? pv.image || null : null, p_site: pv ? pv.site || null : null });
        title.value = ''; link.value = ''; preview = null; seq++; previewBox.hidden = true; document.activeElement && document.activeElement.blur();
        toast('Added to your wishlist ✨', 'ok');
        await refreshGroup(true);
      });
    } }, title, h('div', { class: 'row' }, h('div', { class: 'grow' }, link), add), previewBox,
      h('p', { class: 'tiny muted' }, '✨ Paste a shop link and we’ll add a picture (and the name, if it’s empty).'));
  }

  const mineCard = h('div', { class: 'card tint-gold stack' },
    h('div', { class: 'card-head', style: { marginBottom: 0 } }, h('h2', null, 'My wishlist'), h('span', { class: 'count' }, `${mine.length} / ${max}`)),
    h('p', { class: 'small muted' }, 'Add gifts you’d love to receive, with a link if you like. Everyone in the group can see this.'),
    addArea,
    mine.length ? h('div', { class: 'stack-sm' }, mine.map((w) => wishItem(w, { canDelete: true }))) : h('p', { class: 'small muted center' }, 'Nothing yet. Add a few ideas 🎈'));

  const others = members.filter((m) => !m.is_me).map((m) => {
    const ws = wishes.filter((w) => w.user_id === m.user_id);
    const isGiftee = p.assignment && p.assignment.user_id === m.user_id;
    return h('div', { class: `person-wishes${isGiftee ? ' highlight' : ''}` },
      h('div', { class: 'row' }, h('div', { class: 'avatar' }, m.avatar),
        h('div', { class: 'grow' }, personName(m, 'name ellipsis bold'),
          h('div', { class: 'tiny muted' }, ws.length ? `${ws.length} wish${ws.length === 1 ? '' : 'es'}` : 'No wishes yet',
            g.is_admin && m.wish_locked ? ' · 🔒 locked' : '')),
        isGiftee ? h('span', { class: 'chip red flat' }, '🎯 Your giftee') : null,
        g.is_admin ? h('button', { class: 'icon-btn sm', 'aria-label': `Manage ${m.name}`, onclick: () => openMemberSheet(m) }, icon('cog')) : null),
      ws.length ? h('div', { class: 'stack-sm' }, ws.map((w) => wishItem(w, { canDelete: g.is_admin, owner: m.name }))) : null);
  });

  return h('div', { class: 'grid-2 fade-in' }, h('div', { class: 'col' }, mineCard),
    h('div', { class: 'col' }, h('div', { class: 'card stack' }, h('h2', null, 'Everyone’s wishlists'),
      g.is_admin ? h('p', { class: 'tiny muted' }, '👑 As admin you can remove any item (🗑️) or lock someone’s list (⚙️).') : null,
      others.length ? others : h('p', { class: 'muted small' }, 'Wishlists from other players will show up here.'))));
}

function gifteeTab() {
  const p = S.page; const a = p.assignment; const { group: g, members, wishes } = p.bundle;
  if (!a) {
    return h('div', { class: 'card center stack' }, h('div', { style: { fontSize: '44px' } }, '🎁'),
      h('p', { class: 'muted' }, 'Loading your giftee…'));
  }
  const me = members.find((m) => m.is_me) || {};
  const card = h('button', { class: 'card secret hidden', 'aria-label': 'Tap to reveal your giftee', onclick: () => {
    card.classList.toggle('hidden');
    peek.replaceChildren(icon('eye'), card.classList.contains('hidden') ? 'Tap to peek' : 'Tap to hide');
  } });
  const peek = h('span', { class: 'peek' }, icon('eye'), 'Tap to peek');
  card.append(h('p', { class: 'muted' }, 'You are the Secret Santa for'), h('div', { class: 'avatar xl' }, a.avatar), h('div', { class: 'who' }, a.name), peek);
  const ws = wishes.filter((w) => w.user_id === a.user_id);

  const readyBtn = h('button', { class: `btn block ${me.gift_ready ? 'green' : 'gold'}`, onclick: () => busy(readyBtn, async () => {
    await rpc('set_gift_ready', { p_gid: g.id, p_ready: !me.gift_ready });
    toast(!me.gift_ready ? 'Nice one, Santa! 🎅' : 'Marked as not ready'); await refreshGroup(true);
  }) }, me.gift_ready ? '✅ Gift ready! (tap to undo)' : '🎁 I’ve got my gift');

  const chatBtn = (role, label, ic, cls) => h('button', { class: `btn ${cls} block`, onclick: () => openChat(role), style: { position: 'relative', paddingLeft: '30px', paddingRight: '30px' } }, icon(ic), label,
    h('span', { class: 'dot', 'data-unread': role, hidden: !(p.unread[role] > 0), style: { position: 'absolute', top: '8px', right: '10px' } }));

  return h('div', { class: 'grid-2 fade-in' },
    h('div', { class: 'col' }, card,
      h('div', { class: 'card stack' }, readyBtn, giftProgress(g, members)),
      h('div', { class: 'card stack' }, h('h3', null, 'Psst… stay anonymous 🤫'),
        g.chat_enabled !== false && me.chat_blocked ? h('div', { class: 'notice' }, '🔇 You can’t send messages in this group right now.')
        : g.chat_enabled !== false ? [
          h('p', { class: 'small muted' }, 'Ask your giftee questions without revealing who you are, and answer your own Secret Santa.'),
          chatBtn('giftee', `Message ${firstName(a.name)}`, 'chat', 'lav'),
          chatBtn('santa', 'Messages from my Secret Santa', 'gift', 'gold')
        ] : h('div', { class: 'notice' }, '🔕 The admin has turned off chats for now.'),
        h('button', { class: 'btn ghost block', onclick: () => playReveal() }, icon('replay'), 'Replay the draw'))),
    h('div', { class: 'col' }, h('div', { class: 'card tint-gold stack' },
      h('div', { class: 'card-head', style: { marginBottom: 0 } }, h('h2', null, `${a.name}’s wishlist`), h('span', { class: 'count' }, `${ws.length}`)),
      ws.length ? h('div', { class: 'stack-sm' }, ws.map((w) => wishItem(w)))
        : h('p', { class: 'muted small' }, 'No wishes yet. Send them an anonymous nudge to add some! 💌'),
      g.budget ? h('p', { class: 'small' }, `💸 Budget: ${g.budget}`) : null)));
}

/* ---------------- system notices (group admins only) ---------------- */
const NOTICE_ICON = { info: 'ℹ️', warning: '⚠️', alert: '🚨' };
async function fetchNotices() {
  if (S.fetchingNotices) return;
  S.fetchingNotices = true;
  try { const list = await rpc('my_notices'); S.notices = Array.isArray(list) ? list : []; }
  catch { return; }
  finally { S.fetchingNotices = false; }
  paintBell();
  if (S.page && S.page.kind === 'group' && S.page.bundle.group.is_admin) paintGroupNotices();
  popNewNotice();
}
function unreadNotices(gid) { return S.notices.filter((n) => n.unread && (!gid || n.group_id === gid)); }
function paintBell() {
  document.querySelectorAll('[data-bell]').forEach((slot) => {
    if (!S.notices.length) { slot.replaceChildren(); return; }
    const unread = unreadNotices().length;
    slot.replaceChildren(h('button', { class: 'icon-btn bell-btn', onclick: openNoticeList,
      'aria-label': unread ? `${unread} new system notification${unread > 1 ? 's' : ''}` : 'System notifications' },
      icon('bell'), unread ? h('span', { class: 'bell-count' }, String(unread)) : null));
  });
}
function paintGroupNotices() {
  const slot = document.querySelector('[data-group-notices]');
  if (!slot || !S.page) return;
  slot.replaceChildren(...unreadNotices(S.page.gid).map((n) => noticeCard(n)));
}
function noticeCard(n, { big = false, onDone } = {}) {
  const done = async (msg) => {
    try { await rpc('mark_notice_read', { p_id: n.id }); } catch { /* ignore */ }
    if (msg) toast(msg, 'ok');
    if (onDone) onDone();
    await fetchNotices();
    if (S.page && S.page.kind === 'group') refreshGroup(true);
  };
  const act = (label, cls, fn) => h('button', { class: `sys-btn ${cls}`, onclick: (e) => busy(e.currentTarget, fn) }, label);
  const actions = [];
  if (n.about_user && n.about_in_group && !n.about_blocked) {
    actions.push(act(`🔇 Block ${firstName(n.about_name)} from chat`, 'danger', async () => {
      await rpc('set_member_chat_block', { p_gid: n.group_id, p_uid: n.about_user, p_blocked: true });
      await done(`${n.about_name} can’t send chat messages now 🔇`);
    }));
  }
  if (n.chat_enabled && n.status === 'started') {
    actions.push(act('🔕 Turn off chat for everyone', '', async () => {
      await rpc('set_chat_enabled', { p_gid: n.group_id, p_on: false });
      await done('Chats turned off for everyone 🔕');
    }));
  }
  actions.push(act('Open admin tools', '', async () => {
    S.tab[n.group_id] = 'admin';
    const target = '#/g/' + n.group_id;
    await done();
    if (location.hash !== target) location.hash = target; else if (S.page) drawGroup();
  }));
  if (n.unread) actions.push(act('Got it', 'ghost', async () => done()));
  return h('section', { class: `sys-card lvl-${n.level}${big ? ' big' : ''}${n.unread ? '' : ' read'}`, role: 'status' },
    h('div', { class: 'sys-head' }, h('span', { class: 'sys-pill' }, '🛡️ System notice'), h('span', { class: 'sys-time' }, timeShort(n.created_at))),
    h('div', { class: 'sys-from' }, `Secret Santa · to the admin of “${n.group_name}”`),
    h('div', { class: 'sys-title' }, `${NOTICE_ICON[n.level] || '⚠️'} ${n.title}`),
    h('p', { class: 'sys-body' }, n.body),
    n.about_name ? h('div', { class: 'sys-about' }, 'Player: ', h('b', null, n.about_name), n.about_blocked ? '  ·  🔇 blocked from chat' : '') : null,
    h('div', { class: 'sys-actions' }, actions));
}
function popNewNotice() {
  if (document.querySelector('.sys-overlay')) return;
  const n = S.notices.find((x) => x.unread && !store.get('ss.notice.popped.' + x.id));
  if (!n) return;
  store.set('ss.notice.popped.' + n.id, '1');
  haptic([70, 50, 70]);
  const overlay = h('div', { class: 'sys-overlay', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'System notification' });
  const close = () => { overlay.classList.remove('open'); setTimeout(() => { overlay.remove(); popNewNotice(); }, 260); };
  overlay.append(noticeCard(n, { big: true, onDone: close }));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}
function openNoticeList() {
  const body = h('div', { class: 'stack' });
  const paint = () => body.replaceChildren(...(S.notices.length
    ? S.notices.map((n) => noticeCard(n, { onDone: () => setTimeout(paint, 300) }))
    : [h('p', { class: 'muted center' }, 'No notifications.')]));
  paint();
  sheet('🔔 Notifications', body);
}

/* ---------------- anonymous chat ---------------- */
function readKey(gid, role) { return `ss.read.${gid}.${role}`; }
async function pollUnread() {
  const p = S.page; if (!p || !p.assignment || p.bundle.group.chat_enabled === false) return;
  if ((p.bundle.members.find((m) => m.is_me) || {}).chat_blocked) return;
  for (const role of ['giftee', 'santa']) {
    try {
      const msgs = await rpc('get_thread', { p_gid: p.gid, p_with: role });
      if (S.page !== p) return;
      p.threads[role] = msgs;
      const theirs = msgs.filter((m) => !m.mine).length;
      const read = Number(store.get(readKey(p.gid, role)) || 0);
      p.unread[role] = Math.max(0, theirs - read);
    } catch { /* ignore */ }
  }
  document.querySelectorAll('[data-unread]').forEach((d) => { d.hidden = !(p.unread[d.dataset.unread] > 0); });
  const anyUnread = (p.unread.santa + p.unread.giftee) > 0;
  const tabDot = document.querySelector('[data-unread-tab]');
  if (anyUnread && !tabDot && S.tab[p.gid] !== 'giftee') drawGroup();
  else if (!anyUnread && tabDot) tabDot.remove();
}

function openChat(role) {
  const p = S.page; if (!p || !p.assignment) return;
  const a = p.assignment;
  const listEl = h('div', { class: 'chat-body', 'aria-live': 'polite' });
  const ta = h('textarea', { class: 'input', maxlength: '500', rows: '1', placeholder: 'Type a message…', 'aria-label': 'Message' });
  const send = h('button', { class: 'btn lav', type: 'submit', 'aria-label': 'Send' }, icon('send'));
  let lastLen = -1;
  const paint = (msgs) => {
    if (msgs.length === lastLen) return;
    const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60;
    lastLen = msgs.length;
    if (!msgs.length) {
      listEl.replaceChildren(h('div', { class: 'center muted small', style: { margin: 'auto', padding: '20px' } },
        role === 'giftee' ? `Say hi! ${a.name} will only see “Your Secret Santa”. 🎅` : 'No messages yet. Your Secret Santa may reach out — or you can drop hints here! 🎁'));
    } else {
      listEl.replaceChildren(...msgs.map((m) => h('div', { class: `bubble ${m.mine ? 'me' : 'them'}` }, m.body, h('time', null, timeShort(m.at)))));
    }
    if (atBottom || lastLen <= msgs.length) listEl.scrollTop = listEl.scrollHeight;
    store.set(readKey(p.gid, role), String(msgs.filter((m) => !m.mine).length));
    p.unread[role] = 0;
    document.querySelectorAll(`[data-unread="${role}"]`).forEach((d) => { d.hidden = true; });
  };
  const load = async () => {
    try { const msgs = await rpc('get_thread', { p_gid: p.gid, p_with: role }); if (S.page === p) paint(msgs); } catch { /* ignore */ }
  };
  const form = h('form', { class: 'chat-form', onsubmit: (e) => {
    e.preventDefault();
    const body = ta.value.trim(); if (!body) return;
    busy(send, async () => { await rpc('send_message', { p_gid: p.gid, p_to: role, p_body: body }); ta.value = ''; lastLen = -1; await load(); });
  } }, ta, send);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 640px)').matches) { e.preventDefault(); form.requestSubmit(); } });
  const sub = h('div', { style: { marginBottom: '10px' } },
    h('p', { class: 'small muted' }, role === 'giftee' ? `🤫 ${a.name} can’t see who you are. No name-dropping!` : '🎅 You won’t see who your Secret Santa is. No guessing games that spoil the surprise!'),
    h('p', { class: 'tiny muted' }, 'Be kind! Keep the game fair.'));
  const iv = setInterval(load, 4000);
  sheet(role === 'giftee' ? `Chat with ${a.name}` : 'Your Secret Santa', h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1', minHeight: '0' } }, sub, listEl, form),
    { tall: true, onClose: () => clearInterval(iv) });
  if (p.threads[role]) paint(p.threads[role]);
  load();
}

/* ---------------- edit group (admin) ---------------- */
function openEditGroup() {
  const g = S.page.bundle.group;
  const name = h('input', { type: 'text', maxlength: '60', value: g.name, required: true });
  const budget = h('input', { type: 'text', maxlength: '30', value: g.budget || '', placeholder: 'e.g. ₹500' });
  const date = h('input', { type: 'date', value: g.exchange_date || '' });
  const note = h('textarea', { maxlength: '500', placeholder: 'Rules, theme, venue…' }); note.value = g.note || '';
  const save = h('button', { class: 'btn red block', type: 'submit' }, 'Save');
  const close = sheet('Edit group', h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    busy(save, async () => {
      await rpc('update_group', { p_gid: g.id, p_name: name.value, p_budget: budget.value, p_date: date.value || null, p_note: note.value, p_locked: g.locked });
      close(); toast('Saved', 'ok'); refreshGroup(true);
    });
  } },
    h('label', { class: 'field' }, h('span', null, 'Group name'), name),
    h('div', { class: 'btn-row' }, h('label', { class: 'field' }, h('span', null, 'Budget'), budget), h('label', { class: 'field' }, h('span', null, 'Exchange date'), date)),
    h('label', { class: 'field' }, h('span', null, 'Note for everyone'), note), save));
}

/* ---------------- the big reveal ---------------- */
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function playReveal() {
  const p = S.page; if (!p || !p.assignment) return;
  const a = p.assignment;
  const pool = p.bundle.members.filter((m) => !m.is_me).map((m) => ({ name: m.name, avatar: m.avatar }));
  if (!pool.length) pool.push({ name: a.name, avatar: a.avatar });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Build a long strip of shuffled names that ends on the real giftee.
  const seq = [];
  while (seq.length < 56) {
    const batch = shuffle(pool);
    if (seq.length && batch[0].name === seq[seq.length - 1].name && batch.length > 1) batch.push(batch.shift());
    seq.push(...batch);
  }
  const notGiftee = pool.filter((x) => x.name !== a.name);
  const filler = (avoid) => {
    const ok = notGiftee.filter((x) => !avoid.includes(x.name));
    const from = ok.length ? ok : (notGiftee.length ? notGiftee : pool);
    return from[Math.floor(Math.random() * from.length)];
  };
  // the names right before the winner are never the winner (no spoilers), and never repeat a neighbour
  for (const i of [seq.length - 1, seq.length - 2]) {
    if (seq[i] && seq[i].name === a.name) seq[i] = filler([seq[i - 1] && seq[i - 1].name, seq[i + 1] && seq[i + 1].name]);
  }
  const targetIndex = seq.length;
  seq.push({ name: a.name, avatar: a.avatar });
  const tail = shuffle(notGiftee.length ? notGiftee : pool);
  for (let i = 0; i < 4; i++) seq.push(tail[i % tail.length]);

  const track = h('div', { class: 'reel-track' }, seq.map((s) => h('div', { class: 'reel-item' }, h('span', { class: 'e' }, s.avatar || '🎁'), s.name)));
  const reelWrap = h('div', { class: 'reel-wrap' }, h('div', { class: 'reel' }, track), h('div', { class: 'reel-lens', 'aria-hidden': 'true' }));
  const title = h('h2', null, '🎩 Pulling a name from the hat…');
  const stage = h('div', { class: 'stack', style: { width: '100%' } }, reelWrap);
  const closeBtn = h('button', { class: 'btn ghost', hidden: true, onclick: () => close() }, 'Close');
  const card = h('div', { class: 'card reveal-card' }, title, stage, closeBtn);
  const overlay = h('div', { class: 'reveal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Secret Santa draw' }, card);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('open'));

  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 350);
  }

  function showResult() {
    haptic([30, 60, 90]);
    confetti();
    title.textContent = '🎉 You are the Secret Santa for';
    stage.replaceChildren(h('div', { class: 'result' }, h('div', { class: 'avatar xl' }, a.avatar), h('div', { class: 'who' }, a.name),
      h('p', { class: 'muted' }, 'Shh… keep it a secret! 🤫'),
      h('button', { class: 'btn red block', onclick: () => { close(); S.tab[p.gid] = 'giftee'; drawGroup(); } }, icon('gift'), 'See their wishlist')));
    closeBtn.hidden = false;
  }

  if (reduce) { setTimeout(showResult, 400); return; }

  requestAnimationFrame(() => {
    const ih = track.firstChild.getBoundingClientRect().height || 60;
    const end = -(targetIndex - 2) * ih;
    const anim = track.animate([
      { transform: 'translateY(0px)', offset: 0 },
      { transform: `translateY(${end - ih * 0.35}px)`, offset: 0.9 },
      { transform: `translateY(${end}px)`, offset: 1 }
    ], { duration: 6800, easing: 'cubic-bezier(.22,.55,.16,1)', fill: 'forwards' });
    // gentle tick haptics while spinning
    let last = 0;
    const tickLoop = () => {
      if (!overlay.isConnected || anim.playState === 'finished') return;
      const t = anim.currentTime || 0;
      if (t - last > 140 && t < 4800) { last = t; haptic(4); }
      requestAnimationFrame(tickLoop);
    };
    requestAnimationFrame(tickLoop);
    anim.onfinish = () => setTimeout(showResult, 450);
  });
}

function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = h('canvas', { class: 'confetti' });
  document.body.append(c);
  const ctx = c.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = c.width = innerWidth * dpr, H = c.height = innerHeight * dpr;
  const colors = ['#ff7584', '#4fc69b', '#ffc960', '#a99bff', '#82ccf4', '#ffffff'];
  const parts = Array.from({ length: 160 }, () => ({
    x: W / 2 + (Math.random() - .5) * W * .3, y: H * .45, r: (4 + Math.random() * 6) * dpr,
    vx: (Math.random() - .5) * 22 * dpr, vy: (-10 - Math.random() * 14) * dpr, rot: Math.random() * 6, vr: (Math.random() - .5) * .4,
    c: colors[(Math.random() * colors.length) | 0], s: Math.random() < .5
  }));
  const t0 = performance.now();
  const frame = (t) => {
    const el = t - t0;
    ctx.clearRect(0, 0, W, H);
    for (const q of parts) {
      q.vy += .45 * dpr; q.vx *= .985; q.x += q.vx; q.y += q.vy; q.rot += q.vr;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.c;
      ctx.globalAlpha = Math.max(0, 1 - el / 3200);
      if (q.s) ctx.fillRect(-q.r, -q.r / 2, q.r * 2, q.r); else { ctx.beginPath(); ctx.arc(0, 0, q.r * .6, 0, 6.3); ctx.fill(); }
      ctx.restore();
    }
    if (el < 3300) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}

/* ---------------- snow ---------------- */
function makeSnow() {
  const box = document.querySelector('.snow'); if (!box) return;
  const n = window.innerWidth < 640 ? 14 : 26;
  for (let i = 0; i < n; i++) {
    const f = h('span', { class: 'flake' }, Math.random() < .5 ? '❄' : '•');
    f.style.left = (Math.random() * 100) + 'vw';
    f.style.fontSize = (8 + Math.random() * 14) + 'px';
    f.style.animationDuration = (9 + Math.random() * 12) + 's';
    f.style.animationDelay = (-Math.random() * 20) + 's';
    f.style.opacity = String(.35 + Math.random() * .5);
    f.style.setProperty('--drift', ((Math.random() - .5) * 120) + 'px');
    box.append(f);
  }
}

/* ---------------- boot ---------------- */
async function boot() {
  makeSnow();
  if (!CONFIGURED) return render();
  const params = new URLSearchParams(location.search);
  const authErr = params.get('error_description');
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  if (authErr) toast(authErr, 'error');
  if (S.session) await loadProfile();
  sb.auth.onAuthStateChange((event, session) => {
    const prevUid = S.session?.user?.id;
    S.session = session;
    if (event === 'SIGNED_OUT') { S.profile = null; setTimeout(render, 0); }
    else if (session && session.user.id !== prevUid) { setTimeout(async () => { await loadProfile(); render(); }, 0); }
  });
  window.addEventListener('hashchange', render);
  render();
}
boot();
