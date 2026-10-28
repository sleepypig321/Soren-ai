type Summary = {
  revenue: number;
  profit: number;
  margin: number;
  transactions: number;
  average: number;
  operating: number;
  days: number;
  breakEven: number | null;
};
type Line = { role: 'user' | 'soren'; text: string };
const history: Line[] = [];
const money = (value: number) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let activePanel: HTMLElement | null = null;

function localPreview(question: string, facts: Summary): string {
  const q = question.toLowerCase();
  if (/break.?even|profit|loss|cost|expense|margin/.test(q)) {
    return `Here's what we actually know: ${money(facts.revenue)} in recorded revenue, ${money(facts.profit)} gross profit (${facts.margin.toFixed(1)}% margin), and a modeled operating result of ${money(facts.operating)} after the fixed expenses you entered. ${facts.breakEven === null ? 'We cannot calculate break-even revenue at this margin.' : 'Modeled break-even revenue is '+money(facts.breakEven)+'.'} That does NOT include unlisted costs. First question: which additional expenses are missing?`;
  }
  if (/sales|revenue|traffic|growth|customer|transaction/.test(q)) {
    return `We've recorded ${facts.transactions} transactions over ${facts.days} reporting days, totaling ${money(facts.revenue)} in revenue. Average transaction value: ${money(facts.average)}. Notice what I didn't say: *why* it happened. We need foot traffic, conversion, stock availability, or repeat-customer data to establish causes. Which one can you measure?`;
  }
  return `I can start with the evidence we have: ${money(facts.revenue)} in revenue over ${facts.days} reporting days and ${facts.margin.toFixed(1)}% gross margin. I'm in local preview mode, so I'm not going to pretend I can conduct a full AI investigation yet. Ask me about sales, margins, or break-even—or wait until our Meta connection is safely enabled.`;
}

export function openSorenConversation(facts: Summary, source: string) {
  if (activePanel) { activePanel.remove(); activePanel = null; return; }
  const overlay = document.createElement('div');
  overlay.className = 'soren-conversation-backdrop';
  overlay.innerHTML = `<section class="soren-conversation" role="dialog" aria-modal="true" aria-labelledby="soren-conversation-title">
    <header class="soren-conversation-head">
      <img src="/soren-dna.png" alt=""/><div><p>SOREN / DIRECT CHANNEL</p><h2 id="soren-conversation-title">Let's talk strategy.</h2></div>
      <button class="soren-conversation-close" type="button" aria-label="Close Soren conversation">×</button>
    </header>
    <div class="soren-conversation-context"><span class="soren-conversation-dot"></span> LOCAL INTELLIGENCE PREVIEW <span>·</span> ${escape(source)} <span>·</span> ${facts.days} DAYS</div>
    <div class="soren-conversation-messages" aria-live="polite" aria-label="Soren conversation"></div>
    <form class="soren-conversation-form"><label for="soren-message">ASK SOREN</label><div class="soren-compose"><textarea id="soren-message" rows="2" maxlength="600" required placeholder="What's the biggest problem hiding in these numbers?"></textarea><button type="submit" aria-label="Send message">↗</button></div></form>
    <p class="soren-conversation-note">Local, evidence-based preview · Meta API calls disabled · No credits spent</p>
  </section>`;
  document.body.appendChild(overlay);
  activePanel = overlay;
  const messages = overlay.querySelector<HTMLElement>('.soren-conversation-messages')!;
  const input = overlay.querySelector<HTMLTextAreaElement>('#soren-message')!;
  const close = () => { overlay.remove(); activePanel = null; document.removeEventListener('keydown', onKeys); };
  const onKeys = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKeys);
  overlay.querySelector('.soren-conversation-close')!.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  function renderLines() {
    const lines: Line[] = [{role:'soren',text:"Well, look who brought me some numbers. Lovely. Let's figure out what they actually say."}, ...history];
    messages.innerHTML = lines.map(line => `<article class="soren-line ${line.role}"><span>${line.role === 'soren' ? 'SOREN' : 'YOU'}</span><p>${escape(line.text)}</p></article>`).join('');
    messages.scrollTop = messages.scrollHeight;
  }
  renderLines();
  overlay.querySelector<HTMLFormElement>('.soren-conversation-form')!.addEventListener('submit', event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    history.push({role:'user',text:question},{role:'soren',text:localPreview(question,facts)});
    if (history.length > 24) history.splice(0,history.length-24);
    input.value = '';
    renderLines();
    input.focus();
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); overlay.querySelector<HTMLFormElement>('.soren-conversation-form')!.requestSubmit(); } });
  input.focus();
}
