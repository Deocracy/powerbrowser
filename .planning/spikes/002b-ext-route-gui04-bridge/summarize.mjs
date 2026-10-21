// Prints a compact view of results-<mode>.json: per step action, ground truth, ext snapshot, and event log.
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(new URL(`./results-${process.argv[2]}.json`, import.meta.url)));
const short = o => JSON.stringify(o).replaceAll(r.origin, '');
for (const s of r.steps) {
  console.log(`\n## ${s.index} ${s.name}`);
  if (s.action != null) console.log('action:', short(s.action));
  if (s.actionError) console.log('actionError:', s.actionError);
  const g = s.ground;
  console.log('ground:', short({ top: g.topWindowIsHidden, bwt: g.browserWindowTrackerTopIsHidden, sel: g.hiddenSelected, n: g.hiddenTabCount, err: g.mirrorErrors }));
  for (const o of g.overlays) console.log('  overlay', short(o));
  if (s.snapshot) console.log('snap queryAll:', short(s.snapshot.ok?.queryAll), ' activeCurrent:', short(s.snapshot.ok?.queryActiveCurrent));
  console.log('hits:', short(s.hits));
  for (const e of r.log.filter(e => e.step === s.index && !['cmd-result', 'snapshot'].includes(e.kind))) console.log('  ev', e.kind, short(e.data));
}
