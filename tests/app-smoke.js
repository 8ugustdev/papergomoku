/* App-flow smoke test: stubs the DOM in node and drives the real app.js —
 * init wiring, mode switching, 2-player hotseat flow (no bot), undo,
 * win titles, 1v1 vs bot, legacy save resume. */
'use strict';

// ---------- stub DOM ----------
var IDS = ['screen-start', 'screen-play', 'mode-tiles', 'lvl-list', 'side-tiles',
    'sec-level', 'sec-side', 'sec-seats', 'start-stats', 'board', 'btn-row',
    'btn-reset-score',
    'turn-label', 'clock', 'btn-start', 'btn-resume', 'btn-undo', 'btn-hint',
    'btn-menu', 'btn-new', 'btn-exit', 'btn-again', 'btn-close-menu',
    'btn-close-over', 'menu-modal', 'over-pop', 'over-title', 'over-body'];

function mkEl(tag) {
    var e = {
        tag: tag, className: '', onclick: null, style: {}, attrs: {}, _ch: [], _html: '',
        appendChild: function (c) {
            if (c.tag === '#frag') { e._ch = e._ch.concat(c._ch); }
            else { e._ch.push(c); }
            return c;
        },
        getAttribute: function (a) { return e.attrs[a]; },
        setAttribute: function (a, v) { e.attrs[a] = v; },
        click: function () { if (e.onclick) { e.onclick(); } }
    };
    Object.defineProperty(e, 'children', { get: function () { return e._ch; } });
    Object.defineProperty(e, 'innerHTML', {
        get: function () { return e._html; },
        set: function (v) { e._html = v; if (v === '') { e._ch = []; } }
    });
    return e;
}

var byId = {}, i;
for (i = 0; i < IDS.length; i++) { byId[IDS[i]] = mkEl('div'); }

// pre-populate static children as index.html does
var mt;
['1', '2'].forEach(function (v) {
    mt = mkEl('div'); mt.attrs['data-v'] = v; byId['mode-tiles'].appendChild(mt);
});
['1', '2', '3'].forEach(function (v) {
    mt = mkEl('div'); mt.attrs['data-v'] = v; byId['lvl-list'].appendChild(mt);
});
['1', '2'].forEach(function (v) {
    mt = mkEl('div'); mt.attrs['data-v'] = v; byId['side-tiles'].appendChild(mt);
});

var lsBack = {};
global.localStorage = {
    getItem: function (k) { return (k in lsBack) ? lsBack[k] : null; },
    setItem: function (k, v) { lsBack[k] = String(v); },
    removeItem: function (k) { delete lsBack[k]; }
};
global.window = global;
global.document = {
    readyState: 'complete',
    getElementById: function (id) { return byId[id] || null; },
    createElement: function (t) { return mkEl(t); },
    createDocumentFragment: function () { return mkEl('#frag'); }
};

// ---------- load real code ----------
require('../js/engine.js');
var E = global.PGEngine;
var app = require('../js/app.js');

// ---------- assert helpers ----------
var fail = 0;
function assert(ok, msg) { if (!ok) { console.log('FAIL: ' + msg); fail++; } }
function turnLabel() { return byId['turn-label'].innerHTML; }
function stones() {
    var out = [], r, c, td;
    for (r = 0; r < 15; r++) {
        for (c = 0; c < 15; c++) {
            td = byId.board.children[r].children[c];
            if (td.innerHTML.indexOf('stone') >= 0) { out.push(td.innerHTML); }
        }
    }
    return out;
}
function poll(cond, cb, label, tries) {
    if (cond()) { cb(); return; }
    if ((tries || 60) <= 0) { console.log('FAIL: timeout waiting for ' + label); fail++; done(); return; }
    setTimeout(function () { poll(cond, cb, label, (tries || 60) - 1); }, 100);
}
function done() {
    console.log('app smoke test: ' + (fail ? fail + ' FAILURES' : 'all OK'));
    process.exit(fail ? 1 : 0);
}

// ---------- 1. init: 1v1 default ----------
assert(byId['screen-start'].className.indexOf('hidden') < 0, 'start visible after init');
assert(byId['sec-level'].style.display === 'block', 'level section visible in 1v1');
assert(byId['sec-seats'].style.display === 'none', '2p section hidden in 1v1');

// ---------- 2. switch to 2 PLAYER ----------
byId['mode-tiles'].children[1].click();
assert(JSON.parse(lsBack['pg_mode']) === 2, 'mode persisted');
assert(byId['sec-level'].style.display === 'none', 'level hidden in 2p');
assert(byId['sec-side'].style.display === 'none', 'side hidden in 2p');
assert(byId['sec-seats'].style.display === 'block', '2p section shown');

// ---------- 3. start: black moves first, no bot anywhere ----------
byId['btn-start'].click();
assert(byId['screen-play'].className.indexOf('hidden') < 0, 'play screen visible');
assert(byId['btn-row'].className === 'btn-row nohint', 'HINT hidden in 2p row');
assert(byId.board.children.length === 15, 'board rows built');
assert(turnLabel() === '\u25CF BLACK MOVE', 'black to move, got ' + turnLabel());

byId.board.children[7].children[7].click();               // black plays
assert(stones().length === 1, 'black stone placed');
assert(turnLabel() === '\u25CB WHITE MOVE', 'white to move, got ' + turnLabel());

byId.board.children[8].children[8].click();               // white plays
assert(stones().length === 2, 'white stone placed');
assert(turnLabel() === '\u25CF BLACK MOVE', 'back to black, got ' + turnLabel());

// ---------- 4. undo takes back exactly one move ----------
byId['btn-undo'].click();
assert(stones().length === 1, 'undo popped one move');
assert(turnLabel() === '\u25CB WHITE MOVE', 'white to re-move, got ' + turnLabel());

// ---------- 5. win title + hotseat tally (no level stats in 2p) ----------
app.forceFinish(2);
assert(byId['over-title'].innerHTML === '\u25CB WHITE WINS', 'white win title, got ' + byId['over-title'].innerHTML);
assert(byId['over-body'].innerHTML.indexOf('two players') >= 0, 'win body notes two players');
assert(!('pg_stat_2v2' in lsBack), 'no team stat in 2p mode');
var h2h = JSON.parse(lsBack['pg_h2h']);
assert(h2h.white === 1 && h2h.black === 0, 'tally: white +1');
app.forceFinish(1);
h2h = JSON.parse(lsBack['pg_h2h']);
assert(h2h.white === 1 && h2h.black === 1, 'tally: black +1');
byId['over-pop'].className = 'board-pop';

// ---------- 5b. reset score ----------
byId['mode-tiles'].children[1].click();
assert(byId['btn-reset-score'].style.display === 'block', 'reset button visible with tally');
byId['btn-reset-score'].click();
assert(!('pg_h2h' in lsBack), 'tally cleared');
assert(byId['btn-reset-score'].style.display === 'none', 'reset button hidden after clear');
assert(byId['start-stats'].innerHTML.indexOf('\u2013') < 0, 'tally gone from stats line');

// ---------- 6. back to 1v1: labels, HINT back, bot reply ----------
byId['mode-tiles'].children[0].click();
assert(byId['sec-seats'].style.display === 'none', '2p section hidden in 1v1');
assert(byId['start-stats'].innerHTML.indexOf('\u25CF') < 0, 'no tally shown post-reset');
byId['btn-start'].click();
assert(byId['btn-row'].className === 'btn-row', 'HINT shown in 1v1 row');
assert(turnLabel() === 'YOUR MOVE', '1v1 label, got ' + turnLabel());
byId.board.children[7].children[7].click();
poll(function () { return app.snapshot().moves === 2; },
    function () {
        assert(turnLabel() === 'YOUR MOVE', '1v1 bot replied, turn back');
        assert(stones().length === 2, '1v1 two stones');

        // ---------- 7. legacy (v1) save resumes as 1v1 ----------
        lsBack['pg_save'] = JSON.stringify({
            level: 3, side: 1,
            board: (function () {
                var b = [], k; for (k = 0; k < 225; k++) { b.push('0'); }
                b[112] = '1'; b[113] = '2';
                return b.join('');
            })(),
            log: [112, 113], turn: 1, elapsed: 4200
        });
        byId['btn-resume'].click();
        var snap = app.snapshot();
        assert(snap.mode === 1, 'legacy save resumes as 1v1');
        assert(snap.moves === 2, 'legacy log restored');
        assert(stones().length === 2, 'legacy board restored');
        assert(byId.clock.innerHTML === '0:04', 'legacy clock restored, got ' + byId.clock.innerHTML);
        done();
    }, '1v1 bot reply');

// guard: if polls time out, done() runs via poll failure path
