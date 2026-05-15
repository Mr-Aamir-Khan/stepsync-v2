/**
 * recommend.js — StepSync Pro
 *
 * Lightweight AI recommendation engine (rule-based, no ML dependency).
 * Generates personalized step targets, workout plans, calorie budgets,
 * and diet tips from the user's profile.
 *
 * Algorithm overview:
 *   Step Target  = BASE_STEPS + (activityMultiplier × weightFactor)
 *   TDEE         = BMR × PAL  (Mifflin-St Jeor + Harris-Benedict PAL)
 *   Calories     = MET × weight(kg) × duration(hours)
 *   Water        = weight(kg) × 0.033 liters/day
 */

const Recommend = (() => {

  const BASE_STEPS = 5000;

  const ACTIVITY_MULTIPLIERS = {
    sedentary:  0.5,
    light:      1.0,
    moderate:   1.5,
    active:     2.2,
    very_active: 3.0
  };

  const PAL_FACTORS = {
    sedentary:   1.2,
    light:       1.375,
    moderate:    1.55,
    active:      1.725,
    very_active: 1.9
  };

  const GOAL_STEP_BONUS = {
    weightloss:  2000,
    maintenance: 0,
    muscle:      500,
    endurance:   4000
  };

  /* ── BMR (Mifflin-St Jeor) ── */
  function calcBMR(profile) {
    const { weight, height, age, gender } = profile;
    const bmr = gender === 'female'
      ? (10 * weight) + (6.25 * height) - (5 * age) - 161
      : (10 * weight) + (6.25 * height) - (5 * age) + 5;
    return Math.round(bmr);
  }

  /* ── TDEE ── */
  function calcTDEE(profile) {
    return Math.round(calcBMR(profile) * (PAL_FACTORS[profile.activityLevel] || 1.55));
  }

  /* ── BMI ── */
  function calcBMI(profile) {
    const h = profile.height / 100;
    return +(profile.weight / (h * h)).toFixed(1);
  }

  function bmiCategory(bmi) {
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25)   return 'Healthy';
    if (bmi < 30)   return 'Overweight';
    return 'Obese';
  }

  /* ── Daily step target ── */
  function calcStepTarget(profile) {
    const mult  = ACTIVITY_MULTIPLIERS[profile.activityLevel] || 1.5;
    const wFact = profile.weight / 70; // normalize around 70kg reference
    const bonus = GOAL_STEP_BONUS[profile.fitnessGoal] || 0;
    return Math.round(BASE_STEPS + (mult * 1000 * wFact) + bonus);
  }

  /* ── Water intake ── */
  function calcWater(profile) {
    // Base: weight × 0.033 L/day, add ~500ml for active levels
    const base  = profile.weight * 0.033;
    const extra = ['active','very_active'].includes(profile.activityLevel) ? 0.5 : 0;
    return +(base + extra).toFixed(1);
  }

  /* ── MET-based calorie burn for activities ── */
  function calcActivityCal(met, weight, durationMin) {
    // cal = MET × weight(kg) × duration(hours)
    return Math.round(met * weight * (durationMin / 60));
  }

  /* ── Workout plan generator ── */
  function getWorkoutPlan(profile) {
    const { fitnessGoal, activityLevel, weight } = profile;
    const plans = {
      weightloss: [
        { icon: '🚶', name: '30-min Brisk Walk',    dur: 30, met: 3.8 },
        { icon: '🏃', name: '15-min Light Jog',     dur: 15, met: 7.0 },
        { icon: '🏋️', name: '20-min Bodyweight',    dur: 20, met: 5.0 },
      ],
      maintenance: [
        { icon: '🚶', name: '20-min Walk',           dur: 20, met: 3.5 },
        { icon: '🧘', name: '15-min Stretching',     dur: 15, met: 2.5 },
        { icon: '🚴', name: '20-min Cycling',        dur: 20, met: 6.0 },
      ],
      muscle: [
        { icon: '🏋️', name: '30-min Strength',      dur: 30, met: 6.0 },
        { icon: '🚶', name: '15-min Cool-down Walk', dur: 15, met: 3.0 },
        { icon: '🧘', name: '10-min Mobility',       dur: 10, met: 2.3 },
      ],
      endurance: [
        { icon: '🏃', name: '30-min Run',            dur: 30, met: 9.0 },
        { icon: '🚴', name: '20-min HIIT Cycling',   dur: 20, met: 8.0 },
        { icon: '🏊', name: '15-min Swimming',       dur: 15, met: 8.3 },
      ],
    };
    const items = plans[fitnessGoal] || plans.maintenance;
    return items.map(w => ({
      ...w,
      calories: calcActivityCal(w.met, weight, w.dur)
    }));
  }

  /* ── Diet tips (rule-based) ── */
  function getDietTips(profile) {
    const tips = [];
    const water = calcWater(profile);
    const tdee  = calcTDEE(profile);
    const bmi   = calcBMI(profile);

    tips.push({
      icon: '💧',
      text: `Drink <strong>${water}L of water today</strong> — sip ${Math.round(water/8*250)}ml every ~2 hours.`
    });

    if (profile.fitnessGoal === 'weightloss') {
      const deficit = Math.min(500, Math.round(tdee * 0.15));
      tips.push({
        icon: '🥗',
        text: `Target <strong>${tdee - deficit} kcal/day</strong> (${deficit} kcal deficit). Prioritise vegetables and lean protein.`
      });
    } else if (profile.fitnessGoal === 'muscle') {
      const protein = Math.round(profile.weight * 1.8);
      tips.push({
        icon: '🥩',
        text: `Eat <strong>${protein}g protein/day</strong> (~${Math.round(protein/profile.weight*10)/10}g per kg). Chicken, eggs, tofu all count.`
      });
    } else {
      tips.push({
        icon: '🍽️',
        text: `Your maintenance calories are <strong>${tdee} kcal/day</strong>. Balance carbs, protein, and healthy fats.`
      });
    }

    if (bmi > 25) {
      tips.push({
        icon: '🫐',
        text: `Swap refined carbs for <strong>whole grains and berries</strong> — lower glycaemic index helps manage weight.`
      });
    } else if (bmi < 18.5) {
      tips.push({
        icon: '🥑',
        text: `Add <strong>calorie-dense whole foods</strong> — avocado, nuts, olive oil — to boost intake without large portions.`
      });
    } else {
      tips.push({
        icon: '🌿',
        text: `Eat <strong>30+ different plant foods</strong> per week for gut diversity and micronutrient coverage.`
      });
    }

    // Universal tips
    tips.push({
      icon: '⏰',
      text: `<strong>Don't skip breakfast.</strong> People who eat within 2 hours of waking are more active during the day.`
    });

    return tips;
  }

  /* ── Today's smart summary ── */
  async function getTodayRecommendation(profile, metrics) {
    const stepTarget = calcStepTarget(profile);
    const remaining  = Math.max(0, stepTarget - (metrics.steps || 0));
    const pct        = Math.min(100, Math.round(((metrics.steps || 0) / stepTarget) * 100));

    if (pct >= 100) {
      return `🎉 Goal crushed! You've hit ${metrics.steps?.toLocaleString()} steps. Rest up or go for a bonus 1,000!`;
    }
    if (pct >= 75) {
      const minWalk = Math.round(remaining / 100);
      return `Almost there! ${remaining.toLocaleString()} steps left (~${minWalk} min walk). You've got this.`;
    }
    if (pct >= 50) {
      return `Halfway through! ${remaining.toLocaleString()} more steps. A 20-min brisk walk will close the gap.`;
    }
    if (pct >= 25) {
      return `Good start — ${metrics.steps?.toLocaleString()} steps done. Take a 15-min walk at lunchtime to build momentum.`;
    }
    return `Time to move! Your AI target today is ${stepTarget.toLocaleString()} steps. Start with a 10-min walk — it adds up fast.`;
  }

  /* ── Public API ── */
  return {
    calcBMR,
    calcTDEE,
    calcBMI,
    bmiCategory,
    calcStepTarget,
    calcWater,
    getWorkoutPlan,
    getDietTips,
    getTodayRecommendation
  };
})();
