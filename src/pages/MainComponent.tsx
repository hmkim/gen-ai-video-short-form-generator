import React, {} from 'react';
import { Outlet } from 'react-router-dom'
import {
  TopNavigation,
  AppLayout,
  ContentLayout,
  SideNavigation,
} from '@cloudscape-design/components';

import { AuthUser } from 'aws-amplify/auth';

interface MainComponentProps {
  signOut: (() => void) | undefined;
  user: AuthUser | undefined;
}

const MainComponent: React.FC<MainComponentProps> = (props) => {

  const clickSignOut = () => {
    if (props.signOut) {
      props.signOut();
    }
  }

  return (
    <>
      <TopNavigation
        identity={{
          href: "/",
          title: "Video Creator",
        }}
        utilities={[
          {
            type: "menu-dropdown",
            text: props.user?.signInDetails?.loginId,
            description: props.user?.signInDetails?.loginId,
            iconName: "user-profile",
            items: [
              { id: "signOut", text: "Sign out" }
            ],
            onItemClick: clickSignOut
          }
        ]}
      />
      <AppLayout
        toolsHide={true}
        navigation={
          <SideNavigation
            header={{
              href: '/',
              text: 'Video Creator',
            }}
            items={[
              // upload-library (US-7): 라벨=동작 정합 — 업로드는 /upload에서만,
              // 쇼츠만들기/화자별 편집은 업로드된 영상 선택으로 시작한다.
              { type: 'link', text: `영상 업로드`, href: `/upload` },
              { type: 'divider' },
              { type: 'section-group', title: '쇼츠', items: [
                { type: 'link', text: `쇼츠만들기`, href: `/` },
                { type: 'link', text: `Short-form History`, href: `/history` },
                { type: 'link', text: `Short-form Gallery`, href: `/gallery` },
              ]},
              { type: 'section-group', title: '화자별 영상 편집 · YouTube 자동 업로드', items: [
                { type: 'link', text: `화자별 편집`, href: `/longvideo` },
                { type: 'link', text: `Long Video History`, href: `/longvideo/history` },
                { type: 'link', text: `YouTube Uploads`, href: `/youtube/uploads` },
                { type: 'link', text: `YouTube Settings`, href: `/youtube/connect` },
              ]},
              { type: 'section-group', title: '관리자 설정', items: [
                { type: 'link', text: `모델 관리`, href: `/admin/models` },
              ]},
            ]}
          />
        }
        content={
          <ContentLayout>
            <Outlet />
          </ContentLayout>
        }
      />
    </>
  );
};

export default MainComponent;
