/*
 * ZIP-code dynamic pricing — storefront widget.
 *
 * Calls the app proxy at the RELATIVE path /apps/pricing/estimate so the request
 * stays same-origin (Shopify signs + proxies it; backend verifies the signature).
 * Renders loading / price / invalid / out-of-zone states, debounces input,
 * caches repeat ZIPs, keeps the variant id current, and — on a successful
 * lookup — attaches the ZIP + quoted price to the product form as cart
 * line-item properties so the selection follows through to the cart/order.
 *
 * NOTE: the quoted price is a DISPLAY estimate + a line-item property. It does
 * NOT change the actual checkout price (Shopify owns that — see README).
 */
(function () {
  "use strict";

  function formatPrice(cents, currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "USD",
      }).format(cents / 100);
    } catch (e) {
      return "$" + (cents / 100).toFixed(2);
    }
  }

  function currentVariantId(root) {
    // Prefer the live selection: URL ?variant=, then the product form's id
    // field, then the server-rendered default baked into the block.
    var urlVariant = new URLSearchParams(window.location.search).get("variant");
    if (urlVariant) return urlVariant;

    var form = document.querySelector('form[action*="/cart/add"]');
    if (form) {
      var idField = form.querySelector('[name="id"]');
      if (idField && idField.value) return idField.value;
    }
    return root.getAttribute("data-variant-id") || "";
  }

  // Ensure the product form carries the quote as line-item properties.
  function attachToCart(zip, priceText) {
    var form = document.querySelector('form[action*="/cart/add"]');
    if (!form) return;
    setHidden(form, "properties[Quoted ZIP]", zip);
    setHidden(form, "properties[Quoted Price]", priceText);
  }

  function setHidden(form, name, value) {
    var input = form.querySelector('input[name="' + name + '"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments,
        ctx = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(ctx, args);
      }, ms);
    };
  }

  function initBlock(root) {
    if (root.__zippriceInit) return; // guard against double-init
    root.__zippriceInit = true;

    var input = root.querySelector("[data-zipprice-input]");
    var button = root.querySelector("[data-zipprice-submit]");
    var result = root.querySelector("[data-zipprice-result]");
    var proxyUrl = root.getAttribute("data-proxy-url") || "/apps/pricing/estimate";
    var invalidText =
      root.getAttribute("data-invalid-text") ||
      "Please enter a valid 5-digit ZIP code.";
    var unservedText =
      root.getAttribute("data-unserved-text") ||
      "We don't have pricing for your area yet.";

    var cache = {}; // zip+variant -> rendered HTML state

    function setState(kind, html) {
      result.className = "zipprice__result zipprice__result--" + kind;
      result.innerHTML = html;
    }

    function check() {
      var zip = (input.value || "").trim();

      // Client-side validation (server validates too).
      if (!/^\d{5}$/.test(zip)) {
        setState("invalid", invalidText);
        return;
      }

      var variant = currentVariantId(root);
      var key = zip + "|" + variant;
      if (cache[key]) {
        applyResult(zip, cache[key]);
        return;
      }

      setState("loading", '<span class="zipprice__spinner"></span> Checking…');

      var url =
        proxyUrl +
        "?zip=" +
        encodeURIComponent(zip) +
        "&variant=" +
        encodeURIComponent(variant);

      fetch(url, { headers: { Accept: "application/json" } })
        .then(function (res) {
          if (res.status === 400) return { error: "invalid_zip" };
          if (res.status === 429) return { error: "rate_limited" };
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data && !data.error) cache[key] = data;
          applyResult(zip, data);
        })
        .catch(function () {
          setState(
            "error",
            "Sorry, we couldn't check pricing right now. Please try again.",
          );
        });
    }

    function applyResult(zip, data) {
      if (!data || data.error === "invalid_zip") {
        setState("invalid", invalidText);
        return;
      }
      if (data.error === "rate_limited") {
        setState("error", "Too many requests — please wait a moment.");
        return;
      }

      var priceText = formatPrice(data.price, data.currency);

      if (data.served) {
        setState(
          "served",
          '<span class="zipprice__price">' +
            priceText +
            "</span>" +
            '<span class="zipprice__zone">Price for ' +
            zip +
            " · " +
            (data.zone || "your area") +
            "</span>",
        );
      } else {
        // Out of zone: still show the standard price, but flag it.
        setState(
          "unserved",
          '<span class="zipprice__price">' +
            priceText +
            "</span>" +
            '<span class="zipprice__note">' +
            unservedText +
            "</span>",
        );
      }

      attachToCart(zip, priceText);
    }

    var debouncedCheck = debounce(check, 300);

    button.addEventListener("click", check);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    });
    // Re-entering a ZIP updates the result (debounced) without a reload.
    input.addEventListener("input", function () {
      if (/^\d{5}$/.test((input.value || "").trim())) debouncedCheck();
    });
  }

  function initAll() {
    document.querySelectorAll("[data-zipprice]").forEach(initBlock);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
  // Re-init when the block is re-rendered in the theme editor.
  document.addEventListener("shopify:section:load", initAll);
})();
