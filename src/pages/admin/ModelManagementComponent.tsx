// ModelManagementComponent.tsx
//
// U3 (F3) admin screen at `/admin/models`. Lists the ManagedModel catalog and
// drives the model lifecycle: discover (새로고침 → listFoundationModels), 테스트
// (testModelInvocation), 승인/켜기/끄기 (status transitions), 기본설정 (single
// default). Approval is gated on a successful test (UI guard mirrors the
// backend rule). Cost-incurring transitions (승인/켜기) confirm via a Modal.
//
// Accessibility: H1 '모델 관리', main landmark via ContentLayout, Table with a
// caption, per-row action buttons carry the model name in their aria-label, and
// refresh/test progress is announced through an aria-live region.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ContentLayout,
  Flashbar,
  Header,
  Modal,
  SpaceBetween,
  StatusIndicator,
  Table,
} from '@cloudscape-design/components';
import type { StatusIndicatorProps } from '@cloudscape-design/components';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';

const client = generateClient<Schema>({ authMode: 'userPool' });

type ManagedModel = Schema['ManagedModel']['type'];

interface FlashMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  content: string;
}

interface TestResultView {
  modelId: string;
  displayName: string;
  ok: boolean;
  message: string;
  costHint: string;
}

type ConfirmAction = {
  kind: 'approve' | 'enable';
  model: ManagedModel;
};

const STATUS_ORDER: Record<string, number> = {
  APPROVED: 0,
  PENDING: 1,
  HIDDEN: 2,
};

function statusIndicator(status: ManagedModel['status']): React.ReactNode {
  const map: Record<string, { type: StatusIndicatorProps.Type; label: string }> = {
    APPROVED: { type: 'success', label: '승인됨' },
    PENDING: { type: 'pending', label: '대기' },
    HIDDEN: { type: 'stopped', label: '숨김' },
  };
  const entry = status ? map[status] : undefined;
  if (!entry) {
    return <StatusIndicator type="info">알 수 없음</StatusIndicator>;
  }
  return <StatusIndicator type={entry.type}>{entry.label}</StatusIndicator>;
}

const ModelManagementComponent: React.FC = () => {
  const [models, setModels] = useState<ManagedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResultView | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [flashMessages, setFlashMessages] = useState<FlashMessage[]>([]);

  const showFlash = useCallback((type: FlashMessage['type'], content: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFlashMessages((prev) => [...prev, { id, type, content }]);
    setTimeout(
      () => setFlashMessages((prev) => prev.filter((message) => message.id !== id)),
      5000,
    );
  }, []);

  const sortModels = (items: ManagedModel[]): ManagedModel[] =>
    [...items].sort((a, b) => {
      const orderA = STATUS_ORDER[a.status ?? ''] ?? 99;
      const orderB = STATUS_ORDER[b.status ?? ''] ?? 99;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.displayName ?? '').localeCompare(b.displayName ?? '');
    });

  const loadModels = useCallback(async () => {
    try {
      const { data: items } = await client.models.ManagedModel.list();
      setModels(sortModels(items));
    } catch (error) {
      console.error('Failed to load models:', error);
      showFlash('error', '모델 목록을 불러오지 못했습니다.');
    }
  }, [showFlash]);

  useEffect(() => {
    void (async () => {
      await loadModels();
      setLoading(false);
    })();
  }, [loadModels]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLiveMessage('파운데이션 모델을 새로고침하는 중입니다…');
    try {
      const { data, errors } = await client.queries.listFoundationModels({
        refresh: true,
      });
      if (errors && errors.length > 0) {
        throw new Error(errors.map((e) => e.message).join('; '));
      }
      await loadModels();
      const count = data?.length ?? 0;
      setLastRefreshedAt(new Date().toISOString());
      setLiveMessage(`새로고침 완료: 모델 ${count}개를 확인했습니다.`);
      showFlash('success', `모델 카탈로그를 새로고침했습니다 (${count}개).`);
    } catch (error) {
      console.error('Refresh failed:', error);
      setLiveMessage('새로고침에 실패했습니다. 기존 목록을 유지합니다.');
      showFlash('error', '모델 새로고침에 실패했습니다. 기존 목록을 유지합니다.');
    } finally {
      setRefreshing(false);
    }
  }, [loadModels, showFlash]);

  const handleTest = useCallback(
    async (model: ManagedModel) => {
      setBusyId(model.id);
      setLiveMessage(`${model.displayName} 모델을 테스트하는 중입니다…`);
      try {
        const { data, errors } = await client.queries.testModelInvocation({
          modelId: model.modelId,
        });
        if (errors && errors.length > 0) {
          throw new Error(errors.map((e) => e.message).join('; '));
        }
        const result: TestResultView = {
          modelId: model.modelId,
          displayName: model.displayName,
          ok: data?.ok ?? false,
          message: data?.message ?? '알 수 없는 오류',
          costHint: data?.costHint ?? '',
        };
        setTestResult(result);
        setLiveMessage(
          result.ok
            ? `${model.displayName} 테스트 성공`
            : `${model.displayName} 테스트 실패: ${result.message}`,
        );
        await loadModels();
      } catch (error) {
        console.error('Test failed:', error);
        setTestResult({
          modelId: model.modelId,
          displayName: model.displayName,
          ok: false,
          message: '테스트 호출에 실패했습니다.',
          costHint: '',
        });
        setLiveMessage(`${model.displayName} 테스트 실패`);
      } finally {
        setBusyId(null);
      }
    },
    [loadModels],
  );

  const setStatus = useCallback(
    async (model: ManagedModel, status: NonNullable<ManagedModel['status']>) => {
      setBusyId(model.id);
      try {
        await client.models.ManagedModel.update({ id: model.id, status });
        await loadModels();
        showFlash('success', `${model.displayName} 상태를 ${status}(으)로 변경했습니다.`);
      } catch (error) {
        console.error('Status update failed:', error);
        showFlash('error', `${model.displayName} 상태 변경에 실패했습니다.`);
      } finally {
        setBusyId(null);
      }
    },
    [loadModels, showFlash],
  );

  const handleApproveClick = useCallback(
    (model: ManagedModel) => {
      // UI guard mirrors the backend rule: approve only after a successful test.
      if (model.lastTestResult !== 'success') {
        showFlash('error', '승인 전에 테스트를 성공해야 합니다.');
        return;
      }
      setConfirmAction({ kind: 'approve', model });
    },
    [showFlash],
  );

  const handleEnableClick = useCallback((model: ManagedModel) => {
    setConfirmAction({ kind: 'enable', model });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!confirmAction) {
      return;
    }
    const { model } = confirmAction;
    setConfirmAction(null);
    await setStatus(model, 'APPROVED');
  }, [confirmAction, setStatus]);

  const handleSetDefault = useCallback(
    async (model: ManagedModel) => {
      setBusyId(model.id);
      try {
        // Single-default invariant: clear any current defaults, then set target.
        const currentDefaults = models.filter(
          (item) => item.isDefault && item.id !== model.id,
        );
        await Promise.all(
          currentDefaults.map((item) =>
            client.models.ManagedModel.update({ id: item.id, isDefault: false }),
          ),
        );
        await client.models.ManagedModel.update({ id: model.id, isDefault: true });
        await loadModels();
        showFlash('success', `${model.displayName}을(를) 기본 모델로 설정했습니다.`);
      } catch (error) {
        console.error('Set default failed:', error);
        showFlash('error', '기본 모델 설정에 실패했습니다.');
      } finally {
        setBusyId(null);
      }
    },
    [models, loadModels, showFlash],
  );

  const rowActions = (item: ManagedModel): React.ReactNode => {
    const isBusy = busyId === item.id;
    const approveDisabled = item.lastTestResult !== 'success';
    return (
      <SpaceBetween size="xs" direction="horizontal">
        <Button
          data-testid={`model-test-${item.modelId}`}
          ariaLabel={`${item.displayName} 테스트`}
          loading={isBusy}
          onClick={() => handleTest(item)}
        >
          테스트
        </Button>
        {item.status === 'PENDING' && (
          <Button
            data-testid={`model-approve-${item.modelId}`}
            ariaLabel={`${item.displayName} 승인`}
            variant="primary"
            disabled={approveDisabled}
            loading={isBusy}
            onClick={() => handleApproveClick(item)}
          >
            승인
          </Button>
        )}
        {item.status === 'HIDDEN' && (
          <Button
            data-testid={`model-enable-${item.modelId}`}
            ariaLabel={`${item.displayName} 켜기`}
            loading={isBusy}
            onClick={() => handleEnableClick(item)}
          >
            켜기
          </Button>
        )}
        {item.status === 'APPROVED' && (
          <Button
            data-testid={`model-hide-${item.modelId}`}
            ariaLabel={`${item.displayName} 끄기`}
            loading={isBusy}
            onClick={() => setStatus(item, 'HIDDEN')}
          >
            끄기
          </Button>
        )}
        {item.status === 'APPROVED' && !item.isDefault && (
          <Button
            data-testid={`model-set-default-${item.modelId}`}
            ariaLabel={`${item.displayName} 기본설정`}
            onClick={() => handleSetDefault(item)}
          >
            기본설정
          </Button>
        )}
      </SpaceBetween>
    );
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="파운데이션 모델을 탐색·테스트·승인하고 기본 모델을 지정합니다."
        >
          모델 관리
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Flashbar
          items={flashMessages.map((message) => ({
            id: message.id,
            type: message.type,
            content: message.content,
            dismissible: true,
            onDismiss: () =>
              setFlashMessages((prev) => prev.filter((m) => m.id !== message.id)),
          }))}
        />

        {/* aria-live status region for refresh/test progress (WCAG 4.1.3). */}
        <div aria-live="polite" data-testid="model-management-live-region">
          {liveMessage && (
            <Box color="text-status-info" fontSize="body-s">
              {liveMessage}
            </Box>
          )}
        </div>

        {testResult && (
          <Alert
            data-testid="model-test-result"
            type={testResult.ok ? 'success' : 'error'}
            dismissible
            onDismiss={() => setTestResult(null)}
            header={`${testResult.displayName} 테스트 결과`}
          >
            <SpaceBetween size="xs">
              <Box>{testResult.message}</Box>
              {testResult.costHint && (
                <Box fontSize="body-s" color="text-body-secondary">
                  예상 비용: {testResult.costHint}
                </Box>
              )}
              {testResult.ok && (
                <Box fontSize="body-s">테스트에 성공했습니다. 이제 모델을 승인할 수 있습니다.</Box>
              )}
            </SpaceBetween>
          </Alert>
        )}

        <Table
          data-testid="model-management-table"
          variant="container"
          loading={loading}
          loadingText="모델을 불러오는 중…"
          items={models}
          ariaLabels={{
            tableLabel: '관리 대상 모델 목록',
          }}
          header={
            <Header
              variant="h2"
              counter={`(${models.length})`}
              description={
                lastRefreshedAt
                  ? `마지막 확인: ${new Date(lastRefreshedAt).toLocaleString()}`
                  : '새로고침으로 us-west-2 파운데이션 모델을 탐색합니다.'
              }
              actions={
                <Button
                  data-testid="model-refresh"
                  iconName="refresh"
                  loading={refreshing}
                  onClick={handleRefresh}
                >
                  새로고침
                </Button>
              }
            >
              모델 목록
            </Header>
          }
          columnDefinitions={[
            {
              id: 'model',
              header: '모델',
              cell: (item) => (
                <SpaceBetween size="xxs">
                  <Box fontWeight="bold">{item.displayName}</Box>
                  <Box fontSize="body-s" color="text-body-secondary">
                    {item.modelId}
                  </Box>
                </SpaceBetween>
              ),
              minWidth: 240,
            },
            {
              id: 'provider',
              header: '공급자',
              cell: (item) => item.provider,
              width: 120,
            },
            {
              id: 'status',
              header: '상태',
              cell: (item) => statusIndicator(item.status),
              width: 120,
            },
            {
              id: 'default',
              header: '기본',
              cell: (item) =>
                item.isDefault ? (
                  <StatusIndicator type="success">기본</StatusIndicator>
                ) : (
                  '-'
                ),
              width: 90,
            },
            {
              id: 'lastTested',
              header: '마지막 테스트',
              cell: (item) =>
                item.lastTestedAt
                  ? `${new Date(item.lastTestedAt).toLocaleString()} (${item.lastTestResult ?? '-'})`
                  : '미테스트',
              width: 200,
            },
            {
              id: 'actions',
              header: '동작',
              cell: rowActions,
              minWidth: 280,
            },
          ]}
          empty={
            <Box textAlign="center" padding="l">
              <SpaceBetween size="s">
                <Box>등록된 모델이 없습니다.</Box>
                <Box fontSize="body-s" color="text-body-secondary">
                  새로고침을 눌러 파운데이션 모델을 탐색하세요.
                </Box>
              </SpaceBetween>
            </Box>
          }
          stickyHeader
          stripedRows
        />
      </SpaceBetween>

      <Modal
        visible={confirmAction !== null}
        onDismiss={() => setConfirmAction(null)}
        header="모델 활성화 확인"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setConfirmAction(null)}>
                취소
              </Button>
              <Button
                data-testid="model-confirm-activate"
                variant="primary"
                onClick={handleConfirm}
              >
                {confirmAction?.kind === 'approve' ? '승인' : '켜기'}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="s">
          <Box>
            <strong>{confirmAction?.model.displayName}</strong> 모델을 활성화하면
            업로드 화면에서 선택할 수 있게 되며, 사용 시 Bedrock 호출 비용이
            발생할 수 있습니다.
          </Box>
          {confirmAction?.model.costHint && (
            <Alert type="info">예상 비용: {confirmAction.model.costHint}</Alert>
          )}
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  );
};

export default ModelManagementComponent;
