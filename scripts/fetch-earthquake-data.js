const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const JMA_API_URL = 'https://www.jma.go.jp/bosai/quake/data/list.json';
const DATA_DIR = path.join(__dirname, '../data');

async function fetchEarthquakeData() {
  try {
    console.log('지진 데이터 수집 시작...');
    
    // JMA API에서 지진 목록 가져오기
    const response = await axios.get(JMA_API_URL);
    const earthquakeList = response.data;
    
    const earthquakes = earthquakeList.map(earthquake => ({
      eventID: earthquake.eid,
      dateTime: moment(earthquake.at).format('YYYY-MM-DD HH:mm:ss'),
      epicenter: earthquake.en_anm || earthquake.anm,
      magnitude: earthquake.mag,
      depth: earthquake.dep ? `${earthquake.dep}km` : '',
      maxIntensity: earthquake.maxi,
      reportedDateTime: earthquake.rdt,
      title: earthquake.en_ttl || earthquake.ttl,
      coordinates: earthquake.cod,
      areaCode: earthquake.acd,
      jsonFile: earthquake.json
    }));
    
    // 데이터 디렉토리 생성
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // 현재 시간으로 파일명 생성
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const filename = `earthquakes_${timestamp}.json`;
    const filepath = path.join(DATA_DIR, filename);
    
    // 데이터 저장
    const data = {
      fetchedAt: moment().toISOString(),
      count: earthquakes.length,
      earthquakes
    };
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    
    // 최신 데이터 파일로도 저장
    const latestFilepath = path.join(DATA_DIR, 'latest.json');
    fs.writeFileSync(latestFilepath, JSON.stringify(data, null, 2));
    
    console.log(`${earthquakes.length}개의 지진 데이터를 수집했습니다.`);
    console.log(`파일 저장: ${filepath}`);
    
    return data;
    
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

module.exports = {
  fetchEarthquakeData,
  fetchDetailData
};