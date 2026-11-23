// Address is split so scrapers reading the HTML/JS source don't get it as plain text.
const parts = ['romanzdk', 'gmail.com'];

export function openMail(subject) {
  window.location.href = `mailto:${parts.join('@')}?subject=${encodeURIComponent(subject)}`;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('.js-mail');
  if (el) openMail(el.dataset.subject || 'Můj ajťák');
});
