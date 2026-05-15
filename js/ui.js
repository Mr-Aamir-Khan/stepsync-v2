/**
 * ui.js — StepSync Pro
 * DOM rendering: metrics, health dashboard, challenges, rewards shop,
 * coin popup, dark mode, water display.
 */

const UI = (() => {
  const RING_CIRCUMFERENCE = 2 * Math.PI * 90;

  const els = {};
  function el(id) {
    if (!els[id]) els[id] = document.getElementById(id);
    return els[id];
  }

  /* ── Ring + goal bar ── */
  function updateRing(pct) {
    const arc = el('ring-arc');
    if (!arc) return;
    const offset = RING_CIRCUMFERENCE * (1 - Math.min(pct, 100) / 100);
    arc.style.strokeDashoffset = offset.toFixed(2);
    const met = pct >= 100;
    arc.classList.toggle('goal-met', met);
    el('step-display')?.classList.toggle('goal-met', met);
    const bar = el('goal-bar');
    if (bar) bar.style.width = Math.min(pct, 100) + '%';
  }

  let popTimeout = null;
  function popStepCount() {
    const d = el('step-display');
    if (!d) return;
    d.classList.remove('pop');
    void d.offsetWidth;
    d.classList.add('pop');
    clearTimeout(popTimeout);
    popTimeout = setTimeout(() => d.classList.remove('pop'), 200);
  }

  let lastSteps = -1;

  function updateMetrics(metrics) {
    const { steps, distance, distanceUnit, calories, activeTime, pct, goal } = metrics;

    const stepEl = el('step-display');
    if (stepEl && steps !== lastSteps) {
      stepEl.textContent = steps.toLocaleString();
      if (lastSteps !== -1) popStepCount();
      lastSteps = steps;
    }

    const pctEl = el('pct-display');
    if (pctEl) pctEl.textContent = `${pct}%`;

    updateRing(pct);

    const gEl = el('goal-display');
    if (gEl) gEl.textContent = goal.toLocaleString();

    const distEl = el('stat-dist');
    if (distEl) distEl.textContent = distance.toFixed(2);
    const unitEl = el('stat-dist-unit');
    if (unitEl) unitEl.textContent = distanceUnit;
    const calEl = el('stat-cal');
    if (calEl) calEl.textContent = calories;
    const timeEl = el('stat-time');
    if (timeEl) timeEl.textContent = activeTime;
  }

  /* ── Tracking state ── */
  function setTrackingState(running) {
    el('btn-start')?.toggleAttribute('disabled', running);
    el('btn-stop')?.toggleAttribute('disabled', !running);
    el('ring-wrap')?.classList.toggle('tracking', running);
    updateModeBadge(running);
  }

  function updateModeBadge(running) {
    const badge = el('mode-badge');
    if (!badge) return;
    const mode = Sensor.getMode();
    if (!running)          { badge.textContent = 'STOPPED'; badge.className = 'badge stopped'; }
    else if (mode === 'real') { badge.textContent = 'LIVE';    badge.className = 'badge live'; }
    else                   { badge.textContent = 'MOCK';    badge.className = 'badge mock'; }
  }

  /* ── Water display ── */
  function updateWater(data) {
    const { current, goal } = data;
    const pct = Math.min(100, Math.round((current / goal) * 100));

    const bar = el('water-bar');
    if (bar) bar.style.width = pct + '%';

    const display = el('water-display');
    if (display) display.textContent = `${current.toFixed(1)}L / ${goal.toFixed(1)}L`;

    const goalText = el('water-goal-text');
    if (goalText) goalText.textContent = `Goal: ${goal.toFixed(1)}L`;

    return pct;
  }

  /* ── Coin display ── */
  function updateCoins(total, earned) {
    const countEl = el('coin-count');
    if (countEl) countEl.textContent = total.toLocaleString();

    const csEl = el('cs-coins');
    if (csEl) csEl.textContent = total.toLocaleString();

    if (earned > 0) showCoinPopup(earned);
  }

  function showCoinPopup(amount) {
    const popup = el('coin-popup');
    if (!popup) return;

    const div = document.createElement('div');
    div.className = 'coin-anim';
    div.textContent = `🪙 +${amount}`;
    popup.appendChild(div);

    setTimeout(() => div.remove(), 1900);
  }

  /* ── Health dashboard ── */
  async function renderHealthDashboard() {
    const profile = await Storage.loadProfile();

    const bmi     = Recommend.calcBMI(profile);
    const bmiCat  = Recommend.bmiCategory(bmi);
    const tdee    = Recommend.calcTDEE(profile);
    const water   = Recommend.calcWater(profile);
    const target  = Recommend.calcStepTarget(profile);

    const bmiEl = el('hm-bmi');
    if (bmiEl) bmiEl.textContent = bmi;
    const bmiCatEl = el('hm-bmi-cat');
    if (bmiCatEl) {
      bmiCatEl.textContent = bmiCat;
      const colors = { Underweight: '#4fc3f7', Healthy: '#06d6a0', Overweight: '#ffd166', Obese: '#ff6584' };
      bmiCatEl.style.color = colors[bmiCat] || 'var(--text-dim)';
    }
    const tdeeEl = el('hm-tdee');
    if (tdeeEl) tdeeEl.textContent = tdee.toLocaleString();
    const waterEl = el('hm-water');
    if (waterEl) waterEl.textContent = water.toFixed(1);
    const stepEl = el('hm-step-target');
    if (stepEl) stepEl.textContent = target.toLocaleString();

    // Workout plan
    const plan = Recommend.getWorkoutPlan(profile);
    const wList = el('workout-plan');
    if (wList) {
      wList.innerHTML = plan.map(w => `
        <div class="workout-item">
          <span class="workout-item-icon">${w.icon}</span>
          <div class="workout-item-body">
            <div class="workout-item-name">${w.name}</div>
            <div class="workout-item-detail">${w.dur} minutes · MET ${w.met}</div>
          </div>
          <span class="workout-item-cal">~${w.calories} kcal</span>
        </div>
      `).join('');
    }

    // Diet tips
    const tips = Recommend.getDietTips(profile);
    const dList = el('diet-tips');
    if (dList) {
      dList.innerHTML = tips.map(t => `
        <div class="diet-item">${t.icon} ${t.text}</div>
      `).join('');
    }
  }

  /* ── AI recommendation card ── */
  async function updateRecommendation(metrics) {
    const profile = await Storage.loadProfile();
    const rec = await Recommend.getTodayRecommendation(profile, metrics);
    const recEl = el('rec-body');
    if (recEl) recEl.textContent = rec;
  }

  /* ── Challenges ── */
  function renderChallenges(state) {
    const data     = Gamification.getChallengesData(state);
    const dEl      = el('daily-challenges');
    const wEl      = el('weekly-challenges');
    const rEl      = el('rewards-grid');

    if (dEl) dEl.innerHTML = data.daily.map(ch => challengeHTML(ch)).join('');
    if (wEl) wEl.innerHTML = data.weekly.map(ch => challengeHTML(ch)).join('');

    if (rEl) {
      rEl.innerHTML = data.rewards.map(r => `
        <div class="reward-item ${r.owned ? 'owned' : ''}"
             onclick="${r.owned ? '' : `handleRewardPurchase('${r.id}')`}"
             title="${r.owned ? 'Already owned' : `Buy for ${r.cost} coins`}">
          <div class="reward-icon">${r.icon}</div>
          <div class="reward-name">${r.name}</div>
          ${r.owned
            ? '<div class="reward-owned">✓ Owned</div>'
            : `<div class="reward-cost">🪙 ${r.cost}</div>`}
        </div>
      `).join('');
    }
  }

  function challengeHTML(ch) {
    const s   = ch.state;
    const pct = s.pct || 0;
    return `
      <div class="challenge-item ${s.completed ? 'completed' : ''}">
        <span class="challenge-icon">${ch.icon}</span>
        <div class="challenge-body">
          <div class="challenge-name">${ch.name}</div>
          <div class="challenge-detail">
            ${s.completed ? 'Completed!' : `${(s.progress||0).toLocaleString()} / ${ch.target.toLocaleString()}`}
          </div>
          <div class="challenge-progress">
            <div class="challenge-progress-fill ${s.completed ? 'challenge-completed' : ''}"
                 style="width:${pct}%"></div>
          </div>
        </div>
        <div class="challenge-reward">
          <span class="challenge-coins">🪙 ${ch.reward}</span>
          <span class="challenge-check">✅</span>
        </div>
      </div>
    `;
  }

  /* ── Toast ── */
  let toastTimer = null;
  function toast(msg, celebrate = false, duration = 3000) {
    const t = el('toast');
    if (!t) return;
    clearTimeout(toastTimer);
    t.textContent = msg;
    t.className   = 'toast show' + (celebrate ? ' celebrate' : '');
    toastTimer    = setTimeout(() => t.classList.remove('show', 'celebrate'), duration);
  }

  /* ── Date label ── */
  function setDateLabel() {
    const e = el('today-label');
    if (!e) return;
    e.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric'
    });
  }

  /* ── Dark mode ── */
  function applyDarkMode(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  /* ── Settings modal ── */
  async function openSettings() {
    const [settings, profile] = await Promise.all([Storage.loadSettings(), Storage.loadProfile()]);
    el('inp-goal').value    = settings.goal;
    el('inp-units').value   = settings.units;
    el('inp-stride').value  = settings.stride;
    el('inp-weight').value  = settings.weight || profile.weight;
    el('inp-darkmode').checked      = settings.darkMode !== false;
    el('inp-notifications').checked = settings.notifications === true;
    el('modal-settings').removeAttribute('hidden');
  }

  function closeSettings() { el('modal-settings').setAttribute('hidden', ''); }

  /* ── Profile modal ── */
  async function openProfile() {
    const profile = await Storage.loadProfile();
    el('inp-age').value          = profile.age;
    el('inp-height').value       = profile.height;
    el('inp-weight-profile').value = profile.weight;
    el('inp-gender').value       = profile.gender;
    el('inp-fitness-goal').value = profile.fitnessGoal;
    el('inp-activity').value     = profile.activityLevel;
    el('modal-profile').removeAttribute('hidden');
  }

  function closeProfile() { el('modal-profile').setAttribute('hidden', ''); }

  return {
    updateMetrics,
    setTrackingState,
    updateModeBadge,
    updateWater,
    updateCoins,
    showCoinPopup,
    renderHealthDashboard,
    updateRecommendation,
    renderChallenges,
    toast,
    setDateLabel,
    applyDarkMode,
    openSettings, closeSettings,
    openProfile, closeProfile,
  };
})();

// Expose for inline onclick handlers in rewards
window.handleRewardPurchase = function(rewardId) {
  const result = Gamification.purchaseReward(rewardId);
  if (result.success) {
    UI.toast(`${result.reward.icon} "${result.reward.name}" unlocked! Enjoy!`, true, 4000);
    Storage.loadChallengeState && UI.renderChallenges(Storage.loadChallengeState());
    UI.updateCoins(Storage.loadCoins(), 0);
  } else {
    UI.toast(`❌ ${result.reason} — keep earning coins!`);
  }
};
