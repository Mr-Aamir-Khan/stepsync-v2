/**
 * water.js — StepSync Pro
 * Water intake tracker with 2-hour reminder support.
 */

const Water = (() => {
  let goalLiters = 2.3;
  let currentLiters = 0;
  let reminderTimer = null;
  let onUpdateCb = null;

  const ML_PER_CUP = 0.25; // 250ml per cup

  async function init(profile, onUpdate) {
    onUpdateCb  = onUpdate;
    goalLiters  = Recommend.calcWater(profile);

    // Load today's water from storage
    const today   = await Storage.loadToday();
    currentLiters = parseFloat(today.water || 0);

    emitUpdate();
    scheduleReminder();
  }

  function emitUpdate() {
    if (onUpdateCb) onUpdateCb({ current: currentLiters, goal: goalLiters });
  }

  async function addWater(ml = 250) {
    currentLiters = +((currentLiters + ml / 1000).toFixed(2));
    const today = await Storage.loadToday();
    await Storage.saveToday({ ...today, water: currentLiters });
    emitUpdate();
  }

  async function resetWater() {
    currentLiters = 0;
    const today = await Storage.loadToday();
    await Storage.saveToday({ ...today, water: 0 });
    emitUpdate();
  }

  function setGoal(liters) {
    goalLiters = liters;
    emitUpdate();
  }

  function scheduleReminder() {
    clearTimeout(reminderTimer);
    // Remind every 2 hours if notifications are enabled
    reminderTimer = setTimeout(() => {
      const pct = currentLiters / goalLiters;
      if (pct < 0.9) {
        const remaining = +(goalLiters - currentLiters).toFixed(1);
        if (typeof Notifications !== 'undefined' && Notifications.isEnabled()) {
          Notifications.send(
            '💧 Hydration Reminder',
            `Drink some water! ${remaining}L remaining today.`
          );
        }
      }
      scheduleReminder(); // reschedule
    }, 2 * 60 * 60 * 1000); // 2 hours
  }

  function getPct() {
    return Math.min(100, Math.round((currentLiters / goalLiters) * 100));
  }

  function destroy() {
    clearTimeout(reminderTimer);
  }

  return { init, addWater, resetWater, setGoal, getPct, destroy };
})();
