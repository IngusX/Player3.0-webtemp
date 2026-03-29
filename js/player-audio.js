(function (ns) {
  const { config, dom, state, utils } = ns;
  const supportsAbort = typeof window !== "undefined" && typeof window.AbortController !== "undefined";
  const usesNativePlayback = () => Boolean(ns.native?.isAvailable?.());

  const liveSrc = () => `${config.streamUrl}?_=${Date.now()}`;

  async function goLive(forceLive = false) {
    if (usesNativePlayback()) {
      const ok = await ns.native.play();
      ns.ui.updatePlayButton(ok, { skipNativeSync: true });
      if (ok) {
        state.hasEverPlayed = true;
        state.nativeIsPlaying = true;
        ns.native.syncState(true);
      }
      return;
    }

    const wasMuted = dom.player.muted;
    const prevVol = dom.player.volume;

    if (forceLive) {
      try {
        dom.player.pause();
      } catch (_) {}
      dom.player.src = "";
      dom.player.load();
      dom.player.src = liveSrc();
    } else if (!dom.player.src) {
      dom.player.src = liveSrc();
    } else if (dom.player.readyState < 2) {
      try {
        dom.player.load();
      } catch (_) {}
    }

    try {
      await dom.player.play();
      ns.ui.updatePlayButton(true);
      state.hasEverPlayed = true;
    } catch (error) {
      console.error("No se pudo reproducir:", error);
      ns.ui.updatePlayButton(false);
    }

    dom.player.muted = wasMuted;
    dom.player.volume = ns.device.profile.shouldHideVolumeUi ? 1 : prevVol;
  }

  function pausePlayback() {
    if (usesNativePlayback()) {
      ns.native.pause();
      state.nativeIsPlaying = false;
      ns.ui.updatePlayButton(false, { skipNativeSync: true });
      state.lastPauseAt = Date.now();
      return;
    }

    try {
      dom.player.pause();
      ns.ui.updatePlayButton(false);
      state.lastPauseAt = Date.now();
    } catch (_) {}
  }

  async function resumeFromMediaSession() {
    const pausedLong =
      state.hasEverPlayed &&
      state.lastPauseAt &&
      Date.now() - state.lastPauseAt >= 60 * 1000;

    await goLive(Boolean(pausedLong));
    state.hasEverPlayed = true;
  }

  function clearLiveRefresh() {
    if (!state.liveRefreshTimer) return;
    window.clearTimeout(state.liveRefreshTimer);
    state.liveRefreshTimer = 0;
  }

  function scheduleLiveRefresh() {
    clearLiveRefresh();
    if (usesNativePlayback()) return;
    if (dom.player.paused) return;

    state.liveRefreshTimer = window.setTimeout(async () => {
      state.liveRefreshTimer = 0;
      if (dom.player.paused) return;
      try {
        await goLive(true);
      } catch (_) {}
      scheduleLiveRefresh();
    }, config.liveRefreshMs);
  }

  function recover() {
    if (usesNativePlayback()) return;
    if (dom.player.paused || state.recovering) return;

    const now = Date.now();
    if (now - state.lastRecoverAt < 8000) return;

    state.recovering = true;
    setTimeout(async () => {
      try {
        await goLive();
      } catch (_) {
      } finally {
        state.recovering = false;
        state.lastRecoverAt = Date.now();
      }
    }, 400);
  }

  function clearStallWatchdog() {
    if (!state.stallWatchdogTimer) return;
    window.clearTimeout(state.stallWatchdogTimer);
    state.stallWatchdogTimer = 0;
  }

  function armStallWatchdog(resetBaseline = false) {
    if (usesNativePlayback()) return;
    clearStallWatchdog();
    if (dom.player.paused) return;

    if (resetBaseline || !state.lastTUAt) {
      state.lastTUAt = Date.now();
      state.lastTime = dom.player.currentTime || 0;
    }

    state.stallWatchdogTimer = window.setTimeout(() => {
      state.stallWatchdogTimer = 0;
      if (dom.player.paused) return;

      const now = Date.now();
      const timeAdvanced = (dom.player.currentTime || 0) > state.lastTime + 0.05;
      const stale = now - state.lastTUAt > 10000;
      const lowReady = dom.player.readyState < 3;

      if (!timeAdvanced && stale && lowReady) {
        recover("stall-watchdog");
      }

      armStallWatchdog();
    }, config.stallTimeoutMs);
  }

  function getPollDelay() {
    return document.hidden ? config.pollHiddenMs : config.pollVisibleMs;
  }

  function schedulePoll(runSoon = false) {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = window.setTimeout(() => {
      fetchAndRender();
    }, runSoon ? 0 : getPollDelay());
  }

  async function fetchAndRender() {
    try {
      if (supportsAbort && state.inFlight) {
        try {
          state.inFlight.abort();
        } catch (_) {}
      }

      state.inFlight = supportsAbort ? new AbortController() : null;
      const requestOptions = { cache: "no-store" };
      if (supportsAbort && state.inFlight) {
        requestOptions.signal = state.inFlight.signal;
      }

      const response = await fetch(utils.urlNoCache(config.endpoint), requestOptions);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      ns.ui.updateCurrentTrack(data?.now_playing?.song || {}, data?.station?.art || "");
      ns.ui.updateSourceBadge(data);
      ns.ui.updateHistory(data?.song_history || []);
      utils.requestHeightReport();
    } catch (error) {
      if (!(supportsAbort && error && error.name === "AbortError")) {
        console.error("Error (fetch):", error);
        ns.ui.renderFetchError();
        utils.requestHeightReport();
      }
    } finally {
      schedulePoll();
    }
  }

  async function onPlayButtonClick() {
    try {
      if (state.playedOnTouchAt && Date.now() - state.playedOnTouchAt < 400) {
        state.playedOnTouchAt = 0;
        return;
      }

      if ((usesNativePlayback() && !state.nativeIsPlaying) || (!usesNativePlayback() && dom.player.paused)) {
        await resumeFromMediaSession();
      } else {
        pausePlayback();
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function onPlayButtonTouchStart() {
    try {
      if (usesNativePlayback()) {
        if (!state.nativeIsPlaying) {
          await resumeFromMediaSession();
          state.playedOnTouchAt = Date.now();
        }
        return;
      }

      if (dom.player.paused) {
        const pausedLong =
          state.hasEverPlayed &&
          state.lastPauseAt &&
          Date.now() - state.lastPauseAt >= 60 * 1000;

        if (pausedLong) {
          try {
            await goLive(true);
            state.hasEverPlayed = true;
            state.playedOnTouchAt = Date.now();
            return;
          } catch (_) {}
        }

        if (!dom.player.src) {
          dom.player.src = liveSrc();
        }

        try {
          await dom.player.play();
          ns.ui.updatePlayButton(true);
          state.hasEverPlayed = true;
          state.playedOnTouchAt = Date.now();
        } catch (_) {
          try {
            dom.player.load();
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  function onVisibilityChange() {
    if (!document.hidden) {
      schedulePoll(true);
      if (usesNativePlayback()) {
        ns.native.hydrateState?.();
      } else if (!dom.player.paused) {
        recover("visibility");
        scheduleLiveRefresh();
        armStallWatchdog(true);
      }
    }
  }

  function initialize() {
    dom.btnPlay.addEventListener("click", onPlayButtonClick);
    dom.btnPlay.addEventListener("touchstart", onPlayButtonTouchStart, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (usesNativePlayback()) {
      ns.native.hydrateState?.();
      fetchAndRender();
      return;
    }

    ["error", "emptied"].forEach((eventName) => {
      dom.player.addEventListener(eventName, () => recover(eventName), { passive: true });
    });

    dom.player.addEventListener(
      "timeupdate",
      () => {
        state.lastTUAt = Date.now();
        state.lastTime = dom.player.currentTime || 0;
        armStallWatchdog();
      },
      { passive: true }
    );

    ["play", "playing", "waiting", "stalled", "seeking"].forEach((eventName) => {
      dom.player.addEventListener(
        eventName,
        () => {
          scheduleLiveRefresh();
          armStallWatchdog(eventName === "play" || eventName === "playing");
        },
        { passive: true }
      );
    });

    ["pause", "ended"].forEach((eventName) => {
      dom.player.addEventListener(
        eventName,
        () => {
          clearLiveRefresh();
          clearStallWatchdog();
          ns.ui.updatePlayButton(false);
          if (eventName === "ended") {
            ns.native?.stop?.();
          }
        },
        { passive: true }
      );
    });

    dom.player.src = config.streamUrl;
    if (ns.device.profile.isAndroidTouch || ns.device.profile.isAppleTouch) {
      dom.player.preload = "auto";
    }

    fetchAndRender();
  }

  function teardown() {
    if (usesNativePlayback()) {
      ns.native?.stop?.();
    }
    clearLiveRefresh();
    clearStallWatchdog();
    if (state.pollTimer) {
      window.clearTimeout(state.pollTimer);
    }
    if (supportsAbort && state.inFlight) {
      try {
        state.inFlight.abort();
      } catch (_) {}
    }
  }

  ns.audio = {
    initialize,
    teardown,
    fetchAndRender,
    schedulePoll,
    goLive,
    recover,
    pausePlayback,
    resumeFromMediaSession,
  };
})(window.KSPlayer || (window.KSPlayer = {}));
