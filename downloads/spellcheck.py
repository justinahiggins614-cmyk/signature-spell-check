#!/usr/bin/env python3
"""Signature Spell Check tool — checks your documents on your own PC.

Usage:
  python spellcheck.py notes.txt            list misspellings + suggestions
  python spellcheck.py notes.txt --fix      write notes.txt.fixed with top suggestions
  python spellcheck.py --add myword         teach it a new word (kept in my-words.txt)

Nothing leaves your PC. Word list: words.txt (assembled by install.py).
Your words: my-words.txt. Background-compiled pairs: compiled-patterns.json.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def load_words():
    ws = set()
    for fn in ("words.txt", "my-words.txt"):
        p = os.path.join(HERE, fn)
        if os.path.exists(p):
            ws |= {w.strip().lower() for w in open(p, encoding="utf-8") if w.strip()}
    return ws

def load_pairs():
    p = os.path.join(HERE, "compiled-patterns.json")
    if os.path.exists(p):
        try:
            cp = json.load(open(p)); return cp.get("pairs", {}), cp.get("freq", {})
        except: pass
    return {}, {}

ALPHA = "abcdefghijklmnopqrstuvwxyz"
def edits1(w):
    out = set()
    for i in range(len(w)): out.add(w[:i] + w[i+1:])
    for i in range(len(w)-1): out.add(w[:i] + w[i+1] + w[i] + w[i+2:])
    for i in range(len(w)):
        for a in ALPHA: out.add(w[:i] + a + w[i+1:])
    for i in range(len(w)+1):
        for a in ALPHA: out.add(w[:i] + a + w[i:])
    return out

def suggest(w, words, pairs, freq, limit=5):
    w = w.lower()
    out = []
    if w in pairs and pairs[w] in words: out.append(pairs[w])
    cands = sorted((c for c in edits1(w) if c in words and c != w),
                   key=lambda c: (-freq.get(c, 0), abs(len(c)-len(w)), c))
    for c in cands:
        if c not in out: out.append(c)
    return out[:limit]

def check_file(path, words, pairs, freq):
    problems = []
    with open(path, encoding="utf-8", errors="ignore") as f:
        for ln, line in enumerate(f, 1):
            for m in re.finditer(r"[A-Za-z][A-Za-z']*", line):
                w = m.group(0).strip("'")
                lw = w.lower()
                if len(lw) > 1 and lw not in words:
                    problems.append((ln, w, suggest(w, words, pairs, freq)))
    return problems

def main():
    args = sys.argv[1:]
    if "--add" in args:
        i = args.index("--add")
        if i+1 >= len(args): print("give a word: --add myword"); return
        w = args[i+1].strip().lower()
        p = os.path.join(HERE, "my-words.txt")
        have = set()
        if os.path.exists(p): have = {x.strip() for x in open(p)}
        if w not in have:
            open(p, "a").write(w + "\n")
        print("learned: %s" % w)
        return
    files = [a for a in args if not a.startswith("--")]
    if not files:
        print(__doc__); return
    words = load_words()
    if not words:
        print("words.txt not found — run: python install.py --assemble"); return
    pairs, freq = load_pairs()
    print("%d words known." % len(words))
    for path in files:
        if not os.path.exists(path):
            print("not found: %s" % path); continue
        probs = check_file(path, words, pairs, freq)
        print("\n%s: %d flagged" % (path, len(probs)))
        for ln, w, sugs in probs[:200]:
            print("  line %d: %s%s" % (ln, w, (" -> " + ", ".join(sugs)) if sugs else ""))
        if len(probs) > 200: print("  ... and %d more" % (len(probs)-200))
        if "--fix" in args and probs:
            with open(path, encoding="utf-8", errors="ignore") as f:
                text = f.read()
            for _, w, sugs in probs:
                if sugs:
                    text = re.sub(r"\b%s\b" % re.escape(w), sugs[0], text)
            out = path + ".fixed"
            open(out, "w", encoding="utf-8").write(text)
            print("wrote %s" % out)

if __name__ == "__main__":
    main()
