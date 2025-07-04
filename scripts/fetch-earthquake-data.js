const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const BASE_URL = 'https://www.data.jma.go.jp/multi/quake/index.html?lang=kr';
const DETAIL_URL = 'https://www.data.jma.go.jp/multi/quake/quake_detail.html';
const DATA_DIR = path.join(__dirname, '../data');

async function fetchEarthquakeData() {
  try {
    console.log('지진 데이터 수집 시작...');
    
    // 메인 페이지에서 지진 목록 가져오기
    const response = await axios.get(BASE_URL);
    const $ = cheerio.load(response.data);
    
    const earthquakes = [];
    
    // 지진 목록 테이블 파싱
    $('table.eventtable tr').each((index, element) => {
      if (index === 0) return; // 헤더 건너뛰기
      
      const cells = $(element).find('td');
      if (cells.length >= 6) {
        const dateTime = $(cells[0]).text().trim();
        const epicenter = $(cells[1]).text().trim();
        const magnitude = $(cells[2]).text().trim();
        const depth = $(cells[3]).text().trim();
        const maxIntensity = $(cells[4]).text().trim();
        
        // 상세 페이지 링크 추출
        const detailLink = $(cells[5]).find('a').attr('href');
        let eventID = '';
        if (detailLink) {
          const match = detailLink.match(/eventID=([^&]+)/);
          if (match) eventID = match[1];
        }
        
        earthquakes.push({
          eventID,
          dateTime,
          epicenter,
          magnitude: parseFloat(magnitude) || 0,
          depth: depth.replace('km', '').trim(),
          maxIntensity,
          detailLink: detailLink ? `https://www.data.jma.go.jp${detailLink}` : ''
        });
      }
    });
    
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
async function fetchDetailData(eventID) {
  try {
    const detailUrl = `${DETAIL_URL}?eventID=${eventID}&lang=kr`;
    const response = await axios.get(detailUrl);
    const $ = cheerio.load(response.data);
    
    // 상세 정보 파싱 (필요에 따라 구현)
    const detailInfo = {
      eventID,
      // 추가 상세 정보 파싱
    };
    
    return detailInfo;
  } catch (error) {
    console.error(`상세 정보 수집 실패 (EventID: ${eventID}):`, error);
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