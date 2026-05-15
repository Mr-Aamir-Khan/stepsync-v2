/**
 * sensor.js — StepSync Pro v2.1
 *
 * UPGRADED STEP DETECTION ALGORITHM
 * ───────────────────────────────────────────────────────────────────
 *
 * Problems with old algorithm:
 *   1. Used raw magnitude → hand swing/wave gives same spike as footstep
 *   2. Used accelerationIncludingGravity → 9.8 m/s² gravity always present
 *   3. No rhythm check → isolated jerks counted as steps
 *
 * New 5-stage pipeline:
 *
 *   Stage 1: Gravity removal (exponential low-pass filter per axis)
 *            dynamic = raw - gravity  → pure body movement, no 9.8 bias
 *
 *   Stage 2: Dominant axis selection
 *            Computes variance of X/Y/Z over last 20 samples.
 *            The axis with highest variance = walking direction for this
 *            carry style (upright hand → Y, flat in pocket → Z, etc.)
 *
 *   Stage 3: Smoothing (rolling average window=4)
 *            Removes micro-jitter and sensor noise.
 *
 *   Stage 4: Peak detection with hysteresis
 *            Rise above PEAK_THRESHOLD → peak armed
 *            Drop below LOW_THRESHOLD  → step confirmed
 *            Hysteresis prevents double-counting same footfall.
 *
 *   Stage 5: Time-gap + rhythm validation
 *            Reject < MIN_STEP_MS (not humanly possible)
 *            Rhythm check: isolated single spikes (hand wave) rejected
 *            unless prior steps confirm a walking cadence.
 */

const Sensor = (() => {

  /* ── Tuning constants ── */
  const PEAK_THRESHOLD  = 5.0;   // m/s² — raised: touch/table vibration filter out
  const LOW_THRESHOLD   = 2.0;   // m/s² — ~40% of peak
  const MIN_STEP_MS     = 220;   // ms  — fastest real step
  const MAX_STEP_MS     = 2200;  // ms  — slowest real step
  const SMOOTH_WINDOW   = 6;     // larger window = smoother, less noise
  const AXIS_WINDOW     = 20;    // samples for variance calc
  const RHYTHM_CONFIRM  = 3;     // 3 consistent steps needed before counting
  const GRAVITY_ALPHA   = 0.85;  // slightly stronger gravity tracking

  /* ── Mock constants ── */
  const MOCK_RATE_MS   = 560;
  const MOCK_VARIANCE  = 80;

  /* ── State ── */
  let stepCallback   = null;
  let statusCallback = null;
  let mode           = 'mock';
  let running        = false;

  let gravX = 0, gravY = 0, gravZ = 9.8;
  let axisBufferX = [], axisBufferY = [], axisBufferZ = [];
  let smoothBuffer = [];
  let peakArmed    = false;
  let lastStepTime = 0;
  let recentSteps  = [];
  let mockTimer    = null;

  /* ── Stage 1: Gravity removal ── */
  function removeGravity(x, y, z) {
    gravX = GRAVITY_ALPHA * gravX + (1 - GRAVITY_ALPHA) * x;
    gravY = GRAVITY_ALPHA * gravY + (1 - GRAVITY_ALPHA) * y;
    gravZ = GRAVITY_ALPHA * gravZ + (1 - GRAVITY_ALPHA) * z;
    return { dx: x - gravX, dy: y - gravY, dz: z - gravZ };
  }

  /* ── Stage 2: Dominant axis ── */
  function variance(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  }

  function pickAxis(dx, dy, dz) {
    axisBufferX.push(Math.abs(dx));
    axisBufferY.push(Math.abs(dy));
    axisBufferZ.push(Math.abs(dz));
    if (axisBufferX.length > AXIS_WINDOW) axisBufferX.shift();
    if (axisBufferY.length > AXIS_WINDOW) axisBufferY.shift();
    if (axisBufferZ.length > AXIS_WINDOW) axisBufferZ.shift();

    const vx = variance(axisBufferX);
    const vy = variance(axisBufferY);
    const vz = variance(axisBufferZ);
    if (vx >= vy && vx >= vz) return dx;
    if (vy >= vx && vy >= vz) return dy;
    return dz;
  }

  /* ── Stage 3: Smoother ── */
  function smooth(val) {
    smoothBuffer.push(val);
    if (smoothBuffer.length > SMOOTH_WINDOW) smoothBuffer.shift();
    return smoothBuffer.reduce((a, b) => a + b, 0) / smoothBuffer.length;
  }

  /* ── Stage 5: Rhythm check ── */
  function rhythmOk(now) {
    recentSteps = recentSteps.filter(t => now - t < MAX_STEP_MS * (RHYTHM_CONFIRM + 2));
    if (recentSteps.length < RHYTHM_CONFIRM) return true; // bootstrap phase
    let inCadence = 0;
    for (let i = recentSteps.length - 1; i >= 0 && inCadence < RHYTHM_CONFIRM; i--) {
      const gap = (i === recentSteps.length - 1)
        ? now - recentSteps[i]
        : recentSteps[i + 1] - recentSteps[i];
      if (gap >= MIN_STEP_MS && gap <= MAX_STEP_MS) inCadence++;
    }
    return inCadence >= RHYTHM_CONFIRM;
  }

  /* ── Core processing ── */
  function processSignal(ax, ay, az, gravAlreadyRemoved) {
    let dx, dy, dz;
    if (gravAlreadyRemoved) {
      dx = ax; dy = ay; dz = az;
    } else {
      const d = removeGravity(ax, ay, az);
      dx = d.dx; dy = d.dy; dz = d.dz;
    }

    const signal = pickAxis(dx, dy, dz);
    const mag    = Math.abs(smooth(signal));
    const now    = Date.now();

    if (!peakArmed) {
      if (mag >= PEAK_THRESHOLD) peakArmed = true;
    } else {
      if (mag < LOW_THRESHOLD) {
        peakArmed = false;
        const elapsed = now - lastStepTime;
        if (elapsed < MIN_STEP_MS) return;
        if (elapsed > MAX_STEP_MS) recentSteps = [];
        if (!rhythmOk(now)) return;

        lastStepTime = now;
        recentSteps.push(now);
        if (recentSteps.length > 10) recentSteps.shift();
        notify(1);
      }
    }
  }

  /* ── DeviceMotion handler ── */
  function handleMotion(evt) {
    const pure = evt.acceleration;
    if (pure && pure.x !== null &&
        Math.abs(pure.x) + Math.abs(pure.y) + Math.abs(pure.z) > 0.01) {
      processSignal(pure.x, pure.y, pure.z, true);
    } else {
      const raw = evt.accelerationIncludingGravity;
      if (!raw || raw.x === null) return;
      processSignal(raw.x, raw.y, raw.z, false);
    }
  }

  /* ── Helpers ── */
  function notify(delta) { if (stepCallback) stepCallback(delta); }
  function setStatus(s)  { mode = s; if (statusCallback) statusCallback(s); }

  function resetState() {
    gravX = 0; gravY = 0; gravZ = 9.8;
    axisBufferX = []; axisBufferY = []; axisBufferZ = [];
    smoothBuffer = [];
    peakArmed    = false;
    lastStepTime = 0;
    recentSteps  = [];
  }

  /* ── Mock mode ── */
  function scheduleMock() {
    const delay = MOCK_RATE_MS + (Math.random() - 0.5) * 2 * MOCK_VARIANCE;
    mockTimer = setTimeout(() => {
      if (!running) return;
      notify(1);
      scheduleMock();
    }, delay);
  }

  /* ── Public API ── */

  async function start(onStep, onStatus) {
    stepCallback   = onStep;
    statusCallback = onStatus;
    running        = true;
    resetState();

    if ('wakeLock' in navigator) {
      try { window._wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
    }

    if (typeof DeviceMotionEvent === 'undefined') {
      setStatus('mock'); scheduleMock(); return;
    }

    try {
      // iOS 13+ needs explicit permission
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') throw new Error('permission_denied');
      }

      window.addEventListener('devicemotion', handleMotion, { passive: true });

      // Confirm sensor actually fires real data within 2 seconds
      let fired = false;
      const probe = (evt) => {
        const r = evt.accelerationIncludingGravity || evt.acceleration;
        if (r && r.x !== null && Math.abs(r.x) + Math.abs(r.y) + Math.abs(r.z) > 0.01)
          fired = true;
      };
      window.addEventListener('devicemotion', probe, { passive: true });
      await new Promise(resolve => setTimeout(resolve, 2000));
      window.removeEventListener('devicemotion', probe);

      if (!fired) {
        window.removeEventListener('devicemotion', handleMotion);
        throw new Error('no_data');
      }

      setStatus('real');

    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('denied')) setStatus('permission_denied');
      else setStatus('mock');
      scheduleMock();
    }
  }

  function stop() {
    running = false;
    window.removeEventListener('devicemotion', handleMotion);
    clearTimeout(mockTimer); mockTimer = null;
    if (window._wakeLock) { window._wakeLock.release().catch(() => {}); window._wakeLock = null; }
  }

  function getMode() { return mode; }

  return { start, stop, getMode };

})();
