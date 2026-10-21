// 문서 글자에 고를 수 있는 무료 글꼴. 화면(에디터 툴바·글꼴 불러오기)과 서버(내려받기 HTML)가 같이 쓴다.
// 문서에는 글꼴 id 만 저장되니 id 는 바꾸지 말 것. 주소는 모두 실제로 열리는지 확인한 것.
//   google: 구글 폰트 family 값 (css2 주소에 그대로 들어감)
//   css:    글꼴을 정의하는 CSS 파일 주소
//   faces:  [굵기, 파일 주소] — @font-face 를 직접 만든다

const N = 'https://cdn.jsdelivr.net/gh/projectnoonnu';
const NAVER = 'https://hangeul.pstatic.net/hangeul_static/css';

export const FONT_GROUPS = ['고딕', '명조', '둥근·귀여운', '손글씨', '제목·강조', '픽셀·코딩'];

export const FONTS = [
  // 고딕
  { id: 'noto-sans', name: '본고딕 (Noto Sans KR)', group: '고딕', family: 'Noto Sans KR', google: 'Noto+Sans+KR:wght@400;700' },
  { id: 'suit', name: 'SUIT', group: '고딕', family: 'SUIT', faces: [['100 900', 'https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.woff2']] },
  { id: 'suite', name: 'SUITE', group: '고딕', family: 'SUITE', faces: [['300 900', 'https://cdn.jsdelivr.net/gh/sunn-us/SUITE/fonts/variable/woff2/SUITE-Variable.woff2']] },
  { id: 'wanted-sans', name: '원티드 산스', group: '고딕', family: 'Wanted Sans Variable', css: 'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css' },
  { id: 'spoqa', name: '스포카 한 산스 Neo', group: '고딕', family: 'Spoqa Han Sans Neo', css: 'https://spoqa.github.io/spoqa-han-sans/css/SpoqaHanSansNeo.css' },
  { id: 'nanum-gothic', name: '나눔고딕', group: '고딕', family: 'Nanum Gothic', google: 'Nanum+Gothic:wght@400;700' },
  { id: 'nanum-barun-gothic', name: '나눔바른고딕', group: '고딕', family: 'NanumBarunGothic', css: `${NAVER}/nanum-barun-gothic.css` },
  { id: 'nanum-square', name: '나눔스퀘어', group: '고딕', family: 'NanumSquare', css: `${NAVER}/nanum-square.css` },
  { id: 'nanum-square-neo', name: '나눔스퀘어 네오', group: '고딕', family: 'NanumSquareNeo', faces: [['100 900', `${N}/noonfonts_11-01@1.0/NanumSquareNeo-Variable.woff2`]] },
  { id: 'gothic-a1', name: 'Gothic A1', group: '고딕', family: 'Gothic A1', google: 'Gothic+A1:wght@400;700' },
  { id: 'ibm-plex', name: 'IBM Plex Sans KR', group: '고딕', family: 'IBM Plex Sans KR', google: 'IBM+Plex+Sans+KR:wght@400;700' },
  { id: 'line-seed', name: 'LINE Seed', group: '고딕', family: 'LINESeedKR', faces: [['400', `${N}/noonfonts_11-01@1.0/LINESeedKR-Rg.woff2`], ['700', `${N}/noonfonts_11-01@1.0/LINESeedKR-Bd.woff2`]] },
  { id: 'nexon-lv1', name: '넥슨 Lv.1 고딕', group: '고딕', family: 'NEXONLv1Gothic', faces: [['400', `${N}/noonfonts_20-04@2.1/NEXON%20Lv1%20Gothic%20OTF.woff`], ['700', `${N}/noonfonts_20-04@2.1/NEXON%20Lv1%20Gothic%20OTF%20Bold.woff`]] },
  { id: 'gmarket', name: 'G마켓 산스', group: '고딕', family: 'GmarketSans', faces: [['400', `${N}/noonfonts_2001@1.1/GmarketSansMedium.woff`], ['700', `${N}/noonfonts_2001@1.1/GmarketSansBold.woff`]] },
  { id: 'score-dream', name: '에스코어 드림', group: '고딕', family: 'SCoreDream', faces: [['400', `${N}/noonfonts_six@1.2/S-CoreDream-4Regular.woff`], ['700', `${N}/noonfonts_six@1.2/S-CoreDream-6Bold.woff`]] },
  { id: 'paperlogy', name: '페이퍼로지', group: '고딕', family: 'Paperlogy', faces: [['400', `${N}/2408-3@1.0/Paperlogy-4Regular.woff2`], ['700', `${N}/2408-3@1.0/Paperlogy-7Bold.woff2`]] },
  { id: 'orbit', name: 'Orbit', group: '고딕', family: 'Orbit', google: 'Orbit' },

  // 명조
  { id: 'noto-serif', name: '본명조 (Noto Serif KR)', group: '명조', family: 'Noto Serif KR', google: 'Noto+Serif+KR:wght@400;700' },
  { id: 'nanum-myeongjo', name: '나눔명조', group: '명조', family: 'Nanum Myeongjo', google: 'Nanum+Myeongjo:wght@400;700' },
  { id: 'maru-buri', name: '마루 부리', group: '명조', family: 'MaruBuri', css: `${NAVER}/maru-buri.css` },
  { id: 'gowun-batang', name: '고운바탕', group: '명조', family: 'Gowun Batang', google: 'Gowun+Batang:wght@400;700' },
  { id: 'hahmlet', name: '함렛', group: '명조', family: 'Hahmlet', google: 'Hahmlet:wght@400;700' },
  { id: 'ridi-batang', name: '리디바탕', group: '명조', family: 'RIDIBatang', faces: [['400', `${N}/noonfonts_twelve@1.0/RIDIBatang.woff`]] },
  { id: 'chosun-myeongjo', name: '조선일보명조', group: '명조', family: 'ChosunilboMyungjo', faces: [['400', `${N}/noonfonts_one@1.0/Chosunilbo_myungjo.woff`]] },
  { id: 'song-myung', name: '송명', group: '명조', family: 'Song Myung', google: 'Song+Myung' },
  { id: 'diphylleia', name: 'Diphylleia', group: '명조', family: 'Diphylleia', google: 'Diphylleia' },

  // 둥근·귀여운
  { id: 'gowun-dodum', name: '고운돋움', group: '둥근·귀여운', family: 'Gowun Dodum', google: 'Gowun+Dodum' },
  { id: 'nanum-square-round', name: '나눔스퀘어 라운드', group: '둥근·귀여운', family: 'NanumSquareRound', css: `${NAVER}/nanum-square-round.css` },
  { id: 'maplestory', name: '메이플스토리', group: '둥근·귀여운', family: 'Maplestory', faces: [['300', `${N}/noonfonts_20-04@2.1/MaplestoryOTFLight.woff`], ['700', `${N}/noonfonts_20-04@2.1/MaplestoryOTFBold.woff`]] },
  { id: 'cafe24-ssurround', name: '카페24 써라운드', group: '둥근·귀여운', family: 'Cafe24Ssurround', faces: [['400', `${N}/noonfonts_2105_2@1.0/Cafe24Ssurround.woff`]] },
  { id: 'tmoney-round', name: '티머니 둥근바람', group: '둥근·귀여운', family: 'TmoneyRoundWind', faces: [['400', `${N}/noonfonts_20-07@1.0/TmoneyRoundWindRegular.woff`], ['800', `${N}/noonfonts_20-07@1.0/TmoneyRoundWindExtraBold.woff`]] },
  { id: 'binggrae', name: '빙그레체', group: '둥근·귀여운', family: 'Binggrae', faces: [['400', `${N}/noonfonts_one@1.0/Binggrae.woff`]] },
  { id: 'jua', name: '주아', group: '둥근·귀여운', family: 'Jua', google: 'Jua' },
  { id: 'sunflower', name: '해바라기', group: '둥근·귀여운', family: 'Sunflower', google: 'Sunflower:wght@300;500;700' },
  { id: 'dongle', name: '동글', group: '둥근·귀여운', family: 'Dongle', google: 'Dongle:wght@400;700' },
  { id: 'cute-font', name: '귀여운 글꼴', group: '둥근·귀여운', family: 'Cute Font', google: 'Cute+Font' },
  { id: 'poor-story', name: '서툰 이야기', group: '둥근·귀여운', family: 'Poor Story', google: 'Poor+Story' },
  { id: 'stylish', name: 'Stylish', group: '둥근·귀여운', family: 'Stylish', google: 'Stylish' },
  { id: 'omyu-pretty', name: '오뮤 다예쁨체', group: '둥근·귀여운', family: 'omyu_pretty', faces: [['400', `${N}/noonfonts_2304-01@1.0/omyu_pretty.woff2`]] },

  // 손글씨
  { id: 'nanum-pen', name: '나눔손글씨 펜', group: '손글씨', family: 'Nanum Pen Script', google: 'Nanum+Pen+Script' },
  { id: 'nanum-brush', name: '나눔손글씨 붓', group: '손글씨', family: 'Nanum Brush Script', google: 'Nanum+Brush+Script' },
  { id: 'nanum-barun-pen', name: '나눔바른펜', group: '손글씨', family: 'NanumBarunpen', css: `${NAVER}/nanum-barun-pen.css` },
  { id: 'kyobo-hand', name: '교보 손글씨', group: '손글씨', family: 'KyoboHand', faces: [['400', `${N}/noonfonts_20-04@2.1/KyoboHand.woff`]] },
  { id: 'ownglyph-meetme', name: '온글잎 만나서반가워', group: '손글씨', family: 'Ownglyph_meetme', faces: [['400', `${N}/noonfonts_2402_1@1.0/Ownglyph_meetme-Rg.woff2`]] },
  { id: 'gaegu', name: '개구', group: '손글씨', family: 'Gaegu', google: 'Gaegu:wght@400;700' },
  { id: 'hi-melody', name: '하이멜로디', group: '손글씨', family: 'Hi Melody', google: 'Hi+Melody' },
  { id: 'gamja-flower', name: '감자꽃', group: '손글씨', family: 'Gamja Flower', google: 'Gamja+Flower' },
  { id: 'single-day', name: '싱글데이', group: '손글씨', family: 'Single Day', google: 'Single+Day' },
  { id: 'yeon-sung', name: '연성', group: '손글씨', family: 'Yeon Sung', google: 'Yeon+Sung' },
  { id: 'dokdo', name: '독도', group: '손글씨', family: 'Dokdo', google: 'Dokdo' },
  { id: 'east-sea-dokdo', name: '동해 독도', group: '손글씨', family: 'East Sea Dokdo', google: 'East+Sea+Dokdo' },
  { id: 'kirang-haerang', name: '기랑해랑', group: '손글씨', family: 'Kirang Haerang', google: 'Kirang+Haerang' },
  { id: 'black-white-picture', name: '흑백사진', group: '손글씨', family: 'Black And White Picture', google: 'Black+And+White+Picture' },

  // 제목·강조
  { id: 'do-hyeon', name: '도현', group: '제목·강조', family: 'Do Hyeon', google: 'Do+Hyeon' },
  { id: 'black-han-sans', name: '검은고딕', group: '제목·강조', family: 'Black Han Sans', google: 'Black+Han+Sans' },
  { id: 'hanna-pro', name: '배민 한나 Pro', group: '제목·강조', family: 'BMHANNAPro', faces: [['400', `${N}/noonfonts_seven@1.0/BMHANNAPro.woff`]] },
  { id: 'euljiro', name: '배민 을지로체', group: '제목·강조', family: 'BMEULJIRO', faces: [['400', `${N}/noonfonts_twelve@1.0/BMEULJIRO.woff`]] },
  { id: 'jalnan', name: '여기어때 잘난체', group: '제목·강조', family: 'yg-jalnan', faces: [['400', `${N}/noonfonts_four@1.2/JalnanOTF00.woff`]] },
  { id: 'cafe24-ohsquare', name: '카페24 오스퀘어', group: '제목·강조', family: 'Cafe24Ohsquare', faces: [['400', `${N}/noonfonts_2001@1.1/Cafe24Ohsquare.woff`]] },
  { id: 'sb-aggro', name: '어그로체', group: '제목·강조', family: 'SBAggroB', faces: [['400', `${N}/noonfonts_2108@1.1/SBAggroB.woff`]] },
  { id: 'one-mobile-title', name: 'ONE 모바일 제목', group: '제목·강조', family: 'ONE-Mobile-Title', faces: [['400', `${N}/noonfonts_2105_2@1.0/ONE-Mobile-Title.woff`]] },
  { id: 'gong-gothic', name: '공고딕', group: '제목·강조', family: 'GongGothicMedium', faces: [['400', `${N}/noonfonts_20-10@1.0/GongGothicMedium.woff`]] },
  { id: 'retro-sans', name: '레트로산스', group: '제목·강조', family: 'establishRetrosansOTF', faces: [['400', `${N}/noonfonts_2112@1.0/establishRetrosansOTF.woff`]] },
  { id: 'mapo-golden-pier', name: '마포 금빛나루', group: '제목·강조', family: 'MapoGoldenPier', faces: [['400', `${N}/noonfonts_2001@1.1/MapoGoldenPierA.woff`]] },
  { id: 'tt-together', name: 'TT 투게더', group: '제목·강조', family: 'TTTogether', faces: [['400', `${N}/noonfonts_2001@1.1/TTTogetherA.woff`]] },
  { id: 'gugi', name: '구기', group: '제목·강조', family: 'Gugi', google: 'Gugi' },
  { id: 'bagel-fat-one', name: '베이글', group: '제목·강조', family: 'Bagel Fat One', google: 'Bagel+Fat+One' },
  { id: 'gasoek-one', name: '가석', group: '제목·강조', family: 'Gasoek One', google: 'Gasoek+One' },
  { id: 'moirai-one', name: '모이라이', group: '제목·강조', family: 'Moirai One', google: 'Moirai+One' },
  { id: 'grandiflora-one', name: '그랜디플로라', group: '제목·강조', family: 'Grandiflora One', google: 'Grandiflora+One' },

  // 픽셀·코딩
  { id: 'dunggeunmo', name: '둥근모꼴', group: '픽셀·코딩', family: 'DungGeunMo', faces: [['400', `${N}/noonfonts_six@1.2/DungGeunMo.woff`]] },
  { id: 'neodgm', name: 'Neo둥근모', group: '픽셀·코딩', family: 'NeoDunggeunmo', css: 'https://cdn.jsdelivr.net/gh/neodgm/neodgm-webfont@1.600/neodgm/style.css' },
  { id: 'galmuri11', name: '갈무리11', group: '픽셀·코딩', family: 'Galmuri11', css: 'https://cdn.jsdelivr.net/npm/galmuri@2.39.3/dist/galmuri.css' },
  { id: 'galmuri9', name: '갈무리9', group: '픽셀·코딩', family: 'Galmuri9', css: 'https://cdn.jsdelivr.net/npm/galmuri@2.39.3/dist/galmuri.css' },
  { id: 'd2coding', name: 'D2Coding', group: '픽셀·코딩', family: 'D2Coding', faces: [['400', `${N}/noonfonts_three@1.0/D2Coding.woff`]] },
  { id: 'nanum-gothic-coding', name: '나눔고딕코딩', group: '픽셀·코딩', family: 'Nanum Gothic Coding', google: 'Nanum+Gothic+Coding:wght@400;700' },
];

export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));

// 글꼴이 없을 때 대신 쓸 글꼴까지 붙인 CSS font-family 값
export const fontStack = (id) => {
  const f = FONT_BY_ID[id];
  if (!f) return '';
  const fallback = f.group === '명조' ? 'serif' : f.group === '픽셀·코딩' ? 'monospace' : 'sans-serif';
  return `'${f.family}', ${fallback}`;
};

// 글꼴을 쓰려면 문서 <head> 에 넣어야 하는 것: { href } (CSS 파일) 또는 { css } (@font-face 글)
export function fontSource(id) {
  const f = FONT_BY_ID[id];
  if (!f) return null;
  if (f.google) return { href: `https://fonts.googleapis.com/css2?family=${f.google}&display=swap` };
  if (f.css) return { href: f.css };
  const css = f.faces
    .map(([weight, url]) => {
      const format = url.endsWith('.woff2') ? 'woff2' : 'woff';
      return `@font-face { font-family: '${f.family}'; font-weight: ${weight}; font-display: swap; src: url('${url}') format('${format}'); }`;
    })
    .join('\n');
  return { css };
}

// 내려받기 HTML 용: 쓰인 글꼴들의 <link>·<style>
export function fontHead(ids) {
  const hrefs = new Set();
  const css = [];
  for (const id of ids) {
    const s = fontSource(id);
    if (s?.href) hrefs.add(s.href);
    else if (s?.css) css.push(s.css);
  }
  return [...[...hrefs].map((h) => `<link rel="stylesheet" href="${h}">`), css.length ? `<style>${css.join('\n')}</style>` : ''].filter(Boolean).join('\n');
}
