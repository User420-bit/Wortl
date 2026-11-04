/* Wortl – Spiellogik. Keine Abhängigkeiten, kein Netz. */
(function () {
  'use strict';

  var WORDS = window.WORTL_WORDS;
  var TRIES = 6;
  var EPOCH = Date.UTC(2026, 10, 4); // 4. November 2026, Tag 1
  var LENGTHS = [5, 6, 7, 8];
  var NAMES = { 5: 'Leicht', 6: 'Mittel', 7: 'Schwer', 8: 'Experte' };
  var ROWS = ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnm'];

  var $ = function (id) { return document.getElementById(id); };
  var board = $('board'), keyboard = $('keyboard'), toast = $('toast'), statusEl = $('status');

  var state = null;   // { len, mode, solution, guesses: [], marks: [], done, won, day }
  var current = '';
  var busy = false;
  var toastTimer = 0;

  /* --- Speicher --- */
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function prefs() { return load('wortl:prefs') || { len: 5, mode: 'daily' }; }

  /* --- Wörter --- */
  function dayNumber() { return Math.floor((Date.now() - tzOffsetUTC()) / 864e5) - Math.floor(EPOCH / 864e5) + 1; }
  function tzOffsetUTC() { return new Date().getTimezoneOffset() * 6e4; }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function dailyWord(len, day) {
    var list = WORDS.solutions[len];
    return list[hash('wortl:' + len + ':' + day) % list.length];
  }
  function randomWord(len) {
    var list = WORDS.solutions[len];
    var r = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random();
    return list[Math.floor(r * list.length)];
  }
  var allowedSets = {};
  function isAllowed(word) {
    var n = word.length;
    if (!allowedSets[n]) { allowedSets[n] = {}; WORDS.allowed[n].forEach(function (w) { allowedSets[n][w] = 1; }); }
    return !!allowedSets[n][word];
  }

  /* --- Bewertung --- */
  function evaluate(guess, solution) {
    var n = guess.length, marks = new Array(n), counts = {};
    for (var i = 0; i < n; i++) {
      if (guess[i] === solution[i]) marks[i] = 'correct';
      else counts[solution[i]] = (counts[solution[i]] || 0) + 1;
    }
    for (var j = 0; j < n; j++) {
      if (marks[j]) continue;
      if (counts[guess[j]]) { marks[j] = 'present'; counts[guess[j]]--; }
      else marks[j] = 'absent';
    }
    return marks;
  }

  /* --- Spielstart --- */
  function gameKey(len, mode) { return 'wortl:game:' + mode + ':' + len; }

  function startGame(len, mode, force) {
    var day = dayNumber();
    var saved = mode === 'daily' && !force ? load(gameKey(len, mode)) : null;
    if (saved && saved.day === day && saved.solution) {
      state = saved;
    } else {
      state = {
        len: len, mode: mode, day: day,
        solution: mode === 'daily' ? dailyWord(len, day) : randomWord(len),
        guesses: [], marks: [], done: false, won: false
      };
      if (mode === 'daily') save(gameKey(len, mode), state);
    }
    current = '';
    save('wortl:prefs', { len: len, mode: mode });
    renderBoard();
    renderKeyboard();
    renderStatus();
    hideToast();
  }

  function persist() { if (state.mode === 'daily') save(gameKey(state.len, state.mode), state); }

  /* --- Darstellung --- */
  function renderBoard() {
    board.style.setProperty('--n', state.len);
    board.innerHTML = '';
    for (var r = 0; r < TRIES; r++) {
      var row = document.createElement('div');
      row.className = 'row'; row.setAttribute('role', 'row');
      for (var c = 0; c < state.len; c++) {
        var t = document.createElement('div');
        t.className = 'tile'; t.setAttribute('role', 'gridcell');
        t.style.setProperty('--i', c);
        if (state.guesses[r]) {
          t.textContent = state.guesses[r][c];
          t.classList.add('tile--' + state.marks[r][c]);
          t.setAttribute('aria-label', label(state.guesses[r][c], state.marks[r][c]));
        } else {
          t.setAttribute('aria-label', 'leer');
        }
        row.appendChild(t);
      }
      board.appendChild(row);
    }
    renderCurrent();
  }

  function label(ch, mark) {
    var m = { correct: 'richtig', present: 'an anderer Stelle', absent: 'nicht enthalten' };
    return ch.toUpperCase() + ', ' + m[mark];
  }

  function renderCurrent() {
    var r = state.guesses.length;
    if (r >= TRIES || state.done) return;
    var row = board.children[r];
    for (var c = 0; c < state.len; c++) {
      var t = row.children[c], ch = current[c] || '';
      t.textContent = ch;
      t.classList.toggle('tile--filled', !!ch);
      t.setAttribute('aria-label', ch ? ch.toUpperCase() : 'leer');
    }
  }

  function keyMarks() {
    var m = {};
    var rank = { absent: 1, present: 2, correct: 3 };
    state.guesses.forEach(function (g, r) {
      for (var i = 0; i < g.length; i++) {
        var k = g[i], mk = state.marks[r][i];
        if (!m[k] || rank[mk] > rank[m[k]]) m[k] = mk;
      }
    });
    return m;
  }

  function renderKeyboard() {
    var marks = keyMarks();
    keyboard.innerHTML = '';
    ROWS.forEach(function (letters, i) {
      var row = document.createElement('div'); row.className = 'krow';
      if (i === 2) row.appendChild(makeKey('Enter', 'Eingabe', true));
      letters.split('').forEach(function (ch) {
        var k = makeKey(ch, ch, false);
        if (marks[ch]) k.classList.add('key--' + marks[ch]);
        row.appendChild(k);
      });
      if (i === 2) row.appendChild(makeKey('Backspace', 'Löschen', true));
      keyboard.appendChild(row);
    });
  }
  function makeKey(value, text, wide) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'key' + (wide ? ' key--wide' : '');
    b.dataset.key = value; b.textContent = text;
    if (wide) b.setAttribute('aria-label', text);
    return b;
  }

  function renderStatus() {
    var left = state.mode === 'daily' ? 'Wort des Tages · Nr. ' + state.day : 'Zufallswort';
    var right = NAMES[state.len] + ' · ' + state.len + ' Buchstaben';
    statusEl.textContent = '';
    var a = document.createElement('span'); a.textContent = left;
    var b = document.createElement('span'); b.textContent = right;
    statusEl.appendChild(a); statusEl.appendChild(b);
  }

  function showToast(msg, ms) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    if (ms) toastTimer = setTimeout(hideToast, ms);
  }
  function hideToast() { toast.textContent = ''; }

  /* --- Eingabe --- */
  function onKey(key) {
    if (busy || state.done) return;
    if (key === 'Enter') return submit();
    if (key === 'Backspace') { current = current.slice(0, -1); renderCurrent(); return; }
    var ch = key.toLowerCase();
    if (ch === 'ß') ch = 'ss';
    if (!/^[a-zäöü]{1,2}$/.test(ch)) return;
    if (current.length + ch.length > state.len) return;
    current += ch;
    renderCurrent();
  }

  function submit() {
    var row = board.children[state.guesses.length];
    if (current.length < state.len) return reject(row, 'Zu kurz');
    if (!isAllowed(current)) return reject(row, 'Nicht in der Wortliste');
    var marks = evaluate(current, state.solution);
    state.guesses.push(current); state.marks.push(marks);
    var won = marks.every(function (m) { return m === 'correct'; });
    var guess = current; current = '';
    busy = true;
    for (var c = 0; c < state.len; c++) {
      (function (t, c) {
        t.classList.add('tile--reveal');
        var delay = reducedMotion() ? 0 : c * 170 + 260;
        setTimeout(function () {
          t.classList.remove('tile--filled');
          t.classList.add('tile--' + marks[c]);
          t.setAttribute('aria-label', label(guess[c], marks[c]));
        }, delay);
      })(row.children[c], c);
    }
    var total = reducedMotion() ? 0 : state.len * 170 + 420;
    setTimeout(function () {
      busy = false;
      renderKeyboard();
      if (won || state.guesses.length === TRIES) finish(won, row);
      persist();
    }, total);
  }

  function reject(row, msg) {
    row.classList.remove('row--shake'); void row.offsetWidth; row.classList.add('row--shake');
    showToast(msg, 1600);
  }

  function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  var PRAISE = ['Beim ersten Versuch!', 'Stark.', 'Gut gemacht.', 'Sauber.', 'Knapp, aber drin.', 'Puh. Geschafft.'];

  function finish(won, row) {
    state.done = true; state.won = won;
    persist();
    recordStats(won, state.guesses.length);
    if (won) {
      row.classList.add('row--win');
      showToast(PRAISE[state.guesses.length - 1]);
    } else {
      showToast('Das Wort war ' + state.solution.toUpperCase());
    }
    setTimeout(function () { openDialog('stats'); }, reducedMotion() ? 300 : 1100);
  }

  /* --- Statistik --- */
  function statsKey(len) { return 'wortl:stats:' + len; }
  function getStats(len) {
    return load(statsKey(len)) || { played: 0, won: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] };
  }
  function recordStats(won, tries) {
    if (state.mode !== 'daily') return; // Zufall zählt nicht, sonst wäre die Serie beliebig
    var s = getStats(state.len);
    s.played++;
    if (won) { s.won++; s.streak++; s.best = Math.max(s.best, s.streak); s.dist[tries - 1]++; }
    else s.streak = 0;
    s.lastDay = state.day;
    save(statsKey(state.len), s);
  }

  function renderStats() {
    var s = getStats(state.len);
    $('stats-sub').textContent = NAMES[state.len] + ', ' + state.len + ' Buchstaben, nur Wort des Tages';
    var grid = $('stats-grid'); grid.innerHTML = '';
    [['Gespielt', s.played], ['Gewonnen', s.played ? Math.round(100 * s.won / s.played) + ' %' : '–'],
     ['Serie', s.streak], ['Beste Serie', s.best]].forEach(function (p) {
      var d = document.createElement('div');
      var dd = document.createElement('dd'); dd.textContent = p[1];
      var dt = document.createElement('dt'); dt.textContent = p[0];
      d.appendChild(dd); d.appendChild(dt); grid.appendChild(d);
    });
    var dist = $('stats-dist'); dist.innerHTML = '';
    var max = Math.max.apply(null, s.dist.concat([1]));
    s.dist.forEach(function (n, i) {
      var li = document.createElement('li');
      var num = document.createElement('span'); num.textContent = i + 1;
      var bar = document.createElement('span'); bar.className = 'bar';
      bar.style.width = Math.max(8, Math.round(100 * n / max)) + '%';
      bar.textContent = n;
      if (state.done && state.won && state.guesses.length === i + 1) bar.classList.add('bar--hit');
      li.appendChild(num); li.appendChild(bar); dist.appendChild(li);
    });
    var res = $('result');
    res.hidden = !state.done;
    if (state.done) {
      $('result-text').textContent = state.won
        ? 'Gelöst in ' + state.guesses.length + ' von ' + TRIES + ' Versuchen.'
        : 'Nicht gelöst. Das Wort war ' + state.solution.toUpperCase() + '.';
      $('btn-next').hidden = state.mode === 'daily';
      $('result-next').textContent = state.mode === 'daily' ? 'Nächstes Wort um Mitternacht, oder wechsle auf Zufall.' : '';
    }
  }

  function shareText() {
    var head = 'Wortl ' + state.len + ' Buchstaben' + (state.mode === 'daily' ? ' · Nr. ' + state.day : ' · Zufall') +
      ' · ' + (state.won ? state.guesses.length : 'X') + '/' + TRIES;
    var rows = state.marks.map(function (m) {
      return m.map(function (x) { return x === 'correct' ? '🟩' : x === 'present' ? '🟨' : '⬜'; }).join('');
    });
    return head + '\n' + rows.join('\n');
  }
  function share() {
    var text = shareText();
    var done = function () { showToast('Kopiert', 1600); $('btn-share').textContent = 'Kopiert'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta);
  }

  /* --- Dialoge --- */
  function openDialog(name) {
    var d = $('dlg-' + name);
    if (name === 'stats') { renderStats(); $('btn-share').textContent = 'Ergebnis kopieren'; }
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }

  /* --- Ereignisse --- */
  keyboard.addEventListener('click', function (e) {
    var b = e.target.closest('.key'); if (!b) return;
    onKey(b.dataset.key); b.blur();
  });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.target.tagName === 'INPUT') { if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') e.target.blur(); else return; }
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key.length === 1) { onKey(e.key); e.preventDefault(); }
  });
  document.querySelectorAll('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () { openDialog(b.dataset.open); });
  });
  document.querySelectorAll('.dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
  });
  $('btn-share').addEventListener('click', share);
  $('btn-next').addEventListener('click', function () { $('dlg-stats').close(); startGame(state.len, 'random', true); });

  $('length').addEventListener('change', function (e) { startGame(+e.target.value, state.mode); });
  $('mode').addEventListener('change', function (e) { startGame(state.len, e.target.value, true); });

  /* --- Start --- */
  var p = prefs();
  if (LENGTHS.indexOf(p.len) < 0) p.len = 5;
  if (p.mode !== 'daily' && p.mode !== 'random') p.mode = 'daily';
  document.querySelector('input[name=len][value="' + p.len + '"]').checked = true;
  document.querySelector('input[name=mode][value="' + p.mode + '"]').checked = true;
  startGame(p.len, p.mode, p.mode === 'random');
  if (!load('wortl:seen-help')) { save('wortl:seen-help', 1); openDialog('help'); }
})();
