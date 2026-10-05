# For-Specs pull contract — The Signature Spell Check -> Spec Catalog

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
