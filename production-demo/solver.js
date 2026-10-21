(function (root) {
  "use strict";

  const DEFAULT_JOBS = [
    { id: 1, p1: 34, p2: 27, due: 75, priority: 3 },
    { id: 2, p1: 26, p2: 39, due: 82, priority: 2 },
    { id: 3, p1: 42, p2: 31, due: 90, priority: 4 },
    { id: 4, p1: 29, p2: 24, due: 65, priority: 3 },
    { id: 5, p1: 37, p2: 29, due: 95, priority: 1 },
    { id: 6, p1: 21, p2: 34, due: 58, priority: 5 },
    { id: 7, p1: 31, p2: 22, due: 78, priority: 2 }
  ];

  function normalizeJobs(inputJobs) {
    const jobs = (inputJobs || DEFAULT_JOBS).map((job, index) => ({
      id: index + 1,
      p1: Number(job.p1),
      p2: Number(job.p2),
      due: Number(job.due),
      priority: Number(job.priority)
    }));
    if (jobs.length !== 7) throw new Error("این نمونه برای ۷ سفارش طراحی شده است.");
    for (const job of jobs) {
      if (!Number.isInteger(job.p1) || job.p1 < 5 || job.p1 > 60 ||
          !Number.isInteger(job.p2) || job.p2 < 5 || job.p2 > 60 ||
          !Number.isInteger(job.due) || job.due < 15 || job.due > 240 ||
          !Number.isInteger(job.priority) || job.priority < 1 || job.priority > 5) {
        throw new Error("مقادیر ورودی خارج از محدودهٔ مجاز هستند.");
      }
    }
    return jobs;
  }

  function evaluate(machineSequences, jobsById) {
    const machines = [];
    let weightedTardiness = 0;
    let totalTardiness = 0;
    let onTimeCount = 0;
    let onTimeWeight = 0;
    let lateCount = 0;
    let totalCompletion = 0;

    for (let machineIndex = 0; machineIndex < 2; machineIndex++) {
      let time = 0;
      const rows = [];
      for (const id of machineSequences[machineIndex]) {
        const job = jobsById.get(id);
        const processing = machineIndex === 0 ? job.p1 : job.p2;
        const start = time;
        time += processing;
        const tardiness = Math.max(0, time - job.due);
        if (tardiness === 0) {
          onTimeCount += 1;
          onTimeWeight += job.priority;
        } else {
          lateCount += 1;
        }
        weightedTardiness += tardiness * job.priority;
        totalTardiness += tardiness;
        totalCompletion += time;
        rows.push({
          id: job.id,
          start,
          finish: time,
          processing,
          due: job.due,
          priority: job.priority,
          tardiness
        });
      }
      machines.push({ id: machineIndex + 1, rows, finish: time });
    }

    const makespan = Math.max(machines[0].finish, machines[1].finish);
    const key = machines.map(machine => machine.rows.map(row => String(row.id)).join("-")).join("|");
    return {
      machines,
      metrics: {
        weightedTardiness,
        totalTardiness,
        onTimeCount,
        onTimeWeight,
        lateCount,
        makespan,
        totalCompletion
      },
      key
    };
  }

  function compare(a, b) {
    if (a.metrics.weightedTardiness !== b.metrics.weightedTardiness) {
      return a.metrics.weightedTardiness - b.metrics.weightedTardiness;
    }
    if (a.metrics.onTimeWeight !== b.metrics.onTimeWeight) {
      return b.metrics.onTimeWeight - a.metrics.onTimeWeight;
    }
    if (a.metrics.makespan !== b.metrics.makespan) {
      return a.metrics.makespan - b.metrics.makespan;
    }
    if (a.metrics.totalCompletion !== b.metrics.totalCompletion) {
      return a.metrics.totalCompletion - b.metrics.totalCompletion;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  }

  function solveBaseline(jobs) {
    const machines = [[], []];
    const availableAt = [0, 0];
    const ordered = jobs.slice().sort((a, b) =>
      a.due - b.due || b.priority - a.priority || a.id - b.id
    );

    for (const job of ordered) {
      const finish1 = availableAt[0] + job.p1;
      const finish2 = availableAt[1] + job.p2;
      const machineIndex = finish1 <= finish2 ? 0 : 1;
      machines[machineIndex].push(job.id);
      availableAt[machineIndex] += machineIndex === 0 ? job.p1 : job.p2;
    }
    return evaluate(machines, new Map(jobs.map(job => [job.id, job])));
  }

  function solveExact(jobs) {
    const jobsById = new Map(jobs.map(job => [job.id, job]));
    let best = null;
    let schedulesEvaluated = 0;
    const permutation = [];

    function evaluateSplits() {
      for (let split = 0; split <= permutation.length; split++) {
        const candidate = evaluate(
          [permutation.slice(0, split), permutation.slice(split)],
          jobsById
        );
        schedulesEvaluated += 1;
        if (!best || compare(candidate, best) < 0) best = candidate;
      }
    }

    function permute(remaining) {
      if (remaining.length === 0) {
        evaluateSplits();
        return;
      }
      for (let i = 0; i < remaining.length; i++) {
        const next = remaining[i];
        permutation.push(next);
        permute(remaining.slice(0, i).concat(remaining.slice(i + 1)));
        permutation.pop();
      }
    }

    permute(jobs.map(job => job.id));
    return { ...best, schedulesEvaluated };
  }

  function solve(input) {
    const jobs = normalizeJobs(input && input.jobs);
    const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const baseline = solveBaseline(jobs);
    const exact = solveExact(jobs);
    const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    return {
      status: "optimal",
      jobs,
      exact,
      baseline,
      schedulesEvaluated: exact.schedulesEvaluated,
      solveMs: Math.max(0, end - start),
      objectiveDescription: "ابتدا مجموع تأخیر هر سفارش در اولویت آن ضرب می‌شود و این مقدار کمینه می‌شود؛ در تساوی، اولویت سفارش‌های به‌موقع بیشتر، زمان پایان کل کمتر و سپس مجموع زمان‌های تکمیل کمتر ترجیح داده می‌شود."
    };
  }

  const api = { DEFAULT_JOBS, solve, normalizeJobs };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ProductionScheduler = api;
})(typeof self !== "undefined" ? self : globalThis);
