# Math AAC workspace

Run `python App/app.py` from the repository root. Restart the server after updating and open http://127.0.0.1:8765/index.html?v=22. An already-open app offers a reload button that preserves the current message.

The command window shows the app address and how to stop the server. Successful file requests and cache checks are quiet; failed requests still appear for troubleshooting.

## What each part does

- **Math Board** builds and speaks mathematical notation with large buttons. Its keypad also calculates offline: arithmetic, powers, roots, logarithms, trigonometry, percentages, factorials, combinations, and permutations. Algebra, Calculus, Greek / Discrete, and Functions are input boards for the shared message. They do not solve equations.
- **Calculator** loads Desmos when first opened online. It stays loaded when changing tabs. Use the new-tab link if the embed is unavailable, or Load / retry to reload it (this resets unsaved Desmos work). Desmos requires internet and is not included in the offline cache.
- **Spell** provides letters, numbers, punctuation, and common words for composing messages.
- **My phrases** saves, edits, and removes up to 20 personal phrases. Quick phrases remain available on every screen. They speak immediately by default; disable that behavior in Settings to preview them first.
- **History** stores the latest 30 Math Board calculations for this session. Restore an expression or speak a result. Desmos calculations are separate.
- **Settings** controls speech and repeated-tap filtering. Its Appearance button opens theme, text, button size, spacing, and symbol settings. Preferences and phrases are saved in this browser.

The message field and Speak button remain available in every tab. Copy a Desmos expression or result into that field to speak it. Direct text entry in Math Board or Calculator uses mathematical pronunciation; spelling and quick phrases use plain text. Settings can override this. Cross-origin embedding does not let the app read Desmos results or resize its internal controls. A deeper integration would use the official Desmos API with a production API key: https://www.desmos.com/api/v1.12/docs/index.html.

## Accessibility and sizing

Button size changes minimum height, padding, and the minimum width of navigation and board buttons. Grids automatically use fewer columns as buttons grow. Text and symbol sizes remain independently adjustable. Settings apply to this app, not the embedded Desmos page. Quick phrases appear below the workspace on small screens.

Cursor controls, selection-aware insertion, Backspace, Clear, and Undo edit support corrections. Button input retains keyboard/switch focus. Stop speech cancels active and pending speech. Escape also stops speech while focus is in this app; keys pressed inside Desmos belong to Desmos.

Device speech is the default. Available voices depend on the operating system and browser. Kokoro and Google Cloud are optional speech engines, with device speech as fallback after a failed request or a 4.5-second timeout. Kokoro needs separately installed packages/models; Google needs server credentials. These are alternatives for voice quality, not requirements for using AAC.

## Math conventions

`log(100)` = 2, `ln(e)` = 1, `%` divides by 100, and `mod(10,3)` = 1. Powers associate right to left: `2^3^2` = 512. `-2^2` = -4. `Ans` retains the previous result at full precision; displayed answers use 12 significant digits. RAD/DEG controls only the local Math Board; Desmos has its own angle setting.

## What was simplified

Removed the duplicate right-hand navigation, repeated Speak buttons, duplicate sentence builder, custom graph renderer, function/domain forms, numerical calculus engine, and their separate keypad dialog. Desmos handles advanced calculation and graphing; the local board preserves large accessible math input, speech, and offline calculations. Speech handling, phrase storage, themes, and offline app caching remain.

## Validation

```powershell
node --test --experimental-test-isolation=none App/tests/math.test.cjs App/tests/speech.test.cjs
python -B -m unittest discover -s App/tests -p test_server.py
```

`tests/browser.cjs` requires Playwright, Microsoft Edge, and a server on port 8766 (`python -B App/app.py --no-browser --port 8766`). It checks navigation, math, AAC speech/editing, settings persistence, button growth and grid reflow, phone overflow, and offline caching. The Desmos response and speech are mocked for reproducibility; live embedding and actual voice output require a separate browser/device check.
