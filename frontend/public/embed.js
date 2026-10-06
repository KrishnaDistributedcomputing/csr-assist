(function () {
  "use strict";
  const script = document.currentScript;
  const base = new URL(script.src).origin;
  const position = script.dataset.position === "left" ? "left" : "right";
  const name = script.dataset.assistantName || "Mira";

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.textContent = `Open ${name}`;
  launcher.setAttribute("aria-expanded", "false");
  launcher.style.cssText = [
    "position:fixed", `${position}:24px`, "bottom:24px", "z-index:2147483646",
    "border:0", "border-radius:999px", "padding:14px 20px", "color:#fff",
    "background:#087f7a", "font:600 15px system-ui", "box-shadow:0 10px 30px #0004"
  ].join(";");

  const frame = document.createElement("iframe");
  frame.title = `${name} assistant`;
  frame.src = `${base}/?widget=1`;
  frame.style.cssText = [
    "position:fixed", `${position}:0`, "top:0", "width:min(420px,100vw)",
    "height:100vh", "z-index:2147483647", "border:0", "display:none",
    "background:#fff", "box-shadow:0 0 40px #0004"
  ].join(";");

  function open() {
    frame.style.display = "block";
    launcher.style.display = "none";
    launcher.setAttribute("aria-expanded", "true");
    frame.focus();
  }

  function close() {
    frame.style.display = "none";
    launcher.style.display = "block";
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }

  launcher.addEventListener("click", open);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && frame.style.display === "block") close();
  });
  window.addEventListener("message", (event) => {
    if (event.origin === base && event.data === "csr-assist-close") close();
  });
  document.body.append(launcher, frame);
  window.CSRAssist = Object.freeze({ open, close });
})();
