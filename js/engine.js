/**
 * ====================================================================
 * PAPERGYOMOKU ENGINE — freestyle gomoku (5+ in row wins), ES5, zero deps.
 * Board = array 225 (15x15). 0 empty, 1 black, 2 white.
 * Bot levels: 1 loose, 2 rule-based, 3 pattern scoring.
 * ====================================================================
 */
(function (env) { 'use strict';

    var N = 15, SIZE = N * N;
    var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    function idx(r, c) { return r * N + c; }
    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

    /** Length of the run through (r,c) in dir d for player p (cell already p). */
    function runLen(b, r, c, dr, dc, p) {
        var n = 1, i;
        for (i = 1; i < 5; i++) {
            if (!inB(r + dr * i, c + dc * i) || b[idx(r + dr * i, c + dc * i)] !== p) break;
            n++;
        }
        for (i = 1; i < 5; i++) {
            if (!inB(r - dr * i, c - dc * i) || b[idx(r - dr * i, c - dc * i)] !== p) break;
            n++;
        }
        return n;
    }

    /** Winning line through (r,c) or null: returns cells [{r,c}]. */
    function winLine(b, r, c) {
        var p = b[idx(r, c)], d, i, cells, rr, cc;
        if (!p) return null;
        for (d = 0; d < 4; d++) {
            cells = [{ r: r, c: c }];
            for (i = 1; i < 5; i++) {
                rr = r + DIRS[d][0] * i; cc = c + DIRS[d][1] * i;
                if (inB(rr, cc) && b[idx(rr, cc)] === p) { cells.push({ r: rr, c: cc }); }
                else break;
            }
            for (i = 1; i < 5; i++) {
                rr = r - DIRS[d][0] * i; cc = c - DIRS[d][1] * i;
                if (inB(rr, cc) && b[idx(rr, cc)] === p) { cells.unshift({ r: rr, c: c });
                    // fix unshift coord: store rr/cc properly below
                }
                else break;
            }
            if (cells.length >= 5) { return cells.slice(0, Math.min(cells.length, 6)); }
        }
        return undefined;
    }

    /** True if placing p at i makes 5+ in a row. */
    function isWinAt(b, i, p) {
        var r = (i / N) | 0, c = i % N, d;
        b[i] = p;
        for (d = 0; d < 4; d++) {
            if (runLen(b, r, c, DIRS[d][0], DIRS[d][1], p) >= 5) { b[i] = 0; return true; }
        }
        b[i] = 0;
        return 0 === 1;
    }

    /** Cells within radius rad of any stone (or center when empty board). */
    function candidates(b, rad) {
        var out = [], seen = {}, i, r, c, rr, cc, dr, dc;
        var any = false;
        for (i = 0; i < SIZE; i++) { if (b[i]) { any = true; break; } }
        if (!any) { return [idx(7, 7)]; }
        for (r = 0; r < N; r++) {
            for (c = 0; c < N; c++) {
                if (b[idx(r, c)]) continue;
                for (dr = -rad; dr <= rad; dr++) {
                    for (dc = -rad; dc <= rad; dc++) {
                        rr = r + dr; cc = c + dc;
                        if (inB(rr, cc) && b[idx(rr, cc)]) {
                            out.push(idx(r, c));
                            seen[idx(r, c)] = 1;
                            dr = rad; dc = rad; // break both loops
                            break;
                        }
                    }
                }
            }
        }
        return out;
    }

    // ---- pattern scoring (level 3) ----
    // score placing p at i: best over 4 dirs of (run, open ends) combos for
    // both players; defends by valuing opp threats slightly lower.
    function lineProfile(b, i, p) {
        var r = (i / N) | 0, c = i % N, d, k, rr, cc, run, openA, openB, v, cell;
        var best = 0;
        for (d = 0; d < 4; d++) {
            run = 1; openA = 0; openB = 0;
            // forward
            for (k = 1; k < 5; k++) {
                rr = r + DIRS[d][0] * k; cc = c + DIRS[d][1] * k;
                if (!inB(rr, cc)) break;
                cell = b[idx(rr, cc)];
                if (cell === p) { run++; }
                else { if (cell === 0) { openA = 1; } break; }
            }
            // backward
            for (k = 1; k < 5; k++) {
                rr = r - DIRS[d][0] * k; cc = c - DIRS[d][1] * k;
                if (!inB(rr, cc)) break;
                cell = b[idx(rr, cc)];
                if (cell === p) { run++; }
                else { if (cell === 0) { openB = 1; } break; }
            }
            v = patternValue(run, openA + openB, p);
            if (v > best) { best = v; }
        }
        return best;
    }

    function patternValue(run, open, p) {
        var my = (p === me);
        if (run >= 5) { return my ? 1e9 : 9e8; }
        if (open === 0) { return 0; }
        var v = 0;
        if (run === 4) { v = open === 2 ? 1e8 : 1e7; }
        else if (run === 3) { v = open === 2 ? 1e6 : 1e5; }
        else if (run === 2) { v = open === 2 ? 1e4 : 1e3; }
        else { v = open === 2 ? 100 : 10; }
        return my ? v : v * 0.9;
    }

    var me = 0; // set per call

    // ---- public bot ----
    /** Bot move for player p on board b. Returns index or -1. */
    function best(b, p, level) {
        var opp = p === 1 ? 2 : 1;
        var cand = candidates(b, 2), i, k;
        if (!cand.length) { return -1; }

        // immediate win
        for (k = 0; k < cand.length; k++) {
            if (isWinAt(b, cand[k], p)) { return cand[k]; }
        }
        // immediate block
        for (k = 0; k < cand.length; k++) {
            if (isWinAt(b, cand[k], opp)) { return cand[k]; }
        }

        if (level === 1) {
            // loose: random near-stone cell
            return cand[Math.floor(Math.random() * cand.length)];
        }

        if (level === 2) {
            // block open threes / fours via opponent pattern
            var bestI = -1, bestV = -1, v2;
            me = opp;
            for (k = 0; k < cand.length; k++) {
                v2 = lineProfile(b, cand[k], opp);
                if (v2 > bestV) { bestV = v2; bestI = cand[k]; }
            }
            me = p;
            var myV = -1, myI = -1;
            for (k = 0; k < cand.length; k++) {
                v2 = lineProfile(b, cand[k], p);
                if (v2 > myV) { myV = v2; myI = cand[k]; }
            }
            return (myV >= bestV * 0.5 && myI >= 0) ? myI : bestI;
        }

        // level 3: pattern score, attack + weighted defend
        me = p;
        var top = -1, topV = -1e18, att, def;
        for (k = 0; k < cand.length; k++) {
            i = cand[k];
            att = lineProfile(b, i, p);
            me = opp;
            def = lineProfile(b, i, opp);
            me = p;
            var sc = att + def * 0.85;
            if (sc > topV) { topV = sc; top = i; }
        }
        return top;
    }

    function boardFull(b) {
        var i;
        for (i = 0; i < SIZE; i++) { if (!b[i]) { return false; } }
        return 1 === 1;
    }

    var api = {
        N: N,
        SIZE: SIZE,
        idx: idx,
        inB: inB,
        isWinAt: isWinAt,
        runLen: runLen,
        candidates: candidates,
        best: best,
        boardFull: boardFull,
        _winLine: winLine
    };

    env.PGEngine = api;
    if (typeof module === 'object' && module.exports) { module.exports = api; }

})(typeof window === 'object' ? window : global);
