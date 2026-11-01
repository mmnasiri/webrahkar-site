(function () {
  "use strict";

  const config = window.WEBRAHKAR_CONFIG || {};

  // Keep the square brand mark consistent across every page footer.
  // The homepage already uses this asset directly; this updates legacy footer wordmarks.
  document.querySelectorAll(".site-footer .footer-brand-column > .brand img.brand-logo").forEach(function (logo) {
    logo.src = "/assets/images/Tehranrahkar_Logo.png";
    logo.className = "footer-square-logo";
    logo.width = 400;
    logo.height = 400;
    logo.decoding = "async";
  });
  const menuToggle = document.getElementById("menu-toggle");
  const mainNav = document.getElementById("main-nav");
  const contactForm = document.getElementById("contact-form");
  const contactStatus = document.getElementById("form-status");
  // Brand tagline: keep the approved phrase consistent beneath the header wordmark.
  document.querySelectorAll(".site-header .brand, .topbar .brand").forEach(function (brand) {
    if (!brand.querySelector(".brand-logo") || brand.querySelector(".brand-tagline")) return;
    const tagline = document.createElement("span");
    tagline.className = "brand-tagline";
    const first = document.createElement("span");
    first.textContent = "تصمیم‌های بهتر،";
    const second = document.createElement("strong");
    second.textContent = "اجرای مؤثرتر";
    tagline.appendChild(first);
    tagline.appendChild(document.createTextNode(" "));
    tagline.appendChild(second);
    brand.appendChild(tagline);
  });


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

  // Contact methods are centrally configured. The contact form submits directly
  // to Web3Forms so visitors do not need a local email application.
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
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const formHelp = document.getElementById("form-help");
    const originalButtonHtml = submitButton ? submitButton.innerHTML : "";

    if (submitButton) {
      submitButton.innerHTML = 'ثبت درخواست بررسی <span aria-hidden="true">←</span>';
    }
    if (formHelp) {
      formHelp.textContent = "پیام از طریق همین صفحه ارسال می‌شود؛ نیازی به باز کردن برنامهٔ ایمیل نیست.";
    }

    // Web3Forms supports this honeypot field on its free form endpoint.
    // It is hidden from real users and is only an additional anti-spam layer.
    if (!contactForm.querySelector('[name="botcheck"]')) {
      const honeypot = document.createElement("input");
      honeypot.type = "checkbox";
      honeypot.name = "botcheck";
      honeypot.tabIndex = -1;
      honeypot.autocomplete = "off";
      honeypot.setAttribute("aria-hidden", "true");
      honeypot.style.display = "none";
      contactForm.appendChild(honeypot);
    }

    function showFormStatus(message, kind) {
      if (!contactStatus) return;
      contactStatus.textContent = message;
      contactStatus.style.color = kind === "error" ? "#b45309" : "#138a72";
    }

    contactForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!contactForm.reportValidity()) return;

      const accessKey = String(config.formAccessKey || "").trim();
      if (!accessKey) {
        showFormStatus("ارسال فرم هنوز پیکربندی نشده است. لطفاً از طریق ایمیل contact@tehranrahkar.com با ما در تماس باشید.", "error");
        return;
      }

      const formData = new FormData(contactForm);
      // The honeypot should remain empty. Silently ignore submissions that fill it.
      if (formData.get("botcheck")) return;

      const name = String(formData.get("name") || "").trim();
      const organization = String(formData.get("organization") || "").trim();
      const replyTo = String(formData.get("replyTo") || "").trim();
      const message = String(formData.get("message") || "").trim();
      const replyToIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo);
      const payload = {
        access_key: accessKey,
        subject: "درخواست جدید از وب‌سایت تهران‌راهکار",
        from_name: "تهران‌راهکار | tehranrahkar.com",
        name: name,
        organization: organization || "ذکر نشده",
        contact_method: replyTo,
        message: message,
        botcheck: ""
      };
      if (replyToIsEmail) {
        payload.email = replyTo;
        payload.replyto = replyTo;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "در حال ارسال…";
        submitButton.setAttribute("aria-busy", "true");
      }
      showFormStatus("پیام شما در حال ارسال است…", "pending");

      try {
        const response = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        let result = {};
        try {
          result = await response.json();
        } catch (_) {
          result = {};
        }

        if (response.ok && result.success === true) {
          contactForm.reset();
          showFormStatus("پیام شما با موفقیت ارسال شد. از تماس شما سپاسگزاریم؛ پیام را بررسی و پاسخ خواهیم داد.", "success");
        } else {
          console.warn("Web3Forms submission failed", response.status, result.message || result.body || "No message");
          showFormStatus("ارسال پیام انجام نشد. لطفاً دوباره تلاش کنید یا مستقیماً به contact@tehranrahkar.com ایمیل بزنید.", "error");
        }
      } catch (error) {
        console.warn("Web3Forms network error", error);
        showFormStatus("ارتباط با سرویس ارسال پیام برقرار نشد. لطفاً اتصال اینترنت را بررسی و دوباره تلاش کنید؛ یا به contact@tehranrahkar.com ایمیل بزنید.", "error");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.removeAttribute("aria-busy");
          submitButton.innerHTML = originalButtonHtml;
          submitButton.innerHTML = 'ثبت درخواست بررسی <span aria-hidden="true">←</span>';
        }
      }
    });
  }
})();
