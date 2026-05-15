/**
 * chart-view.js — StepSync Pro
 * Renders step history chart + summary cards.
 * Updated for async Storage API.
 */

const ChartView = (() => {
  let chartInstance = null;
  let activeDays    = 7;

  function shortLabel(dateStr) {
    const d    = new Date(dateStr + 'T00:00:00');
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return activeDays <= 7
      ? `${days[d.getDay()]} ${d.getDate()}`
      : `${d.getMonth()+1}/${d.getDate()}`;
  }

  async function render(nDays = 7) {
    activeDays = nDays;
    const [history, settings] = await Promise.all([
      Storage.loadHistory(nDays),
      Storage.loadSettings()
    ]);

    const labels   = history.map(d => shortLabel(d.date));
    const stepData = history.map(d => d.steps || 0);
    const goal     = settings.goal;

    const barColors = stepData.map(s =>
      s >= goal
        ? 'rgba(255,209,102,0.9)'
        : 'rgba(108,99,255,0.75)'
    );

    const ctx = document.getElementById('history-chart');
    if (!ctx) return;

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label:           'Steps',
            data:            stepData,
            backgroundColor: barColors,
            borderRadius:    8,
            borderSkipped:   false,
            barPercentage:   0.7,
          },
          {
            label:       'Goal',
            data:        new Array(nDays).fill(goal),
            type:        'line',
            borderColor: 'rgba(255,101,132,0.5)',
            borderWidth: 1.5,
            borderDash:  [5, 5],
            pointRadius: 0,
            fill:        false,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1c27',
            borderColor:     '#2a2a3d',
            borderWidth:     1,
            titleColor:      '#e8e8f5',
            bodyColor:       '#7070a0',
            callbacks: {
              label: ctx =>
                ctx.datasetIndex === 0
                  ? ` ${ctx.parsed.y.toLocaleString()} steps`
                  : ` Goal: ${goal.toLocaleString()}`,
            },
          },
        },
        scales: {
          x: {
            grid:  { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#7070a0', font: { family: "'JetBrains Mono'", size: 9 }, maxRotation: 0 },
          },
          y: {
            grid:  { color: 'rgba(255,255,255,0.03)' },
            ticks: {
              color: '#7070a0',
              font: { family: "'JetBrains Mono'", size: 9 },
              callback: v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v,
            },
            beginAtZero: true,
          },
        },
      },
    });

    renderSummary(history, settings);
  }

  function renderSummary(history, settings) {
    const el = document.getElementById('history-summary');
    if (!el) return;

    const totalSteps  = history.reduce((s, d) => s + (d.steps || 0), 0);
    const avgSteps    = Math.round(totalSteps / history.length);
    const daysGoalMet = history.filter(d => d.steps >= settings.goal).length;
    const bestDay     = history.reduce((b, d) => (d.steps || 0) > (b.steps || 0) ? d : b, history[0]);
    const totalDist   = history.reduce((s, d) => s + (d.distance || 0), 0);
    const distLabel   = settings.units === 'imperial' ? 'mi' : 'km';
    const totalCal    = history.reduce((s, d) => s + (d.calories || 0), 0);

    el.innerHTML = `
      <div class="summary-card">
        <div class="s-label">Avg / Day</div>
        <div class="s-val">${avgSteps.toLocaleString()}</div>
        <div class="s-sub">steps</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Goals Met</div>
        <div class="s-val">${daysGoalMet} / ${history.length}</div>
        <div class="s-sub">days</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Best Day</div>
        <div class="s-val">${(bestDay.steps || 0).toLocaleString()}</div>
        <div class="s-sub">${shortLabel(bestDay.date)}</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Distance</div>
        <div class="s-val">${totalDist.toFixed(1)}</div>
        <div class="s-sub">${distLabel} total</div>
      </div>
    `;
  }

  function refresh() { render(activeDays); }

  return { render, refresh };
})();
