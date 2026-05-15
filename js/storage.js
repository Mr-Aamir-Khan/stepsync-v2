/**
 * storage.js — StepSync Pro
 * Dual-layer storage: IndexedDB (primary) + localStorage (fallback).
 * Supports profile, settings, daily records, coins, water, challenges.
 */

const Storage = (() => {
  const LS_PREFIX = 'stepsync_';
  const DAY_PREFIX = `${LS_PREFIX}day_`;
  let db = null;

  /* ── IndexedDB init ── */
  function initDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(false); return; }
      const req = indexedDB.open('stepsync_pro', 2);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('days'))     d.createObjectStore('days',     { keyPath: 'date' });
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('profile'))  d.createObjectStore('profile',  { keyPath: 'id' });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(true); };
      req.onerror   = () => resolve(false);
    });
  }

  function idbPut(store, value) {
    return new Promise((resolve) => {
      if (!db) { resolve(false); return; }
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value).onsuccess = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
  }

  function idbGet(store, key) {
    return new Promise((resolve) => {
      if (!db) { resolve(null); return; }
      try {
        const tx  = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  /* ── Helpers ── */
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  function dateRange(n) {
    const dates = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  function lsGet(key, def) {
    try {
      const r = localStorage.getItem(LS_PREFIX + key);
      return r ? { ...def, ...JSON.parse(r) } : def;
    } catch { return def; }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
  }

  /* ── Settings ── */
  const defaultSettings = {
    id: 'main', goal: 10000, units: 'metric',
    stride: 78, weight: 70, darkMode: true, notifications: false
  };

  async function loadSettings() {
    const idb = await idbGet('settings', 'main');
    if (idb) return { ...defaultSettings, ...idb };
    return lsGet('settings', defaultSettings);
  }

  async function saveSettings(s) {
    const val = { ...defaultSettings, ...s, id: 'main' };
    await idbPut('settings', val);
    lsSet('settings', val);
  }

  /* ── Profile ── */
  const defaultProfile = {
    id: 'user', age: 25, height: 170, weight: 70,
    gender: 'male', fitnessGoal: 'maintenance', activityLevel: 'moderate'
  };

  async function loadProfile() {
    const idb = await idbGet('profile', 'user');
    if (idb) return { ...defaultProfile, ...idb };
    return lsGet('profile', defaultProfile);
  }

  async function saveProfile(p) {
    const val = { ...defaultProfile, ...p, id: 'user' };
    await idbPut('profile', val);
    lsSet('profile', val);
  }

  /* ── Daily records ── */
  const defaultDay = { steps: 0, distance: 0, calories: 0, activeMinutes: 0, water: 0, coins: 0 };

  async function loadToday() {
    const key = todayKey();
    const idb = await idbGet('days', key);
    if (idb) return { ...defaultDay, ...idb };
    const ls = localStorage.getItem(`${DAY_PREFIX}${key}`);
    return ls ? { ...defaultDay, ...JSON.parse(ls) } : { ...defaultDay, date: key };
  }

  async function saveToday(record) {
    const key  = todayKey();
    const data = { ...defaultDay, ...record, date: key };
    await idbPut('days', data);
    try { localStorage.setItem(`${DAY_PREFIX}${key}`, JSON.stringify(data)); } catch {}
  }

  async function loadHistory(n = 7) {
    const dates = dateRange(n).reverse();
    return Promise.all(dates.map(async (date) => {
      const idb = await idbGet('days', date);
      if (idb) return { ...defaultDay, ...idb, date };
      try {
        const ls = localStorage.getItem(`${DAY_PREFIX}${date}`);
        return ls ? { ...defaultDay, ...JSON.parse(ls), date } : { ...defaultDay, date };
      } catch { return { ...defaultDay, date }; }
    }));
  }

  /* ── Coins (accumulated total) ── */
  function loadCoins() {
    return parseInt(localStorage.getItem(`${LS_PREFIX}coins`) || '0', 10);
  }

  function saveCoins(n) {
    localStorage.setItem(`${LS_PREFIX}coins`, String(Math.max(0, Math.floor(n))));
  }

  function addCoins(n) {
    saveCoins(loadCoins() + n);
  }

  function spendCoins(n) {
    const c = loadCoins();
    if (c < n) return false;
    saveCoins(c - n);
    return true;
  }

  /* ── Owned rewards ── */
  function loadOwnedRewards() {
    try {
      return JSON.parse(localStorage.getItem(`${LS_PREFIX}rewards`) || '[]');
    } catch { return []; }
  }

  function saveOwnedRewards(arr) {
    localStorage.setItem(`${LS_PREFIX}rewards`, JSON.stringify(arr));
  }

  /* ── Challenge state ── */
  function loadChallengeState() {
    const key = `${LS_PREFIX}challenges_${todayKey()}`;
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
  }

  function saveChallengeState(state) {
    const key = `${LS_PREFIX}challenges_${todayKey()}`;
    localStorage.setItem(key, JSON.stringify(state));
  }

  /* ── Weekly step accumulator ── */
  async function getWeekSteps() {
    const history = await loadHistory(7);
    return history.reduce((sum, d) => sum + (d.steps || 0), 0);
  }

  /* ── Reset ── */
  async function resetAll() {
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keysToDelete.push(k);
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));
    if (db) {
      ['days','settings','profile'].forEach(store => {
        try { db.transaction(store,'readwrite').objectStore(store).clear(); } catch {}
      });
    }
  }

  /* ── Init ── */
  async function init() { await initDB(); }

  return {
    init,
    loadSettings, saveSettings,
    loadProfile,  saveProfile,
    loadToday,    saveToday, loadHistory,
    loadCoins,    saveCoins, addCoins, spendCoins,
    loadOwnedRewards, saveOwnedRewards,
    loadChallengeState, saveChallengeState,
    getWeekSteps,
    resetAll
  };
})();
