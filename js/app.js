/**
 * app.js — StepSync Pro
 * Entry point. Wires all modules together.
 */

(function () {
  'use strict';

  let waterPctCache = 0;

  /* ══════════════ BOOT ══════════════ */

  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Init storage (IndexedDB)
    await Storage.init();

    // 2. Load settings & apply dark mode
    const settings = await Storage.loadSettings();
    UI.applyDarkMode(settings.darkMode !== false);
    UI.setDateLabel();

    // 3. Notifications (if previously enabled)
    if (settings.notifications) {
      const granted = await Notifications.requestPermission();
      Notifications.setEnabled(granted);
      if (granted) Notifications.scheduleGoalReminder(settings);
    }

    // 4. Init Gamification
    await Gamification.init(
      (total, earned) => UI.updateCoins(total, earned),
      (state) => UI.renderChallenges(state)
    );

    // 5. Init Tracker
    await Tracker.init(
      async (metrics) => {
        UI.updateMetrics(metrics);
        // Update recommendation (debounced via step count change)
        if (metrics.steps % 50 === 0 || metrics.steps < 5) {
          await UI.updateRecommendation(metrics);
        }
        // Check challenges with latest water pct and week steps
        const weekSteps = await Storage.getWeekSteps();
        await Gamification.checkChallenges(
          { steps: metrics.steps, activeMinutes: metrics.activeMinutes || 0 },
          waterPctCache,
          weekSteps
        );
        UI.renderChallenges(Storage.loadChallengeState());
      },
      (steps) => {
        UI.toast(`🎉 Goal reached! ${steps.toLocaleString()} steps!`, true, 5000);
        Notifications.send('🏆 Goal Reached!', `Amazing! You hit ${steps.toLocaleString()} steps today!`);
      }
    );

    // 6. Init Water tracker
    const profile = await Storage.loadProfile();
    await Water.init(profile, (data) => {
      waterPctCache = UI.updateWater(data);
      Tracker.setWaterPct(waterPctCache);
    });

    // 7. Initial UI
    await UI.updateRecommendation({ steps: 0 });
    await ChartView.render(7);
    await renderInitialChallenges();
  });

  async function renderInitialChallenges() {
    const state = Storage.loadChallengeState();
    UI.renderChallenges(state);
  }

  /* ══════════════ TAB NAVIGATION ══════════════ */

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.tab;

      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });

      document.querySelectorAll('.tab-panel').forEach(panel => {
        const active = panel.id === `tab-${target}`;
        panel.classList.toggle('active', active);
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      });

      if (target === 'history') await ChartView.refresh();
      if (target === 'health')  await UI.renderHealthDashboard();
      if (target === 'challenges') UI.renderChallenges(Storage.loadChallengeState());
    });
  });

  /* ══════════════ CHART TOGGLES ══════════════ */

  document.querySelectorAll('.chart-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-toggle').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
      ChartView.render(parseInt(btn.dataset.days, 10));
    });
  });

  /* ══════════════ TRACKER CONTROLS ══════════════ */

  document.getElementById('btn-start')?.addEventListener('click', async () => {
    await Tracker.start();
    UI.setTrackingState(true);
    UI.toast('Tracking started');
    Notifications.resetInactivityTimer();
  });

  document.getElementById('btn-stop')?.addEventListener('click', async () => {
    await Tracker.stop();
    UI.setTrackingState(false);
    UI.toast('Tracking paused');
    await ChartView.refresh();
  });

  document.getElementById('btn-mock-add')?.addEventListener('click', () => {
    Tracker.addSteps(500);
    UI.toast('+500 mock steps added');
  });

  /* ══════════════ WATER CONTROLS ══════════════ */

  document.getElementById('btn-water-add')?.addEventListener('click', async () => {
    await Water.addWater(250);
    UI.toast('💧 +250ml logged!');
  });

  document.getElementById('btn-water-reset')?.addEventListener('click', async () => {
    await Water.resetWater();
    UI.toast('Water intake reset');
  });

  /* ══════════════ PROFILE ══════════════ */

  document.getElementById('btn-profile')?.addEventListener('click', () => UI.openProfile());
  document.getElementById('btn-close-profile')?.addEventListener('click', () => UI.closeProfile());

  document.getElementById('modal-profile')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) UI.closeProfile();
  });

  document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
    const age          = parseInt(document.getElementById('inp-age').value, 10);
    const height       = parseInt(document.getElementById('inp-height').value, 10);
    const weight       = parseInt(document.getElementById('inp-weight-profile').value, 10);
    const gender       = document.getElementById('inp-gender').value;
    const fitnessGoal  = document.getElementById('inp-fitness-goal').value;
    const activityLevel= document.getElementById('inp-activity').value;

    if (isNaN(age) || age < 10 || age > 100) { UI.toast('Age must be 10–100'); return; }
    if (isNaN(height) || height < 100)        { UI.toast('Enter a valid height'); return; }
    if (isNaN(weight) || weight < 30)          { UI.toast('Enter a valid weight'); return; }

    await Storage.saveProfile({ age, height, weight, gender, fitnessGoal, activityLevel });

    // Recalc AI step target and apply to settings
    const profile   = await Storage.loadProfile();
    const newTarget = Recommend.calcStepTarget(profile);
    const settings  = await Storage.loadSettings();
    await Storage.saveSettings({ ...settings, goal: newTarget, weight });

    // Reinit water with new profile
    await Water.init(profile, (data) => {
      waterPctCache = UI.updateWater(data);
      Tracker.setWaterPct(waterPctCache);
    });

    UI.closeProfile();
    UI.toast(`Profile saved! AI step target: ${newTarget.toLocaleString()} steps`, true, 4000);

    // Refresh health dashboard if active
    await UI.renderHealthDashboard();
    await Tracker.init(
      async (metrics) => {
        UI.updateMetrics(metrics);
        if (metrics.steps % 50 === 0 || metrics.steps < 5) {
          await UI.updateRecommendation(metrics);
        }
      },
      (steps) => {
        UI.toast(`🎉 Goal reached! ${steps.toLocaleString()} steps!`, true, 5000);
      }
    );
    await ChartView.refresh();
  });

  /* ══════════════ SETTINGS ══════════════ */

  document.getElementById('btn-settings')?.addEventListener('click', () => UI.openSettings());
  document.getElementById('btn-close-settings')?.addEventListener('click', () => UI.closeSettings());

  document.getElementById('modal-settings')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) UI.closeSettings();
  });

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const goal    = parseInt(document.getElementById('inp-goal').value, 10);
    const units   = document.getElementById('inp-units').value;
    const stride  = parseInt(document.getElementById('inp-stride').value, 10);
    const weight  = parseInt(document.getElementById('inp-weight').value, 10);
    const dark    = document.getElementById('inp-darkmode').checked;
    const notifs  = document.getElementById('inp-notifications').checked;

    if (isNaN(goal) || goal < 100 || goal > 100000) { UI.toast('Goal: 100–100,000'); return; }
    if (isNaN(stride) || stride < 30 || stride > 120) { UI.toast('Stride: 30–120 cm'); return; }

    await Storage.saveSettings({ goal, units, stride, weight, darkMode: dark, notifications: notifs });

    UI.applyDarkMode(dark);

    if (notifs) {
      const granted = await Notifications.requestPermission();
      Notifications.setEnabled(granted);
      if (granted) {
        Notifications.scheduleGoalReminder({ goal });
        UI.toast('Notifications enabled ✓');
      } else {
        UI.toast('Notification permission denied');
      }
    } else {
      Notifications.setEnabled(false);
    }

    UI.closeSettings();
    UI.toast('Settings saved ✓');

    await Tracker.init(
      async (metrics) => {
        UI.updateMetrics(metrics);
        if (metrics.steps % 50 === 0 || metrics.steps < 5) {
          await UI.updateRecommendation(metrics);
        }
      },
      (steps) => UI.toast(`🎉 Goal reached! ${steps.toLocaleString()} steps!`, true, 5000)
    );
    await ChartView.refresh();
  });

  /* ══════════════ RESET ══════════════ */

  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if (!window.confirm('Permanently delete ALL data including coins and challenges?')) return;
    await Tracker.resetToday();
    await Storage.resetAll();
    Storage.saveCoins(0);
    UI.toast('All data cleared');
    UI.updateCoins(0, 0);
    await ChartView.refresh();
  });

  /* ══════════════ KEYBOARD SHORTCUTS ══════════════ */

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      UI.closeSettings();
      UI.closeProfile();
    }
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      if (Tracker.getIsRunning()) {
        Tracker.stop().then(() => { UI.setTrackingState(false); UI.toast('Paused'); });
      } else {
        Tracker.start().then(() => { UI.setTrackingState(true); UI.toast('Tracking started'); });
      }
    }
  });

})();
