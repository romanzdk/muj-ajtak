import './mail.js';
import { fromForm, validate } from './prihlaska.js';

const ENDPOINT = 'https://muj-ajtak.romanzdk.workers.dev/prihlaska';
const form = document.querySelector('#join');
const errorsEl = document.querySelector('#form-errors');

function showErrors(errors) {
  const ul = document.createElement('ul');
  for (const e of errors) {
    const li = document.createElement('li');
    li.textContent = e;
    ul.append(li);
  }
  errorsEl.replaceChildren(ul);
  errorsEl.hidden = false;
  errorsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const SENT_KEY = 'prihlaska-odeslana';
const thanks = document.querySelector('#thanks');

function showThanks() {
  form.hidden = true;
  document.querySelector('#already').hidden = true;
  thanks.hidden = false;
  window.scrollTo({ top: 0 });
  thanks.focus();
}

try {
  const sentAt = localStorage.getItem(SENT_KEY);
  if (sentAt) {
    const el = document.querySelector('#already');
    el.querySelector('time').textContent = new Date(Number(sentAt)).toLocaleDateString('cs-CZ');
    el.hidden = false;
  }
} catch {}

let sending = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return;
  const fd = new FormData(form);
  const payload = {
    name: fd.get('name'),
    city: fd.get('city'),
    phone: fd.get('phone'),
    email: fd.get('email'),
    web: fd.get('web'),
    services: fd.getAll('services'),
    visits: fd.get('visits') === 'ano',
    note: fd.get('note'),
    ico: fd.get('ico'),
    website: fd.get('website'),
    consentPublish: fd.has('consentPublish'),
    consentProcessing: fd.has('consentProcessing'),
    turnstileToken: fd.get('cf-turnstile-response'),
  };
  const localErrors = validate(fromForm(payload));
  if (localErrors.length) {
    showErrors(localErrors);
    return;
  }
  const btn = form.querySelector('button[type="submit"]');
  const label = btn.textContent;
  sending = true;
  btn.disabled = true;
  btn.textContent = 'Odesílám, chvilku strpení…';
  form.inert = true;
  errorsEl.hidden = true;
  let sent = false;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      sent = true;
      try { localStorage.setItem(SENT_KEY, String(Date.now())); } catch {}
      showThanks();
      return;
    }
    showErrors(data.errors || ['Odeslání se nepovedlo. Zkuste to prosím znovu.']);
  } catch {
    showErrors(['Odeslání se nepovedlo. Zkontrolujte připojení k internetu a zkuste to znovu.']);
  } finally {
    if (!sent) {
      sending = false;
      form.inert = false;
      btn.disabled = false;
      btn.textContent = label;
      window.turnstile?.reset();
    }
  }
});
