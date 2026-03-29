(function (ns) {
  const { state } = ns;

  function getParentOrigin() {
    try {
      if (document.referrer) {
        return new URL(document.referrer).origin;
      }
    } catch (_) {}

    return window.location.origin;
  }

  const parentOrigin = getParentOrigin();

  function getDocumentHeight() {
    const html = document.documentElement;
    const body = document.body;
    return Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      html ? html.scrollHeight : 0,
      html ? html.offsetHeight : 0
    );
  }

  function reportHeight(force = false) {
    if (!state.embedded) return;

    const height = getDocumentHeight();
    if (!force && Math.abs(height - state.lastReportedHeight) < 2) return;

    state.lastReportedHeight = height;
    window.parent.postMessage(
      {
        sender: "ksplayer",
        type: "ksplayer:height",
        height,
      },
      parentOrigin
    );
  }

  function scheduleHeightReport(force = false) {
    state.forceHeightReport = state.forceHeightReport || force;
    if (state.heightRaf) return;

    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
    state.heightRaf = schedule(() => {
      state.heightRaf = 0;
      reportHeight(state.forceHeightReport);
      state.forceHeightReport = false;
    });
  }

  function clearHeightFallbackTimeouts() {
    while (state.heightFallbackTimeouts.length) {
      window.clearTimeout(state.heightFallbackTimeouts.pop());
    }
  }

  function scheduleHeightFallbackBurst(force = false) {
    clearHeightFallbackTimeouts();
    [120, 360, 900].forEach((delay) => {
      const timer = window.setTimeout(() => scheduleHeightReport(force), delay);
      state.heightFallbackTimeouts.push(timer);
    });
  }

  function installHeightObservers() {
    if (window.ResizeObserver) {
      state.heightResizeObserver = new ResizeObserver(() => scheduleHeightReport());
      state.heightResizeObserver.observe(document.body);
      state.heightResizeObserver.observe(document.documentElement);
    } else {
      if (window.MutationObserver) {
        state.heightMutationObserver = new MutationObserver(() => scheduleHeightReport());
        state.heightMutationObserver.observe(document.body, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
      scheduleHeightFallbackBurst(true);
    }

    window.addEventListener(
      "resize",
      () => {
        scheduleHeightReport();
        if (!window.ResizeObserver) {
          scheduleHeightFallbackBurst();
        }
      },
      { passive: true }
    );

    window.addEventListener("load", () => {
      reportHeight(true);
      if (!window.ResizeObserver) {
        scheduleHeightFallbackBurst(true);
      }
    });

    document.addEventListener("readystatechange", () => {
      scheduleHeightReport(true);
      if (!window.ResizeObserver) {
        scheduleHeightFallbackBurst(true);
      }
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      if (event.origin !== parentOrigin) return;
      if (event.data && event.data.type === "ksplayer:request-height") {
        reportHeight(true);
        if (!window.ResizeObserver) {
          scheduleHeightFallbackBurst(true);
        }
      }
    });
  }

  function teardown() {
    clearHeightFallbackTimeouts();
    state.heightResizeObserver?.disconnect?.();
    state.heightMutationObserver?.disconnect?.();
  }

  ns.height = {
    getDocumentHeight,
    reportHeight,
    scheduleHeightReport,
    clearHeightFallbackTimeouts,
    scheduleHeightFallbackBurst,
    installHeightObservers,
    teardown,
  };
})(window.KSPlayer || (window.KSPlayer = {}));
