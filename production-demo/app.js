(function () {
  "use strict";
  const API = window.ProductionScheduler;
  if (!API) return;

  const numberFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
  const oneDecimalFmt = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const statusNode = document.getElementById("solve-status");
  const resetButton = document.getElementById("reset-button");
  const inputNodes = Array.from(document.querySelectorAll("[data-job-input]"));
  const planButtons = Array.from(document.querySelectorAll("[data-plan]"));
  const timeline = document.getElementById("gantt-chart");
  const ruler = document.getElementById("timeline-axis");
  const sequenceSummary = document.getElementById("sequence-summary");
  const comparisonNote = document.getElementById("comparison-note");

  let worker = null;
  let pendingTimer = null;
  let latestRequestId = 0;
  let currentResult = null;
  let selectedPlan = "exact";

  function fmt(value) {
    return numberFmt.format(Math.round(Number(value) || 0));
  }
  function fmtDecimal(value) {
    return oneDecimalFmt.format(Number(value) || 0);
  }
  function setStatus(message, kind) {
    statusNode.className = "solve-status" + (kind ? " is-" + kind : "");
    statusNode.replaceChildren();
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    statusNode.appendChild(spinner);
    const text = document.createElement("span");
    text.textContent = message;
    statusNode.appendChild(text);
  }

  function readJobs() {
    const jobs = API.DEFAULT_JOBS.map(job => ({ id: job.id }));
    let firstInvalid = null;
    for (const node of inputNodes) {
      const id = Number(node.dataset.jobInput);
      const field = node.dataset.field;
      const value = Number(node.value);
      const min = Number(node.min);
      const max = Number(node.max);
      const valid = node.value.trim() !== "" && Number.isInteger(value) && value >= min && value <= max;
      node.setAttribute("aria-invalid", valid ? "false" : "true");
      if (!valid && firstInvalid === null) firstInvalid = node;
      if (valid) jobs[id - 1][field] = value;
    }
    if (firstInvalid) return null;
    return jobs;
  }

  function getInput() {
    const jobs = readJobs();
    if (!jobs) return null;
    return { jobs };
  }

  function scheduleSolve(delay) {
    latestRequestId += 1;
    const input = getInput();
    if (!input) {
      setStatus("ورودی نامعتبر است؛ مقدارها را در محدودهٔ تعیین‌شده وارد کنید.", "error");
      return;
    }
    if (pendingTimer) window.clearTimeout(pendingTimer);
    setStatus("ورودی‌ها تغییر کرده‌اند؛ در حال بررسی دوبارهٔ برنامه‌ها…", "pending");
    pendingTimer = window.setTimeout(() => runSolve(input), typeof delay === "number" ? delay : 180);
  }

  function runSolve(input) {
    pendingTimer = null;
    const requestId = ++latestRequestId;
    if (worker) {
      worker.postMessage({ requestId, input });
      return;
    }
    window.setTimeout(() => {
      try {
        handleMessage({ data: { requestId, result: API.solve(input) } });
      } catch (error) {
        handleMessage({ data: { requestId, error: error && error.message ? error.message : String(error) } });
      }
    }, 0);
  }

  function handleMessage(event) {
    const data = event.data || {};
    if (data.requestId !== latestRequestId) return;
    if (data.error) {
      setStatus("حل مساله ناموفق بود: " + data.error, "error");
      return;
    }
    if (!data.result || !data.result.exact || !data.result.baseline) {
      setStatus("پاسخ حل‌گر کامل نیست؛ ورودی‌ها را بازنشانی کنید.", "error");
      return;
    }
    currentResult = data.result;
    renderMetrics();
    renderTimeline();
    const elapsed = fmtDecimal(data.result.solveMs);
    setStatus(
      "بررسی " + fmt(data.result.schedulesEvaluated) + " برنامهٔ ممکن انجام شد؛ بهترین پاسخ در مدل فعلی اثبات شده است. زمان محاسبه: " + elapsed + " میلی‌ثانیه.",
      "success"
    );
  }

  function setMetric(prefix, plan) {
    const m = plan.metrics;
    document.getElementById(prefix + "-weighted-tardiness").textContent = fmt(m.weightedTardiness);
    document.getElementById(prefix + "-ontime").textContent = fmt(m.onTimeCount) + " از " + fmt(API.DEFAULT_JOBS.length);
    document.getElementById(prefix + "-makespan").textContent = fmt(m.makespan);
    document.getElementById(prefix + "-late-count").textContent = fmt(m.lateCount);
    document.getElementById(prefix + "-weighted-tardiness-help").textContent = "واحدِ اولویت × دقیقه";
    document.getElementById(prefix + "-makespan-help").textContent = "دقیقه تا پایان آخرین ماشین";
  }

  function renderMetrics() {
    if (!currentResult) return;
    setMetric("simple", currentResult.baseline);
    setMetric("exact", currentResult.exact);
    const base = currentResult.baseline.metrics.weightedTardiness;
    const best = currentResult.exact.metrics.weightedTardiness;
    const diff = base - best;
    if (diff > 0) {
      comparisonNote.textContent = "در همین ورودی‌ها، برنامهٔ دقیق معیار تأخیر وزنی را " + fmt(diff) + " واحد کمتر کرده است. این تفاوت برای همین مدل و همین فرض‌هاست؛ نتیجهٔ پروژهٔ صنعتی محسوب نمی‌شود.";
    } else {
      comparisonNote.textContent = "دو روش در معیار اصلی تأخیر وزنی نتیجهٔ یکسانی دارند. ممکن است تفاوت در ترتیب سفارش‌ها یا معیارهای ثانویه دیده شود.";
    }
    document.getElementById("evaluated-count").textContent = fmt(currentResult.schedulesEvaluated);
    document.getElementById("solve-duration").textContent = fmtDecimal(currentResult.solveMs);
  }

  function renderTimeline() {
    if (!currentResult) return;
    const plan = selectedPlan === "exact" ? currentResult.exact : currentResult.baseline;
    const makespan = Math.max(1, plan.metrics.makespan);
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    ruler.innerHTML = ticks.map(factor => "<span>" + fmt(makespan * factor) + "</span>").join("");
    timeline.innerHTML = plan.machines.map(machine => {
      const bars = machine.rows.map(row => {
        const left = row.start / makespan * 100;
        const width = row.processing / makespan * 100;
        const lateText = row.tardiness > 0 ? "دیرکرد: " + fmt(row.tardiness) + " دقیقه" : "به‌موقع";
        const title = "سفارش " + fmt(row.id) + "؛ شروع " + fmt(row.start) + "؛ پایان " + fmt(row.finish) +
          "؛ موعد " + fmt(row.due) + "؛ اولویت " + fmt(row.priority) + "؛ " + lateText;
        return '<div class="job-bar machine-' + machine.id + (row.tardiness > 0 ? " is-late" : "") +
          '" style="left:' + left.toFixed(4) + "%;width:" + width.toFixed(4) + '%" title="' + title +
          '" aria-label="' + title + '">س' + fmt(row.id) + "</div>";
      }).join("");
      return '<div class="timeline-row"><div class="timeline-label"><strong>ماشین ' + fmt(machine.id) +
        '</strong><small>' + fmt(machine.rows.length) + ' سفارش · پایان ' + fmt(machine.finish) +
        ' دقیقه</small></div><div class="timeline-track" aria-label="برنامهٔ زمانی ماشین ' + fmt(machine.id) +
        '">' + bars + "</div></div>";
    }).join("");

    sequenceSummary.innerHTML = plan.machines.map(machine => {
      const ids = machine.rows.map(row => fmt(row.id)).join(" ← ") || "بدون سفارش";
      const late = machine.rows.filter(row => row.tardiness > 0).length;
      return '<div class="timeline-order-row"><strong>ماشین ' + fmt(machine.id) +
        '</strong><span>ترتیب اجرا: ' + ids + '</span><span class="' + (late ? "late-flag" : "ontime-flag") +
        '">' + (late ? fmt(late) + " سفارش دیرکرددار" : "همهٔ سفارش‌ها به‌موقع") + "</span></div>";
    }).join("");
  }

  function activatePlanButton(button) {
    selectedPlan = button.dataset.plan;
    planButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle("is-selected", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    });
    renderTimeline();
  }

  planButtons.forEach(button => button.addEventListener("click", () => activatePlanButton(button)));
  inputNodes.forEach(node => {
    node.addEventListener("input", () => scheduleSolve(180));
    node.addEventListener("change", () => scheduleSolve(60));
  });

  resetButton.addEventListener("click", function () {
    if (pendingTimer) window.clearTimeout(pendingTimer);
    inputNodes.forEach(node => {
      node.value = node.dataset.default;
      node.setAttribute("aria-invalid", "false");
    });
    const exactButton = planButtons.find(button => button.dataset.plan === "exact");
    if (exactButton) activatePlanButton(exactButton);
    scheduleSolve(30);
  });

  try {
    worker = new Worker("solver.worker.js");
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", function () {
      worker = null;
      setStatus("حل‌گر در همان مرورگر اجرا می‌شود؛ در حال محاسبه…", "pending");
      scheduleSolve(20);
    });
  } catch (_) {
    worker = null;
  }

  inputNodes.forEach(node => node.setAttribute("aria-invalid", "false"));
  scheduleSolve(20);
})();
