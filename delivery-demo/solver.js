(function (root) {
  "use strict";

  const MAP = { width: 700, height: 440, depot: { id: 0, x: 350, y: 220 } };
  const DEFAULT_CUSTOMERS = [
    { id: 1, x: 95, y: 80, demand: 2, ready: 18, due: 58, service: 8 },
    { id: 2, x: 512, y: 60, demand: 1, ready: 0, due: 57, service: 7 },
    { id: 3, x: 610, y: 310, demand: 2, ready: 38, due: 91, service: 10 },
    { id: 4, x: 372, y: 356, demand: 2, ready: 67, due: 119, service: 8 },
    { id: 5, x: 215, y: 70, demand: 1, ready: 8, due: 65, service: 6 },
    { id: 6, x: 100, y: 305, demand: 2, ready: 49, due: 104, service: 9 },
    { id: 7, x: 470, y: 195, demand: 1, ready: 83, due: 132, service: 7 },
    { id: 8, x: 290, y: 292, demand: 2, ready: 18, due: 74, service: 11 },
    { id: 9, x: 625, y: 135, demand: 3, ready: 91, due: 145, service: 10 },
    { id: 10, x: 177, y: 195, demand: 3, ready: 57, due: 110, service: 12 }
  ];

  const VEHICLE_SPEEDS = [0.94, 1.00, 1.07];
  const VEHICLE_COLORS = ["#2876D2", "#159A86", "#D18A28"];
  const SHIFT_END = 210; // 11:30 when the shift begins at 08:00

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function distanceUnits(a, b) {
    return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / 70;
  }

  function crossesLine(a, b, axis, center) {
    const p = a[axis] - center;
    const q = b[axis] - center;
    return p * q < 0;
  }

  function travelMinutes(a, b, trafficPercent, speedFactor) {
    const dist = distanceUnits(a, b);
    const traffic = Math.max(0, Math.min(100, trafficPercent)) / 100;
    const crossVertical = crossesLine(a, b, "x", MAP.depot.x);
    const crossHorizontal = crossesLine(a, b, "y", MAP.depot.y);
    let corridorDelay = 0;
    if (crossVertical) corridorDelay += 6;
    if (crossHorizontal) corridorDelay += 5.5;
    if (crossVertical && crossHorizontal) corridorDelay += 3.5;
    const raw = dist * 5.15 * speedFactor * (1 + 0.72 * traffic) + corridorDelay * traffic;
    return Math.max(1, Math.ceil(raw));
  }

  function makeScore() {
    return { onTime: 0, lateMinutes: 0, overtime: 0, distance: 0, driveMinutes: 0 };
  }

  function compareScore(a, b) {
    if (!b) return -1;
    if (a.onTime !== b.onTime) return b.onTime - a.onTime;
    if (a.lateMinutes !== b.lateMinutes) return a.lateMinutes - b.lateMinutes;
    if (a.overtime !== b.overtime) return a.overtime - b.overtime;
    const diffDist = a.distance - b.distance;
    if (Math.abs(diffDist) > 1e-8) return diffDist;
    if (a.driveMinutes !== b.driveMinutes) return a.driveMinutes - b.driveMinutes;
    return 0;
  }

  function routeIsBetter(candidate, incumbent) {
    const cmp = compareScore(candidate.score, incumbent && incumbent.score);
    if (cmp !== 0) return cmp < 0;
    return candidate.key < (incumbent ? incumbent.key : "~");
  }

  function summarizeRoute(path, visits, vehicle, traffic, customersById) {
    let time = 0;
    let dist = 0;
    let drive = 0;
    let onTime = 0;
    let lateMinutes = 0;
    let current = MAP.depot;
    const routeVisits = [];

    for (const id of path) {
      const customer = customersById.get(id);
      const legDist = distanceUnits(current, customer);
      const legTime = travelMinutes(current, customer, traffic, vehicle.speedFactor);
      const arrival = time + legTime;
      const serviceStart = Math.max(arrival, customer.ready);
      const late = Math.max(0, serviceStart - customer.due);
      if (late === 0) onTime += 1;
      lateMinutes += late;
      dist += legDist;
      drive += legTime;
      routeVisits.push({ id, arrival, serviceStart, late, service: customer.service, due: customer.due });
      time = serviceStart + customer.service;
      current = customer;
    }

    if (path.length) {
      const backDist = distanceUnits(current, MAP.depot);
      const backTime = travelMinutes(current, MAP.depot, traffic, vehicle.speedFactor);
      dist += backDist;
      drive += backTime;
      time += backTime;
    }

    const score = {
      onTime,
      lateMinutes,
      overtime: path.length ? Math.max(0, time - SHIFT_END) : 0,
      distance: dist,
      driveMinutes: drive
    };
    return {
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      color: vehicle.color,
      capacity: vehicle.capacity,
      load: path.reduce((sum, id) => sum + customersById.get(id).demand, 0),
      path: path.slice(),
      visits: routeVisits,
      returnTime: time,
      score,
      key: path.map(id => String(id).padStart(2, "0")).join("-")
    };
  }

  function addScores(a, b) {
    return {
      onTime: a.onTime + b.onTime,
      lateMinutes: a.lateMinutes + b.lateMinutes,
      overtime: a.overtime + b.overtime,
      distance: a.distance + b.distance,
      driveMinutes: a.driveMinutes + b.driveMinutes
    };
  }

  function scoreFromRoutes(routes) {
    return routes.reduce((sum, route) => addScores(sum, route.score), makeScore());
  }

  function planKey(routes) {
    return routes.map(r => `${r.vehicleId}:${r.key}`).join("|");
  }

  function partitionIsBetter(candidate, incumbent) {
    const cmp = compareScore(candidate.score, incumbent && incumbent.score);
    if (cmp !== 0) return cmp < 0;
    return planKey(candidate.routes) < (incumbent ? planKey(incumbent.routes) : "~");
  }

  function solveExact(input) {
    const started = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const customers = deepCopy(input.customers || DEFAULT_CUSTOMERS).map(c => ({
      ...c,
      due: c.due + Math.max(0, Number(input.deadlineSlack || 0))
    }));
    const traffic = Math.max(0, Math.min(100, Number(input.traffic || 0)));
    const baseCapacity = Math.max(7, Math.min(9, Math.round(Number(input.baseCapacity || 7))));
    const vehicles = [
      { id: 0, name: "خودرو ۱", capacity: baseCapacity - 1, speedFactor: VEHICLE_SPEEDS[0], color: VEHICLE_COLORS[0] },
      { id: 1, name: "خودرو ۲", capacity: baseCapacity, speedFactor: VEHICLE_SPEEDS[1], color: VEHICLE_COLORS[1] },
      { id: 2, name: "خودرو ۳", capacity: baseCapacity, speedFactor: VEHICLE_SPEEDS[2], color: VEHICLE_COLORS[2] }
    ];
    const customersById = new Map(customers.map(c => [c.id, c]));
    const n = customers.length;
    const fullMask = (1 << n) - 1;
    let routeSequencesEvaluated = 0;
    let partitionTransitions = 0;
    const onTimeRouteCountsByVehicle = [];

    const routesByVehicle = vehicles.map(vehicle => {
      const bestByMask = new Array(1 << n).fill(null);
      const onTimeRouteCounts = new Array(1 << n).fill(0n);
      onTimeRouteCounts[0] = 1n;
      const empty = summarizeRoute([], [], vehicle, traffic, customersById);
      bestByMask[0] = empty;

      function visit(mask, currentId, currentTime, load, path, visits, distSoFar, driveSoFar, onTimeSoFar, lateSoFar) {
        if (mask !== 0) {
          routeSequencesEvaluated += 1;
          if (onTimeSoFar === path.length) onTimeRouteCounts[mask] += 1n;
          const currentLocation = customersById.get(currentId);
          const returnDist = distanceUnits(currentLocation, MAP.depot);
          const returnDrive = travelMinutes(currentLocation, MAP.depot, traffic, vehicle.speedFactor);
          const returnTime = currentTime + returnDrive;
          const score = {
            onTime: onTimeSoFar,
            lateMinutes: lateSoFar,
            overtime: Math.max(0, returnTime - SHIFT_END),
            distance: distSoFar + returnDist,
            driveMinutes: driveSoFar + returnDrive
          };
          const key = path.map(id => String(id).padStart(2, "0")).join("-");
          const candidate = {
            vehicleId: vehicle.id,
            vehicleName: vehicle.name,
            color: vehicle.color,
            capacity: vehicle.capacity,
            load,
            path: path.slice(),
            visits: visits.map(v => ({ ...v })),
            returnTime,
            score,
            key
          };
          if (routeIsBetter(candidate, bestByMask[mask])) bestByMask[mask] = candidate;
        }

        for (let i = 0; i < n; i++) {
          const bit = 1 << i;
          if (mask & bit) continue;
          const c = customers[i];
          if (load + c.demand > vehicle.capacity) continue;
          const previous = currentId === 0 ? MAP.depot : customersById.get(currentId);
          const legDistance = distanceUnits(previous, c);
          const legTime = travelMinutes(previous, c, traffic, vehicle.speedFactor);
          const arrival = currentTime + legTime;
          const serviceStart = Math.max(arrival, c.ready);
          const late = Math.max(0, serviceStart - c.due);
          const nextVisits = visits.concat([{ id: c.id, arrival, serviceStart, late, service: c.service, due: c.due }]);
          visit(
            mask | bit,
            c.id,
            serviceStart + c.service,
            load + c.demand,
            path.concat([c.id]),
            nextVisits,
            distSoFar + legDistance,
            driveSoFar + legTime,
            onTimeSoFar + (late === 0 ? 1 : 0),
            lateSoFar + late
          );
        }
      }

      visit(0, 0, 0, 0, [], [], 0, 0, 0, 0, 0);
      onTimeRouteCountsByVehicle.push(onTimeRouteCounts);
      return bestByMask;
    });

    // Exact subset dynamic program: each customer is assigned to one vehicle,
    // and each vehicle receives its best feasible ordered route for that subset.
    const K = vehicles.length;
    const dp = Array.from({ length: K + 1 }, () => new Array(1 << n).fill(null));
    dp[0][0] = { score: makeScore(), routes: [] };

    for (let k = 0; k < K; k++) {
      for (let served = 0; served <= fullMask; served++) {
        const state = dp[k][served];
        if (!state) continue;
        const remaining = fullMask ^ served;
        let subset = remaining;
        while (true) {
          partitionTransitions += 1;
          const route = routesByVehicle[k][subset];
          if (route) {
            const nextMask = served | subset;
            const candidate = {
              score: addScores(state.score, route.score),
              routes: state.routes.concat([route])
            };
            if (partitionIsBetter(candidate, dp[k + 1][nextMask])) dp[k + 1][nextMask] = candidate;
          }
          if (subset === 0) break;
          subset = (subset - 1) & remaining;
        }
      }
    }

    const solved = dp[K][fullMask];

    // Count every labeled fleet plan (route partition + route order) that can
    // deliver every customer on time. BigInt keeps this exact for larger counts.
    const onTimeWays = Array.from({ length: K + 1 }, () => new Array(1 << n).fill(0n));
    onTimeWays[0][0] = 1n;
    for (let k = 0; k < K; k++) {
      for (let served = 0; served <= fullMask; served++) {
        const ways = onTimeWays[k][served];
        if (ways === 0n) continue;
        const remaining = fullMask ^ served;
        let subset = remaining;
        while (true) {
          const routeCount = onTimeRouteCountsByVehicle[k][subset];
          if (routeCount > 0n) onTimeWays[k + 1][served | subset] += ways * routeCount;
          if (subset === 0) break;
          subset = (subset - 1) & remaining;
        }
      }
    }
    const allOnTimeFleetPlansCount = onTimeWays[K][fullMask].toString();

    const ended = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (!solved) {
      return {
        status: "infeasible",
        message: "با ظرفیت فعلی خودروها، امکان تخصیص همهٔ سفارش‌ها وجود ندارد. ظرفیت را افزایش دهید.",
        metrics: null,
        routes: [],
        routeSequencesEvaluated,
        partitionTransitions,
        allOnTimeFleetPlansCount,
        solveMs: Math.max(0, ended - started),
        customers
      };
    }

    const lateCustomers = solved.routes.flatMap(route => route.visits.filter(v => v.late > 0));
    return {
      status: "optimal",
      statusText: "بهترین جواب اثبات‌شده در مدل",
      objectiveDescription: "ابتدا تعداد تحویل‌های به‌موقع بیشینه می‌شود؛ سپس مجموع تأخیر، اضافه‌کاری خودروها و فاصلهٔ مسیرها به‌ترتیب کاهش می‌یابد.",
      metrics: {
        ...solved.score,
        totalCustomers: n,
        lateCount: lateCustomers.length,
        onTimeCount: solved.score.onTime,
        utilization: solved.routes.map(route => ({ id: route.vehicleId, used: route.load, capacity: route.capacity }))
      },
      routes: solved.routes,
      routeSequencesEvaluated,
      partitionTransitions,
      allOnTimeFleetPlansCount,
      solveMs: Math.max(0, ended - started),
      customers
    };
  }

  function evaluateGivenRoutes(input, routePaths) {
    const traffic = Math.max(0, Math.min(100, Number(input.traffic || 0)));
    const customers = deepCopy(input.customers || DEFAULT_CUSTOMERS).map(c => ({
      ...c,
      due: c.due + Math.max(0, Number(input.deadlineSlack || 0))
    }));
    const baseCapacity = Math.max(7, Math.min(9, Math.round(Number(input.baseCapacity || 7))));
    const vehicles = [
      { id: 0, name: "خودرو ۱", capacity: baseCapacity - 1, speedFactor: VEHICLE_SPEEDS[0], color: VEHICLE_COLORS[0] },
      { id: 1, name: "خودرو ۲", capacity: baseCapacity, speedFactor: VEHICLE_SPEEDS[1], color: VEHICLE_COLORS[1] },
      { id: 2, name: "خودرو ۳", capacity: baseCapacity, speedFactor: VEHICLE_SPEEDS[2], color: VEHICLE_COLORS[2] }
    ];
    const map = new Map(customers.map(c => [c.id, c]));
    const routes = vehicles.map(vehicle => summarizeRoute(routePaths[vehicle.id] || [], [], vehicle, traffic, map));
    const score = scoreFromRoutes(routes);
    const allVisits = routes.flatMap(r => r.visits);
    const countLate = allVisits.filter(v => v.late > 0).length;
    return {
      status: "heuristic",
      statusText: "برنامهٔ ساده برای مقایسه",
      metrics: { ...score, totalCustomers: customers.length, lateCount: countLate, onTimeCount: score.onTime },
      routes,
      customers
    };
  }

  function solveGreedy(input) {
    const customers = deepCopy(input.customers || DEFAULT_CUSTOMERS).map(c => ({
      ...c,
      due: c.due + Math.max(0, Number(input.deadlineSlack || 0))
    }));
    const baseCapacity = Math.max(7, Math.min(9, Math.round(Number(input.baseCapacity || 7))));
    const vehicleCaps = [baseCapacity - 1, baseCapacity, baseCapacity];
    const assignment = [[], [], []];
    const loads = [0, 0, 0];
    let valid = true;
    const ordered = customers.slice().sort((a, b) => b.demand - a.demand || a.due - b.due || a.id - b.id);
    for (const c of ordered) {
      const choices = [0, 1, 2].filter(k => loads[k] + c.demand <= vehicleCaps[k]);
      if (!choices.length) { valid = false; break; }
      choices.sort((ka, kb) => {
        const remA = vehicleCaps[ka] - loads[ka] - c.demand;
        const remB = vehicleCaps[kb] - loads[kb] - c.demand;
        if (remA !== remB) return remA - remB;
        const centroidScore = k => {
          const assigned = assignment[k];
          if (!assigned.length) return distanceUnits(MAP.depot, c);
          return assigned.reduce((s, node) => s + distanceUnits(node, c), 0) / assigned.length;
        };
        return centroidScore(ka) - centroidScore(kb) || ka - kb;
      });
      const k = choices[0];
      assignment[k].push(c);
      loads[k] += c.demand;
    }

    if (!valid) {
      // Capacity-only exact fallback ensures the baseline always serves all orders
      // whenever a capacity-feasible partition exists. The route order remains greedy.
      const n = ordered.length;
      let found = null;
      function assignAt(idx, bins, binLoads) {
        if (found) return;
        if (idx === ordered.length) { found = bins.map(b => b.slice()); return; }
        const c = ordered[idx];
        const seenCaps = new Set();
        for (let k = 0; k < 3; k++) {
          if (binLoads[k] + c.demand > vehicleCaps[k] || seenCaps.has(`${vehicleCaps[k]}-${binLoads[k]}`)) continue;
          seenCaps.add(`${vehicleCaps[k]}-${binLoads[k]}`);
          bins[k].push(c);
          binLoads[k] += c.demand;
          assignAt(idx + 1, bins, binLoads);
          binLoads[k] -= c.demand;
          bins[k].pop();
          if (found) return;
        }
      }
      assignAt(0, [[], [], []], [0, 0, 0]);
      if (!found) return { status: "infeasible", message: "ظرفیت کل ناوگان برای همهٔ سفارش‌ها کافی نیست.", metrics: null, routes: [] };
      for (let k = 0; k < 3; k++) assignment[k] = found[k];
    }

    const traffic = Math.max(0, Math.min(100, Number(input.traffic || 0)));
    const routePaths = assignment.map((group, k) => {
      const remaining = group.slice();
      const path = [];
      let current = MAP.depot;
      let time = 0;
      while (remaining.length) {
        remaining.sort((a, b) => {
          const da = distanceUnits(current, a);
          const db = distanceUnits(current, b);
          const urgencyA = Math.max(0, time + travelMinutes(current, a, traffic, VEHICLE_SPEEDS[k]) - a.due);
          const urgencyB = Math.max(0, time + travelMinutes(current, b, traffic, VEHICLE_SPEEDS[k]) - b.due);
          return da + urgencyA * 0.08 - (db + urgencyB * 0.08) || a.id - b.id;
        });
        const next = remaining.shift();
        const drive = travelMinutes(current, next, traffic, VEHICLE_SPEEDS[k]);
        time = Math.max(time + drive, next.ready) + next.service;
        path.push(next.id);
        current = next;
      }
      return path;
    });
    return evaluateGivenRoutes(input, routePaths);
  }

  const api = {
    MAP,
    DEFAULT_CUSTOMERS,
    solveExact,
    solveGreedy,
    travelMinutes,
    distanceUnits,
    SHIFT_END
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DeliveryOptimizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
