#!/usr/bin/env python3
"""Build downloads/signature-spellcheck-offline.html — the whole checker in one file."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
css = open(os.path.join(ROOT, 'style.css')).read()
js = open(os.path.join(ROOT, 'js/spell.js')).read()
words = open(os.path.join(ROOT, 'data/words.txt')).read().strip()
cp = json.load(open(os.path.join(ROOT, 'data/compiled-patterns.json')))
freq = json.dumps(cp.get('freq', {}), separators=(',', ':'))
pairs = json.dumps(cp.get('pairs', {}), separators=(',', ':'))
body = """<header class="brand"><h1><span class="pen">&#9998;</span> The Signature Spell Check <span style="font-size:.6em;opacity:.7">(offline)</span></h1>
<p>Type a word or a whole document &mdash; works with no internet.</p></header>
<main id="main"><div id="flash" class="card" style="display:none" role="status"></div>
<section class="card"><h2><span class="n">1</span>Check a word</h2>
<div class="typebar"><input id="typebar" type="text" autocomplete="off" placeholder="Type a word&hellip;" aria-label="Type a word to check">
<button class="btn" id="typego" type="button">Check</button></div>
<div class="result" id="typeresult" role="status"></div></section>
<section class="card"><h2><span class="n">2</span>Check your document</h2>
<div class="docwrap"><div class="overlay" id="overlay" aria-hidden="true"></div>
<textarea id="doc" spellcheck="false" aria-label="Your document"></textarea></div>
<div class="docstats" id="docstats"></div>
<div class="btnrow"><button class="btn" id="checkdoc" type="button">Check Document (step-through)</button>
<label style="align-self:center;font-size:.9em"><input type="checkbox" id="actoggle"> AutoCorrect</label></div>
<div class="btnrow"><button class="btn ghost" id="persbtn" type="button">My Dictionary</button>
<button class="btn ghost" id="exportbtn" type="button">Export my words</button></div>
<div id="perslist" style="display:none"></div></section></main>
<div id="sugpop" role="dialog" aria-label="Spelling suggestions"></div>
<div id="dlg-back"><div id="dlg" role="dialog" aria-label="Check document"></div></div>
<footer>The Signature Spell Check &middot; offline single-file build</footer>"""
html = ("<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>"
 "<meta name='viewport' content='width=device-width,initial-scale=1'>"
 "<title>The Signature Spell Check (offline)</title><style>" + css + "</style></head><body>"
 + body
 + "<script>window.OFFLINE_WORDS=" + json.dumps(words) + ";\n"
 + "window.OFFLINE_FREQ=" + freq + ";\nwindow.OFFLINE_PAIRS=" + pairs + ";</script>"
 + "<script>" + js + "</script></body></html>")
out = os.path.join(ROOT, 'downloads/signature-spellcheck-offline.html')
open(out, 'w').write(html)
print('offline built:', os.path.getsize(out)//1024, 'KB')
