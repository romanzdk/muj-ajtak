// Run by the approval workflow in the private applications repo: adds the approved helper to data.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { extractHelper, upsertHelper } from '../prihlaska.js';

const file = process.argv[2];
const helper = extractHelper(process.env.ISSUE_BODY || '');
const data = upsertHelper(JSON.parse(readFileSync(file, 'utf8')), helper);
writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Přidán: ${helper.name} (${helper.id})`);
