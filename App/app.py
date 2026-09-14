"""Math AAC: an accessible communication and STEM workspace."""

from __future__ import annotations

import ast
import math
import operator
import re
import subprocess
import threading
import tkinter as tk
from tkinter import ttk
from typing import Callable


COLORS = {
	"light": {"bg": "#eef3f6", "panel": "#ffffff", "ink": "#17212b", "muted": "#52606d", "accent": "#1769aa", "soft": "#d9ecfa", "action": "#dff3e5"},
	"high": {"bg": "#11151a", "panel": "#1d252d", "ink": "#ffffff", "muted": "#d5e2ec", "accent": "#69c5ff", "soft": "#264a63", "action": "#315d42"},
	"warm": {"bg": "#f6f0e7", "panel": "#fffdf8", "ink": "#302b27", "muted": "#685c52", "accent": "#a34f24", "soft": "#f6d9ba", "action": "#dff0d5"},
}
ELEMENTS = {"H": 1.008, "He": 4.003, "C": 12.011, "N": 14.007, "O": 15.999, "F": 18.998, "Na": 22.990, "Mg": 24.305, "Al": 26.982, "Si": 28.085, "P": 30.974, "S": 32.06, "Cl": 35.45, "K": 39.098, "Ca": 40.078, "Fe": 55.845, "Cu": 63.546, "Zn": 65.38, "Ag": 107.868, "I": 126.904, "Ba": 137.327, "Au": 196.967, "Hg": 200.592}


def formula_mass(formula: str) -> tuple[float, dict[str, int]]:
	tokens = re.findall(r"[A-Z][a-z]?|\d+|[()]", formula.replace(" ", ""))
	if not tokens or "".join(tokens) != formula.replace(" ", ""):
		raise ValueError("Use a formula such as H2O or Ca(OH)2.")
	groups: list[dict[str, int]] = [{}]
	index = 0
	while index < len(tokens):
		token = tokens[index]
		if token == "(": groups.append({})
		elif token == ")":
			if len(groups) == 1: raise ValueError("Mismatched parentheses.")
			nested = groups.pop(); multiplier = 1
			if index + 1 < len(tokens) and tokens[index + 1].isdigit(): multiplier = int(tokens[index + 1]); index += 1
			for element, count in nested.items(): groups[-1][element] = groups[-1].get(element, 0) + count * multiplier
		elif token.isdigit(): raise ValueError("A number must follow an element or closing parenthesis.")
		else:
			if token not in ELEMENTS: raise ValueError(f"Unknown element: {token}")
			count = 1
			if index + 1 < len(tokens) and tokens[index + 1].isdigit(): count = int(tokens[index + 1]); index += 1
			groups[-1][token] = groups[-1].get(token, 0) + count
		index += 1
	if len(groups) != 1: raise ValueError("Mismatched parentheses.")
	counts = groups[0]
	return sum(ELEMENTS[element] * count for element, count in counts.items()), counts


SAFE_FUNCTIONS = {name: getattr(math, name) for name in ("sin", "cos", "tan", "sqrt", "log", "log10", "exp", "factorial", "ceil", "floor")}
SAFE_FUNCTIONS["abs"] = abs
SAFE_NAMES = {"pi": math.pi, "e": math.e, "tau": math.tau, "inf": math.inf}
SAFE_OPERATORS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv}


def calculate_expression(expression: str) -> float:
	expression = expression.replace("π", "pi").replace("∞", "inf").replace("×", "*").replace("÷", "/").replace("^", "**")
	tree = ast.parse(expression, mode="eval")
	def visit(node: ast.AST) -> float:
		if isinstance(node, ast.Expression): return visit(node.body)
		if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)): return float(node.value)
		if isinstance(node, ast.Name) and node.id in SAFE_NAMES: return float(SAFE_NAMES[node.id])
		if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in SAFE_FUNCTIONS: return float(SAFE_FUNCTIONS[node.func.id](*(visit(arg) for arg in node.args)))
		if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
			value = visit(node.operand); return value if isinstance(node.op, ast.UAdd) else -value
		if isinstance(node, ast.BinOp) and type(node.op) in SAFE_OPERATORS: return float(SAFE_OPERATORS[type(node.op)](visit(node.left), visit(node.right)))
		raise ValueError("Use numbers, + - * / ^, parentheses, and listed functions.")
	return visit(tree)


class Speech:
	def __init__(self) -> None:
		self.engine = None
		try:
			import pyttsx3  # type: ignore
			self.engine = pyttsx3.init()
		except Exception: pass

	def speak(self, text: str) -> None:
		if not text.strip(): return
		def run() -> None:
			try:
				if self.engine: self.engine.say(text); self.engine.runAndWait(); return
				if __import__("sys").platform == "win32":
					safe = text.replace("'", "''")
					command = f"Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('{safe}')"
					subprocess.run(["powershell", "-NoProfile", "-Command", command], check=False, creationflags=0x08000000)
			except Exception: pass
		threading.Thread(target=run, daemon=True).start()


class MathAACApp(tk.Tk):
	def __init__(self) -> None:
		super().__init__(); self.title("Math AAC Workspace"); self.geometry("1220x820"); self.minsize(980, 680)
		self.speech = Speech(); self.theme_name = tk.StringVar(value="light"); self.font_size = tk.IntVar(value=16); self.display = tk.StringVar(); self.status = tk.StringVar(value="Ready. Choose a phrase, symbol, or tool."); self.apply_theme(); self.build_header(); self.build_tabs()

	@property
	def palette(self) -> dict[str, str]: return COLORS[self.theme_name.get()]

	def apply_theme(self) -> None:
		palette = self.palette; self.configure(bg=palette["bg"]); style = ttk.Style(self); style.theme_use("clam")
		style.configure("TNotebook", background=palette["bg"], borderwidth=0); style.configure("TNotebook.Tab", background=palette["panel"], foreground=palette["ink"], padding=(20, 11), font=("Segoe UI", self.font_size.get(), "bold")); style.map("TNotebook.Tab", background=[("selected", palette["soft"])], foreground=[("selected", palette["accent"])])
		style.configure("TLabel", background=palette["panel"], foreground=palette["ink"], font=("Segoe UI", self.font_size.get())); style.configure("TLabelframe", background=palette["panel"], foreground=palette["ink"], font=("Segoe UI", self.font_size.get(), "bold")); style.configure("TLabelframe.Label", background=palette["panel"], foreground=palette["ink"]); style.configure("TButton", background=palette["panel"], foreground=palette["ink"], padding=(10, 8), font=("Segoe UI", self.font_size.get())); style.map("TButton", background=[("active", palette["soft"])])
		style.configure("Accent.TButton", background=palette["soft"], foreground=palette["accent"], font=("Segoe UI", self.font_size.get(), "bold")); style.configure("Action.TButton", background=palette["action"], foreground=palette["ink"], font=("Segoe UI", self.font_size.get(), "bold")); style.configure("TEntry", fieldbackground=palette["panel"], foreground=palette["ink"], insertcolor=palette["ink"], padding=8, font=("Segoe UI", self.font_size.get())); style.configure("TCheckbutton", background=palette["panel"], foreground=palette["ink"], font=("Segoe UI", self.font_size.get()))

	def build_header(self) -> None:
		header = tk.Frame(self, bg=self.palette["bg"], padx=18, pady=14); header.pack(fill="x"); tk.Label(header, text="MATH AAC", bg=self.palette["bg"], fg=self.palette["accent"], font=("Segoe UI", 24, "bold")).pack(side="left"); tk.Label(header, text="Communication, mathematics, and chemistry", bg=self.palette["bg"], fg=self.palette["muted"], font=("Segoe UI", 12)).pack(side="left", padx=18); ttk.Button(header, text="🔊 Speak", style="Accent.TButton", command=self.speak_display).pack(side="right")

	def build_tabs(self) -> None:
		self.tabs = ttk.Notebook(self); self.tabs.pack(fill="both", expand=True, padx=14, pady=(0, 14)); self.communication_tab = tk.Frame(self.tabs, bg=self.palette["bg"]); self.math_tab = tk.Frame(self.tabs, bg=self.palette["bg"]); self.chem_tab = tk.Frame(self.tabs, bg=self.palette["bg"]); self.settings_tab = tk.Frame(self.tabs, bg=self.palette["bg"])
		for tab, title in ((self.communication_tab, "Communication"), (self.math_tab, "Math Board"), (self.chem_tab, "Chemistry"), (self.settings_tab, "Settings")): self.tabs.add(tab, text=title)
		self.build_communication(); self.build_math(); self.build_chemistry(); self.build_settings()

	def panel(self, parent: tk.Misc, title: str) -> ttk.LabelFrame:
		frame = ttk.LabelFrame(parent, text=title, padding=12); frame.pack(fill="both", expand=True, padx=10, pady=10); return frame

	def build_display(self, parent: tk.Misc) -> None:
		row = tk.Frame(parent, bg=self.palette["panel"]); row.pack(fill="x", pady=(10, 0)); ttk.Entry(row, textvariable=self.display, font=("Segoe UI", self.font_size.get() + 5)).pack(side="left", fill="x", expand=True, ipady=14); ttk.Button(row, text="🔊 Speak", style="Accent.TButton", command=self.speak_display).pack(side="left", padx=(10, 0), fill="y"); ttk.Button(row, text="⌫", command=lambda: self.display.set(self.display.get()[:-1])).pack(side="left", padx=(6, 0), fill="y"); ttk.Button(row, text="Clear", command=lambda: self.display.set("")).pack(side="left", padx=(6, 0), fill="y")

	def add_key(self, parent: tk.Misc, text: str, row: int, column: int, command: Callable[[], None] | None = None, style: str = "") -> None:
		ttk.Button(parent, text=text, style=style, command=command or (lambda: self.display.set(self.display.get() + text))).grid(row=row, column=column, sticky="nsew", padx=4, pady=4, ipadx=8, ipady=10)

	def build_communication(self) -> None:
		self.build_display(self.communication_tab); left = self.panel(self.communication_tab, "Quick phrases"); left.pack(side="left", fill="both", expand=True); right = self.panel(self.communication_tab, "Sentence builder"); right.pack(side="left", fill="both", expand=True)
		phrases = ["I need help", "I have a question", "I am ready", "I don't understand", "Can you repeat that?", "I need more time", "Thank you", "Please wait", "Yes", "No"]
		for index, phrase in enumerate(phrases): ttk.Button(left, text=phrase, command=lambda value=phrase: self.set_and_speak(value)).grid(row=index // 2, column=index % 2, sticky="ew", padx=5, pady=5, ipadx=4, ipady=9)
		left.columnconfigure(0, weight=1); left.columnconfigure(1, weight=1); words = ["I", "need", "want", "like", "feel", "more", "less", "to", "go", "stop", "because", "today"]
		for index, word in enumerate(words): ttk.Button(right, text=word, command=lambda value=word: self.append_word(value)).grid(row=index // 3, column=index % 3, sticky="ew", padx=5, pady=5, ipadx=4, ipady=9)
		for column in range(3): right.columnconfigure(column, weight=1)
		ttk.Button(right, text="🔊 Speak sentence", style="Action.TButton", command=self.speak_display).grid(row=5, column=0, columnspan=3, sticky="ew", pady=14, ipady=7)

	def set_and_speak(self, text: str) -> None:
		self.display.set(text)
		if self.auto_speak.get(): self.speech.speak(text)
		self.status.set(f"Phrase selected: {text}")
	def append_word(self, word: str) -> None: self.display.set(f"{self.display.get().strip()} {word}".strip())
	def speak_display(self) -> None: self.speech.speak(self.display.get()); self.status.set("Speaking current display.")

	def build_math(self) -> None:
		self.build_display(self.math_tab); board = self.panel(self.math_tab, "Math keyboard"); board.pack(side="left", fill="both", expand=True); tools = self.panel(self.math_tab, "Math tools"); tools.pack(side="right", fill="y", padx=(0, 10)); keys = [["7", "8", "9", "÷", "⌫"], ["4", "5", "6", "×", "("], ["1", "2", "3", "-", ")"], ["0", ".", "+", "^", "="], ["π", "e", "∞", "√", "|x|"]]
		for row, values in enumerate(keys):
			for column, key in enumerate(values):
				command = (lambda: self.display.set(self.display.get()[:-1])) if key == "⌫" else self.evaluate_math if key == "=" else (lambda: self.display.set(self.display.get() + "sqrt(")) if key == "√" else (lambda: self.display.set(self.display.get() + "abs(")) if key == "|x|" else None
				self.add_key(board, key, row, column, command, "Accent.TButton" if key == "=" else "")
		for column in range(5): board.columnconfigure(column, weight=1)
		for row in range(5): board.rowconfigure(row, weight=1)
		functions = [("sin", "sin("), ("cos", "cos("), ("tan", "tan("), ("log", "log("), ("ln", "log("), ("n!", "factorial("), ("d/dx", "Derivative: "), ("Σ sum", "Sum: "), ("∫ integral", "Integral: "), ("≤  ≥", " ≤ ")]
		for label, value in functions: ttk.Button(tools, text=label, command=lambda insert=value: self.display.set(self.display.get() + insert)).pack(fill="x", pady=3)
		ttk.Label(tools, text="Greek and discrete symbols").pack(anchor="w", pady=(10, 3))
		symbols = tk.Frame(tools, bg=self.palette["panel"]); symbols.pack(fill="x")
		for index, symbol in enumerate(("α", "β", "γ", "δ", "θ", "λ", "μ", "σ", "φ", "ω", "∧", "∨", "∩", "∪", "→", "≠", "≤", "≥")):
			ttk.Button(symbols, text=symbol, width=3, command=lambda value=symbol: self.display.set(self.display.get() + value)).grid(row=index // 6, column=index % 6, padx=1, pady=1)
		ttk.Button(tools, text="Evaluate", style="Action.TButton", command=self.evaluate_math).pack(fill="x", pady=(16, 3)); ttk.Button(tools, text="🔊 Read result", command=self.speak_display).pack(fill="x", pady=3); tk.Label(self.math_tab, textvariable=self.status, bg=self.palette["bg"], fg=self.palette["muted"], anchor="w").pack(fill="x", padx=14, pady=(0, 8))

	def evaluate_math(self) -> None:
		try:
			result = calculate_expression(self.display.get().strip()); self.display.set(f"{result:g}"); self.status.set(f"Result: {result:g}")
		except Exception as error: self.status.set(f"Could not evaluate: {error}")

	def build_chemistry(self) -> None:
		left = self.panel(self.chem_tab, "Formula and molar mass"); left.pack(side="left", fill="both", expand=True); right = self.panel(self.chem_tab, "Stoichiometry workspace"); right.pack(side="left", fill="both", expand=True); ttk.Label(left, text="Chemical formula").pack(anchor="w"); formula = tk.StringVar(value="H2O"); ttk.Entry(left, textvariable=formula).pack(fill="x", pady=5); result = tk.StringVar(value="Enter a formula and calculate.")
		def mass() -> None:
			try: value, counts = formula_mass(formula.get()); result.set(f"Molar mass: {value:.3f} g/mol\nAtoms: " + "  ".join(f"{element}: {count}" for element, count in counts.items())); self.display.set(formula.get())
			except ValueError as error: result.set(str(error))
		ttk.Button(left, text="Calculate molar mass", style="Action.TButton", command=mass).pack(fill="x", pady=7); tk.Label(left, textvariable=result, justify="left", anchor="nw", bg=self.palette["panel"], fg=self.palette["ink"], wraplength=400).pack(fill="both", expand=True, pady=10)
		fields = {}
		for label, default in (("Substance formula", "H2O"), ("Amount in grams", "18")): ttk.Label(right, text=label).pack(anchor="w"); value = tk.StringVar(value=default); fields[label] = value; ttk.Entry(right, textvariable=value).pack(fill="x", pady=5)
		stoich_result = tk.StringVar(value="Enter a substance and mass.")
		def stoich() -> None:
			try:
				molar_mass, _ = formula_mass(fields["Substance formula"].get()); grams = float(fields["Amount in grams"].get()); moles = grams / molar_mass; stoich_result.set(f"{grams:g} g {fields['Substance formula'].get()}\n= {moles:.5g} mol\nMolar mass = {molar_mass:.3f} g/mol"); self.display.set(stoich_result.get().replace("\n", ", "))
			except (ValueError, ZeroDivisionError) as error: stoich_result.set(f"Check the inputs: {error}")
		ttk.Button(right, text="Convert grams to moles", style="Action.TButton", command=stoich).pack(fill="x", pady=7); ttk.Button(right, text="🔊 Read calculation", command=lambda: self.speech.speak(stoich_result.get())).pack(fill="x", pady=3); tk.Label(right, textvariable=stoich_result, justify="left", anchor="nw", bg=self.palette["panel"], fg=self.palette["ink"], wraplength=400).pack(fill="both", expand=True, pady=10); ttk.Label(right, text="Common formulas").pack(anchor="w")
		for name in ("H2O", "CO2", "NaCl", "Ca(OH)2", "C6H12O6", "H2SO4"): ttk.Button(right, text=name, command=lambda value=name: fields["Substance formula"].set(value)).pack(side="left", padx=2, pady=3)

	def build_settings(self) -> None:
		frame = self.panel(self.settings_tab, "Personalize the workspace"); ttk.Label(frame, text="Color theme").pack(anchor="w", pady=(0, 5)); ttk.Combobox(frame, textvariable=self.theme_name, values=list(COLORS), state="readonly").pack(anchor="w"); ttk.Button(frame, text="Apply theme", command=self.refresh_theme).pack(anchor="w", pady=8); ttk.Label(frame, text="Button and text size").pack(anchor="w", pady=(12, 5)); tk.Scale(frame, from_=12, to=24, orient="horizontal", variable=self.font_size, showvalue=True, bg=self.palette["panel"], fg=self.palette["ink"], highlightthickness=0, command=lambda _: self.refresh_theme()).pack(anchor="w", fill="x"); ttk.Label(frame, text="Accessibility choices").pack(anchor="w", pady=(20, 5)); self.auto_speak = tk.BooleanVar(value=False); ttk.Checkbutton(frame, text="Speak quick phrases immediately", variable=self.auto_speak).pack(anchor="w", pady=4); ttk.Checkbutton(frame, text="Keep display focused after actions", variable=tk.BooleanVar(value=True)).pack(anchor="w", pady=4); ttk.Label(frame, text="Speech uses pyttsx3 when installed, with Windows Speech fallback.").pack(anchor="w", pady=(20, 4))

	def refresh_theme(self) -> None:
		for child in self.winfo_children(): child.destroy()
		self.apply_theme(); self.build_header(); self.build_tabs()


if __name__ == "__main__": MathAACApp().mainloop()
