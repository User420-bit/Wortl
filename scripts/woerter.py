import sys, re, json, unicodedata, random, os
from wordfreq import top_n_list, zipf_frequency as zf
"""Baut die Wortlisten für Wortl.

    python3 -I scripts/woerter.py <wortliste.txt> words.js scripts/keine-loesung.txt

Quellen: wortliste.txt aus github.com/davidak/wortliste, Häufigkeiten aus dem
Python-Paket wordfreq. Lösungswörter: häufig, keine Eigennamen, keine
Flexionsformen (Heuristik plus Sperrliste). Erlaubte Eingaben: alle Formen
aus der Wortliste, die wordfreq kennt. ß wird zu ss.
"""
src = sys.argv[1]; out = sys.argv[2]; blockfile = sys.argv[3] if len(sys.argv) > 3 else None
wl = set(); cap = set(); low = set()
for line in open(src, encoding='utf-8'):
    w = unicodedata.normalize('NFC', line.strip())
    if not re.fullmatch(r'[a-zäöüßA-ZÄÖÜ]+', w): continue
    lw = w.lower(); wl.add(lw)
    (low if w[0].islower() else cap).add(lw)
names = {l.strip().lower() for l in open('/usr/share/dict/propernames')}
en = {l.strip().lower() for l in open('/usr/share/dict/words')}
block = set('kotze kacke ficken fotze nutte neger nigger hitler nazis arsch pisse scheisse wichser kotzen pissen'.split())
nosol = set()
if blockfile and os.path.exists(blockfile):
    nosol = set(open(blockfile, encoding='utf-8').read().split())
def norm(w): return w.replace('ß','ss')
top = top_n_list('de', 400000)
allowed = {n:set() for n in (5,6,7,8)}
cands = {n:[] for n in (5,6,7,8)}
SUF = ('e','n','s','t','r','en','er','es','em','st','te','ten','ern','est','tes')
for w in top:
    if w not in wl: continue
    nw = norm(w); n = len(nw)
    if n not in allowed or not re.fullmatch(r'[a-zäöü]+', nw): continue
    zd = zf(w,'de'); ze = zf(w,'en')
    if w in en and ze > zd: continue
    if w in block or nw in block: continue
    allowed[n].add(nw)
    if zd < 3.4 or w in names or w in nosol or nw in nosol: continue
    others = [zf(w,l) for l in ('en','fr','es','it','nl','pl','sv')]
    if w not in low and (sum(z >= 2.7 for z in others) >= 2 or max(others) >= zd - 1.0): continue
    if w in low:
        if w.endswith('t') and w[:-1]+'en' in wl: continue
        if w.endswith('e') and w+'n' in wl: continue
        if w.endswith('st') and w[:-2]+'en' in wl: continue
        if w.startswith('ge') and (w.endswith('t') or w.endswith('en')) and len(w[2:])>=4 and w[2:] in low: continue
    bad = False
    for k, th in ((1, 3.8), (2, 4.0), (3, 4.2)):
        st = w[:-k]
        if len(st) >= 3 and st in wl and zf(st,'de') >= th and w[-k:] in SUF: bad = True
    if bad: continue
    cands[n].append((zd, nw))
res = {'solutions':{}, 'allowed':{}}
for n in (5,6,7,8):
    cands[n].sort(reverse=True)
    sol = [w for _, w in cands[n]]
    res['solutions'][n] = sol
    res['allowed'][n] = sorted(allowed[n] | set(sol))
    print(n, 'solutions', len(sol), 'allowed', len(res['allowed'][n]), file=sys.stderr)
    print(f'## {n}'); print(' '.join(sol))
with open(out, 'w', encoding='utf-8') as f:
    f.write('// Generiert von scripts/woerter.py, nicht von Hand ändern.\nwindow.WORTL_WORDS = ')
    json.dump(res, f, ensure_ascii=False, separators=(',',':'))
    f.write(';\n')
