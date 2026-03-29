(function (ns) {
  const embedded = window.self !== window.top;

  if (embedded) {
    document.documentElement.classList.add("is-embedded");
    if (document.body) {
      document.body.classList.add("is-embedded");
    }
  }

  ns.config = {
    endpoint: "https://stream.host-cx.net.ar/api/nowplaying/3",
    streamUrl: "https://stream.host-cx.net.ar/listen/konata-station-radio/radio.mp3",
    maxChars: 33,
    storageKeys: {
      volume: "ks_volume_v2",
      muted: "ks_muted_v2",
      theme: "ks_theme",
      artistExpanded: "ks_artist_expanded",
    },
    pollVisibleMs: 10000,
    pollHiddenMs: 30000,
    liveRefreshMs: 60 * 60 * 1000,
    stallTimeoutMs: 12000,
  };

  ns.dom = {
    app: document.getElementById("app"),
    card: document.getElementById("playerCard"),
    themeBtn: document.getElementById("themeToggle"),
    themeIcon: document.getElementById("themeIcon"),
    player: document.getElementById("player"),
    btnPlay: document.getElementById("btn-play"),
    playIcon: document.getElementById("playIcon"),
    muteBtn: document.getElementById("muteToggle"),
    muteIcon: document.getElementById("muteIcon"),
    volRange: document.getElementById("volume"),
    titleEl: document.getElementById("track-title"),
    artistEl: document.getElementById("track-artist"),
    artistToggle: document.getElementById("artistToggle"),
    artistIcon: document.getElementById("artistIcon"),
    coverImg: document.getElementById("cover-img"),
    sourceBadge: document.getElementById("source-badge"),
    badgeText: document.getElementById("badgeText"),
    listMobile: document.getElementById("last-tracks-list"),
    listDesk: document.getElementById("last-tracks-list-desktop"),
    volumeHint: document.getElementById("volume-hint"),
  };

  ns.state = {
    embedded,
    inFlight: null,
    pollTimer: 0,
    lastNowSignature: "",
    lastMobileSignature: "",
    lastDesktopSignature: "",
    liveRefreshTimer: 0,
    recovering: false,
    lastRecoverAt: 0,
    lastTUAt: 0,
    lastTime: 0,
    stallWatchdogTimer: 0,
    heightResizeObserver: null,
    heightMutationObserver: null,
    heightFallbackTimeouts: [],
    heightRaf: 0,
    forceHeightReport: false,
    lastReportedHeight: 0,
    hasEverPlayed: false,
    lastPauseAt: 0,
    playedOnTouchAt: 0,
    nativeIsPlaying: false,
    currentTrack: {
      title: "Konata Station",
      artist: "AUTO DJ",
      art: "",
    },
  };

  ns.storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (_) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (_) {}
    },
  };

  ns.utils = {
    truncate(text) {
      if (!text) return "";
      return text.length <= ns.config.maxChars
        ? text
        : `${text.slice(0, ns.config.maxChars - 1)}…`;
    },
    urlNoCache(base) {
      return `${base}?_=${Date.now()}`;
    },
    requestHeightReport(force = false) {
      ns.height?.scheduleHeightReport(force);
    },
  };
})(window.KSPlayer || (window.KSPlayer = {}));
