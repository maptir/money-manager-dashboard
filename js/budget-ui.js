// Where the budget lives (this browser's localStorage) and the dialog that edits it.
// The numbers themselves are worked out in budget.js.
(() => {
  "use strict";
  const { fmt0, esc } = MM.ui;
  const S = MM.state;
  const $ = id => document.getElementById(id);
  const KEY = "mm_budget";
  const FILE_NAME = "money-manager-budget.json";

  function load() {
    try { return MM.normalizeBudget(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return MM.normalizeBudget(null); }
  }
  let budget = load();
  // Returns false when the browser refused to store it (the budget still applies until the page is closed).
  function save(next) {
    budget = MM.normalizeBudget(next);
    try {
      if (MM.isEmptyBudget(budget)) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify({ version: 1, ...budget }));
      return true;
    } catch (e) { return false; }
  }

  // ---- dialog ----
  const dlg = $("budgetDialog"), totalInp = $("budgetTotal"), catsEl = $("budgetCats"), hint = $("budgetHint");
  let suggestion = { total: null, categories: {} };
  const catInputs = () => [ ...catsEl.querySelectorAll("input") ];

  function readForm() {
    const categories = {};
    catInputs().forEach(i => { categories[ i.dataset.cat ] = i.value; });
    return MM.normalizeBudget({ total: totalInp.value, categories });
  }
  function fillForm(b) {
    totalInp.value = b.total ?? "";
    catInputs().forEach(i => { i.value = b.categories[ i.dataset.cat ] ?? ""; });
    updateHint();
  }
  function updateHint(message) {
    if (message) { hint.textContent = message; hint.classList.add("badtxt"); return; }
    hint.classList.remove("badtxt");
    const b = readForm(), sum = Object.values(b.categories).reduce((s, v) => s + v, 0);
    hint.textContent = !sum ? "No category budgets — only the total is tracked."
      : b.total ? `Category budgets add up to ${fmt0(sum)} — ${sum > b.total ? `${fmt0(sum - b.total)} more than the total` : `${fmt0(b.total - sum)} of the total is left for everything else`}.`
        : `Category budgets add up to ${fmt0(sum)}.`;
  }

  function open() {
    const today = MM.app.todayIso();
    const history = S.raw.filter(t => t.date <= today);
    suggestion = MM.suggestBudget(history, today.slice(0, 7));
    // every category spent on in the last 12 months, plus any that already has a budget
    const since = MM.shiftMonth(today.slice(0, 7), -12);
    const recent = new Set(history.filter(t => t.type === "Expense" && t.ym >= since).map(t => t.category));
    const cats = [ ...new Set([ ...recent, ...Object.keys(budget.categories), ...Object.keys(suggestion.categories) ]) ]
      .sort((a, b) => (S.catSlot[ a ] ?? 999) - (S.catSlot[ b ] ?? 999));
    totalInp.placeholder = suggestion.total ? `suggested ${suggestion.total.toLocaleString("en-US")}` : "no limit";
    catsEl.innerHTML = cats.map(c => `
      <label class="brow"><span>${esc(c)}</span><input type="number" inputmode="numeric" min="0" step="1" data-cat="${esc(c)}" placeholder="${suggestion.categories[ c ] ? `suggested ${suggestion.categories[ c ].toLocaleString("en-US")}` : "not tracked"}"></label>`).join("");
    $("budgetSuggest").disabled = MM.isEmptyBudget(suggestion);
    fillForm(budget);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  const close = () => { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); };

  $("budgetForm").oninput = () => updateHint();
  $("budgetSuggest").onclick = () => fillForm(suggestion);
  $("budgetClear").onclick = () => fillForm(MM.normalizeBudget(null));
  $("budgetCancel").onclick = close;
  $("budgetForm").onsubmit = e => {
    e.preventDefault();
    const stored = save(readForm());
    close();
    MM.app.render();
    if (!stored) alert("The budget is in use, but this browser would not store it — it will be gone after a reload. Use Export to keep a copy.");
  };

  // copy a budget between devices as a small JSON file
  $("budgetExport").onclick = () => {
    const blob = new Blob([ JSON.stringify({ app: "money-manager-dashboard", version: 1, ...readForm() }, null, 2) ], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const fileInp = $("budgetFile");
  $("budgetImport").onclick = () => fileInp.click();
  fileInp.onchange = async () => {
    const file = fileInp.files[ 0 ];
    fileInp.value = "";
    if (!file) return;
    try {
      const b = MM.normalizeBudget(JSON.parse(await file.text()));
      if (MM.isEmptyBudget(b)) throw new Error("no budget amounts in it");
      // categories in the file that are not listed yet get their own row
      Object.keys(b.categories).filter(c => !catInputs().some(i => i.dataset.cat === c)).forEach(c => {
        catsEl.insertAdjacentHTML("beforeend", `<label class="brow"><span>${esc(c)}</span><input type="number" inputmode="numeric" min="0" step="1" data-cat="${esc(c)}" placeholder="not tracked"></label>`);
      });
      fillForm(b);
    } catch (err) {
      updateHint(`Could not read ${file.name}: ${err.message}. Expected a ${FILE_NAME} exported from this page.`);
    }
  };

  MM.budgetUi = { get: () => budget, open };
})();
