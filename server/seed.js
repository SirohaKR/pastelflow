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

// 구역 기본 틀 페이지 (전체 공용 / 새 스페이스)
export function zoneSeed(kind) {
  const who = kind === 'space' ? '스페이스 관리자' : '관리자';
  return {
    notice: {
      title: '공지사항',
      icon: '📢',
      content: [
        { type: 'paragraph', content: `'공지' 카테고리는 ${who}만 고칠 수 있어요. 다른 멤버는 읽기만 할 수 있어요.` },
        { type: 'bulletListItem', content: '새 공지는 이 카테고리에 페이지를 만들어서 올려 주세요.' },
        { type: 'bulletListItem', content: `${who}는 카테고리 이름 옆 ⋯ 메뉴에서 잠금을 풀거나 다른 카테고리를 잠글 수 있어요.` },
        { type: 'paragraph', content: '' },
      ],
    },
    general: {
      title: '시작하기',
      icon: '👋',
      content: [
        { type: 'heading', props: { level: 2 }, content: kind === 'space' ? '스페이스에 오신 걸 환영해요' : '함께 쓰는 공간이에요' },
        { type: 'paragraph', content: "'일반' 카테고리는 편집 권한이 있는 멤버 누구나 페이지를 만들고 고칠 수 있어요." },
        { type: 'bulletListItem', content: '카테고리 이름 옆 + 버튼으로 그 카테고리에 페이지를 바로 만들 수 있어요.' },
        { type: 'bulletListItem', content: '페이지를 카테고리 이름 위로 끌어 놓으면 그 카테고리로 옮겨져요.' },
        { type: 'paragraph', content: '' },
      ],
    },
  };
}
