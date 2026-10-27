import { createClient, type User } from '@supabase/supabase-js';

const url = 'https://oclhhrnlltocibkuinie.supabase.co';
// This is a public browser key, NOT a service-role key.
const publishableKey = 'sb_publishable_s15hLVfl6A1X0GAivOhXjw_q0yrwq8W';
export const supabase = createClient(url, publishableKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });

let currentUser: User | null = null;
let currentBusinessId: string | null = null;
type Business = { id: string; name: string };
let businesses: Business[] = [];
let dashboard: (() => void) | null = null;
let root: HTMLDivElement;
const escapeText = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

function authScreen(message = '') {
  root.innerHTML = `<main class="auth-scene">
    <div class="auth-stars"></div>
    <section class="auth-card">
      <img class="auth-emblem" src="/soren-dna.png" alt="Soren's luminous DNA emblem"/>
      <div class="auth-overline">SOREN / ACCESS PROTOCOL</div>
      <h1>Your business deserves<br/><em>better intelligence.</em></h1>
      <p class="auth-intro">Private workspaces. Clear thinking. A partner who tells you what the numbers actually say.</p>
      <div class="auth-tabs"><button id="tab-login" type="button" class="on">SIGN IN</button><button id="tab-signup" type="button">CREATE ACCOUNT</button></div>
      <form id="auth-form">
        <label for="auth-email">EMAIL ADDRESS</label><input id="auth-email" type="email" autocomplete="email" required placeholder="you@business.com"/>
        <label for="auth-password">PASSWORD</label><input id="auth-password" type="password" autocomplete="current-password" minlength="6" required placeholder="At least 6 characters"/>
        <button id="email-submit" class="auth-primary" type="submit">SIGN IN WITH EMAIL ↗</button>
      </form>
      <div class="auth-separator">OR CONTINUE WITH</div>
      <button id="google-login" class="auth-google" type="button">G <span>Google</span> ↗</button>
      <p class="auth-feedback" id="auth-feedback" role="status">${escapeText(message)}</p>
      <p class="auth-footnote">Business data stays in your private workspace. Never share passwords or secret API keys.</p>
    </section>
    <div class="auth-sidenote">INTELLIGENCE WITH INTENTION · SOREN AI</div>
  </main>`;
  let mode: 'login' | 'signup' = 'login';
  const feedback = root.querySelector<HTMLElement>('#auth-feedback')!;
  const submit = root.querySelector<HTMLButtonElement>('#email-submit')!;
  function setMode(next: 'login' | 'signup') {
    mode = next;
    root.querySelector('#tab-login')?.classList.toggle('on', mode === 'login');
    root.querySelector('#tab-signup')?.classList.toggle('on', mode === 'signup');
    submit.textContent = mode === 'login' ? 'SIGN IN WITH EMAIL ↗' : 'CREATE ACCOUNT ↗';
    root.querySelector<HTMLInputElement>('#auth-password')!.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    feedback.textContent = '';
  }
  root.querySelector('#tab-login')!.addEventListener('click', () => setMode('login'));
  root.querySelector('#tab-signup')!.addEventListener('click', () => setMode('signup'));
  root.querySelector<HTMLFormElement>('#auth-form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const email = root.querySelector<HTMLInputElement>('#auth-email')!.value.trim();
    const password = root.querySelector<HTMLInputElement>('#auth-password')!.value;
    submit.disabled = true;
    feedback.textContent = 'Securing your session…';
    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) feedback.textContent = 'Check your email to confirm your account, then sign in.';
      else feedback.textContent = 'Welcome to Soren.';
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : 'Sign-in failed. Please retry.';
    } finally { submit.disabled = false; }
  });
  root.querySelector('#google-login')!.addEventListener('click', async () => {
    feedback.textContent = 'Opening Google sign-in…';
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
    if (error) feedback.textContent = error.message;
  });
}

async function fetchBusinesses() {
  const { data, error } = await supabase.from('businesses').select('id,name').order('created_at');
  if (error) throw error;
  businesses = (data ?? []) as Business[];
  if (!businesses.some(b => b.id === currentBusinessId)) currentBusinessId = businesses[0]?.id ?? null;
}
async function showAuthenticated() {
  if (!currentUser || !dashboard) return;
  try { await fetchBusinesses(); dashboard(); }
  catch (e) { root.innerHTML = `<div class="auth-error">Unable to load your private workspace. ${escapeText(e instanceof Error ? e.message : 'Please refresh.')}</div>`; }
}
export function addAccountToolbar() {
  if (!currentUser) return;
  const topline = root.querySelector('.topline');
  if (!topline) return;
  const panel = document.createElement('div');
  panel.className = 'account-toolbar';
  panel.innerHTML = `<label for="business-select">BUSINESS</label><select id="business-select" aria-label="Active business">
    <option value="">${businesses.length ? 'SELECT WORKSPACE' : 'NO WORKSPACE YET'}</option>
    ${businesses.map(b => `<option value="${escapeText(b.id)}" ${b.id === currentBusinessId ? 'selected' : ''}>${escapeText(b.name)}</option>`).join('')}
    </select><button id="add-business" title="Create a business workspace">＋ BUSINESS</button>
    <span class="account-name">${escapeText(currentUser.email ?? 'PARTNER')}</span><button id="sign-out" title="Sign out">SIGN OUT ↗</button>`;
  topline.insertAdjacentElement('afterend', panel);
  panel.querySelector<HTMLSelectElement>('#business-select')!.addEventListener('change', e => {
    currentBusinessId = (e.target as HTMLSelectElement).value || null;
  });
  panel.querySelector('#add-business')!.addEventListener('click', async () => {
    const name = prompt('Name your business workspace:')?.trim();
    if (!name) return;
    if (name.length > 120) { alert('Business name must be 120 characters or less.'); return; }
    const { data, error } = await supabase.from('businesses').insert({ owner_id: currentUser!.id, name }).select('id').single();
    if (error) { alert(error.message); return; }
    currentBusinessId = data.id;
    await showAuthenticated();
  });
  panel.querySelector('#sign-out')!.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) alert(error.message);
  });
}
export function initAuth(element: HTMLDivElement, renderDashboard: () => void) {
  root = element;
  dashboard = renderDashboard;
  root.innerHTML = '<div class="auth-loading">SOREN / VERIFYING ACCESS…</div>';
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) void showAuthenticated();
    else authScreen();
  });
}
