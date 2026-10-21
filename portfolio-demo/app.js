(function () {
  "use strict";
  const API = window.PortfolioPlanner;
  if (!API) return;

  const numberFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
  const percentFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
  const budgetInput = document.getElementById("budget-input");
  const budgetRange = document.getElementById("budget-range");
  const projectInputs = Array.from(document.querySelectorAll("[data-project-input][data-field]"));
  const statusNode = document.getElementById("solve-status");
  const resetButton = document.getElementById("reset-button");
  const comparisonNote = document.getElementById("comparison-note");
  const planButtons = Array.from(document.querySelectorAll("[data-plan]"));
  let timer = null;
  let latest = null;

  function fmt(value) { return numberFmt.format(Math.round(Number(value) || 0)); }
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

  function readInput() {
    let invalid = null;
    const projects = API.DEFAULT_PROJECTS.map(p => ({ id: p.id }));
    for (const node of projectInputs) {
      const id = Number(node.dataset.projectInput);
      const field = node.dataset.field;
      const value = Number(node.value);
      const min = Number(node.min);
      const max = Number(node.max);
      const valid = node.value.trim() !== "" && Number.isInteger(value) && value >= min && value <= max;
      node.setAttribute("aria-invalid", valid ? "false" : "true");
      if (!valid && !invalid) invalid = node;
      if (valid) projects[id - 1][field] = value;
    }
    const budget = Number(budgetInput.value);
    const budgetValid = budgetInput.value.trim() !== "" && Number.isInteger(budget) &&
      budget >= Number(budgetInput.min) && budget <= Number(budgetInput.max);
    budgetInput.setAttribute("aria-invalid", budgetValid ? "false" : "true");
    if (!budgetValid && !invalid) invalid = budgetInput;
    if (invalid) return { error: "یکی از ورودی‌ها خالی یا خارج از محدوده است. نتایج فعلی مربوط به آخرین ورودی معتبرند." };
    return { value: { budget, projects } };
  }

  function setMetric(prefix, plan) {
    const values = {
      score: plan.score,
      cost: plan.cost,
      count: plan.count,
      remaining: plan.remaining
    };
    for (const [key, value] of Object.entries(values)) {
      document.getElementById(prefix + "-" + key).textContent = fmt(value);
    }
    document.getElementById(prefix + "-usage-label").textContent =
      percentFmt.format(plan.utilization) + "٪";
    document.getElementById(prefix + "-usage-bar").style.width =
      Math.min(100, Math.max(0, plan.utilization)).toFixed(2) + "%";
    const chips = document.getElementById(prefix + "-projects");
    if (plan.selectedProjects.length === 0) {
      chips.innerHTML = '<span class="project-chip project-chip-empty">هیچ پروژه‌ای انتخاب نشده است</span>';
      return;
    }
    chips.innerHTML = plan.selectedProjects.map(project =>
      '<span class="project-chip">' + project.name + ' <small>' + fmt(project.cost) + '</small></span>'
    ).join("");
  }

  function render(result) {
    setMetric("simple", result.simple);
    setMetric("exact", result.exact);
    document.getElementById("evaluated-count").textContent = fmt(result.subsetsEvaluated);
    comparisonNote.classList.remove("is-warning");
    if (result.scoreDifference > 0) {
      comparisonNote.textContent = "در این سناریو، ترکیب دقیق " + fmt(result.scoreDifference) +
        " امتیاز بیشتر از روش ساده به دست می‌آورد و در عین حال از سقف بودجه عبور نمی‌کند. این تفاوت به همین مقادیر فرضی وابسته است.";
    } else {
      comparisonNote.textContent = "در این سناریو، روش ساده نیز به بهترین امتیاز قابل دستیابی رسیده است. بررسی دقیق، بهینه‌بودن ترکیب منتخب را در همین مدل محدود تأیید می‌کند.";
    }
  }

  function solveNow() {
    timer = null;
    const input = readInput();
    if (input.error) {
      setStatus(input.error, "error");
      return;
    }
    try {
      budgetRange.value = String(input.value.budget);
      latest = API.solve(input.value);
      render(latest);
      setStatus("همهٔ " + fmt(latest.subsetsEvaluated) +
        " ترکیب ممکن بررسی شد؛ ترکیب دقیق بر اساس امتیاز تعریف‌شده انتخاب شده است. زمان محاسبه: " +
        fmt(latest.solveMs) + " میلی‌ثانیه.", "success");
    } catch (error) {
      setStatus("محاسبه انجام نشد: " + (error && error.message ? error.message : String(error)), "error");
    }
  }

  function scheduleSolve(delay) {
    if (timer) window.clearTimeout(timer);
    setStatus("ورودی‌ها تغییر کرده‌اند؛ ترکیب‌ها در حال ارزیابی‌اند…", "pending");
    timer = window.setTimeout(solveNow, typeof delay === "number" ? delay : 150);
  }

  budgetInput.addEventListener("input", scheduleSolve);
  budgetInput.addEventListener("change", () => scheduleSolve(30));
  budgetRange.addEventListener("input", function () {
    budgetInput.value = budgetRange.value;
    scheduleSolve(110);
  });
  projectInputs.forEach(node => {
    node.addEventListener("input", () => scheduleSolve(150));
    node.addEventListener("change", () => scheduleSolve(30));
  });

  resetButton.addEventListener("click", function () {
    if (timer) window.clearTimeout(timer);
    budgetInput.value = API.DEFAULT_BUDGET;
    budgetRange.value = API.DEFAULT_BUDGET;
    projectInputs.forEach(node => {
      const project = API.DEFAULT_PROJECTS[Number(node.dataset.projectInput) - 1];
      node.value = project[node.dataset.field];
      node.setAttribute("aria-invalid", "false");
    });
    budgetInput.setAttribute("aria-invalid", "false");
    solveNow();
  });

  projectInputs.concat([budgetInput]).forEach(node => node.setAttribute("aria-invalid", "false"));
  solveNow();
})();
