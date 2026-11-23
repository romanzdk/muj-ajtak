import { processApplication } from '../prihlaska.js';

const ALLOWED_ORIGINS = ['https://najdiajtaka.cz', 'https://www.najdiajtaka.cz', 'https://romanzdk.github.io'];
const REPO = 'romanzdk/muj-ajtak-prihlasky';
const FAIL = 'Odeslání se nepovedlo. Zkuste to prosím později, nebo nám napište e-mail (odkaz je dole na stránce).';

const json = (data, status, origin) => new Response(status === 204 ? null : JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  },
});

const NOTIFY_FROM = 'prihlasky@najdiajtaka.cz';
const NOTIFY_TO = 'romanzdk@gmail.com';

const b64 = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

export function buildNotifyEmail(helper, issueUrl, now = new Date()) {
  const subject = `Nová přihláška: ${helper.name}`;
  const body = [
    'Na najdiajtaka.cz přišla nová přihláška ajťáka.',
    '',
    `${helper.name}, ${helper.city}`,
    '',
    'Zkontroluj a schval (štítek schvaleno):',
    issueUrl,
  ].join('\r\n');
  return [
    `From: Najdi ajtaka <${NOTIFY_FROM}>`,
    `To: ${NOTIFY_TO}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${now.getTime()}.${Math.random().toString(36).slice(2)}@najdiajtaka.cz>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(body).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}

async function notify(env, helper, issueUrl) {
  if (!env.NOTIFY) return;
  try {
    const { EmailMessage } = await import('cloudflare:email');
    await env.NOTIFY.send(new EmailMessage(NOTIFY_FROM, NOTIFY_TO, buildNotifyEmail(helper, issueUrl)));
  } catch (err) {
    console.error('Notify e-mail failed', err);
  }
}

const withoutId = (body) => body.replace(/"id": "[^"]*"/, '');

// People often press submit twice or resend after a reload; an identical application from the last hour is not created again.
async function alreadySent(result, headers) {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=30`, { headers });
    const list = res.ok ? await res.json() : [];
    const hourAgo = Date.now() - 3600e3;
    return Array.isArray(list) && list.some((i) => i.title === result.title
      && Date.parse(i.created_at) > hourAgo && withoutId(i.body || '') === withoutId(result.body));
  } catch {
    return false;
  }
}

async function turnstileOk(token, ip, secret) {
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  return res.ok && (await res.json()).success === true;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) || (env.ALLOW_LOCALHOST === '1' && origin.startsWith('http://localhost:'));
    const url = new URL(req.url);
    if (url.pathname !== '/prihlaska' || !allowed) return new Response('Not found', { status: 404 });
    if (req.method === 'OPTIONS') return json(null, 204, origin);
    if (req.method !== 'POST') return json({ errors: ['Špatný požadavek.'] }, 405, origin);

    const ip = req.headers.get('CF-Connecting-IP') || '';
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) {
      return json({ errors: ['Příliš mnoho pokusů. Zkuste to prosím za pár minut.'] }, 429, origin);
    }

    const text = await req.text();
    if (text.length > 10000) return json({ errors: ['Přihláška je moc dlouhá.'] }, 413, origin);
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      return json({ errors: ['Špatný požadavek.'] }, 400, origin);
    }
    // Honeypot field is hidden from people; bots fill it. Pretend success so they don't retry.
    if (raw.website) return json({ ok: true }, 200, origin);
    if (!(await turnstileOk(raw.turnstileToken, ip, env.TURNSTILE_SECRET))) {
      return json({ errors: ['Ověření, že nejste robot, se nepovedlo. Obnovte prosím stránku a zkuste to znovu.'] }, 403, origin);
    }

    const id = `p-${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
    const result = await processApplication(raw, { id });
    if (result.errors) return json({ errors: result.errors }, 422, origin);

    const headers = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'muj-ajtak-worker',
    };
    if (await alreadySent(result, headers)) return json({ ok: true, duplicate: true }, 200, origin);
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: result.title, body: result.body }),
    });
    if (!res.ok) {
      console.error('GitHub issue create failed', res.status, await res.text());
      return json({ errors: [FAIL] }, 502, origin);
    }
    const issue = await res.json().catch(() => ({}));
    await notify(env, result.helper, issue.html_url || `https://github.com/${REPO}/issues`);
    return json({ ok: true }, 200, origin);
  },
};
