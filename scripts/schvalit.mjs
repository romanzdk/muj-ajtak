// Run by the approval workflow in the private applications repo.
// AUTO=1: check the application first; on a problem write the reason to reason.txt and exit 2.
import { readFileSync, writeFileSync } from 'node:fs';
import { autoReview, extractHelper, upsertHelper } from '../prihlaska.js';

const file = process.argv[2];
const body = process.env.ISSUE_BODY || '';
const data = JSON.parse(readFileSync(file, 'utf8'));
let helper;
let update = false;
if (process.env.AUTO === '1') {
  const r = autoReview(body, data);
  if (r.reason) {
    writeFileSync('reason.txt', r.reason);
    console.log(`Ke kontrole: ${r.reason}`);
    process.exit(2);
  }
  ({ helper, update } = r);
} else {
  helper = extractHelper(body);
  const same = data.find((h) => h.name === helper.name && ((helper.phone && h.phone === helper.phone) || (helper.email && h.email === helper.email)));
  if (same) helper = { ...helper, id: same.id };
  update = data.some((h) => h.id === helper.id);
}
const next = upsertHelper(data, helper);
writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
console.log(`${update ? 'Upraven' : 'Přidán'}: ${helper.name}, ${helper.city}. Ajťáků na webu: ${next.length}`);
