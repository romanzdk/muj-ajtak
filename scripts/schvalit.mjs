// Run by the approval workflow in the private applications repo (after its own check): publishes the helper to data.json.
// A correction from the same person (same name and phone or e-mail) overwrites their card instead of adding a second one.
import { readFileSync, writeFileSync } from 'node:fs';
import { extractHelper, upsertHelper } from '../prihlaska.js';

const file = process.argv[2];
const data = JSON.parse(readFileSync(file, 'utf8'));
let helper = extractHelper(process.env.ISSUE_BODY || '');
const same = data.find((h) => h.name === helper.name && ((helper.phone && h.phone === helper.phone) || (helper.email && h.email === helper.email)));
if (same) helper = { ...helper, id: same.id };
const next = upsertHelper(data, helper);
writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
console.log(`${same ? 'Upraven' : 'Přidán'}: ${helper.name}, ${helper.city}. Ajťáků na webu: ${next.length}`);
