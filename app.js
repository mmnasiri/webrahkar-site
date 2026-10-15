(function () {
  "use strict";

  const config = window.WEBRAHKAR_CONFIG || {};
  const menuToggle = document.getElementById("menu-toggle");
  const mainNav = document.getElementById("main-nav");
  const contactForm = document.getElementById("contact-form");
  const contactStatus = document.getElementById("form-status");

  // Mobile navigation
  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", function () {
      const isOpen = mainNav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute("aria-label", isOpen ? "بستن منو" : "باز کردن منو");
    });
    mainNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mainNav.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "باز کردن منو");
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && mainNav.classList.contains("is-open")) {
        mainNav.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.focus();
      }
    });
  }

  // Footer year
  const year = document.getElementById("current-year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Demo links stay as honest placeholders until a working demo is deployed.
  document.querySelectorAll("[data-demo-key]").forEach(function (link) {
    const key = link.getAttribute("data-demo-key");
    const destination = config.demoLinks && config.demoLinks[key];
    if (destination && /^https:\/\//i.test(destination)) {
      link.href = destination;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "اجرای دموی تعاملی";
    } else {
      link.href = "#contact";
    }
  });

  // Contact methods are centrally configured. The form uses the visitor's email app;
  // nothing is sent to a server by this static first version.
  const footerContactDetails = document.getElementById("footer-contact-details");
  if (footerContactDetails) {
    const details = [];
    if (config.contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)) {
      const mail = document.createElement("a");
      mail.href = "mailto:" + config.contactEmail;
      mail.textContent = config.contactEmail;
      details.push(mail);
    }
    if (config.phone) {
      const phone = document.createElement("a");
      phone.href = "tel:" + String(config.phone).replace(/[^+\d]/g, "");
      phone.textContent = config.phone;
      details.push(phone);
    }
    details.forEach(function (node, index) {
      if (index) footerContactDetails.appendChild(document.createTextNode(" · "));
      footerContactDetails.appendChild(node);
    });
  }

  if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!contactForm.reportValidity()) return;

      const email = String(config.contactEmail || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        contactStatus.textContent = "برای فعال‌شدن ارسال پیام، ابتدا ایمیل ارتباطی را در فایل site-config.js وارد کنید. این فرم در نسخهٔ فعلی اطلاعات را روی سرور ذخیره نمی‌کند.";
        return;
      }

      const formData = new FormData(contactForm);
      const name = String(formData.get("name") || "").trim();
      const organization = String(formData.get("organization") || "").trim();
      const replyTo = String(formData.get("replyTo") || "").trim();
      const message = String(formData.get("message") || "").trim();
      const subject = "درخواست بررسی مسئله از وب‌سایت وب‌راهکار بهینه";
      const body = [
        "نام: " + name,
        "سازمان / حوزهٔ فعالیت: " + (organization || "ذکر نشده"),
        "راه ارتباطی برای پاسخ: " + replyTo,
        "",
        "شرح مسئله:",
        message
      ].join("\n");
      contactStatus.textContent = "برنامهٔ ایمیل شما برای ارسال پیام باز می‌شود. لطفاً پیام را بررسی و ارسال کنید.";
      window.location.href = "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    });
  }
})();
