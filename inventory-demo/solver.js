(function (root) {
  "use strict";
  const DEFAULT_DEMAND = [14, 18, 26, 12, 25, 20];
  const DEFAULT_PRICES = [11, 10, 15, 9, 14, 10];
  const DEFAULT_SETTINGS = {
    initialInventory: 20,
    fixedOrderCost: 50,
    holdingCost: 1,
    orderCapacity: 55,
    storageCapacity: 70
  };

  function validateInput(input) {
    if (!input || !Array.isArray(input.demands) || !Array.isArray(input.prices) ||
        input.demands.length !== 6 || input.prices.length !== 6) {
      throw new Error("برای هر شش دوره باید تقاضا و قیمت وارد شود.");
    }
    const settings = input.settings || DEFAULT_SETTINGS;
    const ranges = {
      initialInventory: [0, 200],
      fixedOrderCost: [0, 2000],
      holdingCost: [0, 100],
      orderCapacity: [0, 100],
      storageCapacity: [1, 200]
    };
    for (const key of Object.keys(ranges)) {
      const value = Number(settings[key]);
      const bounds = ranges[key];
      if (!Number.isInteger(value) || value < bounds[0] || value > bounds[1]) {
        throw new Error("مقدار «" + key + "» خارج از محدودهٔ مجاز است.");
      }
    }
    if (settings.initialInventory > settings.storageCapacity) {
      throw new Error("موجودی اولیه نباید از ظرفیت انبار بیشتر باشد.");
    }
    const demands = input.demands.map(Number);
    const prices = input.prices.map(Number);
    if (demands.some(v => !Number.isInteger(v) || v < 0 || v > 60)) {
      throw new Error("تقاضای هر دوره باید عددی بین صفر و ۶۰ باشد.");
    }
    if (prices.some(v => !Number.isInteger(v) || v < 1 || v > 100)) {
      throw new Error("قیمت خرید هر دوره باید عددی بین ۱ تا ۱۰۰ باشد.");
    }
    const normalized = {};
    for (const key of Object.keys(ranges)) normalized[key] = Number(settings[key]);
    return { demands, prices, settings: normalized };
  }

  function evaluateOrders(orders, demands, prices, settings) {
    let inventory = settings.initialInventory;
    let purchaseCost = 0;
    let orderingCost = 0;
    let holdingCost = 0;
    const periods = [];
    for (let t = 0; t < demands.length; t++) {
      const opening = inventory;
      const q = orders[t];
      const available = opening + q;
      if (q < 0 || q > settings.orderCapacity || available > settings.storageCapacity || available < demands[t]) {
        return { feasible: false, reason: "محدودیت ظرفیت تأمین یا انبار اجازهٔ پوشش تقاضا را نمی‌دهد." };
      }
      const ending = available - demands[t];
      const pCost = q * prices[t];
      const fCost = q > 0 ? settings.fixedOrderCost : 0;
      const hCost = ending * settings.holdingCost;
      purchaseCost += pCost;
      orderingCost += fCost;
      holdingCost += hCost;
      periods.push({
        period: t + 1,
        demand: demands[t],
        price: prices[t],
        openingInventory: opening,
        orderQuantity: q,
        endingInventory: ending,
        purchaseCost: pCost,
        orderingCost: fCost,
        holdingCost: hCost,
        totalCost: pCost + fCost + hCost
      });
      inventory = ending;
    }
    return {
      feasible: true,
      orders: orders.slice(),
      periods,
      purchaseCost,
      orderingCost,
      holdingCost,
      totalCost: purchaseCost + orderingCost + holdingCost,
      orderCount: orders.filter(q => q > 0).length,
      orderedUnits: orders.reduce((sum, q) => sum + q, 0),
      endingInventory: inventory
    };
  }

  function solveBaseline(demands, prices, settings) {
    let inventory = settings.initialInventory;
    const orders = [];
    for (let t = 0; t < demands.length; t++) {
      const quantity = Math.max(0, demands[t] - inventory);
      if (quantity > settings.orderCapacity) {
        return {
          feasible: false,
          reason: "در دورهٔ " + (t + 1) + "، برای پوشش تقاضا باید " + quantity +
            " واحد سفارش داد، اما سقف سفارش " + settings.orderCapacity + " واحد است. سیاست ساده پیش‌خرید نمی‌کند."
        };
      }
      if (inventory + quantity > settings.storageCapacity) {
        return {
          feasible: false,
          reason: "در دورهٔ " + (t + 1) + "، ظرفیت انبار برای سیاست ساده کافی نیست."
        };
      }
      orders.push(quantity);
      inventory = inventory + quantity - demands[t];
    }
    return evaluateOrders(orders, demands, prices, settings);
  }

  function solveExact(demands, prices, settings) {
    // Dynamic programming: for each period, retain the cheapest path to each ending inventory.
    let states = new Map([[settings.initialInventory, { cost: 0, orderCount: 0, orders: [] }]]);
    let transitionsEvaluated = 0;
    let statesRetained = 1;
    for (let t = 0; t < demands.length; t++) {
      const next = new Map();
      for (const [openingInventory, previous] of states.entries()) {
        const maxOrder = Math.min(settings.orderCapacity, settings.storageCapacity - openingInventory);
        for (let q = 0; q <= maxOrder; q++) {
          transitionsEvaluated += 1;
          const available = openingInventory + q;
          if (available < demands[t]) continue;
          const endingInventory = available - demands[t];
          const periodCost = (q > 0 ? settings.fixedOrderCost : 0) +
            q * prices[t] + endingInventory * settings.holdingCost;
          const candidate = {
            cost: previous.cost + periodCost,
            orderCount: previous.orderCount + (q > 0 ? 1 : 0),
            orders: previous.orders.concat(q)
          };
          const current = next.get(endingInventory);
          if (!current || candidate.cost < current.cost ||
              (candidate.cost === current.cost && candidate.orderCount < current.orderCount)) {
            next.set(endingInventory, candidate);
          }
        }
      }
      states = next;
      statesRetained += states.size;
      if (states.size === 0) {
        return {
          feasible: false,
          reason: "با ظرفیت سفارش و فضای انبار فعلی، پوشش تقاضای شش دوره بدون کمبود ممکن نیست.",
          transitionsEvaluated,
          statesRetained
        };
      }
    }
    let best = null;
    let bestEndingInventory = Infinity;
    for (const [endingInventory, candidate] of states.entries()) {
      if (!best || candidate.cost < best.cost ||
          (candidate.cost === best.cost && candidate.orderCount < best.orderCount) ||
          (candidate.cost === best.cost && candidate.orderCount === best.orderCount && endingInventory < bestEndingInventory)) {
        best = candidate;
        bestEndingInventory = endingInventory;
      }
    }
    const evaluated = evaluateOrders(best.orders, demands, prices, settings);
    return Object.assign({}, evaluated, {
      transitionsEvaluated,
      statesRetained
    });
  }

  function solve(input) {
    const normalized = validateInput(input);
    const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const exact = solveExact(normalized.demands, normalized.prices, normalized.settings);
    const baseline = solveBaseline(normalized.demands, normalized.prices, normalized.settings);
    const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    return {
      exact,
      baseline,
      demands: normalized.demands,
      prices: normalized.prices,
      settings: normalized.settings,
      solveMs: Math.max(0, end - start)
    };
  }

  const api = { DEFAULT_DEMAND, DEFAULT_PRICES, DEFAULT_SETTINGS, validateInput, solve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.InventoryPlanner = api;
})(typeof self !== "undefined" ? self : globalThis);
