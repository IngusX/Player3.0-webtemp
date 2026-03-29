(function (ns) {
  let requestId = 0;
  const pending = new Map();

  function getCapacitorRoot() {
    if (window.Capacitor?.Plugins) return window.Capacitor;

    try {
      if (window.parent && window.parent !== window && window.parent.Capacitor?.Plugins) {
        return window.parent.Capacitor;
      }
    } catch (_) {}

    try {
      if (window.top && window.top !== window && window.top.Capacitor?.Plugins) {
        return window.top.Capacitor;
      }
    } catch (_) {}

    return null;
  }

  function getPlugin() {
    return getCapacitorRoot()?.Plugins?.MediaControls || null;
  }

  function canUseHostBridge() {
    try {
      return Boolean(window.parent && window.parent !== window);
    } catch (_) {
      return false;
    }
  }

  function callHostBridge(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!canUseHostBridge()) {
        reject(new Error("Host bridge unavailable"));
        return;
      }

      const id = `native-${Date.now()}-${++requestId}`;
      pending.set(id, { resolve, reject });

      window.parent.postMessage(
        {
          sender: "ksplayer-native",
          type: "ksplayer:native-request",
          action,
          requestId: id,
          payload,
        },
        "*"
      );

      window.setTimeout(() => {
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        reject(new Error(`Native bridge timeout for ${action}`));
      }, 5000);
    });
  }

  function handleHostBridgeMessage(event) {
    const data = event.data || {};
    if (data.sender !== "ksplayer-native-host") return;
    if (data.type !== "ksplayer:native-response") return;

    const entry = pending.get(data.requestId);
    if (!entry) return;

    pending.delete(data.requestId);
    if (data.error) {
      entry.reject(new Error(data.error));
      return;
    }

    entry.resolve(data.result || { ok: true });
  }

  window.addEventListener("message", handleHostBridgeMessage);

  function isAvailable() {
    return Boolean(getPlugin());
  }

  async function play() {
    const payload = {
      title: ns.state.currentTrack.title || "Konata Station",
      artist: ns.state.currentTrack.artist || "AUTO DJ",
      artUrl: ns.state.currentTrack.art || "",
      streamUrl: ns.config.streamUrl,
    };

    try {
      if (canUseHostBridge()) {
        await callHostBridge("playStream", payload);
      } else {
        const plugin = getPlugin();
        if (!plugin) return false;
        await plugin.playStream(payload);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function pause() {
    try {
      if (canUseHostBridge()) {
        await callHostBridge("pause");
      } else {
        const plugin = getPlugin();
        if (!plugin) return false;
        await plugin.pause();
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function syncState(force = false) {
    const shouldSync = force || ns.state.hasEverPlayed || ns.state.nativeIsPlaying;
    if (!shouldSync) return;

    const payload = {
      title: ns.state.currentTrack.title || "Konata Station",
      artist: ns.state.currentTrack.artist || "AUTO DJ",
      artUrl: ns.state.currentTrack.art || "",
      isPlaying: Boolean(ns.state.nativeIsPlaying),
    };

    try {
      if (canUseHostBridge()) {
        await callHostBridge("syncState", payload);
      } else {
        const plugin = getPlugin();
        if (!plugin) return;
        await plugin.syncState(payload);
      }
    } catch (_) {}
  }

  async function hydrateState() {
    try {
      let state;
      if (canUseHostBridge()) {
        state = await callHostBridge("getState");
      } else {
        const plugin = getPlugin();
        if (!plugin) return;
        state = await plugin.getState();
      }
      handleNativeStateChange(state || {});
    } catch (_) {}
  }

  async function stop() {
    try {
      if (canUseHostBridge()) {
        await callHostBridge("stop");
      } else {
        const plugin = getPlugin();
        if (!plugin) return;
        await plugin.stop();
      }
    } catch (_) {}
  }

  function handleNativeStateChange(payload) {
    if (!payload) return;

    const title = payload.title || ns.state.currentTrack.title || "Konata Station";
    const artist = payload.artist || ns.state.currentTrack.artist || "AUTO DJ";
    const art = payload.artUrl || ns.state.currentTrack.art || "";

    ns.state.currentTrack = { title, artist, art };
    ns.state.nativeIsPlaying = Boolean(payload.isPlaying);

    if (ns.ui?.updatePlayButton) {
      ns.ui.updatePlayButton(ns.state.nativeIsPlaying, { skipNativeSync: true });
    }
  }

  ns.native = {
    isAvailable,
    play,
    pause,
    syncState,
    hydrateState,
    handleNativeStateChange,
    stop,
  };
})(window.KSPlayer || (window.KSPlayer = {}));
