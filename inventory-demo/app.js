(function () {
  "use strict";
  const API = window.InventoryPlanner;
  if (!API) return;

  const numberFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
  const decimalFmt = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const settingNodes = Array.from(document.querySelectorAll("[data-setting]"));
  const periodNodes = Array.from(document.querySelectorAll("[data-period][data-field]"));
  const planButtons = Array.from(document.querySelectorAll("[data-plan]"));
  const statusNode = document.getElementById("solve-status");
  const resetButton = document.getElementById("reset-button");
  let latestResult = null;
  let selectedPlan = "exact";
  let timer = null;

  function fmt(value) { return numberFmt.format(Math.round(Number(value) || 0)); }
  function fmtDecimal(value) { return decimalFmt.format(Number(value) || 0); }
  function setStatus(message, kind) {
    statusNode.className = "solve-status" + (kind ? " is-" + kind : "");
    statusNode.replaceChildren();
    const mark = document.createElement("span");
    mark.className = "status-mark";
    mark.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = message;
    statusNode.append(mark, text);
  }
  function readConfig() {
    let invalid = null;
    const settings = {};
    for (const node of settingNodes) {
      const value = Number(node.value);
      const valid = node.value.trim() !== "" && Number.isInteger(value) &&
        value >= Number(node.min) && value <= Number(node.max);
      node.setAttribute("aria-invalid", valid ? "false" : "true");
      if (!valid && !invalid) invalid = node;
      settings[node.dataset.setting] = value;
    }
    const rows = Array.from({ length: 6 }, () => ({}));
    for (const node of periodNodes) {
      const period = Number(node.dataset.period);
      const field = node.dataset.field;
      const value = Number(node.value);
      const valid = node.value.trim() !== "" && Number.isInteger(value) &&
        value >= Number(node.min) && value <= Number(node.max);
      node.setAttribute("aria-invalid", valid ? "false" : "true");
      if (!valid && !invalid) invalid = node;
      rows[period][field] = value;
    }
    if (settings.initialInventory > settings.storageCapacity) {
      const node = settingNodes.find(item => item.dataset.setting === "initialInventory");
      node.setAttribute("aria-invalid", "true");
      invalid = invalid || node;
    }
    if (invalid) return { error: "یکی از ورودی‌ها خالی یا خارج از محدوده است. موجودی اولیه نیز نباید از ظرفیت انبار بیشتر باشد." };
    return {
      value: {
        settings,
        demands: rows.map(row => row.demand),
        prices: rows.map(row => row.price)
      }
    };
  }

  function clearInvalidFlags() {
    settingNodes.concat(periodNodes).forEach(node => node.setAttribute("aria-invalid", "false"));
  }

  function setMetric(prefix, plan) {
    const warning = document.getElementById(prefix + "-warning");
    if (warning) warning.hidden = true;
    const fields = [
      ["total", plan.totalCost],
      ["order-count", plan.orderCount],
      ["purchase", plan.purchaseCost],
      ["fixed", plan.orderingCost],
      ["holding", plan.holdingCost],
      ["ending", plan.endingInventory]
    ];
    for (const [suffix, value] of fields) {
      document.getElementById(prefix + "-" + suffix).textContent = fmt(value);
    }
  }
  function setInfeasible(prefix, message) {
    ["total", "order-count", "purchase", "fixed", "holding", "ending"].forEach(suffix => {
      document.getElementById(prefix + "-" + suffix).textContent = "—";
    });
    const warning = document.getElementById(prefix + "-warning");
    warning.textContent = message;
    warning.hidden = false;
  }
  function renderMetrics() {
    const result = latestResult;
    if (!result) return;
    document.getElementById("simple-warning").hidden = true;
    if (result.baseline.feasible) setMetric("simple", result.baseline);
    else setInfeasible("simple", result.baseline.reason);
    if (result.exact.feasible) setMetric("exact", result.exact);
    else setInfeasible("exact", result.exact.reason);

    const note = document.getElementById("comparison-note");
    note.classList.remove("is-warning");
    if (!result.exact.feasible) {
      note.textContent = "با محدودیت‌های فعلی، هیچ برنامهٔ شدنی برای پوشش همهٔ تقاضاها پیدا نشد. ظرفیت سفارش یا فضای انبار را افزایش دهید.";
      note.classList.add("is-warning");
    } else if (!result.baseline.feasible) {
      note.textContent = "سیاست ساده در این سناریو شدنی نیست، اما برنامه‌ریزی پویا با پیش‌خرید در دوره‌های قبلی تقاضا را پوشش می‌دهد. هر دو روش از سقف سفارش و ظرفیت انبار یکسان استفاده می‌کنند.";
      note.classList.add("is-warning");
    } else {
      const saving = result.baseline.totalCost - result.exact.totalCost;
      if (saving > 0) {
        note.textContent = "برنامهٔ کم‌هزینه در این سناریو مجموع هزینه را " + fmt(saving) + " واحد کمتر می‌کند. این نتیجه فقط برای همین داده‌ها و فرض‌های آموزشی معتبر است.";
      } else if (saving < 0) {
        note.textContent = "هزینهٔ دو برنامه به‌دلیل قواعد تساوی یا محدودیت‌های سناریو متفاوت است؛ برنامهٔ پویا کمینهٔ هزینهٔ کل تعریف‌شده را انتخاب می‌کند.";
      } else {
        note.textContent = "دو روش در هزینهٔ کل نتیجهٔ یکسانی دارند؛ برنامهٔ زمانی و موجودی پایان دوره می‌تواند متفاوت باشد.";
      }
    }
    document.getElementById("state-count").textContent = fmt(result.exact.statesRetained || 0);
    document.getElementById("solve-duration").textContent = fmtDecimal(result.solveMs);
  }

  function renderChart(plan, storageCapacity) {
    const chart = document.getElementById("inventory-chart");
    if (!plan || !plan.feasible) {
      chart.innerHTML = '<div class="empty-state" style="grid-column:1/-1">برای این سیاست برنامهٔ شدنی وجود ندارد؛ محدودیت نمایش‌داده‌شده در کارت بالا را بررسی کنید.</div>';
      return;
    }
    const scale = Math.max(1, storageCapacity);
    chart.innerHTML = plan.periods.map((period) => {
      const stockHeight = Math.max(0, period.endingInventory / scale * 100);
      const orderHeight = Math.max(0, period.orderQuantity / scale * 100);
      return '<div class="inventory-period">' +
        '<div class="inventory-period-name">دورهٔ ' + fmt(period.period) + '</div>' +
        '<div class="inventory-period-bars">' +
          '<div class="inventory-bar-group"><span class="inventory-bar-value">' + fmt(period.endingInventory) + '</span><div class="inventory-bar-area"><i class="inventory-bar stock" style="height:' + stockHeight.toFixed(2) + '%" title="موجودی پایان دوره: ' + fmt(period.endingInventory) + '"></i></div><span class="inventory-bar-label">موجودی</span></div>' +
          '<div class="inventory-bar-group"><span class="inventory-bar-value">' + fmt(period.orderQuantity) + '</span><div class="inventory-bar-area"><i class="inventory-bar order" style="height:' + orderHeight.toFixed(2) + '%" title="مقدار سفارش: ' + fmt(period.orderQuantity) + '"></i></div><span class="inventory-bar-label">سفارش</span></div>' +
        '</div></div>';
    }).join("");
  }

  function renderTable(plan) {
    const body = document.getElementById("inventory-table-body");
    if (!plan || !plan.feasible) {
      body.innerHTML = '<tr><td colspan="6">برای نمایش برنامه، ابتدا یک سناریوی شدنی تعیین کنید.</td></tr>';
      return;
    }
    body.innerHTML = plan.periods.map(period =>
      '<tr><td>دورهٔ ' + fmt(period.period) + '</td><td>' + fmt(period.openingInventory) +
      '</td><td>' + fmt(period.orderQuantity) + '</td><td>' + fmt(period.demand) +
      '</td><td>' + fmt(period.endingInventory) + '</td><td>' + fmt(period.totalCost) + '</td></tr>'
    ).join("");
  }

  function renderPlan() {
    if (!latestResult) return;
    const plan = selectedPlan === "exact" ? latestResult.exact : latestResult.baseline;
    renderChart(plan, latestResult.settings.storageCapacity);
    renderTable(plan);
  }

  function activatePlanButton(button) {
    selectedPlan = button.dataset.plan;
    planButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle("is-selected", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    });
    renderPlan();
  }
  function solveNow() {
    timer = null;
    const config = readConfig();
    if (config.error) {
      setStatus(config.error, "error");
      return;
    }
    try {
      clearInvalidFlags();
      latestResult = API.solve(config.value);
      renderMetrics();
      renderPlan();
      setStatus("محاسبه انجام شد؛ برنامهٔ کم‌هزینه با بررسی حالت‌های موجودی در شش دوره به دست آمده است.", "success");
    } catch (error) {
      setStatus("محاسبه انجام نشد: " + (error && error.message ? error.message : String(error)), "error");
    }
  }
  function scheduleSolve(delay) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(solveNow, typeof delay === "number" ? delay : 160);
  }

  planButtons.forEach(button => button.addEventListener("click", () => activatePlanButton(button)));
  settingNodes.concat(periodNodes).forEach(node => {
    node.addEventListener("input", () => scheduleSolve(160));
    node.addEventListener("change", () => scheduleSolve(40));
  });
  resetButton.addEventListener("click", function () {
    if (timer) window.clearTimeout(timer);
    settingNodes.forEach(node => {
      node.value = API.DEFAULT_SETTINGS[node.dataset.setting];
      node.setAttribute("aria-invalid", "false");
    });
    periodNodes.forEach(node => {
      const i = Number(node.dataset.period);
      node.value = node.dataset.field === "demand" ? API.DEFAULT_DEMAND[i] : API.DEFAULT_PRICES[i];
      node.setAttribute("aria-invalid", "false");
    });
    const exactButton = planButtons.find(button => button.dataset.plan === "exact");
    if (exactButton) activatePlanButton(exactButton);
    scheduleSolve(20);
  });

  solveNow();
})();