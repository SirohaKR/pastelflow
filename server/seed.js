// 처음 실행할 때 만들어지는 안내 페이지 (BlockNote 블록 형식)
export const welcomeContent = [
  { type: 'heading', props: { level: 2 }, content: '여기는 나만의 파스텔 노트예요' },
  { type: 'paragraph', content: '왼쪽 사이드바에서 페이지를 만들고, 페이지 안에 하위 페이지를 계속 넣을 수 있어요.' },
  { type: 'heading', props: { level: 3 }, content: '이렇게 써 보세요' },
  { type: 'bulletListItem', content: '빈 줄에서 / 를 누르면 제목, 목록, 체크박스, 표, 이미지 같은 블록을 넣을 수 있어요.' },
  { type: 'bulletListItem', content: '글자를 드래그하면 굵게, 색상, 링크 같은 서식 메뉴가 나와요.' },
  { type: 'bulletListItem', content: '블록 왼쪽의 ⠿ 손잡이를 끌면 블록 순서를 바꿀 수 있어요.' },
  { type: 'bulletListItem', content: 'Ctrl + K 로 페이지를 빠르게 찾을 수 있어요.' },
  { type: 'bulletListItem', content: '오른쪽 위 🎨 버튼에서 강조색과 라이트/다크 모드를 바꿀 수 있어요.' },
  { type: 'heading', props: { level: 3 }, content: '오늘 할 일' },
  { type: 'checkListItem', props: { checked: true }, content: '파스텔플로우 설치하기' },
  { type: 'checkListItem', props: { checked: false }, content: '첫 페이지 만들어 보기' },
  { type: 'checkListItem', props: { checked: false }, content: '좋아하는 강조색 고르기' },
  { type: 'paragraph', content: '' },
];
