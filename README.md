# Mind2Voice — Math AAC

A local web app for entering, calculating, and speaking mathematics. It includes a shared number pad, scientific and Greek symbols, named functions, integrals, discrete math, and graphs.

## Run

```text
python App/app.py
```

The app opens at http://127.0.0.1:8765/. Use `--no-browser` to start only the server, or `--port 8766` to choose another port. Keep the server running for local neural speech. The standard entry page is `App/index.html`; old `index (1).html` bookmarks redirect to it.

### Install local neural voices

```text
python -m pip install -r App/requirements-kokoro.txt
python App/app.py --setup-voices
```

Setup downloads the Kokoro model, pronunciation resources, and nine voices while online. Normal operation uses those resources offline. On Windows, `pip install --target C:\MathAAC-Kokoro -r App/requirements-kokoro.txt` avoids long installation paths. Set `KOKORO_PACKAGE_DIR` if using another location.

Heart is the default voice. Settings provides voice, speed, volume, and a voice test. The model stays loaded and caches recent utterances (up to 16 MiB / 64 entries). If Kokoro is unavailable, speech falls back to an installed local device voice; remote browser voices are excluded. Opening the HTML without the server uses this fallback.

## Use the workspace

- **Math and speech bar:** input math to solve or speak. Speak reads the entry; Speak answer reads the last solved answer. Stop cancels playback and pending speech requests. Clear erases the current entry; Undo restores edits and calculations, including function definitions.
- **Shared fields:** tap a tool field, then use the number pad or borrow symbols from Scientific, Algebra, Greek, or Letters. The editing label identifies the destination. Return to field opens its screen; Done editing field returns to independent bar entry.
- **Solve:** calculates the linked tool, or evaluates independent bar input. Enter works too. Tool-specific buttons such as Solve integral, Calculate, Plot, and Evaluate act on their forms.
- **Algebra:** build a fraction or power and insert it at the original editing position. Equality and comparison symbols can be spoken; general equation solving and comparison evaluation are not supported.
- **Letters:** Write a message joins letter taps into words. Use the large Space key between words; Speak reads the complete message without interpreting its punctuation as math. Enter also speaks an independent message. Letters for math preserves symbol entry into a linked tool field. When borrowing letters from a math field, that mode stays selected until you choose Write a message.
- **Greek:** Common uses connects pi to circles, theta to angles, mu to a population mean, and lowercase sigma to population standard deviation. Tap a symbol to insert it; Try example prepares a circle calculation or an editable function draft. Save the draft, then Evaluate the supplied example input. Capital Sigma and Pi open the sum and product editors in Discrete. More letters retains the other Greek variables. Meanings depend on the problem; Greek letters are not automatically assigned numeric values.
- **Integrals:** choose definite or indefinite, enter the expression and variable, and supply bounds when needed. Solved notation appears in the bar. Use answer reuses the number; Use antiderivative (C = 0) reuses a particular antiderivative. Symbolic integration supports a limited set of forms; definite integrals are numerical approximations.
- **Discrete:** choose Counting, Sets, Logic, or Sequences, then one of that group's operations. Plain-language guidance explains order, repetition, set membership, and truth values. Try example prepares teams/rankings, fruit sets, pencil/paper statements, or the sequence 1 through 4. Edit the inputs and Calculate. Speak result reads an explanation; Send result to bar keeps that explanation available through the main Speak button. Changed inputs and errors must be recalculated first. Set entries are case-sensitive; empty sets are allowed. Logic evaluates the truth values you supply, not the factual truth of typed statements.
- **Graph:** plot a rule or saved one-variable function, adjust the window, and use Find y to evaluate a point. Graphs and integrals use radians; the scientific calculator can switch between radians and degrees.
- **Appearance:** change theme, text size, button movement, and live previews. Preferences and named functions save in this browser when local storage is available.

### Named functions

Use Functions → Define to enter a name, variables, and rule. Evaluate accepts values; Compose combines an outer and inner function. Edit rule returns to the definition form. Use in calculator inserts a call with the cursor inside its parentheses.

You can also enter these in the bar and press Solve:

```text
f(x)=2x+3
f(5)          → 13
g(x)=x^2
f(g(2))       → 11
h(x,y)=x^2+y^2
h(3,4)        → 25
```

Implied multiplication (`2x`, `2(x+1)`), powers (`^` or `**`), and scientific functions work. Use `x*y` for products of distinct named variables. `y=x^2` defines `f(x)`. `log` and `ln` are natural logarithms; `log10` is base ten. `Ans` is the last numeric answer and is captured when saving a definition. Invalid definitions leave existing definitions intact. Clear does not delete saved functions.

The left tool panel takes about 70% of the calculator width. Its controls have at least 64 × 64 CSS-pixel targets; integral and fraction inputs are taller. The palette and button styling are unchanged. Shorter screens scroll rather than shrinking these targets, and narrow screens stack the tools and number pad. Browser checks cover desktop, tablet, and phone widths at 18 and 24 px text sizes. These checks do not replace usability testing with the intended users.

### Research behind the tools

- [OpenStax: Angles](https://openstax.org/books/precalculus-2e/pages/5-1-angles) and [Measures of the Spread of the Data](https://openstax.org/books/introductory-statistics-2e/pages/2-7-measures-of-the-spread-of-the-data) inform the angle and population-statistics examples.
- [OpenStax: Series and Their Notations](https://openstax.org/books/algebra-and-trigonometry-2e/pages/13-4-series-and-their-notations) connects capital Sigma with finite sums.
- Oscar Levin's *Discrete Mathematics: An Open Introduction*: [counting](https://discrete.openmathbooks.org/dmoi4/sec_counting-combperm.html), [sets and sequences](https://discrete.openmathbooks.org/dmoi4/sec_intro-structures.html), and [implications](https://discrete.openmathbooks.org/dmoi4/sec_logic-implications.html) inform the task groups and examples.
- [W3C cognitive accessibility guidance](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/) supports clear labels, short explanations, and familiar examples. The specific 64-pixel target size is a design choice for this app.

## Source and checks

| File | Purpose |
| --- | --- |
| `App/index.html` | Page structure and controls |
| `App/styles.css` | Layout and themes |
| `App/app.js` | Boards, navigation, settings, and speech |
| `App/functions.js` | Math engine and tool forms |
| `App/workspace.js` | Shared editing, Undo, previews, and expression builders |
| `App/app.py` | Local server and Kokoro speech |
| `App/sw.js`, `App/manifest.json` | Offline app shell and installation metadata |
| `App/requirements-kokoro.txt` | Local speech dependencies |
| `App/tests/` | Math, runtime, server, and browser regressions |

```text
node --test --experimental-test-isolation=none App/tests/functions.test.cjs App/tests/math-tools.test.cjs App/tests/runtime.test.cjs
python -B -m unittest discover -s App/tests -p "*_test.py"
```

For real-browser checks, run the app on port 8766 and an isolated Chrome session with `--remote-debugging-port=9224`, then run `node App/tests/layout-check.cjs`. It checks screen layout, touch targets, overlap, and button workflows. Screenshots are written to the system temporary directory.

When changing frontend assets, update the cache version in `index.html`, `sw.js`, and the startup URL in `app.py` together. No build step or JavaScript package installation is required.
