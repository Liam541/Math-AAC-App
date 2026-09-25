# Mind2Voice – Math-Focused AAC Application

## Overview

**Mind2Voice** is an Augmentative and Alternative Communication (AAC) application designed to make mathematical communication more accessible for individuals who are nonverbal or have limited speech.

Many existing AAC tools focus primarily on everyday communication. Communicating mathematics can introduce additional challenges because students may need to express equations, mathematical symbols, functions, and other concepts that can be difficult to enter using a conventional AAC interface.

Mind2Voice addresses this problem by providing a **math-focused AAC interface** that combines communication tools with mathematical input and calculation features.

---

## Project Goals

The primary goal of Mind2Voice is to make mathematical communication **simpler, more accessible, and more personalized**.

The application is intended to:

* Provide an accessible way to enter mathematical expressions
* Allow users to communicate mathematical responses through text-to-speech
* Provide quick access to commonly used phrases
* Provide mathematical calculation tools
* Allow the interface to be personalized for individual users
* Support mathematical communication from basic arithmetic through higher-level mathematics
* Give students greater independence when participating in mathematics and STEM courses

---

## Features

### Math Board

The Math Board provides a touch-based interface for entering:

* Numbers
* Letters
* Mathematical symbols
* Equations
* Greek letters
* Other mathematical notation

Different mathematical boards can be selected depending on what the user needs to enter.

The TTS bar is shared by every math board. Tap a tool field or choose it in **Editing** to link it to the bar, then switch tabs to borrow Greek letters, operators, or functions. Typing, selection replacement, Clear, and Backspace update the linked field. Choose **TTS bar / calculator** to return to independent bar entry. **Copy bar to…** transfers existing bar content into any math input without retyping.

**Solve** calculates the selected tool. Integral results appear in the bar with the full integral and answer, ready for **Speak**. **Use answer** makes a numeric result available for the next expression; **Use antiderivative (C = 0)** copies a particular antiderivative for reuse. For example, select Integral · expression, enter `θ^2` with the Greek and Basic boards, set the variable to `θ` and bounds to `0` and `3`, then Solve to display and speak the integral with answer `9`. Functions, discrete results, and graph summaries also have **Send … to TTS bar** controls.

The calculator also keeps **Problem** and **Answer** together, with separate **Speak problem**, **Speak answer**, and **Speak both** buttons. **Stop speaking** cancels speech that is playing or still loading. **Undo** restores recent typing, keypad edits, cleared entries, field copies, and calculator results. The **Editing** label and outlined field show where input goes; **Return to…** brings that field back into view.

**More functions** opens additional keys without changing the main keypad. It also offers labeled fraction and power slots and an optional integral guide through expression, variable, and bounds. **Calculator preferences and phrases** includes plain-language key labels, extra key spacing, a sidebar-free math workspace, reduced button movement, and a live-preview toggle. The text-size and appearance link opens the existing settings. Preferences and five customizable math phrases are saved locally when available; speaking these phrases does not replace the equation. These controls support individual preferences and do not assume a user's mathematical ability.

### Text-to-Speech

Entered responses can be read aloud using text-to-speech functionality.

This allows users to communicate their mathematical responses without needing to verbally produce the response themselves.

### Quick Responses

Users can program commonly used phrases that can be accessed with a single touch.

Examples may include classroom communication such as:

* "I need help."
* "I have an answer."
* "Can you repeat the question?"
* "I am finished."

The exact responses can be customized for individual users.

### Calculator

The application includes a calculator for solving and communicating mathematical problems.

The planned functionality is intended to support multiple types of mathematical operations rather than limiting the application to basic arithmetic.

#### Named functions

Open **Math Board → Functions**, or press **Define functions** below the calculator. Choose **Define f(x)**, enter a rule such as `2x+3`, and press **Save function**. Select the saved function, enter `5` in **Evaluate at**, and press **Evaluate selected function**. The keypad edits the last selected Rule, Evaluate at, or Display field.

For composition, select an outer saved function and an inner function under **Compose with**, enter the inner function's arguments in **Evaluate at**, then press **Evaluate composition**. **Edit selected** loads a definition for editing. **Use in calculator** inserts a call with the cursor inside its parentheses; the calculator also has a saved-function selector and **Insert saved function** button.

You can still type directly into the shared display and press **Evaluate display** in the Functions tab, **ENTER** on the calculator, or Enter on the keyboard:

* Define `f(x)=2x+3`, then evaluate `f(5)` to get `13`.
* Define `g(x)=x^2`, then evaluate `f(g(2))` to get `11`.
* Define compositions directly: `h(t)=f(g(t))`.
* Multiple parameters work too: `h(x,y)=x^2+y^2`, then `h(3,4)` gives `25`.
* Use implied multiplication (`2x`, `2(x+1)`), powers (`^` or `**`), and existing scientific functions. Write `x*y` for products of distinct named variables.
* `y=x^2` is shorthand for `f(x)=x^2`. Angles use radians; `log` and `ln` remain natural logarithms, and `log10` is base ten.

Definitions are saved in this browser when local storage is available. The saved-function selectors and **List functions** show them; saving the same name replaces its definition. Define dependencies first. Invalid or circular definitions leave previous definitions intact. Clear clears the selected keypad field without deleting saved functions. `Ans` retains the last numeric result and is captured when used in a definition.

Evaluation returns real numeric values. Symbolic simplification, equation solving, and step-by-step solutions are not included.

Function tests: `node --test --experimental-test-isolation=none App/tests/functions.test.cjs`.

### Personalized Icons

The interface can be customized for individual users.

Personalized icons are intended to make the application easier to recognize and navigate based on the user's individual preferences and accessibility needs.

### Optional Smart Assistance

An optional smart-assistance system may provide:

* Word suggestions
* Response suggestions
* Autocorrect
* Potential mathematical solution assistance

Smart assistance is considered an optional feature and may depend on the capabilities and scope of the final implementation.

---

## Why an App?

The original project concept involved creating a standalone AAC device. However, meeting the desired 8–12 hours of continuous operation would require a larger battery system and specialized charging equipment, increasing the cost, weight, and complexity of the device.

A mobile application provides a more practical alternative because modern tablets and mobile devices already contain many of the components required by the system.

This approach allows the project to focus on **accessibility, communication, and mathematical functionality** rather than developing custom hardware.

The application is also:

* More portable
* Less expensive
* Easier to update
* Easier to adapt to changing user requirements
* Usable on devices the user may already own

---

## Supported Mathematical Communication

Mind2Voice is intended to support mathematical communication across multiple levels, including:

* Basic arithmetic
* Algebra
* Trigonometry
* Functions
* Mathematical symbols
* Greek letters
* College-level calculus

The goal is not simply to provide a calculator, but to allow the user to **communicate mathematical ideas**.

---

## Technical Approach

### Current source layout

The browser loads `app.js` (boards, navigation, settings, speech), `functions.js` (the shared math engine and tool interfaces), `shared-input.js` (linked editing and Undo), and `calculator-access.js` (calculator accessibility controls). `index.html` contains the layout, and `styles.css` contains the styling. Older standalone copies of the function and math-tool implementations have been removed; update the shared implementation in `functions.js`.

Run locally with `python App/app.py --no-browser`. Run checks with:

```text
node --test --experimental-test-isolation=none App/tests/functions.test.cjs App/tests/math-tools.test.cjs App/tests/runtime.test.cjs
python -B -m unittest discover -s App/tests -p "*_test.py"
```

The full-page runtime tests load scripts in the order declared in `index.html`. When changing cached frontend assets, update their version in `index.html`, `sw.js`, and the startup URL in `app.py` together.

### Software

The proposed technology stack includes:

* **Android / iOS**
* **Python**
* **Text-to-Speech (TTS)**
* **Optional AI**

The application will use a backend programming language such as Python or C++ for application logic and a separate frontend language for the visual interface.

### Interface Structure

The application will use multiple mathematical boards to organize different types of input.

For example, separate boards may contain:

* Numbers
* Letters
* Mathematical symbols
* Greek letters
* Other specialized mathematical inputs

The user will be able to switch between these boards through a touch-based menu.

Each board can contain its own functions and supporting code to help organize the application and make development easier.

---

## Accessibility Considerations

Accessibility is a central component of the project rather than an additional feature.

The interface is being designed around:

* Touch-based interaction
* Simple navigation
* Customizable controls
* Personalized icons
* Text-to-speech output
* Quick-access responses
* Reduced reliance on verbal communication

Because accessibility needs vary between individuals, personalization is an important part of the application's design.

---

## Project Impact

Mind2Voice is intended to address a gap between AAC technology and mathematical communication.

By providing dedicated tools for mathematical input, the application could give nonverbal and limited-speech students more ways to participate in mathematics.

The goal is to help make mathematics and STEM education more accessible while giving users greater independence in the classroom.

> **More accessible communication can create more opportunities to learn, participate, and pursue STEM.**

---

## Project Status

**Current Status:** In Development

Mind2Voice is currently being developed as a student project. Features, technology choices, and implementation details may change as development and testing continue.
