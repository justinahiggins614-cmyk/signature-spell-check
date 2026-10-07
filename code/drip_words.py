#!/usr/bin/env python3
"""2h drip for The Signature Spell Check (Website 36).

Syncs new dictionary headwords into the wordlist, rebuilds the A-Z files,
re-runs the background compiler (patterns + for-specs exports), rebuilds the
offline page + download parts, restamps counts, commits + pushes.

Silent unless failing. Never invents words: every addition is a real
dictionary headword.
"""
import json, os, re, subprocess, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
DATA = os.path.join(ROOT, "data")
DICT = os.path.expanduser("~/workspace/jah-dictionary/data/definitions/all.jsonl")
# headwords.csv is rebuilt after all.jsonl by the dictionary drip and carries
# newer headwords that never landed in all.jsonl — read both, never invent.
DICT_CSV = os.path.expanduser("~/workspace/jah-dictionary/data/headwords.csv")
GOAL = 1_000_000

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def norm(w):
    w = (w or "").strip()
    if re.fullmatch(r"[A-Za-z][A-Za-z'\-]*", w):
        w = w.lower().strip("'-")
        if len(w) >= 2 or w in ("a", "i"):
            if "'" not in w: return w
    return None

def dict_words():
    out = set()
    if os.path.exists(DICT):
        for line in open(DICT, encoding="utf-8", errors="ignore"):
            line = line.strip()
            if not line: continue
            try: r = json.loads(line)
            except: continue
            w = norm(r.get("w", ""))
            if w: out.add(w)
    if os.path.exists(DICT_CSV):
        import csv
        try:
            for row in csv.DictReader(open(DICT_CSV, encoding="utf-8", errors="ignore")):
                w = norm(row.get("word"))
                if w: out.add(w)
        except Exception:
            pass
    return out

def main():
    wp = os.path.join(DATA, "words.txt")
    cur = {w.strip() for w in open(wp) if w.strip()} if os.path.exists(wp) else set()
    new = sorted(dict_words() - cur)
    if new:
        words = sorted(cur | set(new))
        open(wp, "w").write("\n".join(words))
        # rebuild A-Z
        azd = os.path.join(DATA, "az")
        by = {}
        for w in words: by.setdefault(w[0], []).append(w)
        for L, ws in by.items():
            json.dump(ws, open(os.path.join(azd, L + ".json"), "w"), separators=(",", ":"))
    # recompile patterns + for-specs exports
    r = sh("python3 code/compile_patterns.py"); print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0: sys.exit(1)
    # rebuild offline page + parts
    r = sh("python3 code/build_offline.py"); print(r.stdout.strip() or r.stderr.strip())
    r = sh("python3 - <<'EOF'\nimport json\nlines = open('data/words.txt').readlines()\nN=5\nper=(len(lines)+N-1)//N\nparts=[]\nfor i in range(N):\n    chunk=lines[i*per:(i+1)*per]\n    if not chunk: break\n    fn='words-part-%d.txt'%(i+1); data=''.join(chunk)\n    open('downloads/parts/'+fn,'w').write(data)\n    parts.append({'file':fn,'bytes':len(data.encode('utf-8'))})\njson.dump({'parts':parts,'total_words':len(lines)},open('downloads/manifest.json','w'),indent=1)\nprint('parts rebuilt:',len(parts))\nEOF")
    print(r.stdout.strip() or r.stderr.strip())
    # restamp counts
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    total = len(cur) + len(new)
    for fn, key in (("spellcheck-manifest.json", "total_words"), ("api.json", "words_known")):
        p = os.path.join(ROOT, fn)
        if os.path.exists(p):
            d = json.load(open(p)); d[key] = total; d["updated"] = now
            if "remaining_to_goal" in d: d["remaining_to_goal"] = GOAL - total
            if "progress" in d: d["progress"] = "%d / 1000000 WORDS" % total
            json.dump(d, open(p, "w"), indent=1)
    # guard: never push a bloated data dir
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk("data") for f in fs)
    if size > 800*1024*1024:
        print("GUARD: data over 800MB, not pushing"); sys.exit(2)
    r = sh('git add -A && git -c user.name="JAH System" -c user.email="jah@spellcheck.local" '
           'commit -qm "Spellcheck drip: +%d words (%d total)" && git push -q origin master' % (len(new), total))
    print("drip done: +%d words, %d total" % (len(new), total))

if __name__ == "__main__":
    main()
