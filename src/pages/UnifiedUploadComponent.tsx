// UnifiedUploadComponent.tsx
//
// U1 통합 업로드 — 런처 화면(`/upload`).
//
// 설계 결정: 기존 쇼츠/롱 업로드 흐름은 사전 메타데이터(쇼츠: 개수/테마/길이,
// 롱: 발표자 수/이름)가 서로 달라 단일 업로드로 통합하지 않는다. 대신 이 화면은
// 사용자가 목적을 먼저 고르도록 안내하는 "런처"이며, 각 목적 카드는 기존 라우트로
// 이동한다(추가형 — 기존 라우트/컴포넌트는 그대로 유지).

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
} from '@cloudscape-design/components';

/** 단일 목적 카드의 정적 정의. */
interface PurposeCard {
  /** 테스트/자동화용 안정 식별자 (kebab-case). */
  testId: string;
  /** 카드 제목. */
  title: string;
  /** 카드 설명(목적 안내). */
  description: string;
  /** CTA 버튼 라벨. */
  actionLabel: string;
  /** 클릭 시 이동할 기존 라우트. */
  route: string;
}

/**
 * 3개 목적 카드 — 각 카드는 기존 흐름 라우트로 이동한다.
 * 라우트 경로는 기존 App.tsx 정의와 1:1로 일치해야 한다.
 */
const PURPOSE_CARDS: readonly PurposeCard[] = [
  {
    testId: 'goto-shorts',
    title: '쇼츠 만들기',
    description: '긴 영상에서 하이라이트를 자동으로 추출해 짧은 쇼츠를 생성합니다.',
    actionLabel: '쇼츠 만들기 시작',
    route: '/',
  },
  {
    testId: 'goto-longvideo',
    title: '화자별 편집',
    description: '긴 영상을 화자별로 분리하고 편집합니다.',
    actionLabel: '화자별 편집 시작',
    route: '/longvideo',
  },
  {
    testId: 'goto-youtube',
    title: 'YouTube 업로드',
    description: '완성된 영상을 YouTube에 게시합니다.',
    actionLabel: 'YouTube 업로드 열기',
    route: '/youtube/uploads',
  },
];

/**
 * `/upload` 런처 화면. 목적 카드를 선택하면 해당 기존 흐름으로 라우팅한다.
 * 접근성: H1 헤더, 각 카드의 CTA는 네이티브 버튼(키보드/스크린리더 지원).
 */
const UnifiedUploadComponent: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="원하는 작업을 선택하세요. 각 작업은 전용 업로드 화면으로 이동합니다."
        >
          업로드
        </Header>
      }
    >
      <ColumnLayout columns={3} variant="default">
        {PURPOSE_CARDS.map((card) => (
          <div key={card.testId} data-testid={card.testId}>
            <Container header={<Header variant="h2">{card.title}</Header>}>
              <SpaceBetween size="m">
                <Box variant="p">{card.description}</Box>
                <Button
                  variant="primary"
                  ariaLabel={card.actionLabel}
                  onClick={() => navigate(card.route)}
                >
                  {card.actionLabel}
                </Button>
              </SpaceBetween>
            </Container>
          </div>
        ))}
      </ColumnLayout>
    </ContentLayout>
  );
};

export default UnifiedUploadComponent;
