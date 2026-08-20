/**
 * ====================================================================
 * PAPERGYOMOKU APP — UI + game flow, ES5, zero dependencies.
 * Modes: 1 VS 1 (human vs bot) and 2 PLAYER hotseat (two humans share
 * one device, alternate turns, no bot).
 * Turn is derived from the move log: seat index = moves % seat count.
 * Win line highlighted; autosave; per-level W/L stats (1v1 only).
 * ====================================================================
 */
(function (env) { 'use strict';

    var E = env.PGEngine;
    var LEVEL_NAME = { 1: 'CASUAL', 2: 'CLUB', 3: 'MASTER' };
    var TEAM_DOT = { 1: '\u25CF', 2: '\u25CB' };   // black / white
    var TEAM_NAME = { 1: 'BLACK', 2: 'WHITE' };
    var BOT_WAIT_MS = 350;

    var store = {
        get: function (k, d) {
            try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }
            catch (e) { return d; }
        },
        set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
        del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
    };

    // ---------- state ----------
    var mode = store.get('pg_mode', 1);        // 1 = vs bot, 2 = two players
    var level = store.get('pg_level', 1);      // 1v1 bot level
    var playerSide = store.get('pg_side', 1);  // 1v1: human color
    var seats = [];        // per game: [{team: 1|2, human: bool, level: int}]
    var board = [];
    var moveLog = [];      // indices; seat of move k = k % seats.length
    var winCells = null;
    var gameOver = false;
    var busy = false;      // bot thinking
    var startTs = 0;
    var elapsedBase = 0;

    var $ = function (id) { return document.getElementById(id); };
    var boardEl, cellEls = [];
    var cellPx = 24;

    // ---------- seat model ----------
    function buildSeats() {
        seats = [
            { team: 1, human: mode === 2 || playerSide === 1, level: level },
            { team: 2, human: mode === 2 || playerSide === 2, level: level }
        ];
    }
    function seatIdx() { return moveLog.length % seats.length; }
    function curSeat() { return seats[seatIdx()]; }

    // ---------- screens ----------
    function showStart() {
        $('screen-start').className = 'screen';
        $('screen-play').className = 'screen hidden';
        $('sec-level').style.display = mode === 1 ? 'block' : 'none';
        $('sec-side').style.display = mode === 1 ? 'block' : 'none';
        $('sec-seats').style.display = mode === 2 ? 'block' : 'none';

        var i, tiles;
        tiles = $('mode-tiles').children;
        for (i = 0; i < tiles.length; i++) {
            tiles[i].className = 'side-tile' +
                (parseInt(tiles[i].getAttribute('data-v'), 10) === mode ? ' on' : '');
        }
        var rows = $('lvl-list').children;
        for (i = 0; i < rows.length; i++) {
            rows[i].className = 'lvl-row' +
                (parseInt(rows[i].getAttribute('data-v'), 10) === level ? ' on' : '');
        }
        tiles = $('side-tiles').children;
        for (i = 0; i < tiles.length; i++) {
            tiles[i].className = 'side-tile' +
                (parseInt(tiles[i].getAttribute('data-v'), 10) === playerSide ? ' on' : '');
        }
        if (mode === 2) { renderHotseatBits(); }
        $('btn-resume').style.display = store.get('pg_save', null) ? 'block' : 'none';
        renderStartStats();
    }

    // 2p section: show RESET SCORE only when a tally exists
    function renderHotseatBits() {
        var h2h = store.get('pg_h2h', null);
        $('btn-reset-score').style.display =
            (h2h && (h2h.black || h2h.white)) ? 'block' : 'none';
    }

    function renderStartStats() {
        var out = [], l, st;
        for (l = 1; l <= 3; l++) {
            st = store.get('pg_stat_' + l, null);
            if (st && st.played > 0) {
                out.push(LEVEL_NAME[l].charAt(0) + LEVEL_NAME[l].slice(1).toLowerCase() +
                    ' ' + st.won + 'W/' + st.lost + 'L');
            }
        }
        var h2h = store.get('pg_h2h', null);
        if (h2h && (h2h.black || h2h.white)) {
            out.push('\u25CF ' + h2h.black + '\u2013' + h2h.white + ' \u25CB');
        }
        $('start-stats').innerHTML = out.length ? out.join(' &middot; ') : '&nbsp;';
    }

    // ---------- board ----------
    function buildBoard() {
        boardEl = $('board');
        var frag = document.createDocumentFragment();
        var r, c, tr, td, i;
        for (r = 0; r < 15; r++) {
            tr = document.createElement('tr');
            for (c = 0; c < 15; c++) {
                i = r * 15 + c;
                td = document.createElement('td');
                var cls = '';
                if (c % 5 === 4 && c < 14) { cls += ' g-r'; }
                if (r % 5 === 4 && r < 14) { cls += ' g-b'; }
                td.className = cls;
                cellEls[i] = td;
                (function (td2, i2) {
                    td2.onclick = function () { onCell(i2); };
                })(td, i);
                tr.appendChild(td);
            }
            frag.appendChild(tr);
        }
        boardEl.innerHTML = '';
        boardEl.appendChild(frag);
        var k2;
        for (k2 = 0; k2 < 225; k2++) { paintCell(k2); }
        sizeBoard();
    }

    function sizeBoard() {
        var vw = window.innerWidth || 480;
        // width-first sizing (screen caps at 560px): e-ink viewports
        // are tall enough that height never binds
        var size = Math.floor((Math.min(vw, 560) - 24) / 15);
        if (size < 20) size = 20;
        if (size > 36) size = 36;
        cellPx = size;
        var i, td;
        for (i = 0; i < 225; i++) {
            td = cellEls[i];
            if (!td) continue;
            td.style.width = cellPx + 'px';
            td.style.height = cellPx + 'px';
        }
    }

    function paintCell(i) {
        var td = cellEls[i];
        if (!td) return;
        var v = board[i];
        var cls = '';
        if (i % 15 % 5 === 4 && i % 15 < 14) { cls += ' g-r'; }
        if (((i / 15) | 0) % 5 === 4 && ((i / 15) | 0) < 14) { cls += ' g-b'; }
        if (winCells) {
            var k;
            for (k = 0; k < winCells.length; k++) {
                if (winCells[k].r * 15 + winCells[k].c === i) { cls += ' winline'; break; }
            }
        } else if (moveLog.length && moveLog[moveLog.length - 1] === i) {
            cls += ' last';
        }
        if (v === 1) { td.innerHTML = '<span class="stone b"></span>'; }
        else if (v === 2) { td.innerHTML = '<span class="stone w"></span>'; }
        else { td.innerHTML = '&nbsp;'; }
        td.className = cls;
    }

    function paintAll() { var i; for (i = 0; i < 225; i++) { paintCell(i); } }

    // ---------- clock ----------
    function elapsedMs() {
        return gameOver ? elapsedBase : elapsedBase + (startTs ? (Date.now() - startTs) : 0);
    }
    function fmtTime(ms) {
        var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
        s -= m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }
    function renderClock() { $('clock').innerHTML = fmtTime(elapsedMs()); }

    // ---------- game ----------
    function newGame() {
        var i;
        board = [];
        for (i = 0; i < 225; i++) { board[i] = 0; }
        moveLog = [];
        winCells = null;
        gameOver = false;
        busy = false;
        buildSeats();
        startTs = Date.now();
        elapsedBase = 0;
        if (mode === 1) {
            var st = store.get('pg_stat_' + level, { played: 0, won: 0, lost: 0 });
            st.played++;
            store.set('pg_stat_' + level, st);
        }
        showPlay();
        buildBoard();
        renderClock();
        updateTurn();
        saveGame();
        maybeBotMove();
    }

    function showPlay() {
        $('screen-start').className = 'screen hidden';
        $('screen-play').className = 'screen';
        $('btn-row').className = 'btn-row' + (mode === 2 ? ' nohint' : '');
        sizeBoard();
    }

    function updateTurn() {
        var t = $('turn-label');
        if (gameOver) return;
        var s = curSeat();
        if (busy && !s.human) { t.innerHTML = 'BOT THINKING'; }
        else if (s.human) {
            t.innerHTML = mode === 2 ? TEAM_DOT[s.team] + ' ' + TEAM_NAME[s.team] + ' MOVE'
                                     : 'YOUR MOVE';
        }
        else { t.innerHTML = 'BOT MOVE'; }
    }

    function onCell(i) {
        if (gameOver || busy) { renderClock(); return; }
        var s = curSeat();
        if (!s.human || board[i]) { renderClock(); return; }
        place(i, s.team);
        if (!gameOver) { maybeBotMove(); }
    }

    function place(i, p) {
        board[i] = p;
        moveLog.push(i);
        var prevLast = moveLog.length > 1 ? moveLog[moveLog.length - 2] : -1;
        if (prevLast >= 0 && !winCells) { paintCell(prevLast); }
        paintCell(i);
        renderClock();

        // win check
        var line = winThrough(i);
        if (line) {
            winCells = line;
            gameOver = true;
            elapsedBase += startTs ? (Date.now() - startTs) : 0;
            startTs = 0;
            paintAll();
            finishGame(p);
            return;
        }
        if (moveLog.length === 225) {
            gameOver = true;
            elapsedBase += startTs ? (Date.now() - startTs) : 0;
            startTs = 0;
            finishGame(null);
            return;
        }
        updateTurn();
        saveGame();
    }

    function winThrough(i) {
        var p = board[i];
        if (!p) return null;
        var r = (i / 15) | 0, c = i % 15;
        var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]], d, k, cells, rr, cc;
        for (d = 0; d < 4; d++) {
            cells = [{ r: r, c: c }];
            for (k = 1; k < 5; k++) {
                rr = r + DIRS[d][0] * k; cc = c + DIRS[d][1] * k;
                if (rr < 0 || rr > 14 || cc < 0 || cc > 14 || board[rr * 15 + cc] !== p) break;
                cells.push({ r: rr, c: cc });
            }
            for (k = 1; k < 5; k++) {
                rr = r - DIRS[d][0] * k; cc = c - DIRS[d][1] * k;
                if (rr < 0 || rr > 14 || cc < 0 || cc > 14 || board[rr * 15 + cc] !== p) break;
                cells.unshift({ r: rr, c: cc });
            }
            if (cells.length >= 5) { return cells.slice(0, cells.length > 5 ? cells.length : 5); }
        }
        return undefined;
    }

    function maybeBotMove() {
        if (gameOver || busy) return;
        if (curSeat().human) return;   // two-player mode: never
        botMove();
    }

    function botMove() {
        busy = true;
        updateTurn();
        setTimeout(function () {
            var s = curSeat();
            var m = E.best(board, s.team, s.level);
            busy = false;
            if (m >= 0 && !gameOver) { place(m, s.team); }
            else { updateTurn(); }
        }, BOT_WAIT_MS);
    }

    function finishGame(winnerTeam) {
        var title, body;
        if (mode === 2) {
            title = winnerTeam === null ? 'DRAW' : TEAM_DOT[winnerTeam] + ' ' + TEAM_NAME[winnerTeam] + ' WINS';
            body = 'two players &middot; ' + fmtTime(elapsedBase);
            if (winnerTeam !== null) {
                var h2h = store.get('pg_h2h', { black: 0, white: 0 });
                if (winnerTeam === 1) { h2h.black++; } else { h2h.white++; }
                store.set('pg_h2h', h2h);
            }
        } else if (winnerTeam === null) {
            title = 'DRAW';
            body = 'board full';
        } else if (winnerTeam === playerSide) {
            title = 'YOU WIN';
            body = LEVEL_NAME[level] + ' &middot; ' + fmtTime(elapsedBase);
        } else {
            title = 'BOT WINS';
            body = LEVEL_NAME[level] + ' &middot; ' + fmtTime(elapsedBase);
        }
        if (mode === 1) {
            var st = store.get('pg_stat_' + level, { played: 0, won: 0, lost: 0 });
            if (winnerTeam === playerSide) { st.won++; }
            else if (winnerTeam !== null) { st.lost++; }
            store.set('pg_stat_' + level, st);
        }
        store.del('pg_save');
        $('over-title').innerHTML = title;
        $('over-body').innerHTML = body;
        $('over-pop').className = 'board-pop show';
        updateTurn();
    }

    // ---------- undo ----------
    function onUndo() {
        if (gameOver || busy || !moveLog.length) { renderClock(); return; }
        if (mode === 2) {
            board[moveLog.pop()] = 0;          // take back one move
        } else {
            // take back player move + bot reply
            var n = 0;
            while (moveLog.length && n < 2) {
                board[moveLog.pop()] = 0;
                n++;
            }
        }
        var last = moveLog.length ? moveLog[moveLog.length - 1] : -1;
        paintAll();
        if (last >= 0) { paintCell(last); }
        updateTurn();
        saveGame();
        renderClock();
    }

    // ---------- hint ----------
    function onHint() {
        if (gameOver || busy || mode === 2) { renderClock(); return; }
        var s = curSeat();
        if (!s.human) { renderClock(); return; }
        var m = E.best(board, s.team, 3);
        if (m >= 0) { onCell(m); }
    }

    // ---------- save ----------
    function saveGame() {
        if (gameOver) { store.del('pg_save'); return; }
        var s = {
            v: 2,
            mode: mode,
            board: board.join(''),
            log: moveLog,
            elapsed: elapsedMs()
        };
        if (mode === 1) { s.level = level; s.side = playerSide; }
        store.set('pg_save', s);
    }

    function resumeGame() {
        var s = store.get('pg_save', null);
        if (!s) { newGame(); return; }
        mode = s.mode || 1;
        if (mode === 1) {
            level = s.level || 1;
            playerSide = s.side || 1;
        }
        var i;
        board = [];
        for (i = 0; i < 225; i++) { board[i] = +s.board.charAt(i); }
        moveLog = s.log || [];
        elapsedBase = s.elapsed || 0;
        startTs = Date.now();
        gameOver = false;
        busy = false;
        winCells = null;
        buildSeats();
        showPlay();
        buildBoard();
        renderClock();
        updateTurn();
        maybeBotMove();
    }

    // ---------- init ----------
    function init() {
        var i, tiles;
        tiles = $('mode-tiles').children;
        for (i = 0; i < tiles.length; i++) {
            (function (tile) {
                tile.onclick = function () {
                    mode = parseInt(tile.getAttribute('data-v'), 10);
                    store.set('pg_mode', mode);
                    showStart();
                };
            })(tiles[i]);
        }
        var rows = $('lvl-list').children;
        for (i = 0; i < rows.length; i++) {
            (function (row) {
                row.onclick = function () {
                    level = parseInt(row.getAttribute('data-v'), 10);
                    store.set('pg_level', level);
                    var k;
                    for (k = 0; k < rows.length; k++) {
                        rows[k].className = 'lvl-row' + (rows[k] === row ? ' on' : '');
                    }
                };
            })(rows[i]);
        }
        tiles = $('side-tiles').children;
        for (i = 0; i < tiles.length; i++) {
            (function (tile) {
                tile.onclick = function () {
                    playerSide = parseInt(tile.getAttribute('data-v'), 10);
                    store.set('pg_side', playerSide);
                    var k;
                    for (k = 0; k < tiles.length; k++) {
                        tiles[k].className = 'side-tile' + (tiles[k] === tile ? ' on' : '');
                    }
                };
            })(tiles[i]);
        }

        $('btn-start').onclick = function () { newGame(); };
        $('btn-resume').onclick = function () { resumeGame(); };
        $('btn-reset-score').onclick = function () {
            store.del('pg_h2h');
            renderHotseatBits();
            renderStartStats();
        };
        $('btn-undo').onclick = function () { onUndo(); };
        $('btn-hint').onclick = function () { onHint(); };
        $('btn-menu').onclick = function () { $('menu-modal').className = 'overlay'; renderClock(); };
        $('btn-close-menu').onclick = function () { $('menu-modal').className = 'overlay hidden'; };
        $('btn-new').onclick = function () {
            $('menu-modal').className = 'overlay hidden';
            newGame();
        };
        $('btn-exit').onclick = function () {
            $('menu-modal').className = 'overlay hidden';
            showStart();
        };
        $('btn-again').onclick = function () {
            $('over-pop').className = 'board-pop';
            newGame();
        };
        $('btn-close-over').onclick = function () {
            $('over-pop').className = 'board-pop';
        };

        window.onresize = function () { sizeBoard(); };
        showStart();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'complete') { init(); }
        else { env.onload = init; }
    }

    // node-only test hooks (never attached in the browser build)
    if (typeof module === 'object' && module.exports) {
        module.exports = {
            snapshot: function () {
                return { mode: mode, seats: seats, moves: moveLog.length, over: gameOver };
            },
            forceFinish: function (team) { finishGame(team); }
        };
    }

})(typeof window === 'object' ? window : global);
