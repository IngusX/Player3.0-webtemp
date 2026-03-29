(function (ns) {
  const { dom } = ns;

  function matches(query) {
    try {
      return Boolean(window.matchMedia && window.matchMedia(query).matches);
    } catch (_) {
      return false;
    }
  }

  function detectDeviceProfile(nav = navigator, win = window) {
    const ua = nav.userAgent || nav.vendor || "";
    const platform = nav.platform || "";
    const maxTouchPoints = Number(nav.maxTouchPoints) || 0;
    const touchCapable = maxTouchPoints > 0 || "ontouchstart" in win;
    const finePointer = matches("(pointer: fine)");
    const hover = matches("(hover: hover)");
    const anyHover = matches("(any-hover: hover)");
    const coarsePointer = matches("(pointer: coarse)");
    const appleTouch = /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
    const androidTouch = /Android/i.test(ua) && touchCapable;
    const likelyDesktop = finePointer || hover || anyHover;

    return {
      ua,
      platform,
      maxTouchPoints,
      touchCapable,
      finePointer,
      coarsePointer,
      likelyDesktop,
      isAppleTouch: appleTouch,
      isAndroidTouch: androidTouch,
      shouldHideVolumeUi: appleTouch || (androidTouch && touchCapable && !likelyDesktop),
    };
  }

  function setVolumeUiState(hidden) {
    document.documentElement.classList.toggle("no-volume-ui", hidden);
    if (dom.volumeHint) {
      dom.volumeHint.hidden = !hidden;
    }
    if (dom.volRange) {
      dom.volRange.disabled = hidden;
    }
  }

  ns.device = {
    detectDeviceProfile,
    profile: detectDeviceProfile(),
    setVolumeUiState,
  };
})(window.KSPlayer || (window.KSPlayer = {}));
