#!/usr/bin/env python3
"""Assemble the Signature Spell Check tool (antivirus-style part download).

  python install.py --assemble

Joins downloads/parts/words-part-N.txt into words.txt, verifies every part
arrived intact against downloads/manifest.json, then reports ready.
One download, then:  python spellcheck.py my-document.txt
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def main():
    if "--assemble" not in sys.argv:
        print(__doc__); return
    man = json.load(open(os.path.join(HERE, "manifest.json")))
    blob = []
    for p in man["parts"]:
        fp = os.path.join(HERE, "parts", p["file"])
        if not os.path.exists(fp):
            print("MISSING PART: %s — download it, then re-run." % p["file"]); return
        data = open(fp, encoding="utf-8").read()
        if len(data.encode("utf-8")) != p["bytes"]:
            print("CORRUPT PART: %s — re-download it." % p["file"]); return
        blob.append(data)
    open(os.path.join(HERE, "words.txt"), "w", encoding="utf-8").write("".join(blob))
    n = sum(1 for _ in open(os.path.join(HERE, "words.txt"), encoding="utf-8"))
    print("assembled words.txt: %d words. Ready: python spellcheck.py my-document.txt" % n)

if __name__ == "__main__":
    main()
