/**
 * charts.js - 다크 모드 대시보드용 Chart.js 컨트롤러 (도넛 3종 + 주식 꺾은선 차트)
 */

function formatWon(val) {
  return Number(val || 0).toLocaleString('ko-KR') + '원';
}

const DARK_PALETTES = {
  incomeVsExpense: ['#10b981', '#ff7a18'],
  incomeCategories: ['#10b981', '#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#f472b6'],
  expenseColorMap: {
    '용돈': '#f472b6',
    '저축': '#a78bfa',
    '식비': '#ff7a18',
    '주거': '#fbbf24',
    '통신': '#38bdf8',
    '교통': '#60a5fa',
    '모임(계)': '#2dd4bf',
    '취미': '#ec4899',
    '보험': '#818cf8',
    '경조사': '#fb7185',
    '기타': '#71717a'
  }
};

const ChartManager = {
  instances: {
    ratioChart: null,
    incomeCatChart: null,
    expenseCatChart: null,
    stockLineChart: null
  },

  initGlobalDefaults() {
    if (window.Chart) {
      Chart.defaults.font.family = "'NanumSquareRound', 'Nanum Gothic', sans-serif";
      Chart.defaults.color = '#a1a1aa';
      Chart.defaults.responsive = true;
      Chart.defaults.maintainAspectRatio = false;
    }
  },

  // 1. 수입 vs 지출(총 저축액 포함) 비율 도넛 차트
  renderRatioChart(totalIncome, totalExpense, monthlySavings = 0) {
    const ctx = document.getElementById('chartRatio');
    if (!ctx) return;
    if (this.instances.ratioChart) this.instances.ratioChart.destroy();

    const expenseWithSavings = (Number(totalExpense) || 0) + (Number(monthlySavings) || 0);
    const hasData = totalIncome > 0 || expenseWithSavings > 0;
    const data = hasData ? [totalIncome, totalExpense, monthlySavings] : [1, 1, 0];
    const colors = hasData ? ['#10b981', '#ff7a18', '#a78bfa'] : ['#27272a', '#27272a', '#27272a'];

    this.instances.ratioChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['총 수입', '총 지출', '총 저축액'],
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: '#121215',
          borderWidth: 2,
          hoverOffset: 5
        }]
      },
      options: {
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, padding: 8, color: '#a1a1aa', font: { size: 10.5, weight: 'bold' } }
          },
          tooltip: {
            callbacks: {
              label(context) {
                if (!hasData) return ' 데이터 없음';
                const val = context.raw || 0;
                const sum = totalIncome + expenseWithSavings;
                const pct = sum > 0 ? ((val / sum) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${formatWon(val)} (${pct}%)`;
              },
              afterBody() {
                if (!hasData) return '';
                return ` 지출+저축 합계: ${formatWon(expenseWithSavings)}`;
              }
            }
          }
        }
      }
    });

    const centerEl = document.getElementById('ratioCenterValue');
    if (centerEl) {
      // 총 수입 - (총 지출 + 총 저축액)
      const bal = totalIncome - expenseWithSavings;
      centerEl.textContent = (bal >= 0 ? '+' : '') + Math.round(bal / 10000).toLocaleString() + '만';
      centerEl.style.color = bal >= 0 ? '#10b981' : '#f87171';
    }
  },

  // 2. 수입 세분화 도넛 차트
  renderIncomeCategoryChart(transactions) {
    const ctx = document.getElementById('chartIncomeCategory');
    if (!ctx) return;
    if (this.instances.incomeCatChart) this.instances.incomeCatChart.destroy();

    const map = {};
    let total = 0;
    transactions.filter(t => t.type === 'income').forEach(t => {
      const amt = Number(t.amount) || 0;
      map[t.category] = (map[t.category] || 0) + amt;
      total += amt;
    });

    const labels = Object.keys(map);
    const data = Object.values(map);
    const hasData = data.length > 0;

    this.instances.incomeCatChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: hasData ? labels : ['내역 없음'],
        datasets: [{
          data: hasData ? data : [1],
          backgroundColor: hasData ? DARK_PALETTES.incomeCategories.slice(0, labels.length) : ['#27272a'],
          borderColor: '#121215',
          borderWidth: 2,
          hoverOffset: 5
        }]
      },
      options: {
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, padding: 8, color: '#a1a1aa', font: { size: 11, weight: 'bold' } }
          },
          tooltip: {
            callbacks: {
              label(context) {
                if (!hasData) return ' 등록된 수입 없음';
                const val = context.raw || 0;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${formatWon(val)} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    const centerEl = document.getElementById('incomeCenterValue');
    if (centerEl) {
      centerEl.textContent = Math.round(total / 10000).toLocaleString() + '만';
      centerEl.style.color = '#10b981';
    }
  },

  // 3. 지출 세분화 도넛 차트
  renderExpenseCategoryChart(transactions) {
    const ctx = document.getElementById('chartExpenseCategory');
    if (!ctx) return;
    if (this.instances.expenseCatChart) this.instances.expenseCatChart.destroy();

    const map = {};
    let total = 0;
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const amt = Number(t.amount) || 0;
      map[t.category] = (map[t.category] || 0) + amt;
      total += amt;
    });

    const labels = Object.keys(map);
    const data = Object.values(map);
    const hasData = data.length > 0;
    const colors = hasData ? labels.map(l => DARK_PALETTES.expenseColorMap[l] || '#71717a') : ['#27272a'];

    this.instances.expenseCatChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: hasData ? labels : ['내역 없음'],
        datasets: [{
          data: hasData ? data : [1],
          backgroundColor: colors,
          borderColor: '#121215',
          borderWidth: 2,
          hoverOffset: 5
        }]
      },
      options: {
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, padding: 8, color: '#a1a1aa', font: { size: 10, weight: 'bold' } }
          },
          tooltip: {
            callbacks: {
              label(context) {
                if (!hasData) return ' 등록된 지출 없음';
                const val = context.raw || 0;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${formatWon(val)} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    const centerEl = document.getElementById('expenseCenterValue');
    if (centerEl) {
      centerEl.textContent = Math.round(total / 10000).toLocaleString() + '만';
      centerEl.style.color = '#ff7a18';
    }
  },

  // 4. 주식 현황 - 연간(1~12월) 총 보유 금액 꺾은선 그래프
  renderStockLineChart(year) {
    const ctx = document.getElementById('chartStockLine');
    if (!ctx) return;
    if (this.instances.stockLineChart) this.instances.stockLineChart.destroy();

    const series = Storage.getAnnualStockSeries(year);

    this.instances.stockLineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: '부부 총 주식 보유금액',
            data: series.totalSeries,
            borderColor: '#ff7a18',
            backgroundColor: 'rgba(255, 122, 24, 0.15)',
            borderWidth: 3,
            pointBackgroundColor: '#ff9f43',
            pointBorderColor: '#121215',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: true,
            tension: 0.32
          },
          {
            label: '남편 보유금액',
            data: series.husbandSeries,
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 3.5,
            tension: 0.32
          },
          {
            label: '아내 보유금액',
            data: series.wifeSeries,
            borderColor: '#f472b6',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 3.5,
            tension: 0.32
          }
        ]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#71717a',
              callback: val => Math.round(val / 10000).toLocaleString() + '만'
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#a1a1aa', font: { weight: 'bold' } }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#e4e4e7', font: { weight: 'bold' } }
          },
          tooltip: {
            callbacks: {
              label(context) {
                const idx = context.dataIndex;
                const val = context.raw || 0;
                if (context.datasetIndex === 0) {
                  const rate = series.momRates[idx];
                  const rateStr = rate !== 0 ? ` (전월대비 ${rate > 0 ? '+' : ''}${rate}%)` : '';
                  return ` ${context.dataset.label}: ${formatWon(val)}${rateStr}`;
                }
                return ` ${context.dataset.label}: ${formatWon(val)}`;
              }
            }
          }
        }
      }
    });
  }
};
