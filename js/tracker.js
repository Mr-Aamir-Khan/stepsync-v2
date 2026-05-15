/**
 * tracker.js — StepSync Pro
 * Core tracking engine with coin rewards, challenge checking,
 * and profile-aware calorie estimation.
 */

const Tracker = (() => {
  let steps         = 0;
  let isRunning     = false;
  let activeSeconds = 0;
  let tickTimer     = null;
  let onUpdate      = null;
  let onGoalReached = null;
  let goalCelebrated = false;
  let profile       = {};
  let settings      = {};
  let waterPct      = 0;

  /* ── Derived calcs ── */
  function calcDistance(s, set) {
    const meters = (s * set.stride) / 100;
    return set.units === 'imperial' ? meters * 0.000621371 : meters / 1000;
  }

  function calcCalories(s, prof, set) {
    // MET-based: steps × MET × weight × time_per_step
    // Walking MET ~3.5, ~0.04 kcal/step at 70kg
    const wFactor = (prof.weight || set.weight || 70) / 70;
    return Math.round(s * 0.04 * wFactor);
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /* ── Emit update ── */
  function emitUpdate() {
    if (!onUpdate) return;
    const dist = calcDistance(steps, settings);
    const cal  = calcCalories(steps, profile, settings);
    onUpdate({
      steps,
      distance:      parseFloat(dist.toFixed(2)),
      distanceUnit:  settings.units === 'imperial' ? 'mi' : 'km',
      calories:      cal,
      activeSeconds,
      activeMinutes: Math.round(activeSeconds / 60),
      activeTime:    formatTime(activeSeconds),
      goal:          settings.goal,
      pct:           Math.min(100, Math.round((steps / settings.goal) * 100)),
    });
  }

  /* ── Step handler ── */
  async function onStep(delta) {
    if (!isRunning) return;
    steps += delta;

    // Coin reward check
    Gamification.checkCoinReward(steps);

    // Notification ping (resets inactivity timer)
    Notifications.onStep();

    // Persist
    const dist = calcDistance(steps, settings);
    const cal  = calcCalories(steps, profile, settings);
    const today = await Storage.loadToday();
    await Storage.saveToday({
      ...today,
      steps,
      distance:      parseFloat(dist.toFixed(2)),
      calories:      cal,
      activeMinutes: Math.round(activeSeconds / 60),
    });

    // Challenge check (async, non-blocking)
    const weekSteps = await Storage.getWeekSteps();
    await Gamification.checkChallenges(
      { steps, activeMinutes: Math.round(activeSeconds / 60) },
      waterPct,
      weekSteps
    );

    // Goal celebration
    if (!goalCelebrated && steps >= settings.goal) {
      goalCelebrated = true;
      if (onGoalReached) onGoalReached(steps);
    }

    emitUpdate();
  }

  /* ── Active time ticker ── */
  function startTicker() {
    stopTicker();
    tickTimer = setInterval(() => {
      if (isRunning) { activeSeconds++; emitUpdate(); }
    }, 1000);
  }

  function stopTicker() { clearInterval(tickTimer); tickTimer = null; }

  /* ── Sensor status ── */
  function onSensorStatus(mode) {
    emitUpdate();
    const el = document.getElementById('sensor-status');
    if (!el) return;
    const labels = {
      real:             'Sensor: accelerometer active ✓',
      mock:             'Sensor: mock mode (no physical sensor)',
      permission_denied:'Sensor: permission denied — mock mode',
    };
    el.textContent = labels[mode] || `Sensor: ${mode}`;
  }

  /* ── Public API ── */

  async function init(updateCb, goalCb) {
    onUpdate      = updateCb;
    onGoalReached = goalCb;

    [settings, profile] = await Promise.all([Storage.loadSettings(), Storage.loadProfile()]);
    const saved   = await Storage.loadToday();
    steps         = saved.steps || 0;
    activeSeconds = (saved.activeMinutes || 0) * 60;
    goalCelebrated = steps >= settings.goal;

    emitUpdate();
  }

  async function start() {
    if (isRunning) return;
    // Reload settings/profile in case they changed
    [settings, profile] = await Promise.all([Storage.loadSettings(), Storage.loadProfile()]);
    isRunning = true;
    startTicker();
    await Sensor.start(onStep, onSensorStatus);
  }

  async function stop() {
    if (!isRunning) return;
    isRunning = false;
    Sensor.stop();
    stopTicker();
    emitUpdate();
    const dist  = calcDistance(steps, settings);
    const cal   = calcCalories(steps, profile, settings);
    const today = await Storage.loadToday();
    await Storage.saveToday({
      ...today,
      steps,
      distance:      parseFloat(dist.toFixed(2)),
      calories:      cal,
      activeMinutes: Math.round(activeSeconds / 60),
    });
  }

  function setWaterPct(pct) { waterPct = pct; }

  function addSteps(n) { onStep(n); }

  async function resetToday() {
    stop();
    steps          = 0;
    activeSeconds  = 0;
    goalCelebrated = false;
    const today = await Storage.loadToday();
    await Storage.saveToday({ ...today, steps: 0, distance: 0, calories: 0, activeMinutes: 0 });
    emitUpdate();
  }

  function getIsRunning() { return isRunning; }

  return { init, start, stop, addSteps, resetToday, getIsRunning, setWaterPct };
})();
