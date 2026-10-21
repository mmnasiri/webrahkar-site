(function (root) {
  "use strict";
  const DEFAULT_BUDGET = 90;
  const DEFAULT_PROJECTS = [
    { id: 1, name: "زیرساخت دیجیتال", cost: 22, score: 36, requires: [] },
    { id: 2, name: "آموزش و توانمندسازی", cost: 14, score: 18, requires: [] },
    { id: 3, name: "اتوماسیون فرایند", cost: 26, score: 25, requires: [1] },
    { id: 4, name: "مدیریت مصرف انرژی", cost: 18, score: 28, requires: [2] },
    { id: 5, name: "یکپارچه‌سازی داده‌ها", cost: 20, score: 32, requires: [] },
    { id: 6, name: "ارتقای کنترل کیفیت", cost: 25, score: 40, requires: [3] },
    { id: 7, name: "سامانهٔ برنامه‌ریزی یکپارچه", cost: 30, score: 45, requires: [4, 5] },
    { id: 8, name: "بازطراحی چیدمان انبار", cost: 16, score: 25, requires: [5] }
  ];

  function normalize(input) {
    const budget = Number(input && input.budget);
    if (!Number.isInteger(budget) || budget < 20 || budget > 200) {
      throw new Error("سقف بودجه باید عدد صحیحی بین ۲۰ تا ۲۰۰ باشد.");
    }
    if (!input || !Array.isArray(input.projects) || input.projects.length !== DEFAULT_PROJECTS.length) {
      throw new Error("اطلاعات هر هشت پروژه باید مشخص باشد.");
    }
    const projects = input.projects.map((p, index) => {
      const template = DEFAULT_PROJECTS[index];
      const cost = Number(p.cost);
      const score = Number(p.score);
      if (!Number.isInteger(cost) || cost < 5 || cost > 100) {
        throw new Error("هزینهٔ هر پروژه باید عدد صحیحی بین ۵ تا ۱۰۰ باشد.");
      }
      if (!Number.isInteger(score) || score < 1 || score > 100) {
        throw new Error("امتیاز هر پروژه باید عدد صحیحی بین ۱ تا ۱۰۰ باشد.");
      }
      return { id: template.id, name: template.name, cost, score, requires: template.requires.slice() };
    });
    return { budget, projects };
  }

  function evaluateMask(mask, budget, projects) {
    const selected = projects.filter(p => (mask & (1 << (p.id - 1))) !== 0);
    const set = new Set(selected.map(p => p.id));
    for (const project of selected) {
      if (project.requires.some(requiredId => !set.has(requiredId))) return null;
    }
    const cost = selected.reduce((sum, p) => sum + p.cost, 0);
    if (cost > budget) return null;
    const score = selected.reduce((sum, p) => sum + p.score, 0);
    return {
      mask,
      selectedIds: selected.map(p => p.id),
      selectedProjects: selected.map(p => ({ id: p.id, name: p.name, cost: p.cost, score: p.score })),
      cost,
      score,
      count: selected.length,
      remaining: budget - cost,
      utilization: budget > 0 ? cost / budget * 100 : 0
    };
  }

  function better(candidate, incumbent) {
    if (!incumbent) return true;
    if (candidate.score !== incumbent.score) return candidate.score > incumbent.score;
    if (candidate.cost !== incumbent.cost) return candidate.cost < incumbent.cost;
    if (candidate.count !== incumbent.count) return candidate.count < incumbent.count;
    return candidate.mask < incumbent.mask;
  }

  function solveExact(budget, projects) {
    let best = null;
    let feasibleCount = 0;
    const totalSubsets = 1 << projects.length;
    for (let mask = 0; mask < totalSubsets; mask++) {
      const candidate = evaluateMask(mask, budget, projects);
      if (!candidate) continue;
      feasibleCount += 1;
      if (better(candidate, best)) best = candidate;
    }
    return Object.assign({}, best, { totalSubsets, feasibleCount });
  }

  function solveGreedy(budget, projects) {
    const selected = new Set();
    const byId = new Map(projects.map(p => [p.id, p]));
    const ordered = projects.slice().sort((a, b) =>
      (b.score / b.cost) - (a.score / a.cost) ||
      b.score - a.score ||
      a.id - b.id
    );

    function addPrerequisites(id, closure) {
      const project = byId.get(id);
      for (const requiredId of project.requires) {
        if (!closure.has(requiredId)) {
          closure.add(requiredId);
          addPrerequisites(requiredId, closure);
        }
      }
      closure.add(id);
    }

    for (const project of ordered) {
      if (selected.has(project.id)) continue;
      const closure = new Set();
      addPrerequisites(project.id, closure);
      const candidateIds = new Set([...selected, ...closure]);
      const candidateCost = [...candidateIds].reduce((sum, id) => sum + byId.get(id).cost, 0);
      if (candidateCost <= budget) {
        for (const id of closure) selected.add(id);
      }
    }
    const mask = [...selected].reduce((value, id) => value | (1 << (id - 1)), 0);
    return evaluateMask(mask, budget, projects);
  }

  function solve(input) {
    const normalized = normalize(input);
    const start = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const exact = solveExact(normalized.budget, normalized.projects);
    const simple = solveGreedy(normalized.budget, normalized.projects);
    const end = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    return {
      budget: normalized.budget,
      projects: normalized.projects,
      exact,
      simple,
      scoreDifference: exact.score - simple.score,
      subsetsEvaluated: exact.totalSubsets,
      feasibleSubsets: exact.feasibleCount,
      solveMs: Math.max(0, end - start)
    };
  }

  const api = { DEFAULT_BUDGET, DEFAULT_PROJECTS, normalize, solve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PortfolioPlanner = api;
})(typeof self !== "undefined" ? self : globalThis);
