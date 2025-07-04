const fs = require('fs');
const path = require('path');
const moment = require('moment');

const DATA_DIR = path.join(__dirname, '../data');
const CHARTS_DIR = path.join(__dirname, '../charts');

function generateMermaidCharts() {
  try {
    console.log('Mermaid 차트 생성 시작...');
    
    // 최신 데이터 로드
    const latestDataPath = path.join(DATA_DIR, 'latest.json');
    if (!fs.existsSync(latestDataPath)) {
      console.error('최신 데이터 파일이 없습니다.');
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(latestDataPath, 'utf8'));
    const earthquakes = data.earthquakes;
    
    // 차트 디렉토리 생성
    if (!fs.existsSync(CHARTS_DIR)) {
      fs.mkdirSync(CHARTS_DIR, { recursive: true });
    }
    
    // 1. 규모별 지진 발생 횟수 차트
    const magnitudeChart = generateMagnitudeChart(earthquakes);
    fs.writeFileSync(path.join(CHARTS_DIR, 'magnitude-chart.md'), magnitudeChart);
    
    // 2. 시간대별 지진 발생 차트
    const timeChart = generateTimeChart(earthquakes);
    fs.writeFileSync(path.join(CHARTS_DIR, 'time-chart.md'), timeChart);
    
    // 3. 지역별 지진 발생 차트
    const regionChart = generateRegionChart(earthquakes);
    fs.writeFileSync(path.join(CHARTS_DIR, 'region-chart.md'), regionChart);
    
    // 4. 깊이별 지진 분포 차트
    const depthChart = generateDepthChart(earthquakes);
    fs.writeFileSync(path.join(CHARTS_DIR, 'depth-chart.md'), depthChart);
    
    console.log('Mermaid 차트 생성 완료!');
    
  } catch (error) {
    console.error('차트 생성 중 오류 발생:', error);
    throw error;
  }
}

function generateMagnitudeChart(earthquakes) {
  const magnitudeRanges = {
    '1.0-2.9': 0,
    '3.0-3.9': 0,
    '4.0-4.9': 0,
    '5.0-5.9': 0,
    '6.0-6.9': 0,
    '7.0+': 0
  };
  
  earthquakes.forEach(eq => {
    const mag = eq.magnitude;
    if (mag >= 1.0 && mag < 3.0) magnitudeRanges['1.0-2.9']++;
    else if (mag >= 3.0 && mag < 4.0) magnitudeRanges['3.0-3.9']++;
    else if (mag >= 4.0 && mag < 5.0) magnitudeRanges['4.0-4.9']++;
    else if (mag >= 5.0 && mag < 6.0) magnitudeRanges['5.0-5.9']++;
    else if (mag >= 6.0 && mag < 7.0) magnitudeRanges['6.0-6.9']++;
    else if (mag >= 7.0) magnitudeRanges['7.0+']++;
  });
  
  const chartData = Object.entries(magnitudeRanges)
    .map(([range, count]) => `    "${range}" : ${count}`)
    .join('\n');
  
  return `# 규모별 지진 발생 횟수

\`\`\`mermaid
xychart-beta
    title "규모별 지진 발생 횟수"
    x-axis [1.0-2.9, 3.0-3.9, 4.0-4.9, 5.0-5.9, 6.0-6.9, 7.0+]
    y-axis "발생 횟수" 0 --> ${Math.max(...Object.values(magnitudeRanges)) + 5}
    bar [${Object.values(magnitudeRanges).join(', ')}]
\`\`\`

업데이트 시간: ${moment().format('YYYY-MM-DD HH:mm:ss')}
`;
}

function generateTimeChart(earthquakes) {
  const hourlyData = new Array(24).fill(0);
  
  earthquakes.forEach(eq => {
    const dateTime = eq.dateTime;
    const hour = parseInt(dateTime.split(' ')[1]?.split(':')[0] || '0');
    if (hour >= 0 && hour <= 23) {
      hourlyData[hour]++;
    }
  });
  
  const hours = Array.from({length: 24}, (_, i) => `${i}시`);
  
  return `# 시간대별 지진 발생 분포

\`\`\`mermaid
xychart-beta
    title "시간대별 지진 발생 분포"
    x-axis [${hours.map(h => `"${h}"`).join(', ')}]
    y-axis "발생 횟수" 0 --> ${Math.max(...hourlyData) + 2}
    line [${hourlyData.join(', ')}]
\`\`\`

업데이트 시간: ${moment().format('YYYY-MM-DD HH:mm:ss')}
`;
}

function generateRegionChart(earthquakes) {
  const regionData = {};
  
  earthquakes.forEach(eq => {
    const region = eq.epicenter.split(' ')[0] || '미분류';
    regionData[region] = (regionData[region] || 0) + 1;
  });
  
  // 상위 10개 지역만 표시
  const topRegions = Object.entries(regionData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const regions = topRegions.map(([region]) => `"${region}"`).join(', ');
  const counts = topRegions.map(([, count]) => count).join(', ');
  
  return `# 지역별 지진 발생 횟수 (상위 10개)

\`\`\`mermaid
xychart-beta
    title "지역별 지진 발생 횟수"
    x-axis [${regions}]
    y-axis "발생 횟수" 0 --> ${Math.max(...topRegions.map(([, count]) => count)) + 2}
    bar [${counts}]
\`\`\`

업데이트 시간: ${moment().format('YYYY-MM-DD HH:mm:ss')}
`;
}

function generateDepthChart(earthquakes) {
  const depthRanges = {
    '0-10km': 0,
    '11-30km': 0,
    '31-70km': 0,
    '71-150km': 0,
    '151-300km': 0,
    '300km+': 0
  };
  
  earthquakes.forEach(eq => {
    const depth = parseInt(eq.depth) || 0;
    if (depth <= 10) depthRanges['0-10km']++;
    else if (depth <= 30) depthRanges['11-30km']++;
    else if (depth <= 70) depthRanges['31-70km']++;
    else if (depth <= 150) depthRanges['71-150km']++;
    else if (depth <= 300) depthRanges['151-300km']++;
    else depthRanges['300km+']++;
  });
  
  const ranges = Object.keys(depthRanges).map(r => `"${r}"`).join(', ');
  const counts = Object.values(depthRanges).join(', ');
  
  return `# 깊이별 지진 분포

\`\`\`mermaid
xychart-beta
    title "깊이별 지진 분포"
    x-axis [${ranges}]
    y-axis "발생 횟수" 0 --> ${Math.max(...Object.values(depthRanges)) + 2}
    bar [${counts}]
\`\`\`

업데이트 시간: ${moment().format('YYYY-MM-DD HH:mm:ss')}
`;
}

// 직접 실행 시
if (require.main === module) {
  generateMermaidCharts();
}

module.exports = {
  generateMermaidCharts
};