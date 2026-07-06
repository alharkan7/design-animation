// Main JavaScript for 3D Map Visualization

// Name mapping from SPPG data names to geoBoundaries shapeName values.
// The new GeoJSON (geoBoundaries IDN ADM2, 519 features, BPS-sourced) includes
// separate features for every Kota and Kabupaten, so only genuine spelling
// differences need mapping — no more many-to-one parent-regency fallbacks.
const NAME_MAPPING = {
  // Spacing / compound-word differences
  'KARANGASEM': 'KARANG ASEM',
  'GUNUNGKIDUL': 'GUNUNG KIDUL',
  'BATANGHARI': 'BATANG HARI',
  'BANYUASIN': 'BANYU ASIN',
  'LABUHANBATU': 'LABUHAN BATU',
  'LABUHANBATU SELATAN': 'LABUHAN BATU SELATAN',
  'LABUHANBATU UTARA': 'LABUHAN BATU UTARA',
  'MUKO MUKO': 'MUKOMUKO',
  'KOTABARU': 'KOTA BARU',
  'TULANG BAWANG': 'TULANGBAWANG',
  'FAK FAK': 'FAKFAK',

  // Hyphen differences
  'TOJO UNA UNA': 'TOJO UNA-UNA',
  'TOLI TOLI': 'TOLI-TOLI',

  // Kota compound-word differences
  'KOTA BANJARBARU': 'KOTA BANJAR BARU',
  'KOTA BAU BAU': 'KOTA BAUBAU',
  'KOTA LUBUK LINGGAU': 'KOTA LUBUKLINGGAU',
  'KOTA SAWAHLUNTO': 'KOTA SAWAH LUNTO',
  'KOTA PEMATANGSIANTAR': 'KOTA PEMATANG SIANTAR',
  'KOTA PADANG SIDEMPUAN': 'KOTA PADANGSIDIMPUAN',

  // Historical name changes
  'MAHAKAM ULU': 'MAHAKAM HULU',
  'TOBA': 'TOBA SAMOSIR',
  'PASANGKAYU': 'MAMUJU UTARA', // renamed from Mamuju Utara
  'KEPULAUAN TANIMBAR': 'MALUKU TENGGARA BARAT', // renamed from MTB

  // Jakarta administrative prefixes
  'ADM. KEP. SERIBU': 'KEPULAUAN SERIBU',
  'KOTA ADM. JAKARTA BARAT': 'KOTA JAKARTA BARAT',
  'KOTA ADM. JAKARTA PUSAT': 'KOTA JAKARTA PUSAT',
  'KOTA ADM. JAKARTA SELATAN': 'KOTA JAKARTA SELATAN',
  'KOTA ADM. JAKARTA TIMUR': 'KOTA JAKARTA TIMUR',
  'KOTA ADM. JAKARTA UTARA': 'KOTA JAKARTA UTARA',

  // Abbreviated prefix
  'KEP. SIAU TAGULANDANG BIARO': 'SIAU TAGULANDANG BIARO',
  'KAB TIMOR TENGAH SELATAN': 'TIMOR TENGAH SELATAN',
};

// Normalize SPPG city name to match GeoJSON shapeName
function normalizeCityName(sppgCity) {
  let name = sppgCity.toUpperCase().trim();

  // Check direct mapping first
  if (NAME_MAPPING[name]) return NAME_MAPPING[name];

  // Remove KAB/KAB. prefix
  const withoutKab = name.replace(/^KAB\.?\s+/, '').trim();
  if (withoutKab !== name) {
    if (NAME_MAPPING[withoutKab]) return NAME_MAPPING[withoutKab];
    name = withoutKab;
  }

  // Collapse whitespace and normalize
  name = name.replace(/\s+/g, ' ').trim();

  // Final mapping check after normalization
  if (NAME_MAPPING[name]) return NAME_MAPPING[name];

  return name;
}

async function initMap() {
  const chartDom = document.getElementById('chart-container');
  const myChart = echarts.init(chartDom);

  // Show loading spinner
  myChart.showLoading({
    text: 'Loading Map Data...',
    color: '#38bdf8',
    textColor: '#f8fafc',
    maskColor: 'rgba(15, 23, 42, 0.8)'
  });

  try {
    // Fetch Indonesia GeoJSON (local, geoBoundaries IDN ADM2 simplified)
    const geoJsonUrl = '/geojson/indonesia-adm2.geojson';
    const response = await fetch(geoJsonUrl);
    if (!response.ok) throw new Error('Failed to load GeoJSON');
    const geoJson = await response.json();

    // Normalize feature name property: geoBoundaries uses "shapeName",
    // ECharts geo3D expects "name" or "NAME_2" — unify to "name".
    geoJson.features.forEach(feature => {
      const shapeName = feature.properties.shapeName || '';
      feature.properties.name = shapeName;
      feature.properties.NAME_2 = shapeName; // compat
    });

    // Fetch SPPG data
    const sppgResponse = await fetch('/scrapers/bgn-sppg/output/sppg_aggregated.json');
    if (!sppgResponse.ok) {
      throw new Error('Failed to load SPPG data');
    }
    const sppgData = await sppgResponse.json();

    // Create a map of normalized city names to their data
    const sppgDataMap = new Map();

    for (const item of sppgData) {
      const sppgCity = item.CITY_REGENCY;
      const normalizedCity = normalizeCityName(sppgCity);
      sppgDataMap.set(normalizedCity, {
        count: item.COUNT,
        province: item.PROVINCE,
        originalName: sppgCity
      });
    }

    // Collect all GeoJSON city names for matching
    const geoJsonCityNames = new Set();
    geoJson.features.forEach(feature => {
      const name = feature.properties.name;
      if (name) {
        geoJsonCityNames.add(name.toUpperCase());
      }
    });

    // Check for unmapped cities — try KOTA prefix addition and partial match
    const unmappedCities = [];
    for (const [city, data] of [...sppgDataMap.entries()]) {
      if (geoJsonCityNames.has(city)) continue;

      // Try adding KOTA prefix
      if (geoJsonCityNames.has('KOTA ' + city)) {
        sppgDataMap.set('KOTA ' + city, data);
        sppgDataMap.delete(city);
        continue;
      }

      // Try partial match
      let found = false;
      for (const geoName of geoJsonCityNames) {
        if (geoName.includes(city) || city.includes(geoName)) {
          sppgDataMap.set(geoName, data);
          sppgDataMap.delete(city);
          found = true;
          break;
        }
      }
      if (!found) {
        unmappedCities.push({ city, original: data.originalName });
      }
    }

    if (unmappedCities.length > 0) {
      console.warn(`${unmappedCities.length} cities could not be mapped to GeoJSON:`,
        unmappedCities.map(c => c.original).join(', '));
    }

    // Generate bar data for matched cities
    const populationData = [];

    geoJson.features.forEach((feature) => {
      const name = feature.properties.name;
      const nameUpper = name.toUpperCase();

      // Get data from SPPG if available
      const sppgInfo = sppgDataMap.get(nameUpper);

      if (sppgInfo) {
        // Collect coordinates for centroid calculation
        const coordsList = [];
        if (feature.geometry) {
          if (feature.geometry.type === 'Polygon') {
            feature.geometry.coordinates.forEach(ring => coordsList.push(...ring));
          } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach(poly => {
              poly.forEach(ring => coordsList.push(...ring));
            });
          }
        }

        // Place one bar per region at its centroid
        if (coordsList.length > 0) {
          const lng = coordsList.reduce((sum, c) => sum + c[0], 0) / coordsList.length;
          const lat = coordsList.reduce((sum, c) => sum + c[1], 0) / coordsList.length;

          const value = sppgInfo.count;
          populationData.push({
            value: [lng, lat, value],
            province: sppgInfo.province,
            cityName: name,
            count: sppgInfo.count
          });
        }
      }
    });

    // Helper to interpolate colors
    function interpolateColor(color1, color2, factor) {
      const result = color1.slice();
      for (let i = 0; i < 3; i++) {
        result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
      }
      return result;
    }

    const baseMapColors = {
      warm: { good: [242, 239, 233], poor: [224, 122, 95] },
      blue: { good: [230, 240, 248], poor: [120, 160, 210] },
      mono: { good: [248, 238, 238], poor: [220, 110, 110] }
    };

    function getRegionsData(paletteId) {
      const colors = baseMapColors[paletteId] || baseMapColors.warm;
      return geoJson.features.map((feature) => {
        const name = feature.properties.name;
        const sppgInfo = sppgDataMap.get(name.toUpperCase());

        let count = 50; // Default medium value
        if (sppgInfo) {
          count = Math.min(sppgInfo.count, 150);
        }

        const factor = (count - 10) / 140;
        const rgb = interpolateColor(colors.good, colors.poor, Math.max(0, Math.min(1, factor)));

        return {
          name: name,
          itemStyle: {
            color: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
          }
        };
      });
    }

    const regionsData = getRegionsData('warm');

    // Register the map
    echarts.registerMap('indonesia', geoJson);

    // Find max value for scaling
    const maxValue = Math.max(...populationData.map(d => d.value[2]), 1);

    // Map Configuration
    const option = {
      backgroundColor: '#d6e1e6',

      tooltip: {
        show: false
      },

      visualMap: {
        show: false,
        min: 0,
        max: maxValue,
        inRange: {
          color: ['#f59e0b', '#ea580c', '#dc2626', '#991b1b', '#7f1d1d']
        }
      },

      geo3D: {
        map: 'indonesia',
        roam: true,
        regionHeight: 0.05,
        regions: regionsData,

        postEffect: {
          enable: true,
          bloom: {
            enable: true,
            bloomIntensity: 0.6
          }
        },

        groundPlane: {
          show: false,
          color: '#020617'
        },

        shading: 'color',

        itemStyle: {
          color: '#f2efe9',
          opacity: 0.95,
          borderWidth: 0.8,
          borderColor: 'rgba(0, 0, 0, 0.25)'
        },

        viewControl: {
          minDistance: 10,
          maxDistance: 400,
          autoRotate: true,
          autoRotateAfterStill: 99999999,
          autoRotateSpeed: 1.5,
          distance: window.innerWidth <= 768 ? 60 : 50,
          alpha: 40,
          beta: -20,
          center: window.innerWidth <= 768 ? [-16, -2, 0] : [0, -5, 0],
          panMouseButton: 'right',
          rotateMouseButton: 'left',
          zoomSensitivity: 2,
          panSensitivity: 2,
          rotateSensitivity: 2
        },

        emphasis: {
          label: {
            show: true,
            formatter: function(params) {
              const nameUpper = params.name.toUpperCase();
              const sppgInfo = sppgDataMap.get(nameUpper);
              if (sppgInfo) {
                return params.name + ' (' + sppgInfo.count + ')';
              }
              return params.name;
            },
            textStyle: {
              color: '#0f172a',
              fontSize: 14,
              fontWeight: 'bold',
              backgroundColor: 'rgba(255,255,255,0.9)',
              padding: [4, 8],
              borderRadius: 4
            }
          },
          itemStyle: {
            color: '#f8fafc',
            opacity: 1
          }
        },

        light: {
          main: {
            intensity: 1.2,
            shadow: true,
            alpha: 40,
            beta: -30
          },
          ambient: {
            intensity: 0.5
          }
        }
      },

      series: [
        {
          type: 'bar3D',
          coordinateSystem: 'geo3D',
          shading: 'color',
          tooltip: {
            show: false
          },
          // Start with zero heights for animation
          data: populationData.map(item => {
            if (typeof item === 'object') {
              return { ...item, value: [item.value[0], item.value[1], 0] };
            }
            return [item[0], item[1], 0];
          }),
          barSize: 0.15,
          minHeight: 0,
          itemStyle: {
            opacity: 0.8
          },
          label: {
            show: false
          },
          emphasis: {
            itemStyle: {
              opacity: 1,
              color: '#38bdf8'
            },
            label: {
              show: false
            }
          },
          animation: true,
          animationDurationUpdate: 2000,
          animationEasingUpdate: 'cubicOut'
        }
      ]
    };

    myChart.hideLoading();

    // Create a lookup map for tooltip data
    const tooltipDataMap = new Map();
    populationData.forEach(item => {
      const value = typeof item === 'object' && item.value ? item.value : item;
      const key = `${value[0].toFixed(4)}_${value[1].toFixed(4)}`;
      tooltipDataMap.set(key, {
        province: typeof item === 'object' ? item.province : 'Unknown',
        cityName: typeof item === 'object' ? item.cityName : 'Unknown',
        count: typeof item === 'object' ? item.count : (value[2] || 0)
      });
    });

    // Store globally for tooltip formatter access
    window.tooltipDataMap = tooltipDataMap;

    myChart.setOption(option);

    // Trigger animation to rise up the spikes
    setTimeout(() => {
      myChart.setOption({
        series: [{
          data: populationData,
          minHeight: 0.2
        }]
      });
    }, 100);

    window.addEventListener('resize', () => {
      myChart.resize();
    });

    // Track hover state for reliable clicks on 3D objects
    let lastHoveredCity = null;

    myChart.on('mouseover', function(params) {
      if (params.name) {
        lastHoveredCity = params.name;
      } else if (params.data && params.data.cityName) {
        lastHoveredCity = params.data.cityName;
      }
    });

    myChart.on('mouseout', function() {
      lastHoveredCity = null;
    });

    // Handle clicks globally via ZRender to catch geo3D area clicks reliably
    myChart.getZr().on('click', function(e) {
      if (!lastHoveredCity) return;

      let province = 'Unknown';
      let cityName = lastHoveredCity;
      let count = 0;

      const sppgInfo = sppgDataMap.get(cityName.toUpperCase());
      if (sppgInfo) {
        province = sppgInfo.province;
        count = sppgInfo.count;
      }

      if (cityName !== 'Unknown') {
        document.getElementById('info-city').textContent = cityName;
        document.getElementById('info-province').textContent = province;
        document.getElementById('info-count').textContent = new Intl.NumberFormat('id-ID').format(count);
        document.getElementById('click-info-card').classList.remove('hidden');
      }
    });

    let isRotating = true;

    function setRotation(state) {
      isRotating = state;
      myChart.setOption({ geo3D: { viewControl: { autoRotate: state } } });
      updateRotationIcon();
    }

    function updateRotationIcon() {
      const toggleBtn = document.getElementById('rotation-toggle-btn');
      if (toggleBtn) {
        toggleBtn.innerHTML = `<i data-lucide="${isRotating ? 'pause' : 'play'}" aria-hidden="true"></i><span id="rotation-text">${isRotating ? 'Pause' : 'Resume'}</span>`;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }
    }

    // Toggle on spacebar
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setRotation(!isRotating);
      }
    });

    // Stop rotation when the user interacts anywhere on the map
    myChart.getZr().on('mousedown', function() {
      if (isRotating) {
        isRotating = false;
        updateRotationIcon();
      }
    });

    // Handle close button
    const closeBtn = document.getElementById('close-info-card');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('click-info-card').classList.add('hidden');
      });
    }

    const palettes = {
      blue: ['#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'],
      warm: ['#f59e0b', '#ea580c', '#dc2626', '#991b1b', '#7f1d1d'],
      mono: ['#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c']
    };

    // Handle toggle button
    const toggleBtn = document.getElementById('rotation-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        setRotation(!isRotating);
      });
    }

    document.getElementById('color-palette').addEventListener('change', (e) => {
      const paletteId = e.target.value;
      const newPalette = palettes[paletteId];
      
      myChart.setOption({
        visualMap: {
          inRange: { color: newPalette }
        },
        geo3D: {
          regions: getRegionsData(paletteId)
        }
      });
      
      document.querySelector('.legend-color-gradient').style.background = `linear-gradient(to top, ${newPalette.join(', ')})`;
      
      const flatBox = document.querySelector('.legend-color-flat');
      if (flatBox) {
        const c1 = baseMapColors[paletteId].good;
        const c2 = baseMapColors[paletteId].poor;
        flatBox.style.background = `linear-gradient(to top, rgb(${c1[0]},${c1[1]},${c1[2]}), rgb(${c2[0]},${c2[1]},${c2[2]}))`;
      }
    });

    // -- Data View Table Generation --
    const provinceMap = new Map();
    for (const item of sppgData) {
      const prov = item.PROVINCE || 'Unknown';
      if (!provinceMap.has(prov)) {
        provinceMap.set(prov, { name: prov, total: 0, cities: [] });
      }
      const pData = provinceMap.get(prov);
      pData.total += item.COUNT;
      pData.cities.push({ name: item.CITY_REGENCY, count: item.COUNT });
    }

    const provincesBase = Array.from(provinceMap.values());
    let currentSortBy = 'count';
    let currentSortOrder = 'desc';
    let allExpanded = false;

    function renderTable() {
      const tbody = document.getElementById('data-table-body');
      if (!tbody) return;
      
      tbody.innerHTML = '';
      
      // Sort provinces
      provincesBase.sort((a, b) => {
        if (currentSortBy === 'name') {
          return currentSortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        } else {
          return currentSortOrder === 'asc' ? a.total - b.total : b.total - a.total;
        }
      });

      provincesBase.forEach((prov, pIndex) => {
        // Province row
        const pRow = document.createElement('tr');
        pRow.className = 'row-province' + (allExpanded ? ' expanded' : '');
        pRow.dataset.provIndex = pIndex;
        
        pRow.innerHTML = `
          <td class="prov-name-cell">
            <span class="prov-icon"><i data-lucide="chevron-right" style="width:16px;height:16px;"></i></span>
            <span class="prov-text">${prov.name}</span>
          </td>
          <td>${new Intl.NumberFormat('id-ID').format(prov.total)}</td>
        `;
        tbody.appendChild(pRow);

        // Sort cities
        prov.cities.sort((a, b) => {
          if (currentSortBy === 'name') {
            return currentSortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
          } else {
            return currentSortOrder === 'asc' ? a.count - b.count : b.count - a.count;
          }
        });

        // City rows
        prov.cities.forEach(city => {
          const cRow = document.createElement('tr');
          cRow.className = `row-city prov-group-${pIndex}` + (allExpanded ? ' visible' : '');
          cRow.innerHTML = `
            <td class="city-name">${city.name}</td>
            <td>${new Intl.NumberFormat('id-ID').format(city.count)}</td>
          `;
          tbody.appendChild(cRow);
        });

        // Click handler to toggle cities
        pRow.addEventListener('click', () => {
          const isExpanded = pRow.classList.toggle('expanded');
          const cityRows = document.querySelectorAll(`.prov-group-${pIndex}`);
          cityRows.forEach(row => {
            if (isExpanded) {
              row.classList.add('visible');
            } else {
              row.classList.remove('visible');
            }
          });
        });
      });
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }

    renderTable();

    // Sorting Headers
    document.querySelectorAll('#data-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const sortBy = th.dataset.sort;
        if (currentSortBy === sortBy) {
          currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          currentSortBy = sortBy;
          currentSortOrder = sortBy === 'name' ? 'asc' : 'desc';
        }
        
        // Update header UI
        document.querySelectorAll('#data-table th.sortable').forEach(h => {
          h.classList.remove('sort-active');
          h.querySelector('.sort-icon').innerHTML = '';
        });
        th.classList.add('sort-active');
        const iconName = currentSortOrder === 'asc' ? 'arrow-up' : 'arrow-down';
        th.querySelector('.sort-icon').innerHTML = `<i data-lucide="${iconName}" style="width:14px;height:14px;"></i>`;
        
        renderTable();
      });
    });

    // Toggle Data View
    const btnShowData = document.getElementById('show-data-btn');
    const btnCloseData = document.getElementById('close-data-view');
    const dataContainer = document.getElementById('data-view-container');

    if (btnShowData && btnCloseData && dataContainer) {
      btnShowData.addEventListener('click', () => {
        dataContainer.classList.remove('hidden');
      });
      btnCloseData.addEventListener('click', () => {
        dataContainer.classList.add('hidden');
      });
    }

    // Show/Hide All Toggle
    const btnToggleAll = document.getElementById('toggle-all-cities');
    if (btnToggleAll) {
      btnToggleAll.addEventListener('click', () => {
        allExpanded = !allExpanded;
        btnToggleAll.textContent = allExpanded ? 'Hide All' : 'Show All';
        renderTable();
      });
    }

  } catch (error) {
    console.error('Error loading map data:', error);
    myChart.hideLoading();
    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = `
      <div style="color: #ef4444; text-align: center; margin-top: 20%; font-family: Outfit, sans-serif;">
        <h2>Failed to load map data</h2>
        <p>Please check your internet connection or try again later.</p>
        <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 1rem;">${error.message}</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', initMap);
