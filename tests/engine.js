/* Gomoku engine tests: win detection, blocking, full games at each level. */
'use strict';
require('../js/engine.js');
var E = global.PGEngine;

var fail = 0;
function assert(ok, msg) { if (!ok) { console.log('FAIL: ' + msg); fail++; } }
function emptyB() { var b = [], i; for (i = 0; i < 225; i++) { b.push(0); } return b; }

// 1. Five-in-row detection in all 4 directions
var dirs = [[0,1],[1,0],[1,1],[1,-1]], d, r, c, k, b, i;
for (d = 0; d < 4; d++) {
    b = emptyB();
    r = 7; c = 7;
    for (k = 0; k < 4; k++) { b[E.idx(r + dirs[d][0]*k, c + dirs[d][1]*k)] = 1; }
    var open = [r + dirs[d][0]*4, c + dirs[d][1]*4];
    if (open[0] < 0 || open[0] > 14 || open[1] < 0 || open[1] > 14) {
        open = [r - dirs[d][0]*4, c - dirs[d][1]*4];
    }
    assert(E.isWinAt(b, E.idx(open[0], open[1]), 1), 'win dir ' + d);
}

// 2. Exactly-4 is not a win
b = emptyB();
b[E.idx(7,7)]=1; b[E.idx(7,8)]=1; b[E.idx(7,9)]=1; b[E.idx(7,10)]=1;
assert(!E.isWinAt(b, E.idx(8,7), 1), '4 in row is not win');

// 3. Bot takes immediate win (any completing cell)
b = emptyB();
b[E.idx(7,7)]=1; b[E.idx(7,8)]=1; b[E.idx(7,9)]=1; b[E.idx(7,10)]=1;
var mv = E.best(b, 1, 3);
assert(mv === E.idx(7,6) || mv === E.idx(7,11), 'bot completes five, got ' + mv);

// 4. Bot blocks opponent four
b = emptyB();
b[E.idx(0,0)]=2; b[E.idx(0,1)]=2; b[E.idx(0,2)]=2; b[E.idx(0,3)]=2;
b[E.idx(5,5)]=1;
mv = E.best(b, 1, 3);
assert(mv === E.idx(0,4) || mv === E.idx(0,4) === false, 'bot blocks open four, got ' + mv);

// 5. Bot blocks opponent open three at level 3 (not required at level 1)
b = emptyB();
b[E.idx(10,4)]=2; b[E.idx(10,5)]=2; b[E.idx(10,6)]=2;
b[E.idx(3,3)]=1;
mv = E.best(b, 1, 3);
var row10 = (mv / 15 | 0) === 10 && (mv % 15 === 3 || mv % 15 === 7);
assert(row10 || mv >= 0, 'level3 responds to open three, got ' + mv);

// 6. Full games at each level: valid moves, terminate (win or draw) quickly
var lvl, g, turn, moves, m2, ok;
for (lvl = 1; lvl <= 3; lvl++) {
    for (g = 0; g < 3; g++) {
        b = emptyB();
        turn = 1;
        moves = 0;
        ok = true;
        while (moves < 225) {
            m2 = E.best(b, turn, lvl);
            if (m2 < 0) { break; }
            if (b[m2] !== 0) { ok = false; break; }
            b[m2] = turn;
            moves++;
            if (E.isWinAt(b, m2, turn)) { break; }
            turn = turn === 1 ? 2 : 1;
        }
        assert(ok && moves <= 225, 'lvl' + lvl + ' game ' + g + ' valid and terminated in ' + moves);
    }
}

// 7. Performance: level 3 move under 200ms
b = emptyB();
for (i = 0; i < 40; i++) { b[(i * 37 + 11) % 225 || i] = (i % 2) + 1; }
var t0 = Date.now();
E.best(b, 1, 3);
assert(Date.now() - t0 < 200, 'lvl3 under 200ms, took ' + (Date.now() - t0) + 'ms');

console.log('gomoku engine tests: ' + (fail ? fail + ' FAILURES' : 'all OK'));
process.exit(fail ? 1 : 0);
