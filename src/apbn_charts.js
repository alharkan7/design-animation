import Chart from 'chart.js/auto';

// Configuration
const DATA_URL = '/data/apbn-pendidikan_cleaned.csv';

// Colors
const COLOR_PRIMARY = '#38bdf8'; // Sky 400
const COLOR_SECONDARY = '#818cf8'; // Indigo 400
const COLOR_ACCENT = '#f472b6'; // Pink 400
const COLOR_GRID = 'rgba(255, 255, 255, 0.1)';
const COLOR_TEXT = '#94a3b8';

// Helper to format currency
const formatCurrency = (value) => {
  const trillions = value / 1000000000000;
  return `Rp ${trillions.toFixed(1)} T`;
};

// Helper to format percentage
const formatPercentage = (value) => {
  return `${(value * 100).toFixed(2)}%`;
};

async function loadData() {
  const response = await fetch(DATA_URL);
  const text = await response.text();
  
  // Simple CSV parser
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  
  const data = lines.slice(1).map(line => {
    const values = line.split(',');
    return {
      year: values[0],
      educationBudget: parseInt(values[1]),
      totalAPBN: parseInt(values[2]),
      percentage: parseFloat(values[3])
    };
  });
  
  return data;
}

async function initCharts() {
  const data = await loadData();
  
  const years = data.map(d => d.year);
  const budgets = data.map(d => d.educationBudget);
  const percentages = data.map(d => d.percentage);
  const totalAPBN = data.map(d => d.totalAPBN);

  // 1. Combo Chart: Budget (Bar) vs Percentage (Line)
  const ctxCombo = document.getElementById('comboChart').getContext('2d');
  new Chart(ctxCombo, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        {
          label: 'Education Budget (Rp)',
          data: budgets,
          backgroundColor: COLOR_PRIMARY,
          borderRadius: 4,
          order: 2,
          yAxisID: 'y',
        },
        {
          label: 'Portion of APBN (%)',
          data: percentages,
          type: 'line',
          borderColor: COLOR_ACCENT,
          backgroundColor: COLOR_ACCENT,
          borderWidth: 3,
          pointBackgroundColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          order: 1,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: { color: '#f8fafc' }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.dataset.yAxisID === 'y') {
                label += formatCurrency(context.raw);
              } else {
                label += formatPercentage(context.raw);
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: COLOR_GRID },
          ticks: { color: COLOR_TEXT }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: COLOR_GRID },
          ticks: { 
            color: COLOR_TEXT,
            callback: function(value) {
              return formatCurrency(value);
            }
          },
          title: {
            display: true,
            text: 'Budget (Trillions IDR)',
            color: COLOR_TEXT
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { display: false },
          ticks: { 
            color: COLOR_ACCENT,
            callback: function(value) {
              return formatPercentage(value);
            }
          },
          title: {
            display: true,
            text: 'Portion of APBN',
            color: COLOR_ACCENT
          },
          min: 0,
          max: 0.25 // Scale it to give the line some headroom (target is 20%)
        }
      },
      animation: {
        duration: 2000,
        easing: 'easeOutQuart',
        delay: (context) => {
          if (context.type === 'data' && context.mode === 'default') {
            return context.dataIndex * 300;
          }
          return 0;
        }
      }
    }
  });

  // 2. Area Chart: Education vs Rest of APBN
  const ctxArea = document.getElementById('areaChart').getContext('2d');
  
  // Calculate "Rest of APBN"
  const restAPBN = data.map(d => d.totalAPBN - d.educationBudget);

  new Chart(ctxArea, {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        {
          label: 'Education Budget',
          data: budgets,
          borderColor: COLOR_PRIMARY,
          backgroundColor: 'rgba(56, 189, 248, 0.5)', // Transparent Blue
          fill: true,
          tension: 0.4
        },
        {
          label: 'Rest of APBN',
          data: restAPBN,
          borderColor: 'rgba(148, 163, 184, 0.5)', // Slate
          backgroundColor: 'rgba(148, 163, 184, 0.2)', // Transparent Slate
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + formatCurrency(context.raw);
            },
            footer: function(tooltipItems) {
              const index = tooltipItems[0].dataIndex;
              // Access the original data using the index
              const year = years[index];
              const originalItem = data.find(d => d.year === year);
              
              if (originalItem) {
                 return `Total APBN: ${formatCurrency(originalItem.totalAPBN)}\nEducation Share: ${formatPercentage(originalItem.percentage)}`;
              }
              return '';
            }
          }
        },
        legend: {
            labels: { color: '#f8fafc' }
        }
      },
      scales: {
        x: {
          grid: { color: COLOR_GRID },
          ticks: { color: COLOR_TEXT }
        },
        y: {
          stacked: true,
          grid: { color: COLOR_GRID },
          ticks: { 
            color: COLOR_TEXT,
            callback: function(value) {
              return formatCurrency(value);
            }
          },
          title: {
            display: true,
            text: 'Total APBN Volume',
            color: COLOR_TEXT
          }
        }
      },
      animation: {
        duration: 2000,
        easing: 'easeOutQuart',
        delay: (context) => {
          if (context.type === 'data' && context.mode === 'default') {
            return context.dataIndex * 300;
          }
          return 0;
        }
      }
    }
  });
  // 3. Animated Pie Chart
  const ctxPie = document.getElementById('pieChart').getContext('2d');
  const yearLabel = document.getElementById('yearLabel');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const speedButtons = document.querySelectorAll('.speed-control .btn');
  
  // Initial Data (Year 2005)
  let currentIndex = 0;
  let isPlaying = true;
  let speed = 2000;
  let timer = null;
  
  const getPieData = (index) => {
    const d = data[index];
    const edu = d.educationBudget;
    const rest = d.totalAPBN - edu;
    return [edu, rest];
  };

  const pieChart = new Chart(ctxPie, {
    type: 'pie',
    data: {
      labels: ['Education Budget', 'Rest of APBN'],
      datasets: [{
        data: getPieData(0),
        backgroundColor: [COLOR_PRIMARY, 'rgba(148, 163, 184, 0.5)'],
        borderColor: [COLOR_PRIMARY, 'rgba(148, 163, 184, 1)'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: {
          labels: { color: '#f8fafc' },
          position: 'bottom'
        },
        tooltip: {
            callbacks: {
                label: function(context) {
                    const value = context.raw;
                    const total = context.chart._metasets[context.datasetIndex].total;
                    const percentage = (value / total * 100).toFixed(2) + '%';
                    return context.label + ': ' + formatCurrency(value) + ' (' + percentage + ')';
                }
            }
        }
      }
    }
  });

  const nextFrame = () => {
    currentIndex = (currentIndex + 1) % data.length;
    const currentData = data[currentIndex];
    
    // Update Label
    yearLabel.innerText = currentData.year;
    
    // Update Chart Data
    pieChart.data.datasets[0].data = getPieData(currentIndex);
    pieChart.update();
    
    if (isPlaying) {
      timer = setTimeout(nextFrame, speed);
    }
  };
  
  // Start Animation
  timer = setTimeout(nextFrame, speed);

  // Controls Logic
  const togglePlay = () => {
    isPlaying = !isPlaying;
    playPauseBtn.innerText = isPlaying ? '⏸ Pause' : '▶ Play';
    
    if (isPlaying) {
      nextFrame();
    } else {
      clearTimeout(timer);
    }
  };

  playPauseBtn.addEventListener('click', togglePlay);

  speedButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active class from all
      speedButtons.forEach(b => b.classList.remove('active'));
      // Add to clicked
      e.target.classList.add('active');
      
      // Set speed
      speed = parseInt(e.target.dataset.speed);
      
      // Restart timer if playing to apply new speed immediately
      if (isPlaying) {
        clearTimeout(timer);
        timer = setTimeout(nextFrame, speed);
      }
    });
  });
}

initCharts();
