/**
 * gamification.js — StepSync Pro
 * Coin system, challenges, and rewards shop.
 *
 * Coin economy:
 *   Earn: 1 coin per 100 steps
 *   Spend: badges, premium features, ad-free mode
 *
 * Challenges refresh daily/weekly.
 */

const Gamification = (() => {
  const COINS_PER_STEPS = 100; // 1 coin per 100 steps

  let coinUpdateCb      = null;
  let challengeUpdateCb = null;
  let lastCoinStep      = 0;   // step count at last coin award

  /* ── Challenge definitions ── */
  const DAILY_CHALLENGES = [
    { id: 'daily_5k',   name: 'Step Starter',   icon: '👣', target: 5000,  reward: 10, type: 'steps' },
    { id: 'daily_8k',   name: 'Active Day',      icon: '🚶', target: 8000,  reward: 20, type: 'steps' },
    { id: 'daily_10k',  name: 'Goal Crusher',    icon: '🏆', target: 10000, reward: 35, type: 'steps' },
    { id: 'daily_water',name: 'Hydration Hero',  icon: '💧', target: 100,   reward: 15, type: 'water_pct' },
    { id: 'daily_active',name: '30-min Active',  icon: '⏱', target: 30,    reward: 12, type: 'active_min' },
  ];

  const WEEKLY_CHALLENGES = [
    { id: 'weekly_35k', name: 'Weekly Walker',   icon: '🌟', target: 35000, reward: 50,  type: 'week_steps' },
    { id: 'weekly_50k', name: 'Half Century',    icon: '🥇', target: 50000, reward: 100, type: 'week_steps' },
    { id: 'weekly_70k', name: 'Step Legend',     icon: '🔥', target: 70000, reward: 200, type: 'week_steps' },
  ];

  /* ── Rewards catalog ── */
  const REWARDS = [
    { id: 'badge_bronze',  name: 'Bronze Badge',   icon: '🥉', cost: 50,  type: 'badge' },
    { id: 'badge_silver',  name: 'Silver Badge',   icon: '🥈', cost: 150, type: 'badge' },
    { id: 'badge_gold',    name: 'Gold Badge',     icon: '🥇', cost: 300, type: 'badge' },
    { id: 'adfree_day',    name: 'Ad-Free (1 day)',icon: '🚫', cost: 25,  type: 'feature' },
    { id: 'dark_theme',    name: 'Neon Theme',     icon: '🌈', cost: 100, type: 'theme' },
    { id: 'badge_fire',    name: 'Fire Legend',    icon: '🔥', cost: 500, type: 'badge' },
  ];

  /* ── Coin award logic ── */
  function checkCoinReward(totalSteps) {
    const newCoins = Math.floor(totalSteps / COINS_PER_STEPS) - Math.floor(lastCoinStep / COINS_PER_STEPS);
    if (newCoins > 0) {
      Storage.addCoins(newCoins);
      lastCoinStep = totalSteps;
      if (coinUpdateCb) coinUpdateCb(Storage.loadCoins(), newCoins);
    }
  }

  /* ── Challenge progress checker ── */
  async function checkChallenges(metrics, waterPct, weekSteps) {
    const state   = Storage.loadChallengeState();
    let   changed = false;

    const allChallenges = [...DAILY_CHALLENGES, ...WEEKLY_CHALLENGES];

    for (const ch of allChallenges) {
      if (state[ch.id]?.completed) continue; // already done today/week

      let progress = 0;
      switch (ch.type) {
        case 'steps':       progress = metrics.steps || 0; break;
        case 'active_min':  progress = metrics.activeMinutes || 0; break;
        case 'water_pct':   progress = waterPct; break;
        case 'week_steps':  progress = weekSteps || 0; break;
      }

      const pct = Math.min(100, Math.round((progress / ch.target) * 100));
      state[ch.id] = { ...state[ch.id], progress, pct };

      if (progress >= ch.target && !state[ch.id]?.completed) {
        state[ch.id].completed = true;
        Storage.addCoins(ch.reward);
        if (coinUpdateCb) coinUpdateCb(Storage.loadCoins(), ch.reward);
        UI.toast(`🏆 Challenge complete: "${ch.name}" — +${ch.reward} coins!`, true, 4000);
        changed = true;
      }
    }

    Storage.saveChallengeState(state);
    if (challengeUpdateCb) challengeUpdateCb(state);
    return state;
  }

  /* ── Purchase reward ── */
  function purchaseReward(rewardId) {
    const reward = REWARDS.find(r => r.id === rewardId);
    if (!reward) return { success: false, reason: 'Not found' };

    const owned = Storage.loadOwnedRewards();
    if (owned.includes(rewardId)) return { success: false, reason: 'Already owned' };

    const spent = Storage.spendCoins(reward.cost);
    if (!spent) return { success: false, reason: 'Not enough coins' };

    owned.push(rewardId);
    Storage.saveOwnedRewards(owned);
    if (coinUpdateCb) coinUpdateCb(Storage.loadCoins(), 0);

    return { success: true, reward };
  }

  /* ── Build UI data for challenges ── */
  function getChallengesData(state) {
    const owned = Storage.loadOwnedRewards();
    return {
      daily:   DAILY_CHALLENGES.map(ch => ({
        ...ch,
        state: state[ch.id] || { progress: 0, pct: 0, completed: false }
      })),
      weekly:  WEEKLY_CHALLENGES.map(ch => ({
        ...ch,
        state: state[ch.id] || { progress: 0, pct: 0, completed: false }
      })),
      rewards: REWARDS.map(r => ({ ...r, owned: owned.includes(r.id) })),
    };
  }

  /* ── Init ── */
  async function init(onCoinUpdate, onChallengeUpdate) {
    coinUpdateCb      = onCoinUpdate;
    challengeUpdateCb = onChallengeUpdate;

    const today = await Storage.loadToday();
    lastCoinStep = today.steps || 0;

    const coins = Storage.loadCoins();
    if (coinUpdateCb) coinUpdateCb(coins, 0);
  }

  return {
    init,
    checkCoinReward,
    checkChallenges,
    purchaseReward,
    getChallengesData,
    REWARDS
  };
})();
