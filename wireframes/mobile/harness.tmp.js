// DOM-shim harness: execute the monolith's <script> headlessly and assert behaviour.
const fs = require('fs');
const ids = eval(fs.readFileSync('ids.json.tmp', 'utf8'));

function El(tag) {
  return {
    tagName: tag, _attrs: {}, childNodes: [], style: {}, textContent: '',
    setAttribute(k, v) { this._attrs[k] = String(v); },
    setAttributeNS(ns, k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : null; },
    appendChild(n) { this.childNodes.push(n); return n; },
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); return n; },
    get firstChild() { return this.childNodes[0] || null; },
    querySelector(sel) { return this.childNodes.find(c => c.tagName === sel) || null; },
    addEventListener() {}
  };
}
const registry = {};
ids.forEach(id => { const e = El('g'); e._attrs.id = id; registry[id] = e; });
global.document = {
  getElementById(id) { return registry[id] || (registry[id] = (() => { const e = El('g'); e._attrs.id = id; return e; })()); },
  createElementNS(ns, tag) { return El(tag); },
  addEventListener() {}
};

// load the page script + export internals
let js = fs.readFileSync('cdata.tmp.js', 'utf8');
js += '\n;module.exports = { state, POSTS, matches, render, nav, VIEWS, VIEW_ORDER, VERIFIED_LEVELS, subByName };\n';
const api = (function () { const module = { exports: {} }; eval(js); return module.exports; })();

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } }

// subscribe to Alberta as well (default subs is just Global) for the full ladder
if (!api.state.subs.some(s => s.name === 'Alberta')) api.state.subs.push({ name: 'Alberta', icon: '#ic-building', included: true });

// 1) feed ladder shrinks monotonically 16 -> 12 -> 8 -> 4
const counts = [];
for (let v = 0; v < 4; v++) { api.state.verified = v; counts.push(api.POSTS.filter(p => api.matches(p, 'feed')).length); }
console.log('feed ladder counts:', counts.join(' -> '));
ok('ladder 16/12/8/4', JSON.stringify(counts) === JSON.stringify([16, 12, 8, 4]));
ok('ladder monotonic', counts.every((c, i) => i === 0 || c <= counts[i - 1]));

// 2) ID filter keeps residency+official authors; Official excludes residents
api.state.verified = 1;
const idAuthors = api.POSTS.filter(p => api.matches(p, 'feed')).map(p => p.author);
ok('ID keeps Official (Rae)', idAuthors.includes('Rae Nguyen'));
ok('ID keeps Residency (Hana)', idAuthors.includes('Hana Okafor'));
ok('ID drops tier0 (Jordan)', !idAuthors.includes('Jordan Vance'));
api.state.verified = 3;
const offAuthors = api.POSTS.filter(p => api.matches(p, 'feed')).map(p => p.author);
ok('Official excludes resident (Hana)', !offAuthors.includes('Hana Okafor'));
ok('Official keeps official (Premier)', offAuthors.includes('Hon. A. Premier'));

// 3) My Districts keeps Global + only Edmonton-Strathcona Alberta posts
api.state.verified = 0; api.state.kyc = 2; api.state.myDistricts = true;
const md = api.POSTS.filter(p => api.matches(p, 'feed'));
const mdGlobals = md.filter(p => p.jur === 'Global').length;
const mdAlberta = md.filter(p => p.jur === 'Alberta');
ok('MyDistricts keeps all 5 Global', mdGlobals === 5);
ok('MyDistricts Alberta all in es', mdAlberta.every(p => p.districts.indexOf('edmonton-strathcona') >= 0));
ok('MyDistricts excludes calgary (Rosa)', !md.some(p => p.author === 'Rosa Klein'));
console.log('MyDistricts total:', md.length, '(5 Global +', mdAlberta.length, 'Alberta)');
api.state.myDistricts = false; api.state.kyc = 0; api.state.verified = 0;

// 4) render() runs for every view at every verified level without throwing
let threw = null;
try {
  for (const view of api.VIEW_ORDER) {
    api.state.view = view;
    api.state.jurFeedOpen = true; api.state.distFeedOpen = true;
    for (let v = 0; v < 4; v++) { api.state.verified = v; api.render(); }
  }
} catch (e) { threw = e; }
ok('render all views x levels no throw', !threw);
if (threw) console.log('  THREW:', threw && threw.stack || threw);
api.state.verified = 0;

// 5) every view's scroll max includes FOOTER_PAD (>=0; long views > 0)
api.state.view = 'feed'; api.state.jurFeedOpen = true; api.render();
ok('feed max > 0 (has padding)', api.VIEWS.feed.max > 0);
api.state.view = 'post'; api.render();
ok('post max > 0 (has padding)', api.VIEWS.post.max > 0);

// 6) nav() flips state.view and rebuilds
api.nav('jurisdiction');
ok('nav sets view', api.state.view === 'jurisdiction');
ok('nav resets scroll', api.state.scroll === 0);

// 7) P-cycle order feed->jur->dist->prof->post->feed
const order = api.VIEW_ORDER;
ok('cycle wraps to feed', order[(order.indexOf('post') + 1) % order.length] === 'feed');

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
