import './mail.js';

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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
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
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  errorsEl.hidden = true;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      form.hidden = true;
      const thanks = document.querySelector('#thanks');
      thanks.hidden = false;
      thanks.focus();
      return;
    }
    showErrors(data.errors || ['Odeslání se nepovedlo. Zkuste to prosím znovu.']);
  } catch {
    showErrors(['Odeslání se nepovedlo. Zkontrolujte připojení k internetu a zkuste to znovu.']);
  } finally {
    btn.disabled = false;
    window.turnstile?.reset();
  }
});
