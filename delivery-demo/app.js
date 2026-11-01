(function () {
  "use strict";
  const API = window.DeliveryOptimizer;
  if (!API) return;

  const numberFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
  const oneDecimalFmt = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const map = document.getElementById("route-map");
  const routesLayer = document.getElementById("routes-layer");
  const markersLayer = document.getElementById("markers-layer");
  const trafficSlider = document.getElementById("traffic-slider");
  const slackSlider = document.getElementById("slack-slider");
  const capacitySlider = document.getElementById("capacity-slider");
  const statusNode = document.getElementById("solve-status");
  const resetButton = document.getElementById("reset-button");
  const ordersList = document.getElementById("orders-list");
  const routeLegend = document.getElementById("route-legend");
  const planButtons = Array.from(document.querySelectorAll("[data-plan]"));

  let customers = JSON.parse(JSON.stringify(API.DEFAULT_CUSTOMERS));
  let exactPlan = null;
  let greedyPlan = null;
  let selectedPlan = "exact";
  let worker = null;
  let latestRequestId = 0;
  let pendingTimer = null;
  let draggingCustomerId = null;
  let currentPointerId = null;

  try {
    worker = new Worker("solver.worker.js");
    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", function () {
      // Fall back to the same exact solver on the main thread if worker loading
      // is blocked by a browser or hosting policy. The eight-order model is small.
      worker = null;
      setStatus("حل‌گر در مرورگر اجرا می‌شود؛ یک لحظه صبر کنید…", "pending");
      runSolve();
    });
  } catch (_) {
    worker = null;
  }

  function faNum(value) { return numberFmt.format(Math.round(Number(value) || 0)); }
  function fmtDecimal(value) { return oneDecimalFmt.format(Number(value) || 0); }
  function fmtBigCount(value) {
    try { return new Intl.NumberFormat("fa-IR").format(BigInt(value || "0")); }
    catch (_) { return String(value || "0"); }
  }
  function fmtClock(minutes) {
    const total = 8 * 60 + Math.max(0, Math.round(minutes || 0));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return (String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0")).replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  }
  function inputState() {
    return {
      customers: JSON.parse(JSON.stringify(customers)),
      traffic: Number(trafficSlider.value),
      deadlineSlack: Number(slackSlider.value),
      baseCapacity: Number(capacitySlider.value)
    };
  }
  function vehicleCaps() {
    const cap = Number(capacitySlider.value);
    return [cap - 1, cap, cap];
  }
  function refreshControlLabels() {
    document.getElementById("traffic-value").textContent = `${faNum(trafficSlider.value)}٪`;
    document.getElementById("slack-value").textContent = `${faNum(slackSlider.value)} دقیقه`;
    document.getElementById("capacity-value").textContent = `${faNum(capacitySlider.value)} واحد`;
    const caps = vehicleCaps();
    document.getElementById("capacity-help").textContent = `ظرفیت‌ها: خودرو ۱ = ${faNum(caps[0])}، خودرو ۲ = ${faNum(caps[1])}، خودرو ۳ = ${faNum(caps[2])}`;
  }
  function setStatus(message, kind) {
    statusNode.className = `solve-status${kind ? ` is-${kind}` : ""}`;
    statusNode.innerHTML = "";
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    statusNode.appendChild(spinner);
    const text = document.createElement("span");
    text.textContent = message;
    statusNode.appendChild(text);
    if (kind === "pending") statusNode.classList.add("is-pending");
  }

  function scheduleSolve(delay) {
    // Invalidate any in-flight answer as soon as inputs change, before debouncing.
    latestRequestId += 1;
    refreshControlLabels();
    if (pendingTimer) clearTimeout(pendingTimer);
    setStatus("پارامترها تغییر کرده‌اند؛ در حال محاسبهٔ دوبارهٔ برنامه‌ها…", "pending");
    pendingTimer = setTimeout(runSolve, typeof delay === "number" ? delay : 220);
  }

  function runSolve() {
    pendingTimer = null;
    const requestId = ++latestRequestId;
    const input = inputState();
    if (worker) {
      worker.postMessage({ requestId, input });
      return;
    }
    // Fallback for browsers without Worker support.
    window.setTimeout(function () {
      try {
        handleWorkerMessage({ data: {
          requestId,
          exact: API.solveExact(input),
          greedy: API.solveGreedy(input)
        } });
      } catch (error) {
        setStatus(`حل مساله ناموفق بود: ${error.message || error}`, "error");
      }
    }, 0);
  }

  function handleWorkerMessage(event) {
    const data = event.data || {};
    if (data.requestId !== latestRequestId) return;
    if (data.error) {
      setStatus(`حل مساله ناموفق بود: ${data.error}`, "error");
      return;
    }
    exactPlan = data.exact;
    greedyPlan = data.greedy;
    if (!exactPlan || exactPlan.status !== "optimal") {
      setStatus((exactPlan && exactPlan.message) || "برای این ورودی‌ها برنامهٔ قابل اجرا پیدا نشد. ظرفیت ناوگان و شرایط سفارش‌ها را بررسی کنید.", "error");
      renderMarkers();
      renderRoutes();
      renderOrdersList();
      return;
    }
    const routeCount = faNum(exactPlan.routeSequencesEvaluated);
    const transitionCount = faNum(exactPlan.partitionTransitions);
    const timeText = `${fmtDecimal(exactPlan.solveMs)} میلی‌ثانیه`;
    setStatus(`حل کامل شد؛ ${routeCount} ترتیب مسیر و ${transitionCount} حالت تخصیص بررسی شد. بهترین جواب در مدل فعلی اثبات شده است.`, "success");
    document.getElementById("sequence-count").textContent = routeCount;
    document.getElementById("partition-count").textContent = transitionCount;
    document.getElementById("all-ontime-count").textContent = fmtBigCount(exactPlan.allOnTimeFleetPlansCount);
    document.getElementById("solve-time").textContent = timeText;
    renderPlanMetrics();
    renderMarkers();
    renderRoutes();
    renderOrdersList();
    renderLegend();
  }

  function getPosition(id) {
    if (id === 0) return API.MAP.depot;
    return customers.find(c => c.id === id);
  }

  function pathToSvg(route, isGreedy) {
    const ids = [0].concat(route.path || [], [0]);
    if (!route.path || !route.path.length) return "";
    let d = "";
    for (let i = 0; i < ids.length - 1; i++) {
      const a = getPosition(ids[i]);
      const b = getPosition(ids[i + 1]);
      if (!a || !b) continue;
      if (!d) d = `M ${a.x} ${a.y}`;
      // Each leg follows a simple rectilinear street-network path.
      d += ` L ${b.x} ${a.y} L ${b.x} ${b.y}`;
    }
    return `<path class="route-path${isGreedy ? " is-greedy" : ""}" d="${d}" stroke="${route.color}" aria-label="${route.vehicleName}"/>`;
  }

  function renderRoutes() {
    if (!routesLayer) return;
    const plan = selectedPlan === "exact" ? exactPlan : greedyPlan;
    if (!plan || !plan.routes) {
      routesLayer.innerHTML = "";
      return;
    }
    const isGreedy = selectedPlan === "greedy";
    routesLayer.innerHTML = plan.routes.map(route => pathToSvg(route, isGreedy)).join("");
  }

  function renderMarkers() {
    if (!markersLayer) return;
    const customerMarkup = customers.map(c => `
      <g class="customer-marker${draggingCustomerId === c.id ? " is-dragging" : ""}" data-customer-id="${c.id}" tabindex="0" role="button" aria-label="سفارش ${c.id}، بار ${c.demand} واحد؛ برای تغییر موقعیت بکشید" transform="translate(${c.x} ${c.y})">
        <circle class="pin-circle" r="15"></circle>
        <text class="pin-number" x="0" y="1">${faNum(c.id)}</text>
        <circle class="demand-badge" cx="13" cy="-13" r="8"></circle>
        <text class="demand-number" x="13" y="-12">${faNum(c.demand)}</text>
      </g>`).join("");
    markersLayer.innerHTML = `
      <g class="depot-marker" transform="translate(${API.MAP.depot.x} ${API.MAP.depot.y})" aria-label="انبار مرکزی">
        <rect class="depot-box" x="-15" y="-15" width="30" height="30" rx="8"></rect>
        <circle class="depot-inner" cx="0" cy="0" r="4"></circle>
        <text class="depot-label" x="0" y="29">انبار</text>
      </g>${customerMarkup}`;
  }

  function renderLegend() {
    const plan = selectedPlan === "exact" ? exactPlan : greedyPlan;
    if (!plan) return;
    routeLegend.innerHTML = plan.routes.map(route => `
      <span class="legend-item"><i class="legend-line" style="background-color:${route.color};${selectedPlan === "greedy" ? "background-image:linear-gradient(90deg,transparent 45%,white 45%,white 65%,transparent 65%)" : ""}"></i>${route.vehicleName} · ${faNum(route.load)}/${faNum(route.capacity)} واحد بار</span>`).join("");
  }

  function renderPlanMetrics() {
    if (!exactPlan || !greedyPlan || !exactPlan.metrics || !greedyPlan.metrics) return;
    fillPlan("simple", greedyPlan);
    fillPlan("exact", exactPlan);
    const simple = greedyPlan.metrics;
    const exact = exactPlan.metrics;
    const diffOnTime = exact.onTimeCount - simple.onTimeCount;
    const diffLate = simple.lateMinutes - exact.lateMinutes;
    let note;
    if (diffOnTime > 0) note = `حل‌گر دقیق، با همین ورودی‌ها ${faNum(diffOnTime)} تحویل به‌موقع بیشتر از روش ساده پیدا کرده است.`;
    else if (diffLate > 0) note = `تعداد تحویل‌های به‌موقع برابر است، اما حل‌گر دقیق مجموع تأخیر را ${faNum(diffLate)} دقیقه کاهش داده است.`;
    else note = "تعداد تحویل‌های به‌موقع و مجموع تأخیر دو برنامه با ورودی‌های یکسان مقایسه شده‌اند؛ تفاوت ممکن است در معیارهای دیگر هم دیده شود.";
    const h = document.querySelector(".results-intro");
    if (h) h.textContent = note;
  }

  function fillPlan(prefix, plan) {
    const m = plan.metrics;
    document.getElementById(`${prefix}-ontime`).textContent = `${faNum(m.onTimeCount)} / ${faNum(m.totalCustomers)}`;
    document.getElementById(`${prefix}-lateness`).textContent = `${faNum(m.lateMinutes)} دقیقه · ${faNum(m.lateCount)} سفارش دیرکرددار`;
    document.getElementById(`${prefix}-distance`).textContent = `${fmtDecimal(m.distance)} واحد`;
    document.getElementById(`${prefix}-overtime`).textContent = `${faNum(m.overtime)} دقیقه`;
    const list = document.getElementById(`${prefix}-routes`);
    list.innerHTML = plan.routes.map(route => {
      const routeOnTime = route.visits.filter(v => v.late === 0).length;
      const routeLate = route.visits.filter(v => v.late > 0).length;
      const orderList = route.path.length ? `انبار / ${route.path.map(faNum).join(" / ")} / انبار` : "بدون سفارش";
      const capacityText = `${faNum(route.load)}/${faNum(route.capacity)} بار`;
      const statusClass = routeLate ? "is-late" : "is-good";
      const statusText = route.path.length ? `${faNum(routeOnTime)}/${faNum(route.path.length)} به‌موقع` : "—";
      return `<div class="route-summary"><i class="route-summary-dot" style="background:${route.color}"></i><div class="route-summary-main"><strong>${route.vehicleName} · ${capacityText}</strong><small>${orderList}<br>بازگشت: ${fmtClock(route.returnTime)}</small></div><span class="route-summary-status ${statusClass}">${statusText}</span></div>`;
    }).join("");
  }

  function renderOrdersList() {
    const slack = Number(slackSlider.value);
    ordersList.innerHTML = customers.slice().sort((a, b) => a.id - b.id).map(c => `
      <button type="button" class="order-detail" data-focus-customer="${c.id}" aria-label="رفتن به سفارش ${c.id} روی نقشه">
        <span class="order-detail-num">${faNum(c.id)}</span>
        <span class="order-detail-text"><strong>سفارش ${faNum(c.id)} · بار ${faNum(c.demand)} واحد</strong><small>بازهٔ تحویل: ${fmtClock(c.ready)} تا ${fmtClock(c.due + slack)} · خدمت: ${faNum(c.service)} دقیقه</small></span>
      </button>`).join("");
  }

  function pointFromEvent(event) {
    const pt = map.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const matrix = map.getScreenCTM();
    return matrix ? pt.matrixTransform(matrix.inverse()) : { x: 0, y: 0 };
  }

  map.addEventListener("pointerdown", function (event) {
    const marker = event.target.closest && event.target.closest("[data-customer-id]");
    if (!marker) return;
    draggingCustomerId = Number(marker.getAttribute("data-customer-id"));
    currentPointerId = event.pointerId;
    try { map.setPointerCapture(event.pointerId); } catch (_) { /* optional browser capability */ }
    renderMarkers();
    renderRoutes();
    event.preventDefault();
  });

  map.addEventListener("pointermove", function (event) {
    if (draggingCustomerId === null || (currentPointerId !== null && event.pointerId !== currentPointerId)) return;
    const point = pointFromEvent(event);
    const customer = customers.find(c => c.id === draggingCustomerId);
    if (!customer) return;
    customer.x = Math.max(28, Math.min(672, Math.round(point.x)));
    customer.y = Math.max(28, Math.min(412, Math.round(point.y)));
    renderMarkers();
    renderRoutes();
  });

  function finishDrag(event) {
    if (draggingCustomerId === null) return;
    if (event && currentPointerId !== null && event.pointerId !== currentPointerId) return;
    draggingCustomerId = null;
    currentPointerId = null;
    renderMarkers();
    scheduleSolve(80);
  }
  map.addEventListener("pointerup", finishDrag);
  map.addEventListener("pointercancel", finishDrag);

  ordersList.addEventListener("click", function (event) {
    const button = event.target.closest && event.target.closest("[data-focus-customer]");
    if (!button) return;
    const id = Number(button.getAttribute("data-focus-customer"));
    const marker = markersLayer.querySelector(`[data-customer-id="${id}"]`);
    if (marker) {
      marker.focus({ preventScroll: true });
      marker.classList.add("is-dragging");
      setTimeout(() => marker.classList.remove("is-dragging"), 450);
    }
  });

  trafficSlider.addEventListener("input", () => scheduleSolve(240));
  slackSlider.addEventListener("input", () => {
    renderOrdersList();
    scheduleSolve(220);
  });
  capacitySlider.addEventListener("input", () => scheduleSolve(200));

  planButtons.forEach(button => {
    button.addEventListener("click", function () {
      selectedPlan = button.getAttribute("data-plan");
      planButtons.forEach(b => b.classList.toggle("is-selected", b === button));
      renderRoutes();
      renderLegend();
    });
  });

  resetButton.addEventListener("click", function () {
    if (pendingTimer) clearTimeout(pendingTimer);
    customers = JSON.parse(JSON.stringify(API.DEFAULT_CUSTOMERS));
    trafficSlider.value = "80";
    slackSlider.value = "0";
    capacitySlider.value = "6";
    selectedPlan = "exact";
    planButtons.forEach(b => b.classList.toggle("is-selected", b.getAttribute("data-plan") === "exact"));
    refreshControlLabels();
    renderMarkers();
    renderRoutes();
    renderOrdersList();
    scheduleSolve(25);
  });

  // Do not display a stored answer before the initial solve finishes.
  refreshControlLabels();
  renderMarkers();
  renderOrdersList();
  scheduleSolve(30);
})();
