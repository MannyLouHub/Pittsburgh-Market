/* ─────────────────────────────────────────────────────────────────────────
   Pittsburgh Market Hub — site-wide password gate
   Client-side deterrent (NOT real security): the files are public on GitHub
   Pages, so a determined visitor can bypass this. It keeps the site unlisted
   from casual eyes. Only the SHA-256 HASH of the password lives here — never
   the plaintext.

   To change the password: replace HASH with the new SHA-256 hex and bump the
   ?v= version on every <script src="…/gate.js"> include so browsers refetch.
   Changing the hash also auto-re-prompts everyone (their stored token stops
   matching).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // SHA-256 of the password, lowercase hex. PLACEHOLDER — replaced at build.
  var HASH = "a4d4e35f6c234b287a45206389a14aa5a2f4f05bbef154ae73c9ddac7a11ea2a";
  var KEY = "pmh-auth";

  // Already unlocked? Bail immediately — zero impact, no flash.
  try {
    if (localStorage.getItem(KEY) === HASH) return;
  } catch (e) {
    /* localStorage blocked (private mode, etc.) — fall through to prompt */
  }

  // Hide the page synchronously, before the body paints, so protected content
  // never flashes. The overlay re-shows itself via its own visibility rule.
  var lock = document.createElement("style");
  lock.id = "pmh-lock";
  lock.textContent =
    "html{visibility:hidden!important}#pmh-gate{visibility:visible!important}";
  (document.head || document.documentElement).appendChild(lock);

  function sha256Hex(str) {
    var buf = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", buf).then(function (digest) {
      var bytes = new Uint8Array(digest), hex = "";
      for (var i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
      }
      return hex;
    });
  }

  function build() {
    var dark =
      (document.documentElement.getAttribute("data-theme") || "dark") !== "light";

    var bg = dark ? "#1c1c1c" : "#fbf2e6";
    var card = dark ? "#262626" : "#ffffff";
    var text = dark ? "#f5e8d8" : "#2a2a2a";
    var muted = dark ? "#9a96a0" : "#6b6b6b";
    var accent = dark ? "#daa520" : "#b8860b";
    var border = dark ? "rgba(218,165,32,0.28)" : "rgba(0,0,0,0.14)";
    var fieldBg = dark ? "#1c1c1c" : "#faf6ee";
    var bad = "#b84040";

    var o = document.createElement("div");
    o.id = "pmh-gate";
    o.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483647;display:flex;" +
        "align-items:center;justify-content:center;padding:24px;" +
        "background:" + bg + ";font-family:'IBM Plex Sans',system-ui,sans-serif;"
    );

    o.innerHTML =
      '<form id="pmh-form" autocomplete="off" style="' +
        "width:100%;max-width:380px;background:" + card + ";" +
        "border:1px solid " + border + ";border-radius:14px;" +
        "padding:32px 28px;box-shadow:0 24px 60px rgba(0,0,0,.35);" +
        'box-sizing:border-box;">' +
        '<div style="font-family:\'Playfair Display\',serif;font-weight:900;' +
          "font-size:22px;color:" + text + ';margin-bottom:6px;">' +
          "Pittsburgh Market Hub</div>" +
        '<div style="font-size:13px;color:' + muted + ';margin-bottom:22px;">' +
          "Enter the password to continue.</div>" +
        '<input id="pmh-pw" type="password" autofocus placeholder="Password" ' +
          'aria-label="Password" style="' +
          "width:100%;box-sizing:border-box;padding:12px 14px;font-size:15px;" +
          "border:1px solid " + border + ";border-radius:9px;background:" +
          fieldBg + ";color:" + text + ";outline:none;margin-bottom:6px;" +
          'font-family:\'IBM Plex Mono\',monospace;">' +
        '<div id="pmh-err" style="min-height:18px;font-size:12.5px;color:' +
          bad + ';margin-bottom:12px;"></div>' +
        '<button type="submit" style="' +
          "width:100%;padding:12px;font-size:15px;font-weight:600;cursor:pointer;" +
          "border:none;border-radius:9px;background:" + accent + ";" +
          'color:#1c1c1c;font-family:\'IBM Plex Sans\',sans-serif;">' +
          "Unlock</button>" +
      "</form>";

    var style = document.createElement("style");
    style.textContent =
      "@keyframes pmh-shake{0%,100%{transform:translateX(0)}" +
      "20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}";
    o.appendChild(style);

    document.body.appendChild(o);

    var form = o.querySelector("#pmh-form");
    var input = o.querySelector("#pmh-pw");
    var err = o.querySelector("#pmh-err");
    input.focus();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.textContent = "";
      var val = input.value;
      sha256Hex(val)
        .then(function (hex) {
          if (hex === HASH) {
            try { localStorage.setItem(KEY, HASH); } catch (e2) {}
            o.parentNode && o.parentNode.removeChild(o);
            var l = document.getElementById("pmh-lock");
            l && l.parentNode.removeChild(l);
          } else {
            err.textContent = "Incorrect password.";
            form.style.animation = "pmh-shake .4s";
            input.value = "";
            input.focus();
            setTimeout(function () { form.style.animation = ""; }, 400);
          }
        })
        .catch(function () {
          err.textContent = "Could not verify — please try again.";
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
