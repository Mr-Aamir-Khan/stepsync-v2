/**
 * notifications.js — StepSync Pro
 * Push notifications via Notification API + Service Worker.
 *
 * Features:
 *   - Goal progress reminder (2 PM if < 50% goal)
 *   - Inactivity alert (1 hour without steps)
 *   - Water reminder (every 2 hours, handled by water.js)
 *   - Goal achieved celebration
 */

const Notifications = (() => {
  let enabled           = false;
  let inactivityTimer   = null;
  let goalReminderTimer = null;
  let lastStepTime      = Date.now();

  const INACTIVITY_MS   = 60 * 60 * 1000; // 1 hour
  const GOAL_REMIND_H   = 14;              // 2 PM

  /* ── Permission ── */
  async function requestPermission() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') { enabled = true; return true; }
    if (Notification.permission === 'denied')  { return false; }
    const result = await Notification.requestPermission();
    enabled = result === 'granted';
    return enabled;
  }

  /* ── Send a notification ── */
  function send(title, body, options = {}) {
    if (!enabled || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const defaults = {
      icon:  'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag:   'stepsync-notification',
    };

    // Use service worker if available (shows even when app is background)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, { body, ...defaults, ...options });
      }).catch(() => {
        new Notification(title, { body, ...defaults, ...options });
      });
    } else {
      try { new Notification(title, { body, ...defaults, ...options }); } catch {}
    }
  }

  /* ── Inactivity detection ── */
  function resetInactivityTimer() {
    lastStepTime = Date.now();
    clearTimeout(inactivityTimer);
    if (!enabled) return;
    inactivityTimer = setTimeout(() => {
      send(
        '🚶 Time to Move!',
        "You haven't moved in an hour. Even a 5-minute walk makes a difference!",
        { tag: 'stepsync-inactivity' }
      );
      resetInactivityTimer(); // reschedule
    }, INACTIVITY_MS);
  }

  /* ── Goal progress reminder ── */
  async function scheduleGoalReminder(settings) {
    clearTimeout(goalReminderTimer);
    if (!enabled) return;

    const now    = new Date();
    const target = new Date();
    target.setHours(GOAL_REMIND_H, 0, 0, 0);

    if (now >= target) {
      // Already past 2pm — schedule for tomorrow
      target.setDate(target.getDate() + 1);
    }

    const msUntil = target - now;

    goalReminderTimer = setTimeout(async () => {
      const today   = await Storage.loadToday();
      const goal    = settings.goal || 10000;
      const steps   = today.steps || 0;

      if (steps < goal) {
        const remaining = goal - steps;
        const pct       = Math.round((steps / goal) * 100);
        send(
          `Keep moving! ${pct}% there 🏃`,
          `${remaining.toLocaleString()} steps remaining. A 20-min walk will get you much closer!`,
          { tag: 'stepsync-goal' }
        );
      }
      scheduleGoalReminder(settings); // reschedule for next day
    }, msUntil);
  }

  /* ── Notify on tracking step (call from tracker) ── */
  function onStep() {
    if (enabled) resetInactivityTimer();
  }

  /* ── Enable / disable ── */
  function setEnabled(val) {
    enabled = val;
    if (!val) {
      clearTimeout(inactivityTimer);
      clearTimeout(goalReminderTimer);
    }
  }

  function isEnabled() { return enabled; }

  return {
    requestPermission,
    send,
    scheduleGoalReminder,
    resetInactivityTimer,
    onStep,
    setEnabled,
    isEnabled
  };
})();
