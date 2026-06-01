// Main JavaScript for 3D Map Visualization



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
    // Fetch Indonesia GeoJSON from a reliable open-source repository
    const geoJsonUrl = 'https://raw.githubusercontent.com/rifani/geojson-political-indonesia/master/IDN_adm_2_kabkota.json';
    const response = await fetch(geoJsonUrl);
    const geoJson = await response.json();
    
    const populationData = [];
    
    // Fix properties and generate data based on actual map coordinates
    geoJson.features.forEach((feature, index) => {
      // ECharts needs 'name' property to render regions. Use NAME_2 which is Kabupaten/Kota
      feature.properties.name = feature.properties.NAME_2 || `Region ${index}`;
      
      // Collect all polygon vertices to sample from
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
      
      // Sample points from the boundary to make spikes along the island shapes
      // We reduce the points per region because there are >500 regencies/cities.
      const pointsToSample = Math.floor(Math.random() * 3) + 1; // 1 to 3 points per regency
      for (let i = 0; i < pointsToSample; i++) {
        if (coordsList.length > 0) {
          const randCoord = coordsList[Math.floor(Math.random() * coordsList.length)];
          // Jitter the coordinate slightly so it's not perfectly on the edge
          const lng = randCoord[0] + (Math.random() - 0.5) * 0.1;
          const lat = randCoord[1] + (Math.random() - 0.5) * 0.1;
          const value = 10 + Math.pow(Math.random(), 3) * 140; // Random spike heights
          populationData.push([lng, lat, value]);
        }
      }
    });

    // Helper to interpolate colors for AQI
    function interpolateColor(color1, color2, factor) {
      const result = color1.slice();
      for (let i = 0; i < 3; i++) {
        result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
      }
      return result;
    }
    const colorGood = [15, 23, 42]; // #0f172a (Navy - Good)
    const colorPoor = [127, 29, 29]; // #7f1d1d (Dark Red - Poor)

    // Generate dummy Air Quality (AQI) data for each region
    const aqiData = {};
    const regionsData = geoJson.features.map((feature, i) => {
      const name = feature.properties.NAME_2 || `Region ${i}`;
      // Generate AQI score between 10 and 150
      const aqi = Math.floor(10 + Math.random() * 140);
      aqiData[name] = aqi;
      
      // Calculate color based on AQI
      const factor = (aqi - 10) / 140; // Normalize 0 to 1
      const rgb = interpolateColor(colorGood, colorPoor, factor);
      
      return {
        name: name,
        itemStyle: {
          color: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
        }
      };
    });

    // Register the map in ECharts
    echarts.registerMap('indonesia', geoJson);

    // Map Configuration
    const option = {
      backgroundColor: '#0f172a', // Match the global theme
      
      // Visual Map (Legend and color scale for the bars)
      visualMap: {
        show: false,
        min: 0,
        max: 150, // Adjust based on the dummy data values
        inRange: {
          // Color gradient from low to high density (cool to warm/bright colors)
          color: ['#0ea5e9', '#38bdf8', '#818cf8', '#c084fc', '#e879f9', '#f472b6']
        }
      },

      // The 3D Map configuration
      geo3D: {
        map: 'indonesia',
        roam: true,
        regionHeight: 0.5, // Small height to prevent z-fighting (flickering)
        regions: regionsData, // Apply choropleth colors
        
        postEffect: {
          enable: true,
          bloom: {
            enable: true,
            bloomIntensity: 0.6 // Cinematic neon glow
          }
        },
        
        groundPlane: {
          show: true,
          color: '#020617' // Very dark floor to highlight the map
        },
        
        // Define the shading and lighting
        shading: 'color', // 'color', 'lambert', 'realistic'
        
        itemStyle: {
          // Default color if regions array doesn't override
          color: '#1e293b', 
          opacity: 0.9,
          borderWidth: 0.8,
          borderColor: 'rgba(56, 189, 248, 0.4)' // Glowing cyan wireframe borders
        },
        
        // Initial camera view
        viewControl: {
          autoRotate: true,
          autoRotateSpeed: 3,
          distance: 120, // Distance of camera
          alpha: 40,    // Pitch angle
          beta: -20,    // Yaw angle
          center: [0, -5, 0], // Offset the center slightly
          panMouseButton: 'right',
          rotateMouseButton: 'left',
          zoomSensitivity: 2,
          panSensitivity: 2,
          rotateSensitivity: 2
        },

        // Highlighting styles when hovering over regions
        emphasis: {
          label: {
            show: true,
            formatter: function(params) {
              const aqi = aqiData[params.name] || 'N/A';
              return params.name + '\nAQI: ' + aqi;
            },
            textStyle: {
              color: '#0f172a', // Dark text for contrast
              fontSize: 14,
              fontWeight: 'bold',
              backgroundColor: 'rgba(255,255,255,0.9)', // Light background
              padding: [4, 8],
              borderRadius: 4
            }
          },
          itemStyle: {
            color: '#f8fafc', // Bright white/light blue for highlighted region
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

      // The 3D Bars (Spikes) series
      series: [
        {
          type: 'bar3D',
          coordinateSystem: 'geo3D',
          shading: 'color', // 'color' makes the bars unaffected by shadows, maximizing the neon bloom effect
          data: populationData,
          
          // Size and shape of the spikes
          barSize: 0.6,
          minHeight: 0.2,
          
          itemStyle: {
            opacity: 0.8
          },
          
          // Tooltip configuration (not used here as we disable tooltip globally, but good to have)
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: false
            }
          }
        }
      ]
    };

    myChart.hideLoading();
    myChart.setOption(option);

    // Handle window resize
    window.addEventListener('resize', () => {
      myChart.resize();
    });

    // Interactivity / Configurable Settings
    const palettes = {
      cool: ['#0ea5e9', '#38bdf8', '#818cf8', '#c084fc', '#e879f9', '#f472b6'],
      heat: ['#fde047', '#f59e0b', '#ea580c', '#ef4444', '#b91c1c'],
      neon: ['#10b981', '#34d399', '#2dd4bf', '#06b6d4', '#3b82f6'],
      mono: ['#64748b', '#94a3b8', '#cbd5e1', '#f1f5f9', '#ffffff']
    };

    document.getElementById('color-palette').addEventListener('change', (e) => {
      const newPalette = palettes[e.target.value];
      myChart.setOption({
        visualMap: {
          inRange: { color: newPalette }
        }
      });
      document.querySelector('.legend-color-gradient').style.background = `linear-gradient(to top, ${newPalette.join(', ')})`;
    });

    document.getElementById('bar-size').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('bar-size-val').innerText = val.toFixed(1);
      myChart.setOption({
        series: [{
          barSize: val
        }]
      });
    });

    document.getElementById('bar-bevel').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('bar-bevel-val').innerText = val.toFixed(1);
      myChart.setOption({
        series: [{
          bevelSize: val,
          bevelSmoothness: val > 0 ? 2 : 0
        }]
      });
    });

  } catch (error) {
    console.error('Error loading map data:', error);
    myChart.hideLoading();
    // Show error message on the canvas if loading fails
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

// Initialize the map when the DOM is loaded
document.addEventListener('DOMContentLoaded', initMap);
