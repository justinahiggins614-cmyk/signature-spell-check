#!/usr/bin/env python3
"""Background compiler for The Signature Spell Check (Website 36).

Runs AWAY from users (cron, repo side). Compiles:
  data/compiled-patterns.json — word frequencies + common misspelling pairs,
      loaded by the site to rank suggestions for everyone.
  data/for-specs/vocab.json     — top vocabulary for the Spec Catalog to pull.
  data/for-specs/new-words.json — newly added words, candidates for the
      word-patent pipeline (a word users inspire can become a JAH-WORD draft).
  data/for-specs/README.md      — the pull contract.

Personal words stay on the user's device and are NEVER part of this compile.
"""
import json, os, re, sys
from collections import Counter
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
DICT = os.path.expanduser("~/workspace/jah-dictionary/data/definitions/all.jsonl")

# Curated common misspellings -> correction (American English, hand-reviewed).
PAIRS = {
 "teh":"the","adn":"and","recieve":"receive","seperate":"separate","occured":"occurred",
 "definately":"definitely","goverment":"government","wich":"which","thier":"their",
 "beleive":"believe","untill":"until","happend":"happened","writting":"writing",
 "neccessary":"necessary","tommorrow":"tomorrow","freind":"friend","becuase":"because",
 "exmaple":"example","langauge":"language","knowlege":"knowledge","busines":"business",
 "calender":"calendar","cemetary":"cemetery","changable":"changeable","collegue":"colleague",
 "comming":"coming","compair":"compare","dissapear":"disappear","enviroment":"environment",
 "exagerate":"exaggerate","existense":"existence","experiance":"experience","finaly":"finally",
 "foriegn":"foreign","governer":"governor","grammer":"grammar","harrass":"harass",
 "immediatly":"immediately","independant":"independent","juge":"judge","lenght":"length",
 "liason":"liaison","libary":"library","managment":"management","millenium":"millennium",
 "miniscule":"minuscule","mispell":"misspell","noticable":"noticeable","ocassion":"occasion",
 "persistant":"persistent","playwrite":"playwright","posession":"possession","prefered":"preferred",
 "publically":"publicly","realy":"really","refered":"referred","relevent":"relevant",
 "rythm":"rhythm","sieze":"seize","suprise":"surprise","tatoo":"tattoo","tendancy":"tendency",
 "truely":"truly","useage":"usage","vaccum":"vacuum","villian":"villain","warrent":"warrant",
 "wierd":"weird","writen":"written","accross":"across","arguement":"argument","athiest":"atheist",
 "begining":"beginning","buisness":"business","catagory":"category","colum":"column",
 "commited":"committed","consciencious":"conscientious","dilemna":"dilemma","embarass":"embarrass",
 "excede":"exceed","existence":"existence","flourescent":"fluorescent","foreward":"forward",
 "guage":"gauge","harrassment":"harassment","humourous":"humorous","ignorent":"ignorant",
 "inocence":"innocence","irresistable":"irresistible","kernal":"kernel","leasure":"leisure",
 "maintanance":"maintenance","marraige":"marriage","medeval":"medieval","memento":"memento",
 "millenia":"millennia","miniscule":"minuscule","mischievious":"mischievous","morgage":"mortgage",
 "neice":"niece","nickle":"nickel","nother":"another","nucular":"nuclear","occurance":"occurrence",
 "paralell":"parallel","pasttime":"pastime","pavillion":"pavilion","peice":"piece",
 "percieve":"perceive","personel":"personnel","plagerism":"plagiarism","preceed":"precede",
 "presance":"presence","principle":"principal","promiss":"promise","pronounciation":"pronunciation",
 "quantaty":"quantity","quarentine":"quarantine","queston":"question","reasearch":"research",
 "restarant":"restaurant","rythm":"rhythm","sence":"sense","seperator":"separator",
 "siege":"siege","similiar":"similar","sincerly":"sincerely","speach":"speech",
 "stationary":"stationery","stradegy":"strategy","succesful":"successful","supercede":"supersede",
 "tattooes":"tattoos","threshhold":"threshold","tounge":"tongue","unecessary":"unnecessary",
 "unsuccesful":"unsuccessful","velvetta":"velveta","warrent":"warrant","wendsday":"wednesday",
 "whereever":"wherever","wih":"with","youe":"your",
}

def load_words():
    p = os.path.join(DATA, "words.txt")
    return [w.strip() for w in open(p) if w.strip()] if os.path.exists(p) else []

def main():
    words = load_words()
    wset = set(words)
    # Frequency: count word usage across the dictionary's own definition text
    # (a real, repo-local signal of which words matter).
    freq = Counter()
    if os.path.exists(DICT):
        for line in open(DICT, encoding="utf-8", errors="ignore"):
            line = line.strip()
            if not line: continue
            try: r = json.loads(line)
            except: continue
            d = r.get("d") or []
            txt = " ".join(d).lower()
            for w in re.findall(r"[a-z][a-z']*", txt):
                w = w.strip("'")
                if w in wset: freq[w] += 1
    top = dict(freq.most_common(20000))
    # keep only curated pairs whose correction is a known word
    pairs = {k: v for k, v in PAIRS.items() if v in wset}
    built = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    compiled = {
        "version": 1, "built": built,
        "words": len(words),
        "freq": top, "pairs": pairs,
        "source": ("Background-compiled from the Signature Dictionary's definition text "
                   "(word frequencies) plus a hand-curated misspelling list. "
                   "Personal user words are never included."),
    }
    os.makedirs(DATA, exist_ok=True)
    json.dump(compiled, open(os.path.join(DATA, "compiled-patterns.json"), "w"), separators=(",", ":"))
    # Spec-catalog pull contract
    fs = os.path.join(DATA, "for-specs"); os.makedirs(fs, exist_ok=True)
    vocab = [w for w, _ in freq.most_common(5000)]
    json.dump({"built": built, "vocab": vocab,
               "note": "Top vocabulary by real usage in the Signature library. "
                       "The Spec Catalog (signature-one-archive) may pull this for word choice."},
              open(os.path.join(fs, "vocab.json"), "w"), separators=(",", ":"))
    # New words since last compile -> word-patent candidates
    state_p = os.path.join(DATA, "compiler-state.json")
    prev = set()
    if os.path.exists(state_p):
        try: prev = set(json.load(open(state_p)).get("words", []))
        except: pass
    new_words = sorted(set(words) - prev)
    json.dump({"built": built, "new_words": new_words,
               "count": len(new_words),
               "note": ("Words newly added to the spell-check wordlist. Candidates for the "
                        "word-patent pipeline: each can grow into a JAH-WORD patent draft, "
                        "a word program, and a word-AI.")},
              open(os.path.join(fs, "new-words.json"), "w"), separators=(",", ":"))
    json.dump({"words": words}, open(state_p, "w"))
    readme = """# For-Specs pull contract — The Signature Spell Check -> Spec Catalog

The background compiler (code/compile_patterns.py, cron jah-spellcheck-drip)
publishes two machine-readable feeds for the Spec Catalog (signature-one-archive):

- `vocab.json` — top 5,000 words by real usage frequency in the Signature
  library. The spec generator may pull this for vocabulary choice when
  drafting new specs ("speck maker pulling those").
- `new-words.json` — words newly added to the spell-check wordlist since the
  last compile. Each is a candidate for the word-patent pipeline: a JAH-WORD
  patent draft + word program + word-AI ("all patents users inspire").

Both files carry a `built` timestamp and a `note`. They are JSON, UTF-8,
rewritten atomically by the compiler. Readers must tolerate missing files
(first run) and treat the feeds as advisory, never as the sole vocabulary.
"""
    open(os.path.join(fs, "README.md"), "w").write(readme)
    print("compiled: %d words, %d freq, %d pairs, %d new-words" % (
        len(words), len(top), len(pairs), len(new_words)))

if __name__ == "__main__":
    main()
