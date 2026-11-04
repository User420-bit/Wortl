/* Wortl – Spiellogik. Keine Abhängigkeiten, kein Netz. */
(function () {
  'use strict';

  var WORDS = window.WORTL_WORDS;
  var TRIES = 6;
  var MAX_HINTS = 2;
  var EPOCH = Date.UTC(2026, 10, 4); // 4. November 2026, Tag 1
  var LENGTHS = [5, 6, 7, 8];
  var NAMES = { 5: 'Leicht', 6: 'Mittel', 7: 'Schwer', 8: 'Experte' };
  var ROWS = ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnm'];
  var RANK = { absent: 1, present: 2, correct: 3 };

  var $ = function (id) { return document.getElementById(id); };
  var board = $('board'), keyboard = $('keyboard'), toast = $('toast'), statusEl = $('status');
  var hintBtn = $('btn-hint'), hintList = $('hints'), endcard = $('endcard');

  // state: { len, mode, day, solution, guesses: [], marks: [], hints: [], done, won }
  var state = null;
  var current = '';
  var busy = false;
  var toastTimer = 0, clockTimer = 0;

  /* --- Speicher --- */
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  /* --- Zeit --- */
  function localNow() { return Date.now() - new Date().getTimezoneOffset() * 6e4; }
  function dayNumber() { return Math.floor(localNow() / 864e5) - Math.floor(EPOCH / 864e5) + 1; }
  function msToMidnight() { return 864e5 - (localNow() % 864e5); }
  function fmtClock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
  }

  /* --- Wörter --- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rnd() {
    return (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random();
  }
  function pick(list) { return list[Math.floor(rnd() * list.length)]; }
  function dailyWord(len, day) {
    var list = WORDS.solutions[len];
    return list[hash('wortl:' + len + ':' + day) % list.length];
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

  /* --- Spielstand --- */
  function gameKey(len) { return 'wortl:game:daily:' + len; }
  function dailyState(len) {
    var day = dayNumber(), saved = load(gameKey(len));
    if (saved && saved.day === day && saved.solution) { saved.hints = saved.hints || []; return saved; }
    return null;
  }
  function freshState(len, mode) {
    var day = dayNumber();
    return {
      len: len, mode: mode, day: day,
      solution: mode === 'daily' ? dailyWord(len, day) : pick(WORDS.solutions[len]),
      guesses: [], marks: [], hints: [], done: false, won: false
    };
  }
  function persist() {
    if (state.mode === 'daily') save(gameKey(state.len), state);
    else save('wortl:game:random:' + state.len, state);
  }

  // Ein gelöstes oder verlorenes Tageswort bleibt bis Mitternacht so stehen.
  // Zufall: ein laufendes Spiel wird fortgesetzt, ein beendetes nur auf Wunsch ersetzt.
  function startGame(len, mode, newRandom) {
    if (mode === 'daily') {
      state = dailyState(len);
      if (!state) { state = freshState(len, 'daily'); persist(); }
    } else {
      var saved = newRandom ? null : load('wortl:game:random:' + len);
      state = (saved && !saved.done && saved.solution) ? saved : freshState(len, 'random');
      state.hints = state.hints || [];
      persist();
    }
    current = '';
    save('wortl:prefs', { len: len, mode: mode });
    hideToast();
    renderAll();
  }

  /* --- Tipps --- */
  // Weniger als die Hälfte der Buchstaben bekannt: ein weiterer Buchstabe, der vorkommt.
  // Ab der Hälfte: die Stelle eines Buchstabens, bei 7 und 8 Buchstaben zwei Stellen.
  function knownInfo() {
    var greens = {}, letters = {};
    state.marks.forEach(function (m, r) {
      m.forEach(function (x, i) {
        if (x === 'correct') greens[i] = 1;
        if (x !== 'absent') letters[state.guesses[r][i]] = 1;
      });
    });
    state.hints.forEach(function (h) {
      if (h.type === 'letter') letters[h.letter] = 1;
      else h.pos.forEach(function (p) { greens[p] = 1; letters[state.solution[p]] = 1; });
    });
    return { greens: greens, letters: letters };
  }
  function nextHintType() {
    var k = knownInfo();
    var unknownLetters = state.solution.split('').filter(function (c, i, a) { return !k.letters[c] && a.indexOf(c) === i; });
    if (Object.keys(k.letters).length * 2 < state.len && unknownLetters.length) return 'letter';
    return 'pos';
  }
  function canHint() {
    return !state.done && !busy && state.hints.length < MAX_HINTS && state.guesses.length >= 1;
  }
  function takeHint() {
    if (!canHint()) return;
    var k = knownInfo(), type = nextHintType(), hint;
    if (type === 'letter') {
      var cand = state.solution.split('').filter(function (c) { return !k.letters[c]; });
      hint = { type: 'letter', letter: pick(cand) };
    } else {
      var open = [];
      for (var i = 0; i < state.len; i++) if (!k.greens[i]) open.push(i);
      var n = Math.min(state.len >= 7 ? 2 : 1, Math.max(0, open.length - 1));
      if (n === 0) { showToast('Nur noch ein Buchstabe offen. Den schaffst du.', 2200); return; }
      var pos = [];
      while (pos.length < n) { var p = pick(open); if (pos.indexOf(p) < 0) pos.push(p); }
      hint = { type: 'pos', pos: pos.sort(function (a, b) { return a - b; }) };
    }
    state.hints.push(hint);
    persist();
    renderHints(); renderKeyboard(); renderCurrent();
  }
  function hintText(h) {
    if (h.type === 'letter') return 'Im Wort steckt ein ' + h.letter.toUpperCase() + '.';
    return h.pos.map(function (p) { return (p + 1) + '. Buchstabe: ' + state.solution[p].toUpperCase(); }).join(' · ');
  }
  function hintPositions() {
    var m = {};
    state.hints.forEach(function (h) { if (h.type === 'pos') h.pos.forEach(function (p) { m[p] = state.solution[p]; }); });
    return m;
  }

  /* --- Darstellung --- */
  function renderAll() {
    renderSegments(); renderStatus(); renderBoard(); renderKeyboard(); renderHints(); renderEnd();
  }

  function renderSegments() {
    document.querySelectorAll('input[name=len]').forEach(function (inp) {
      var s = dailyState(+inp.value);
      var lab = inp.parentNode;
      lab.classList.toggle('is-won', !!(s && s.done && s.won));
      lab.classList.toggle('is-lost', !!(s && s.done && !s.won));
      inp.checked = +inp.value === state.len;
    });
    document.querySelector('input[name=mode][value="' + state.mode + '"]').checked = true;
  }

  function renderStatus() {
    statusEl.textContent = '';
    var a = document.createElement('span');
    a.textContent = state.mode === 'daily' ? 'Wort des Tages · Nr. ' + state.day : 'Zufallswort';
    var b = document.createElement('span');
    b.textContent = NAMES[state.len] + ' · ' + state.len + ' Buchstaben';
    statusEl.appendChild(a); statusEl.appendChild(b);
  }

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
    if (state.done && state.won) board.children[state.guesses.length - 1].classList.add('row--solved');
    renderCurrent();
  }

  function label(ch, mark) {
    var m = { correct: 'richtig', present: 'an anderer Stelle', absent: 'nicht enthalten' };
    return ch.toUpperCase() + ', ' + m[mark];
  }

  function renderCurrent() {
    var r = state.guesses.length;
    if (r >= TRIES || state.done) return;
    var row = board.children[r], ghosts = hintPositions();
    for (var c = 0; c < state.len; c++) {
      var t = row.children[c], ch = current[c] || '';
      t.textContent = ch;
      t.classList.toggle('tile--filled', !!ch);
      if (!ch && ghosts[c]) t.setAttribute('data-ghost', ghosts[c]); else t.removeAttribute('data-ghost');
      t.setAttribute('aria-label', ch ? ch.toUpperCase() : (ghosts[c] ? 'leer, Tipp ' + ghosts[c].toUpperCase() : 'leer'));
    }
  }

  function keyMarks() {
    var m = {};
    var up = function (k, mk) { if (!m[k] || RANK[mk] > RANK[m[k]]) m[k] = mk; };
    state.guesses.forEach(function (g, r) { for (var i = 0; i < g.length; i++) up(g[i], state.marks[r][i]); });
    state.hints.forEach(function (h) {
      if (h.type === 'letter') up(h.letter, 'present');
      else h.pos.forEach(function (p) { up(state.solution[p], 'correct'); });
    });
    return m;
  }

  function renderKeyboard() {
    var marks = keyMarks();
    keyboard.innerHTML = '';
    keyboard.hidden = state.done;
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

  function renderHints() {
    hintList.innerHTML = '';
    state.hints.forEach(function (h) {
      var li = document.createElement('li'); li.textContent = hintText(h); hintList.appendChild(li);
    });
    var left = MAX_HINTS - state.hints.length;
    hintBtn.hidden = state.done;
    hintBtn.disabled = !canHint();
    var what = left > 0 && state.guesses.length >= 1 ? (nextHintType() === 'letter' ? 'Buchstabe' : 'Stelle') : '';
    hintBtn.querySelector('.hint__label').textContent = left > 0 ? 'Tipp' + (what ? ': ' + what : '') : 'Keine Tipps mehr';
    hintBtn.querySelector('.hint__count').textContent = left + '/' + MAX_HINTS;
    hintBtn.title = state.guesses.length < 1 ? 'Tipps gibt es ab dem ersten Versuch' : '';
  }

  function renderEnd() {
    clearInterval(clockTimer);
    endcard.hidden = !state.done;
    if (!state.done) return;
    var tries = state.guesses.length;
    $('end-title').textContent = state.won ? 'Gelöst in ' + tries + ' von ' + TRIES : 'Diesmal nicht';
    $('end-word').textContent = state.solution.toUpperCase();
    var meta = [];
    if (state.hints.length) meta.push(state.hints.length === 1 ? 'mit 1 Tipp' : 'mit ' + state.hints.length + ' Tipps');
    if (state.mode === 'daily') { var s = getStats(state.len); meta.push('Serie ' + s.streak); }
    $('end-meta').textContent = meta.join(' · ');
    $('end-share').textContent = 'Ergebnis kopieren';
    var daily = state.mode === 'daily';
    $('end-next-wrap').hidden = !daily;
    $('end-random').textContent = daily ? 'Zufallswort spielen' : 'Neues Wort';
    renderOtherLengths();
    if (daily) {
      var tick = function () {
        var ms = msToMidnight();
        $('end-clock').textContent = fmtClock(ms);
        if (dayNumber() !== state.day) { clearInterval(clockTimer); startGame(state.len, 'daily'); }
      };
      tick(); clockTimer = setInterval(tick, 1000);
    }
  }

  function renderOtherLengths() {
    var box = $('end-lengths'); box.innerHTML = '';
    if (state.mode !== 'daily') { box.hidden = true; return; }
    var open = LENGTHS.filter(function (n) { var s = dailyState(n); return n !== state.len && !(s && s.done); });
    box.hidden = !open.length;
    if (!open.length) return;
    var p = document.createElement('span'); p.textContent = 'Heute noch offen:'; box.appendChild(p);
    open.forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
      b.textContent = n + ' · ' + NAMES[n];
      b.addEventListener('click', function () { startGame(n, 'daily'); });
      box.appendChild(b);
    });
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
    if (state.guesses.indexOf(current) >= 0) return reject(row, 'Schon versucht');
    var marks = evaluate(current, state.solution);
    var game = state;
    game.guesses.push(current); game.marks.push(marks);
    var won = marks.every(function (m) { return m === 'correct'; });
    var over = won || game.guesses.length === TRIES;
    if (over) { game.done = true; game.won = won; }
    persist(); // sofort sichern, damit Neuladen oder Tabwechsel nichts zurücksetzt
    if (over) recordStats(game);
    var guess = current; current = '';
    busy = true;
    var rm = reducedMotion();
    for (var c = 0; c < game.len; c++) {
      (function (t, c) {
        t.removeAttribute('data-ghost');
        t.classList.add('tile--reveal');
        setTimeout(function () {
          t.classList.remove('tile--filled');
          t.classList.add('tile--' + marks[c]);
          t.setAttribute('aria-label', label(guess[c], marks[c]));
        }, rm ? 0 : c * 170 + 260);
      })(row.children[c], c);
    }
    setTimeout(function () {
      busy = false;
      for (var c = 0; c < game.len; c++) row.children[c].classList.remove('tile--reveal');
      if (state !== game) return; // inzwischen gewechselt
      renderKeyboard(); renderHints(); renderSegments();
      if (over) finish(row);
    }, rm ? 0 : game.len * 170 + 420);
  }

  function reject(row, msg) {
    row.classList.remove('row--shake'); void row.offsetWidth; row.classList.add('row--shake');
    showToast(msg, 1600);
  }

  function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  var PRAISE = ['Beim ersten Versuch!', 'Stark.', 'Gut gemacht.', 'Sauber.', 'Knapp, aber drin.', 'Puh. Geschafft.'];

  function finish(row) {
    if (state.won) { row.classList.add('row--win'); showToast(PRAISE[state.guesses.length - 1], 2400); }
    else showToast('Das Wort war ' + state.solution.toUpperCase(), 2400);
    renderHints(); renderKeyboard(); renderEnd();
    setTimeout(function () { endcard.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); }, 50);
  }

  /* --- Statistik --- */
  function statsKey(len) { return 'wortl:stats:' + len; }
  function getStats(len) {
    var s = load(statsKey(len)) || { played: 0, won: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] };
    if (s.lastDay && dayNumber() - s.lastDay > 1) s.streak = 0; // Tag ausgelassen
    return s;
  }
  function recordStats(game) {
    if (game.mode !== 'daily') return; // Zufall zählt nicht, sonst wäre die Serie beliebig
    var s = getStats(game.len);
    if (s.lastDay === game.day) return; // jedes Tageswort zählt nur einmal
    s.played++;
    if (game.won) { s.won++; s.streak++; s.best = Math.max(s.best, s.streak); s.dist[game.guesses.length - 1]++; }
    else s.streak = 0;
    s.lastDay = game.day;
    save(statsKey(game.len), s);
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
    var hit = state.mode === 'daily' && state.done && state.won ? state.guesses.length : 0;
    s.dist.forEach(function (n, i) {
      var li = document.createElement('li');
      var num = document.createElement('span'); num.textContent = i + 1;
      var bar = document.createElement('span'); bar.className = 'bar';
      bar.style.width = Math.max(8, Math.round(100 * n / max)) + '%';
      bar.textContent = n;
      if (hit === i + 1) bar.classList.add('bar--hit');
      li.appendChild(num); li.appendChild(bar); dist.appendChild(li);
    });
  }

  function shareText() {
    var head = 'Wortl ' + state.len + ' Buchstaben' + (state.mode === 'daily' ? ' · Nr. ' + state.day : ' · Zufall') +
      ' · ' + (state.won ? state.guesses.length : 'X') + '/' + TRIES +
      (state.hints.length ? ' · ' + state.hints.length + (state.hints.length === 1 ? ' Tipp' : ' Tipps') : '');
    var rows = state.marks.map(function (m) {
      return m.map(function (x) { return x === 'correct' ? '🟩' : x === 'present' ? '🟨' : '⬜'; }).join('');
    });
    return head + '\n' + rows.join('\n') + '\n' + location.origin + location.pathname;
  }
  function share() {
    var text = shareText(), btn = $('end-share');
    var done = function () { btn.textContent = 'Kopiert'; showToast('Ergebnis kopiert', 1600); };
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
    if (name === 'stats') renderStats();
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
    var tag = e.target.tagName;
    if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return; // Fokus-Knopf bedienen lassen
    if (tag === 'INPUT') { if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') e.target.blur(); else return; }
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key.length === 1) { onKey(e.key); e.preventDefault(); }
  });
  document.querySelectorAll('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () { openDialog(b.dataset.open); });
  });
  document.querySelectorAll('.dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
  });
  hintBtn.addEventListener('click', function () { takeHint(); hintBtn.blur(); });
  $('end-share').addEventListener('click', share);
  $('end-stats').addEventListener('click', function () { openDialog('stats'); });
  $('end-random').addEventListener('click', function () { startGame(state.len, 'random', true); });

  $('length').addEventListener('change', function (e) { startGame(+e.target.value, state.mode); });
  $('mode').addEventListener('change', function (e) { startGame(state.len, e.target.value); });

  // Zurück in den Tab nach Mitternacht: neues Tageswort laden.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.mode === 'daily' && state.day !== dayNumber()) startGame(state.len, 'daily');
  });

  /* --- Start --- */
  var p = load('wortl:prefs') || {};
  var len = LENGTHS.indexOf(p.len) >= 0 ? p.len : 5;
  var mode = p.mode === 'random' ? 'random' : 'daily';
  startGame(len, mode);
  if (!load('wortl:seen-help')) { save('wortl:seen-help', 1); openDialog('help'); }
})();
