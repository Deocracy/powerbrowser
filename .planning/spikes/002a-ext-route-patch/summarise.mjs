// Prints a compact per-step view of a results file: node summarise.mjs [results.json]
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2] || new URL('./results.json', import.meta.url), 'utf8'));
const strip = s => String(s).split(r.origin).join('');
const q = x => !x ? '-' : x.ok ? JSON.stringify(x.ok.map(t => `${t.id}:${strip(t.url || '')}${t.active ? '*' : ''}w${t.windowId}`)) : `ERR ${x.err}`;
console.log('mode:', r.mode, '| tabhost:', JSON.stringify(r.tabhost), '| ids:', JSON.stringify(r.ids));
for (const s of r.steps) {
  const sn = s.snapshot?.ok || s.snapshot || {};
  console.log(`${s.index} ${s.name}\n   action: ${strip(JSON.stringify(s.action ?? s.actionError ?? null)).slice(0, 400)}`);
  console.log(`   all ${q(sn.queryAll)} | activeCur ${q(sn.queryActiveCurrent)} | lastFoc ${q(sn.queryActiveLastFocused)} | top ${s.ground.topWindow}`);
  console.log(`   webDriver ${strip(JSON.stringify(s.ground.webDriverBrowsers))} | extTabs ${strip(JSON.stringify(s.ground.extTabsUrls))} | overlays ${strip(JSON.stringify(s.ground.overlays.map(o => [o.url, o.getBrowserData])))}`);
  if (s.ground.hostTrace && (s.ground.hostTrace.setIcon.length || s.ground.hostTrace.unsupported.length)) console.log(`   host setIcon ${strip(JSON.stringify(s.ground.hostTrace.setIcon))} unsupported ${JSON.stringify(s.ground.hostTrace.unsupported)}`);
}
console.log('--- extension log (excluding cmd-result/snapshot)');
for (const e of r.log) if (!['cmd-result', 'snapshot'].includes(e.kind)) console.log(e.step, e.src, e.kind, strip(JSON.stringify(e.data)).slice(0, 260));
