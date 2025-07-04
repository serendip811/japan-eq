const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const JMA_API_URL = 'https://www.jma.go.jp/bosai/quake/data/list.json';
const EPI_DICT_URL = 'https://www.data.jma.go.jp/multi/data/dictionary/epi.json';
const DATA_DIR = path.join(__dirname, '../data');
const MONTHLY_DIR = path.join(DATA_DIR, 'monthly');
const EPI_DICT_PATH = path.join(DATA_DIR, 'epi-dictionary.json');

async function fetchEarthquakeData() {
  try {
    console.log('지진 데이터 수집 시작...');
    
    // 진앙지 사전 업데이트
    await fetchEpicenters();
    
    // JMA API에서 지진 목록 가져오기
    const response = await axios.get(JMA_API_URL);
    const earthquakeList = response.data;
    
    const earthquakes = earthquakeList.map(earthquake => {
      // coordinates에서 깊이 정보 추출 (예: "+29.4+129.3-20000/" -> 20)
      let depthFromCoords = null;
      if (earthquake.cod && earthquake.cod.includes('-')) {
        const coordMatch = earthquake.cod.match(/([+-]\d+\.\d+)([+-]\d+\.\d+)([+-]\d+)/);
        if (coordMatch && coordMatch[3]) {
          depthFromCoords = Math.abs(parseInt(coordMatch[3])) / 1000; // -20000 -> 20
        }
      }
      
      return {
        eventID: earthquake.eid,
        dateTime: moment(earthquake.at).format('YYYY-MM-DD HH:mm:ss'),
        epicenter: earthquake.en_anm || earthquake.anm,
        epicenterKr: getKoreanEpicenter(earthquake.en_anm || earthquake.anm),
        magnitude: earthquake.mag,
        depth: earthquake.dep ? parseFloat(earthquake.dep) : depthFromCoords,
        maxIntensity: earthquake.maxi,
        reportedDateTime: earthquake.rdt,
        title: earthquake.en_ttl || earthquake.ttl,
        coordinates: earthquake.cod,
        areaCode: earthquake.acd,
        jsonFile: earthquake.json
      };
    });
    
    // 데이터 디렉토리 생성
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(MONTHLY_DIR)) {
      fs.mkdirSync(MONTHLY_DIR, { recursive: true });
    }
    
    // 월별 데이터 저장
    await saveMonthlyData(earthquakes);
    
    // 전체 데이터 병합 및 저장
    const allData = await mergeAllMonthlyData();
    
    // 최신 데이터 파일로 저장
    const latestFilepath = path.join(DATA_DIR, 'latest.json');
    fs.writeFileSync(latestFilepath, JSON.stringify(allData, null, 2));
    
    // 백업용 타임스탬프 파일도 저장
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const filename = `earthquakes_${timestamp}.json`;
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(allData, null, 2));
    
    console.log(`${earthquakes.length}개의 새로운 지진 데이터를 수집했습니다.`);
    console.log(`전체 데이터 수: ${allData.count}개`);
    console.log(`파일 저장: ${filepath}`);
    
    return allData;
    
  } catch (error) {
    console.error('지진 데이터 수집 중 오류 발생:', error);
    throw error;
  }
}

// 상세 정보 가져오기 (선택적)
async function fetchDetailData(jsonFile) {
  try {
    const detailUrl = `https://www.jma.go.jp/bosai/quake/data/${jsonFile}`;
    const response = await axios.get(detailUrl);
    
    return response.data;
  } catch (error) {
    console.error(`상세 정보 수집 실패 (JSON File: ${jsonFile}):`, error);
    return null;
  }
}

// 직접 실행 시
if (require.main === module) {
  fetchEarthquakeData()
    .then(data => {
      console.log('데이터 수집 완료!');
    })
    .catch(error => {
      console.error('실행 실패:', error);
      process.exit(1);
    });
}

// 월별 데이터 저장 함수
async function saveMonthlyData(earthquakes) {
  const monthlyGroups = {};
  
  // 월별로 그룹화
  earthquakes.forEach(eq => {
    const month = moment(eq.dateTime).format('YYYY-MM');
    if (!monthlyGroups[month]) {
      monthlyGroups[month] = [];
    }
    monthlyGroups[month].push(eq);
  });
  
  // 각 월별 데이터 저장
  for (const [month, data] of Object.entries(monthlyGroups)) {
    const monthlyFilepath = path.join(MONTHLY_DIR, `${month}.json`);
    
    let existingData = [];
    if (fs.existsSync(monthlyFilepath)) {
      try {
        const existingFile = fs.readFileSync(monthlyFilepath, 'utf8');
        const existingJson = JSON.parse(existingFile);
        existingData = existingJson.earthquakes || [];
      } catch (error) {
        console.warn(`기존 월별 데이터 로드 실패 (${month}):`, error);
      }
    }
    
    // 중복 제거 (eventID 기준)
    const existingIds = new Set(existingData.map(eq => eq.eventID));
    const newData = data.filter(eq => !existingIds.has(eq.eventID));
    
    if (newData.length > 0) {
      const mergedData = [...existingData, ...newData];
      const monthlyData = {
        month,
        fetchedAt: moment().toISOString(),
        count: mergedData.length,
        earthquakes: mergedData.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime))
      };
      
      fs.writeFileSync(monthlyFilepath, JSON.stringify(monthlyData, null, 2));
      console.log(`${month} 월별 데이터 저장: ${newData.length}개 새로운 데이터, 총 ${mergedData.length}개`);
    } else {
      console.log(`${month} 월별 데이터: 새로운 데이터 없음`);
    }
  }
}

// 전체 월별 데이터 병합 함수
async function mergeAllMonthlyData() {
  const allEarthquakes = [];
  
  if (!fs.existsSync(MONTHLY_DIR)) {
    return {
      fetchedAt: moment().toISOString(),
      count: 0,
      earthquakes: []
    };
  }
  
  const monthlyFiles = fs.readdirSync(MONTHLY_DIR)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a)); // 최신 월부터 정렬
  
  for (const file of monthlyFiles) {
    try {
      const filepath = path.join(MONTHLY_DIR, file);
      const fileContent = fs.readFileSync(filepath, 'utf8');
      const monthlyData = JSON.parse(fileContent);
      
      if (monthlyData.earthquakes) {
        allEarthquakes.push(...monthlyData.earthquakes);
      }
    } catch (error) {
      console.warn(`월별 데이터 로드 실패 (${file}):`, error);
    }
  }
  
  // 중복 제거 및 정렬
  const uniqueEarthquakes = [];
  const seenIds = new Set();
  
  for (const eq of allEarthquakes) {
    if (!seenIds.has(eq.eventID)) {
      seenIds.add(eq.eventID);
      uniqueEarthquakes.push(eq);
    }
  }
  
  uniqueEarthquakes.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  
  return {
    fetchedAt: moment().toISOString(),
    count: uniqueEarthquakes.length,
    earthquakes: uniqueEarthquakes,
    monthlyFiles: monthlyFiles.length
  };
}

// 진앙지 사전 가져오기 함수
async function fetchEpicenters() {
  try {
    // 이미 최신 사전이 있는지 확인 (1일 캐시)
    if (fs.existsSync(EPI_DICT_PATH)) {
      const stats = fs.statSync(EPI_DICT_PATH);
      const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      if (ageInHours < 24) {
        console.log('진앙지 사전이 최신입니다.');
        return;
      }
    }
    
    console.log('진앙지 사전 업데이트 중...');
    const response = await axios.get(EPI_DICT_URL);
    fs.writeFileSync(EPI_DICT_PATH, JSON.stringify(response.data, null, 2));
    console.log('진앙지 사전 업데이트 완료');
  } catch (error) {
    console.error('진앙지 사전 업데이트 실패:', error);
  }
}

// 영어 진앙지명을 한국어로 변환하는 함수
function getKoreanEpicenter(englishName) {
  try {
    if (!fs.existsSync(EPI_DICT_PATH)) {
      return englishName;
    }
    
    const epiDict = JSON.parse(fs.readFileSync(EPI_DICT_PATH, 'utf8'));
    
    // 정확히 일치하는 항목 찾기
    for (const [code, location] of Object.entries(epiDict)) {
      if (location.english === englishName) {
        return location.korean || englishName;
      }
    }
    
    // 부분 일치 검색 (키워드 포함)
    for (const [code, location] of Object.entries(epiDict)) {
      if (location.english && englishName.includes(location.english)) {
        return location.korean || englishName;
      }
    }
    
    return englishName;
  } catch (error) {
    console.error('진앙지 변환 실패:', error);
    return englishName;
  }
}

module.exports = {
  fetchEarthquakeData,
  fetchDetailData,
  saveMonthlyData,
  mergeAllMonthlyData,
  fetchEpicenters,
  getKoreanEpicenter
};