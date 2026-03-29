(function (ns) {
  const { config, dom, state, storage, utils } = ns;
  const supportsMediaSession =
    typeof navigator !== "undefined" &&
    "mediaSession" in navigator &&
    typeof window.MediaMetadata !== "undefined";

  function setMediaSessionPlaybackState(isPlaying) {
    if (!supportsMediaSession) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }

  function updateMediaSessionMetadata({ title, artist, art }) {
    if (!supportsMediaSession) return;

    const artwork = art
      ? [96, 128, 192, 256, 384, 512].map((size) => ({
          src: art,
          sizes: `${size}x${size}`,
          type: "image/png",
        }))
      : [];

    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: title || "Konata Station",
      artist: artist || "AUTO DJ",
      album: "Konata Station",
      artwork,
    });

    ns.native?.syncState?.();
  }

  function bindMediaSessionHandlers() {
    if (!supportsMediaSession) return;

    const safeBind = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (_) {}
    };

    safeBind("play", () => ns.audio?.resumeFromMediaSession?.());
    safeBind("pause", () => ns.audio?.pausePlayback?.());
    safeBind("stop", () => ns.audio?.pausePlayback?.());
  }

  function resolveInitialTheme() {
    const saved = storage.get(config.storageKeys.theme);
    if (saved) return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applyTheme(theme) {
    dom.app.setAttribute("data-theme", theme);
    dom.card.setAttribute("data-theme", theme);
    dom.themeIcon.textContent = theme === "dark" ? "light_mode" : "dark_mode";
    dom.themeBtn.setAttribute("aria-pressed", String(theme === "dark"));
    storage.set(config.storageKeys.theme, theme);
    utils.requestHeightReport();
  }

  function setRangeVisual(rangeEl) {
    const value = parseInt(rangeEl.value, 10) || 0;
    rangeEl.style.setProperty("--value", `${Math.max(0, Math.min(100, value))}%`);
  }

  function updatePlayButton(isPlaying, options = {}) {
    dom.playIcon.textContent = isPlaying ? "pause" : "play_arrow";
    dom.btnPlay.setAttribute("aria-label", isPlaying ? "Pausar" : "Reproducir");
    setMediaSessionPlaybackState(isPlaying);
    ns.state.nativeIsPlaying = isPlaying;
    if (!options.skipNativeSync) {
      ns.native?.syncState?.();
    }
  }

  function syncMuteUi() {
    const muted = dom.player.muted;
    dom.muteIcon.textContent = muted ? "volume_off" : "volume_up";
    dom.muteBtn.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
    dom.muteBtn.setAttribute("aria-pressed", String(muted));
  }

  function restoreVolume() {
    let volume = 40;
    const saved = storage.get(config.storageKeys.volume);
    if (saved != null) {
      volume = Math.max(0, Math.min(100, parseInt(saved, 10) || 0));
    }

    dom.player.muted = storage.get(config.storageKeys.muted) === "true";

    if (ns.device.profile.shouldHideVolumeUi) {
      dom.player.volume = 1;
    } else {
      dom.volRange.value = String(volume);
      setRangeVisual(dom.volRange);
      dom.player.volume = volume / 100;
    }

    syncMuteUi();
  }

  function persistVolume() {
    storage.set(config.storageKeys.volume, String(dom.volRange.value));
  }

  function persistMute() {
    storage.set(config.storageKeys.muted, String(dom.player.muted));
  }

  function toggleMute() {
    dom.player.muted = !dom.player.muted;
    syncMuteUi();
    persistMute();
  }

  function updateSourceBadge(data) {
    const isLive = data?.live?.is_live;
    const name = data?.live?.streamer_name;
    dom.badgeText.textContent = isLive ? name || "EN VIVO" : "AUTO DJ";
    dom.sourceBadge.classList.toggle("live", Boolean(isLive));
  }

  function applyArtistView(expanded) {
    const full = dom.artistEl.dataset.full || dom.artistEl.textContent || "";
    const collapsed = dom.artistEl.dataset.collapsed || utils.truncate(full);
    dom.artistEl.textContent = expanded ? full : collapsed;
    dom.artistEl.classList.toggle("expanded", expanded);
    dom.artistIcon.classList.toggle("expanded", expanded);
    dom.artistToggle.setAttribute("aria-expanded", String(expanded));
    dom.artistToggle.setAttribute(
      "aria-label",
      expanded ? "Ocultar artista completo" : "Mostrar artista completo"
    );
  }

  function setArtist(full) {
    const collapsed = utils.truncate(full);
    dom.artistEl.dataset.full = full;
    dom.artistEl.dataset.collapsed = collapsed;
    dom.artistToggle.title = full;
    const expanded = storage.get(config.storageKeys.artistExpanded) === "true";
    applyArtistView(expanded);
  }

  function toggleArtist() {
    const willExpand = !dom.artistEl.classList.contains("expanded");
    storage.set(config.storageKeys.artistExpanded, String(willExpand));
    applyArtistView(willExpand);
    utils.requestHeightReport();
  }

  function createTrackButton(className, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `track-chip ${className}`.trim();
    button.textContent = utils.truncate(text);
    button.dataset.full = text;
    button.dataset.collapsed = utils.truncate(text);
    button.title = text;
    button.setAttribute("aria-expanded", "false");
    return button;
  }

  function renderHistoryList(listEl, entries, className, emptyLabel) {
    if (!listEl) return;

    const fragment = document.createDocumentFragment();
    if (!entries.length) {
      const item = document.createElement("li");
      item.appendChild(createTrackButton(className, emptyLabel));
      fragment.appendChild(item);
    } else {
      entries.forEach((entry) => {
        const title = (entry?.song?.title || "Desconocida").toUpperCase();
        const artist = (entry?.song?.artist || "Desconocido").toUpperCase();
        const item = document.createElement("li");
        item.appendChild(createTrackButton(className, `${title} - ${artist}`));
        fragment.appendChild(item);
      });
    }

    listEl.replaceChildren(fragment);
  }

  function toggleChip(button) {
    const expanded = !button.classList.contains("expanded");
    button.classList.toggle("expanded", expanded);
    button.textContent = expanded ? button.dataset.full || "" : button.dataset.collapsed || "";
    button.setAttribute("aria-expanded", String(expanded));
    utils.requestHeightReport();
  }

  function bindChipList(listEl) {
    if (!listEl) return;
    listEl.addEventListener("click", (event) => {
      const button = event.target.closest(".track-chip");
      if (!button || !listEl.contains(button)) return;
      toggleChip(button);
    });
  }

  function serializeHistory(entries) {
    return entries
      .map((entry) => `${entry?.song?.title || ""}|${entry?.song?.artist || ""}`)
      .join("||");
  }

  function updateCurrentTrack(now, stationArt) {
    const title = (now.title || "Desconocida").toUpperCase();
    const artist = now.artist || "Desconocido";
    const art = now.art || stationArt || "";
    const signature = [title, artist, art].join("|");

    if (signature === state.lastNowSignature) return;
    state.lastNowSignature = signature;
    state.currentTrack = { title, artist, art };

    dom.titleEl.textContent = title;
    setArtist(artist);
    if (art && dom.coverImg.getAttribute("src") !== art) {
      dom.coverImg.src = art;
    }
    dom.coverImg.alt = `Portada de ${title} - ${artist}`;
    updateMediaSessionMetadata({ title, artist, art });
    ns.native?.syncState?.(true);
  }

  function updateHistory(hist) {
    const mobileEntries = hist.slice(0, 3);
    const mobileSignature = serializeHistory(mobileEntries);
    if (mobileSignature !== state.lastMobileSignature) {
      state.lastMobileSignature = mobileSignature;
      renderHistoryList(dom.listMobile, mobileEntries, "tag", "NO HAY CANCIONES");
    }

    const desktopEntries = hist.slice(0, 5);
    const desktopSignature = serializeHistory(desktopEntries);
    if (desktopSignature !== state.lastDesktopSignature) {
      state.lastDesktopSignature = desktopSignature;
      renderHistoryList(dom.listDesk, desktopEntries, "chip", "NO HAY CANCIONES");
    }
  }

  function renderFetchError() {
    renderHistoryList(dom.listMobile, [], "tag", "ERROR AL CARGAR");
    renderHistoryList(dom.listDesk, [], "chip", "ERROR AL CARGAR");
    state.lastMobileSignature = "__error__";
    state.lastDesktopSignature = "__error__";
  }

  function bindThemeControls() {
    dom.themeBtn.addEventListener(
      "click",
      () => {
        const next = dom.app.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
      },
      { passive: true }
    );
  }

  function bindVolumeControls() {
    dom.volRange.addEventListener("input", (event) => {
      if (ns.device.profile.shouldHideVolumeUi) return;
      const value = Math.min(100, Math.max(0, parseInt(event.target.value, 10) || 0));
      dom.player.volume = value / 100;
      if (dom.player.muted && value > 0) {
        dom.player.muted = false;
        persistMute();
      }
      syncMuteUi();
      setRangeVisual(dom.volRange);
      persistVolume();
    });

    dom.muteBtn.addEventListener("click", toggleMute, { passive: true });
  }

  function bindArtistControls() {
    dom.artistToggle.addEventListener("click", toggleArtist, { passive: true });
  }

  function initialize() {
    ns.device.setVolumeUiState(ns.device.profile.shouldHideVolumeUi);
    bindThemeControls();
    bindVolumeControls();
    bindArtistControls();
    bindMediaSessionHandlers();
    bindChipList(dom.listMobile);
    bindChipList(dom.listDesk);
    applyTheme(resolveInitialTheme());
    restoreVolume();
    updatePlayButton(false);
    updateMediaSessionMetadata({
      title: dom.titleEl.textContent || "Konata Station",
      artist: dom.artistEl.textContent || "AUTO DJ",
      art: dom.coverImg.getAttribute("src") || "",
    });
  }

  ns.ui = {
    initialize,
    applyTheme,
    updatePlayButton,
    syncMuteUi,
    updateSourceBadge,
    updateCurrentTrack,
    updateHistory,
    renderFetchError,
  };
})(window.KSPlayer || (window.KSPlayer = {}));
