document.addEventListener("DOMContentLoaded", () => {
  const playerApp = window.KSPlayer;
  playerApp.ui.initialize();
  playerApp.height.installHeightObservers();
  playerApp.audio.initialize();
  playerApp.height.scheduleHeightReport(true);
});

window.addEventListener("beforeunload", () => {
  const playerApp = window.KSPlayer;
  playerApp.audio?.teardown();
  playerApp.height?.teardown();
});
