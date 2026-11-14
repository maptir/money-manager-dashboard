// The Transactions tab: search, filter, sort and page through every transaction in the period.
(() => {
  "use strict";
  const { fmt0, fmt2 } = MM.ui;
  const S = MM.state;
  const filtered = () => MM.app.filtered();

  const txState = { q: "", type: "", cat: "", sortKey: "date", sortDir: -1, page: 1 };
  const TX_PAGE_SIZE = 20;
  function populateTxCat() {
    const sel = document.getElementById("txCat");
    sel.innerHTML = '<option value="">All categories</option>';
    [ ...new Set(S.raw.map(t => t.category)) ].sort((a, b) => (S.catSlot[ a ] ?? 99) - (S.catSlot[ b ] ?? 99)).forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
    txState.cat = ""; txState.q = ""; txState.type = ""; txState.page = 1;
    document.getElementById("txSearch").value = "";
    document.getElementById("txType").value = "";
  }
  function renderTxBrowser(list) {
    let rows = list;
    if (txState.type) rows = rows.filter(t => t.type === txState.type);
    if (txState.cat) rows = rows.filter(t => t.category === txState.cat);
    if (txState.q) {
      const q = txState.q.toLowerCase();
      rows = rows.filter(t => `${t.content} ${t.detail} ${t.category} ${t.subCategory}`.toLowerCase().includes(q));
    }
    const expSum = rows.reduce((s, t) => s + (t.type === "Expense" ? t.amount : 0), 0);
    const { sortKey: k, sortDir: dir } = txState;
    rows = rows.slice().sort((a, b) => (a[ k ] > b[ k ] ? 1 : a[ k ] < b[ k ] ? -1 : 0) * dir);
    const pages = Math.max(1, Math.ceil(rows.length / TX_PAGE_SIZE));
    txState.page = Math.min(Math.max(1, txState.page), pages);
    const shown = rows.slice((txState.page - 1) * TX_PAGE_SIZE, txState.page * TX_PAGE_SIZE);
    document.querySelector("#txTable tbody").innerHTML = shown.map(t =>
      `<tr><td>${t.date}</td><td>${t.type}</td><td>${t.category}</td><td>${t.subCategory || ""}</td><td>${(t.content || t.detail || "").slice(0, 60)}</td><td class="num" style="color:${t.type === "Income" ? "var(--good)" : "inherit"}">${fmt2(t.amount)}</td></tr>`).join("");
    document.getElementById("txCount").textContent =
      `${rows.length.toLocaleString()} transactions · ${fmt0(expSum)} expense total`;
    const pager = document.getElementById("txPager");
    const btn = (label, page, disabled) => `<button ${disabled ? "disabled" : ""} data-page="${page}">${label}</button>`;
    pager.innerHTML =
      btn("«", 1, txState.page === 1) +
      btn("‹ Prev", txState.page - 1, txState.page === 1) +
      `<span class="pinfo">page ${txState.page} / ${pages}</span>` +
      btn("Next ›", txState.page + 1, txState.page === pages) +
      btn("»", pages, txState.page === pages);
    pager.querySelectorAll("button[data-page]").forEach(b => {
      b.onclick = () => { txState.page = +b.dataset.page; renderTxBrowser(filtered()); };
    });
  }
  let txDebounce;
  document.getElementById("txSearch").oninput = e => {
    clearTimeout(txDebounce);
    txDebounce = setTimeout(() => { txState.q = e.target.value.trim(); txState.page = 1; renderTxBrowser(filtered()); }, 150);
  };
  document.getElementById("txType").onchange = e => { txState.type = e.target.value; txState.page = 1; renderTxBrowser(filtered()); };
  document.getElementById("txCat").onchange = e => { txState.cat = e.target.value; txState.page = 1; renderTxBrowser(filtered()); };
  document.querySelectorAll("#txTable th").forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      if (txState.sortKey === k) txState.sortDir *= -1;
      else { txState.sortKey = k; txState.sortDir = k === "amount" ? -1 : 1; }
      txState.page = 1;
      renderTxBrowser(filtered());
    };
  });
  // set the table filters from outside (e.g. a category tapped on the This-month tab)
  function setFilter({ cat = "", type = "", q = "" } = {}) {
    Object.assign(txState, { cat, type, q, page: 1 });
    document.getElementById("txCat").value = cat;
    document.getElementById("txType").value = type;
    document.getElementById("txSearch").value = q;
  }

  MM.tx = { render: renderTxBrowser, onData: populateTxCat, setFilter, resetPage: () => { txState.page = 1; } };
})();
