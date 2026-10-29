import { openBusinessDNA } from './business-dna';
import { createClient, type User } from '@supabase/supabase-js';

const url = 'https://oclhhrnlltocibkuinie.supabase.co';
// This is a public browser key, NOT a service-role key.
const publishableKey = 'sb_publishable_s15hLVfl6A1X0GAivOhXjw_q0yrwq8W';
export const supabase = createClient(url, publishableKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });

let currentUser: User | null = null;
let currentBusinessId: string | null = null;
type Business = { id: string; name: string };
let businesses: Business[] = [];
export const getActiveBusinessId = () => currentBusinessId;
export const getActiveUserId = () => currentUser?.id ?? null;
export const getActiveBusinessName = () => businesses.find(b => b.id === currentBusinessId)?.name ?? 'Personal workspace';
let dashboard: (() => void) | null = null;
let root: HTMLDivElement;
const escapeText = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

function authScreen(message = '') {
  root.innerHTML = `<main class="auth-scene auth-landing">
    <div class="auth-stars" aria-hidden="true"></div>
    <header class="landing-header">
      <div class="landing-brand"><img src="/soren-dna.png" alt=""/><span>SOREN<small>INTELLIGENCE WITH INTENTION</small></span></div>
      <span class="landing-header-note">YOUR BUSINESS. SEEN CLEARLY.</span>
      <a href="#auth-access" class="landing-header-link">GET STARTED ↗</a>
    </header>
    <div class="landing-layout">
      <section class="landing-story" aria-labelledby="landing-title">
        <div class="landing-index"><span class="landing-indicator"></span> RETAIL INTELLIGENCE / BUILT FOR REAL OWNERS</div>
        <h1 id="landing-title">Your numbers<br/>have a <em>story.</em><br/><span>Meet the mind</span><br/>that listens.</h1>
        <p class="landing-lead">Most dashboards show you what happened. Soren helps you investigate what matters next—with grounded analysis, honest answers, and a conversation that stays with you.</p>
        <div class="landing-motto"><span>◉</span><p>Less guessing. More knowing.<br/><strong>And yes, you can actually talk to Soren.</strong></p></div>
        <div class="landing-scroll-note">01 / FROM DATA TO DECISIONS <span>↓</span></div>
      </section>
      <section class="auth-card" id="auth-access" aria-label="Sign in or create your Soren account">
        <img class="auth-emblem" src="/soren-dna.png" alt="Soren's luminous DNA emblem"/>
        <div class="auth-overline">SOREN / ACCESS PROTOCOL</div>
        <h2>Your command center<br/><em>starts here.</em></h2>
        <p class="auth-intro">Private business workspaces. Intelligence with a point of view.</p>
        <div class="auth-tabs"><button id="tab-login" type="button" class="on">SIGN IN</button><button id="tab-signup" type="button">CREATE ACCOUNT</button></div>
        <form id="auth-form">
          <label for="auth-email">EMAIL ADDRESS</label><input id="auth-email" type="email" autocomplete="email" required placeholder="you@business.com"/>
          <label for="auth-password">PASSWORD</label><input id="auth-password" type="password" autocomplete="current-password" minlength="6" required placeholder="At least 6 characters"/>
          <button id="email-submit" class="auth-primary" type="submit">SIGN IN WITH EMAIL ↗</button>
        </form>
        <div class="auth-separator">OR CONTINUE WITH</div>
        <button id="google-login" class="auth-google" type="button">G <span>Google</span> ↗</button>
        <p class="auth-feedback" id="auth-feedback" role="status">${escapeText(message)}</p>
        <p class="auth-footnote">Your business data belongs in your private workspace. Never share passwords or secret API keys.</p>
      </section>
    </div>
    <section class="landing-capabilities" aria-label="What Soren can do">
      <div class="landing-section-intro"><p>THE SOREN DIFFERENCE / 001—004</p><h2>Not another dashboard.<br/><em>A sharper perspective.</em></h2></div>
      <div class="landing-feature-grid">
        <article class="landing-feature"><span class="landing-feature-icon">⌁</span><span class="landing-feature-number">01 / SEE</span><h3>Find your retail signals.</h3><p>Explore sales patterns, spot unusual days, and follow the evidence behind your store's performance.</p></article>
        <article class="landing-feature"><span class="landing-feature-icon">▤</span><span class="landing-feature-number">02 / CONNECT</span><h3>Bring your own data.</h3><p>Import CSV reports, including Clover exports. Match unfamiliar columns without rewriting your spreadsheets.</p></article>
        <article class="landing-feature"><span class="landing-feature-icon">◈</span><span class="landing-feature-number">03 / UNDERSTAND</span><h3>Ask better questions.</h3><p>Talk through business decisions with Soren. He separates what the data proves from what needs investigating.</p></article>
        <article class="landing-feature"><span class="landing-feature-icon">✧</span><span class="landing-feature-number">04 / REMEMBER</span><h3>Build on every conversation.</h3><p>Keep a business profile, saved context, and private conversation history across your workspace.</p></article>
      </div>
    </section>
    <footer class="landing-footer"><span>SOREN AI © 2026</span><span>BUILT FOR OWNERS WHO WANT THE TRUTH, NOT JUST A PRETTY CHART.</span><a href="#auth-access">ENTER SOREN ↑</a></footer>
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
    </select><button id="business-dna" title="Edit retail business profile">◈ BUSINESS DNA</button><button id="add-business" title="Create a business workspace">＋ BUSINESS</button>
    <span class="account-name">${escapeText(currentUser.email ?? 'PARTNER')}</span><button id="sign-out" title="Sign out">SIGN OUT ↗</button>`;
  topline.insertAdjacentElement('afterend', panel);
  panel.querySelector<HTMLSelectElement>('#business-select')!.addEventListener('change', e => {
    currentBusinessId = (e.target as HTMLSelectElement).value || null;
    window.dispatchEvent(new Event('soren:business-changed'));
  });
  const dnaButton=panel.querySelector<HTMLButtonElement>('#business-dna')!;
  dnaButton.disabled=!currentBusinessId;
  dnaButton.title=currentBusinessId?'Edit retail business profile':'Create a business first';
  dnaButton.addEventListener('click', () => {if(currentBusinessId)void openBusinessDNA(supabase,currentBusinessId,getActiveBusinessName());});
  panel.querySelector('#add-business')!.addEventListener('click', () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'workspace-modal-backdrop';
    backdrop.innerHTML = `<section class="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-modal-title" aria-describedby="workspace-modal-description">
      <button class="workspace-modal-close" type="button" aria-label="Close workspace dialog">×</button>
      <div class="workspace-modal-identity"><img src="/soren-dna.png" alt=""/><span>SOREN / WORKSPACE GENESIS</span></div>
      <p class="workspace-modal-step">01 / NEW BUSINESS</p>
      <h2 id="workspace-modal-title">Give your vision<br/><em>a home.</em></h2>
      <p id="workspace-modal-description">Create a private command center for your business. Your intelligence begins here.</p>
      <form id="workspace-modal-form">
        <label for="workspace-business-name">BUSINESS NAME</label>
        <input id="workspace-business-name" name="name" type="text" maxlength="120" autocomplete="organization" required placeholder="e.g. The Vault Lifestyle & Wellness"/>
        <p class="workspace-modal-hint">Only you can access this workspace.</p>
        <p class="workspace-modal-error" role="alert" aria-live="polite"></p>
        <div class="workspace-modal-actions"><button type="button" class="workspace-modal-cancel">CANCEL</button><button type="submit" class="workspace-modal-create">CREATE WORKSPACE ↗</button></div>
      </form>
    </section>`;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector<HTMLInputElement>('#workspace-business-name')!;
    const form = backdrop.querySelector<HTMLFormElement>('#workspace-modal-form')!;
    const create = backdrop.querySelector<HTMLButtonElement>('.workspace-modal-create')!;
    const errorText = backdrop.querySelector<HTMLElement>('.workspace-modal-error')!;
    const close = () => { document.removeEventListener('keydown', onKeydown); backdrop.remove(); };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !create.disabled) close();
      if (event.key === 'Tab') {
        const controls = Array.from(backdrop.querySelectorAll<HTMLElement>('button,input')).filter(el => !el.hasAttribute('disabled'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeydown);
    backdrop.querySelector('.workspace-modal-close')!.addEventListener('click', close);
    backdrop.querySelector('.workspace-modal-cancel')!.addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop && !create.disabled) close(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name || name.length > 120) { errorText.textContent = 'Enter a business name (1–120 characters).'; input.focus(); return; }
      if (!currentUser) { errorText.textContent = 'Your session expired. Please sign in again.'; return; }
      create.disabled = true;
      create.textContent = 'CREATING YOUR SPACE…';
      errorText.textContent = '';
      try {
        const { data, error } = await supabase.from('businesses').insert({ owner_id: currentUser.id, name }).select('id').single();
        if (error) throw error;
        currentBusinessId = data.id;
        window.dispatchEvent(new Event('soren:business-changed'));
        close();
        await showAuthenticated();
      } catch (error) {
        errorText.textContent = error instanceof Error ? error.message : 'Could not create workspace. Please try again.';
      } finally {
        create.disabled = false;
        create.textContent = 'CREATE WORKSPACE ↗';
      }
    });
    input.focus();
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
    window.dispatchEvent(new Event('soren:auth-changed'));
    if (currentUser) void showAuthenticated();
    else authScreen();
  });
}
