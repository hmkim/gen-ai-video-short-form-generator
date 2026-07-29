# GenAI Video Short-Form Generator — 아키텍처 리뷰

> **작성일:** 2026-05-28  
> **최종 검증일:** 2026-05-28 (코드 교차 검증 완료)  
> **관점:** AWS Well-Architected Framework (보안, 비용, 운영, 신뢰성, 성능)

---

## 종합 평가

전반적으로 잘 설계된 서버리스 아키텍처. Amplify Gen2 + Step Functions + EventBridge 조합은 비동기 미디어 처리 워크로드에 적합. 보안, 비용, 운영 측면에서 프로덕션 준비를 위해 개선이 필요한 영역 존재.

| 영역 | 등급 | 핵심 이슈 |
|------|------|-----------|
| 보안 | ⚠️ 중-상 | IAM wildcard, 입력 검증 부재, guest 접근 구조 복잡 |
| 비용 | ✅ 양호 | Transcribe가 지배적. 서버리스로 유휴 비용 없음 |
| 운영 | ⚠️ 중간 | 에러 처리/모니터링/알림 부재, Logs 보존 미설정 |
| 신뢰성 | ⚠️ 중간 | 데이터 정합성 버그 존재, 멱등성 미보장, 타임아웃 설정 오류 |
| 성능 | ✅ 양호 | 적절한 리소스 할당. Transcribe 폴링 개선 여지 |
| 아키텍처 설계 | ✅ 우수 | 서비스 선택과 이벤트 기반 설계가 적절 |

---

## 1. 보안 (Security Pillar) — 위험도: 중-상

### 즉시 조치 필요 (High Priority)

| # | 이슈 | 위험도 | 영향 |
|---|------|--------|------|
| 1 | **IAM Wildcard 정책** — Bedrock `resources: ["*"]`, Secrets Manager `resources: ["*"]`, states:StartExecution `resources: ["*"]` | **High** | 최소 권한 원칙 위반. 계정 내 모든 Bedrock 모델/Secret/StateMachine에 접근 가능 |
| 2 | **exchangeYouTubeToken redirectUri 미검증** | **High** | Open Redirect 취약점. 공격자가 OAuth 토큰을 자신의 서버로 리다이렉트 가능 |
| 3 | **publish/publishLongVideo에 guest 접근 허용** | **Medium** | 미인증 사용자가 가짜 stage 이벤트를 주입하여 다른 사용자의 UI를 조작 가능 |
| 4 | **모든 Lambda에 입력 검증 부재** | **Medium** | uuid injection, path traversal, 비정상 데이터로 인한 예기치 않은 동작 |

### 권장 조치

```
1. IAM 정책 즉시 수정:
   - Bedrock: "arn:aws:bedrock:us-west-2:*:inference-profile/us.anthropic.*"
   - Secrets Manager: "arn:aws:secretsmanager:{region}:{account}:secret:youtube-oauth-*"
   - StartExecution: 각 StateMachine ARN 명시
   - MediaConvert role: AmazonS3FullAccess → 버킷 ARN 한정 커스텀 정책

2. exchangeYouTubeToken: 허용 origin 화이트리스트 적용
   const ALLOWED_REDIRECTS = ['https://your-domain.com/youtube/callback'];

3. allow.guest() 제거 — EventBridge → AppSync 경로는 IAM auth로 충분

4. 입력 검증 패턴 적용:
   - uuid: UUID v4 정규식 검증
   - presenterCount: 1 또는 2만 허용
   - timestamp: 0 이상, 합리적 상한 (86400초)
   - S3 key: videos/{uuid}/ prefix 강제
```

### 추가 고려사항

- **프롬프트 인젝션**: 사용자 transcript가 LLM 프롬프트에 직접 삽입됨. XML delimiter로 사용자 데이터를 격리하고, `html.escape()` 적용 권장
- **Gallery/YouTubeUpload 모델**: `allow.authenticated()`는 다른 사용자 데이터 노출. `allow.owner()`로 변경 필요
- **S3 암호화**: SSE-S3 기본값은 적절하나, 민감 영상이라면 SSE-KMS + 키 정책 고려

### ⚠️ `allow.guest()` 제거 관련 중요 사항 (코드 검증 결과)

**`allow.guest()` 단순 제거는 서비스 장애를 유발합니다.**

현재 구조:
```
EventBridge → eventBusRole (IAM, SigV4) → AppSync publish/publishLongVideo mutation
```

`allow.guest()`가 수행하는 이중 역할:
1. Cognito Identity Pool 비인증 사용자 접근 허용 (의도된 목적)
2. **AppSync API에 IAM auth mode를 활성화하는 유일한 트리거** (숨겨진 부작용)

`defineData` 설정에 `iamAuthorizationMode`가 명시되어 있지 않으므로, `allow.guest()` 제거 시:
- AppSync에서 IAM auth mode가 비활성화됨
- `eventBusRole`의 SigV4 서명 요청이 거부됨
- **실시간 stage 알림 전체 중단** (Step Function 완료를 프론트엔드가 수신 불가)

**안전한 대안:**
```typescript
// defineData에 명시적 IAM auth mode 추가
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    // IAM auth mode를 명시적으로 활성화
  },
});

// 그 후 publish/publishLongVideo에서 allow.guest() → IAM 전용 규칙으로 변경
```

**조치 우선순위:** sandbox에서 충분히 검증 후 변경. 5순위 유지.

---

## 2. 비용 최적화 (Cost Optimization Pillar) — 양호

### 현재 비용 구조 분석

| 서비스 | 1시간 영상 기준 | 비중 | 평가 |
|--------|----------------|------|------|
| Amazon Transcribe | ~$1.44 | **72%** | 지배적 비용 요소 |
| Amazon Bedrock | ~$0.15-0.50 | ~15-25% | 모델 선택에 따라 변동 |
| Lambda/DDB/S3/SF | ~$0.01 | <1% | 무시 가능 |
| **합계** | **~$1.60-2.00** | | |

### 강점
- 서버리스 아키텍처로 유휴 비용 없음
- 사용자가 Bedrock 모델을 선택할 수 있어 비용/품질 트레이드오프 제어 가능
- Lambda 512MB는 Python 3.12 워크로드에 적정

### 개선 기회

| 전략 | 예상 절감 | 난이도 |
|------|-----------|--------|
| **Transcribe 언어 수동 지정** (자동 감지 대신) | ~10-15% ($0.14/영상) | 낮음 — UI에서 언어 선택 추가 |
| **S3 Transfer Acceleration 조건부 적용** | 소규모 파일 시 불필요 비용 제거 | 낮음 — 파일 크기 기준 분기 |
| **개선 B (Vision) Haiku 모델 사용** | Vision 비용 80% 절감 ($0.60→$0.12) | 낮음 |
| **Transcribe 결과 캐싱** | 재처리 시 100% 절감 | 중간 — 동일 영상 재업로드 감지 필요 |
| **Step Functions Express Workflow** | Standard 대비 ~60% 절감 | 중간 — 5분 이내 완료 보장 필요 |

### 비용 위험 요소

- **개선 B (Vision 분석)**: boundary당 $0.03-0.06 추가. 10개 캡은 적절하나, 캡 없이 배포하면 비용 폭발 가능
- **Bedrock 모델 선택**: DeepSeek R1 등 고비용 모델 선택 시 단일 호출 $1+ 가능. UI에 예상 비용 표시 권장
- **대용량 영상**: 3시간+ 영상의 Transcribe 비용 $4.32+. 영상 길이 제한 또는 사전 경고 필요

---

## 3. 운영 우수성 (Operational Excellence Pillar) — 개선 필요

### 현재 강점
- Step Functions으로 파이프라인 시각화/디버깅 용이
- EventBridge + AppSync Subscription으로 실시간 상태 전달
- Stage 기반 진행 상태 추적 (stage 0→1→2)

### 개선 필요 영역

| 영역 | 현재 상태 | 권장 |
|------|-----------|------|
| **에러 처리** | Bedrock 오류 시 fallback (aiConfidence=0.5)만 존재. Step Function에 Retry/Catch 없음 | Step Functions Catch/Retry 패턴 적용. Transcribe 실패, S3 접근 오류 등 각 단계별 재시도 정책 |
| **모니터링/알림** | 미설정 | CloudWatch Alarms: Lambda 에러율, Step Function 실패율, Transcribe 실패 |
| **로깅** | `console.log(event)` 수준. 구조화 로깅 없음 | JSON 구조화 로깅 + X-Ray 트레이싱 활성화 |
| **CloudWatch Logs 보존** | **미설정 (무기한 보존 = 비용 누적)** | 30일 또는 90일 보존 정책 설정 (Lambda CDK에서 `logRetention` prop) |
| **S3 Lifecycle** | **미설정** | 임시 파일(프레임, 중간 결과)에 7일 만료. 미완성 멀티파트 업로드 정리 |
| **DLQ (Dead Letter Queue)** | 미설정 | Lambda 비동기 호출 실패 시 SQS DLQ로 전달 |
| **배포 전략** | Amplify sandbox 기반 | 프로덕션: amplify pipeline + 환경 분리 (dev/staging/prod) |
| **영상 처리 실패 복구** | 사용자에게 알림 없음 (무한 대기) | FAILED stage + 에러 메시지 + 재시도 버튼 |
| **중복 업로드 방지** | **없음** — 같은 영상을 여러 번 업로드하면 각각 독립 처리 | 콘텐츠 해시 기반 중복 감지 또는 UI에서 기존 처리 진행 중 경고 |

### Step Functions 개선 권장

```
현재: 단순 순차 실행
권장: 각 단계에 Retry + Catch 추가

Retry:
  - Transcribe: MaxAttempts=3, BackoffRate=2 (일시적 서비스 오류)
  - Bedrock: MaxAttempts=2, BackoffRate=2 (throttling 대응)
  - Lambda: MaxAttempts=2 (timeout 대응)

Catch:
  - 모든 단계: 실패 시 DDB stage를 "FAILED"로 업데이트
  - EventBridge로 실패 이벤트 발행 → 사용자 UI에 에러 표시
```

---

## 4. 신뢰성 (Reliability Pillar) — 중간

### 강점
- 서버리스 구성으로 인프라 장애 자동 복구
- DynamoDB + S3의 높은 내구성
- EventBridge의 at-least-once 전달 보장

### 위험 요소

| 위험 | 영향 | 대응 |
|------|------|------|
| **Lambda 600초 타임아웃** | 대용량 영상(3시간+)에서 Transcribe 폴링 또는 Bedrock 호출 타임아웃 | Transcribe: 비동기 완료 이벤트 사용 (폴링 대신). Bedrock: 토큰 수 제한 |
| **Transcribe 동시 실행 제한** | 기본 100개 동시 작업. 다수 사용자 동시 업로드 시 throttling | Service Quotas 모니터링 + 큐잉 |
| **MediaConvert 작업 실패** | 출력 영상 미생성 | Step Function에서 MediaConvert 작업 상태 폴링 + 재시도 |
| **단일 리전 배포** | us-west-2 장애 시 전체 서비스 중단 | 현재 규모에서는 수용 가능. 향후 멀티리전 고려 |
| **DynamoDB BatchWrite 25개 제한** | 세그먼트 50개+ 시 분할 필요 | ✅ boto3 batch_writer가 자동 처리 (검증 완료) |

### 🐛 코드 검증에서 발견된 신뢰성 버그

#### Bug 1: DynamoDB Scan 페이지네이션 누락 (High)

**파일:** `amplify/custom/lambda-functions/analyze-presenter-segments/lambda_function.py` (lines 50-57)

```python
# 현재 코드 — 첫 1MB만 삭제
old_segments = segment_table.scan(
    FilterExpression='longVideoEditId = :vid',
    ExpressionAttributeValues={':vid': video_id},
    ProjectionExpression='id'
)
with segment_table.batch_writer() as batch:
    for old in old_segments.get('Items', []):
        batch.delete_item(Key={'id': old['id']})
```

**문제:** DynamoDB `scan()`은 최대 1MB per call. 세그먼트가 많을 경우 `LastEvaluatedKey`가 반환되지만 체크하지 않음. 결과: 고아 레코드가 DynamoDB에 잔류.

**수정:**
```python
# 페이지네이션 루프
with segment_table.batch_writer() as batch:
    scan_kwargs = {
        'FilterExpression': 'longVideoEditId = :vid',
        'ExpressionAttributeValues': {':vid': video_id},
        'ProjectionExpression': 'id'
    }
    while True:
        response = segment_table.scan(**scan_kwargs)
        for old in response.get('Items', []):
            batch.delete_item(Key={'id': old['id']})
        if 'LastEvaluatedKey' not in response:
            break
        scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
```

#### Bug 2: 비원자적 Delete-then-Write 패턴 (High)

**같은 파일** — 세그먼트 전체 삭제 후 새 세그먼트 쓰기까지의 사이에 Lambda가 실패하면 데이터 유실.

**현재:**
```
1. scan + delete all old segments  ← 여기서 성공
2. [Lambda crash / timeout]         ← 이 시점에 데이터 없음
3. write new segments              ← 실행되지 않음
```

**권장 수정 (Write-then-Delete):**
```
1. Write new segments (with version flag or TTL)
2. Delete old segments (now safe — new data exists)
```
또는 `segmentVersion` 필드를 추가하여 논리적 삭제 후 최신 버전만 조회하는 패턴.

#### Bug 3: Bedrock 클라이언트 타임아웃 설정 오류 (Medium)

**파일:** `amplify/custom/lambda-functions/analyze-presenter-segments/lambda_function.py` (line 11)

```python
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-west-2',
    config=botocore.config.Config(connect_timeout=1000, read_timeout=1000)
)
```

**문제:** boto3 `Config` 타임아웃 단위는 **초**. `1000초` = 16.7분 → Lambda 최대 실행 시간(600초=10분)보다 긺. 타임아웃이 절대 발동하지 않음.

**수정:**
```python
config=botocore.config.Config(
    connect_timeout=10,     # 10초 내 연결
    read_timeout=300,       # 5분 내 응답 (Lambda 600초 타임아웃 내 여유 확보)
    retries={'max_attempts': 2}
)
```

#### Bug 4: 멱등성(Idempotency) 미보장 (Medium)

**현상:** 동일 S3 키에 대해 EventBridge가 이벤트를 2회 전달하면:
1. 두 번째 Step Function이 같은 `{uuid}_longvideo` Transcribe job 생성 시도
2. Transcribe `ConflictException` 발생
3. Step Function에 해당 에러 핸들러 없음 → 영구 실패

**대응 방안:**
- Step Function 실행 이름에 S3 event ID를 포함하여 중복 실행 방지
- 또는 `GetEditRecord` 후 `stage >= 1`이면 조기 종료하는 Choice 분기 추가

---

## 5. 성능 효율성 (Performance Efficiency Pillar) — 양호

### 강점
- S3 Transfer Acceleration으로 대용량 업로드 최적화
- Lambda 512MB는 Python 3.12에 적정 (CPU 비례 할당)
- Bedrock Converse API 사용 (스트리밍 불필요한 배치 처리에 적합)

### 개선 기회

| 영역 | 현재 | 권장 |
|------|------|------|
| **Transcribe 폴링** | 10초 간격 Wait loop | EventBridge 완료 이벤트 수신으로 전환 (지연 시간 단축) |
| **Lambda Cold Start** | Python 3.12 + 512MB | 빈번 호출이 아니므로 현재 수용 가능. SnapStart 미지원(Python) |
| **개선 B FFmpeg** | 2048MB Lambda | 프레임 추출은 가벼운 작업이므로 1024MB로도 충분할 수 있음. 테스트 후 결정 |
| **Bedrock 토큰 제한** | transcript 앞 4000자 + 뒤 4000자 | 적절한 컨텍스트 윈도우 관리. 다만 중간 부분 누락 가능성 인지 필요 |

---

## 6. 개선 계획 평가

### Phase 1 (Timeline UX) — ✅ 적절
- 프론트엔드 전용 변경으로 리스크 최소
- 추가 비용 없음
- UX 개선 효과 높음

### Phase 2 (발화 비율 기반 매핑) — ✅ 강력 추천
- 비용 증가 거의 없음 (~$0.001)
- 정확도 개선 효과 높음 (순서 기반 → 발화량 기반)
- 보안 개선 동시 적용 (입력 검증, IAM scope 축소)

### Phase 3 (Vision 분석) — ⚠️ 조건부 추천
- 비용 증가 $0.05-0.60/영상 (Haiku 사용 시 $0.05-0.12)
- 복잡도 증가 (FFmpeg Layer, 새 Lambda, Step Function 수정)
- **권장**: Phase 2 적용 후 정확도 측정 → 부족할 때만 Phase 3 진행. opt-in 방식으로 사용자 선택 제공

---

## 7. 보안 조치 시 실행/운영 리스크 분석

### 7.1 IAM Wildcard → Scoped ARN 변경

**리스크: 중간**

| 조치 | 운영 문제 가능성 |
|------|-----------------|
| Bedrock `resources: ["*"]` → 모델 ARN 패턴 | ⚠️ 사용자가 UI에서 모델을 선택하는 구조. 새 모델 추가 시 IAM 정책도 업데이트 필요. 패턴이 너무 좁으면 특정 모델 호출 실패 |
| Secrets Manager → 특정 secret ARN | ✅ 낮은 리스크. secret 이름이 고정되어 있으므로 안전 |
| StartExecution → StateMachine ARN | ⚠️ CDK에서 StateMachine ARN을 참조해야 하는데, Amplify Gen2의 스택 간 참조(cross-stack reference) 순서 문제 발생 가능 |

**대응:**
- Bedrock: `arn:aws:bedrock:us-west-2::foundation-model/*` + `arn:aws:bedrock:us-west-2:*:inference-profile/*` 패턴 사용 → 새 모델 추가에도 대응 가능
- StartExecution: CDK에서 `stateMachine.stateMachineArn`을 직접 참조하되, 순환 의존성 발생 시 `Fn.importValue` 또는 SSM Parameter로 우회

### 7.2 `allow.guest()` 제거

**리스크: 높음 — 서비스 장애 확정 (검증 완료)**

코드 검증 결과, `allow.guest()`가 필요한 이유가 **확인**됨:
- `defineData`에 `iamAuthorizationMode`가 명시되어 있지 않음
- `allow.guest()`가 Amplify Gen2에서 IAM auth mode를 활성화하는 **유일한 메커니즘**
- EventBridge `eventBusRole` (SigV4 서명)은 IAM auth mode가 있어야 AppSync 호출 성공
- `publish.js`/`publishLongVideo.js`는 단순 pass-through (`return event.arguments`)

**확정된 사실:**
- `allow.guest()` 단순 제거 → EventBridge→AppSync 즉시 실패 → 실시간 알림 전체 중단
- `receive`/`receiveLongVideo` subscription은 `allow.authenticated()`만으로 정상 (수신 측은 안전)
- 문제는 **발행 측** (EventBridge IAM role의 mutation 호출)

**안전한 대응:**
1. `defineData`에 `iamAuthorizationMode` 명시 추가
2. `allow.guest()` → Amplify Gen2 IAM 전용 auth rule로 변경
3. sandbox에서 실시간 stage 업데이트 E2E 검증
4. 검증 통과 후에만 프로덕션 적용

### 7.3 입력 검증 추가

**리스크: 낮음 — 단, 과도한 검증은 정상 요청 차단 가능**

| 검증 항목 | 주의점 |
|-----------|--------|
| uuid 형식 | Amplify가 생성하는 ID가 표준 UUID v4가 아닐 수 있음. 실제 ID 형식 확인 후 정규식 작성 |
| presenterCount | DynamoDB에 integer로 저장. Step Function에서 전달 시 string "2"로 올 수 있음 (JSON 직렬화 주의) |
| timestamp | Transcribe 결과의 timestamp가 float. 정수만 허용하면 실패 |

### 7.4 `exchangeYouTubeToken` redirectUri 검증

**리스크: 중간**

- 개발 환경(localhost)과 프로덕션 환경의 redirect URI가 다름
- 하드코딩하면 환경 전환 시 실패
- **대응**: 환경 변수로 허용 origin 목록 관리 (`ALLOWED_REDIRECT_URIS`)

---

## 8. 에러 처리 + 사용자 알림 구성

Step Function 실패 시 사용자에게 에러를 전달하려면 기존 EventBridge → AppSync Subscription 경로를 활용:

```
Step Function 단계 실패
    │ Catch block
    ▼
UpdateDDB: stage = "FAILED", errorMessage = "..."
    │
    ▼
EventBridge PutEvents: detail-type = "LongVideoStageChanged"
    detail: { videoId, stage: "FAILED", error: "Transcribe timeout" }
    │
    ▼
AppSync Subscription → Frontend: 에러 UI 표시
```

### 구현 포인트

1. **Step Function Catch 블록**: 각 단계에 `Catch` 추가 → 실패 시 "UpdateDDB-Failed" 상태로 이동
2. **DDB 스키마 확장**: `LongVideoEdit`에 `errorMessage` 필드 추가 (optional string)
3. **EventBridge 이벤트**: 기존 `LongVideoStageChanged` 이벤트에 `error` 필드 포함
4. **Frontend**: stage === "FAILED" 시 에러 메시지 표시 + 재시도 버튼

---

## 9. 우선순위 높은 수정 사항 (Top 7, 검증 후 재정렬)

### 1순위: Step Function 에러 처리 + 사용자 알림 (운영 필수)

**이유**: 현재 파이프라인 실패 시 사용자는 무한 대기 상태. 가장 직접적인 UX 문제.

**수정 범위:**
- `LongVideoProcessStateMachine.ts`: 각 단계에 Retry/Catch 추가
- `amplify/data/resource.ts`: LongVideoEdit 모델에 `errorMessage: a.string()` 추가
- Frontend `LongVideoEditorComponent.tsx`: FAILED stage 처리 UI

**Retry 정책 권장:**
```
Transcribe 폴링: MaxAttempts=3, IntervalSeconds=10, BackoffRate=2
Bedrock 호출: MaxAttempts=2, IntervalSeconds=5, BackoffRate=2
Lambda 일반: MaxAttempts=2, IntervalSeconds=3, BackoffRate=2
```

---

### 2순위: IAM Bedrock/Secrets Manager 정책 Scope 축소 (보안 필수)

**이유**: 가장 높은 보안 위험이면서 운영 리스크가 낮음.

**수정 범위:**
- `AnalyzePresenterSegments/resource.ts`: Bedrock 정책
- YouTube 관련 3개 Lambda resource.ts: Secrets Manager 정책

**안전한 패턴:**
```typescript
// Bedrock — 모든 inference profile 허용 (새 모델 추가에도 대응)
resources: [
  `arn:aws:bedrock:us-west-2::foundation-model/*`,
  `arn:aws:bedrock:us-west-2:*:inference-profile/*`
]

// Secrets Manager — secret 이름 패턴
resources: [
  `arn:aws:secretsmanager:${region}:${account}:secret:youtube-oauth-*`
]
```

---

### 3순위: Lambda 입력 검증 (보안 + 안정성)

**이유**: 비정상 입력으로 인한 예기치 않은 Lambda 실패 방지. 에러 처리와 함께 적용하면 시너지.

**수정 범위:**
- `detect-presenter-boundaries/lambda_function.py`
- `analyze-presenter-segments/lambda_function.py`

**검증 패턴 (최소한):**
```python
def validate_input(event):
    uuid = event.get('uuid', '')
    if not uuid or not re.match(r'^[a-zA-Z0-9\-]{20,50}$', uuid):
        raise ValueError(f"Invalid uuid: {uuid}")
    
    presenter_count = int(event.get('presenterCount', 2))
    if presenter_count not in (1, 2):
        raise ValueError(f"Invalid presenterCount: {presenter_count}")
    
    bucket = event.get('bucket_name', '')
    if not bucket:
        raise ValueError("Missing bucket_name")
```

---

### 4순위: `exchangeYouTubeToken` redirectUri 검증 (보안)

**이유**: Open Redirect는 OAuth 토큰 탈취로 이어질 수 있는 실질적 공격 벡터.

**수정 범위:**
- `amplify/data/exchangeYouTubeToken.ts`

**구현:**
```typescript
const ALLOWED_ORIGINS = (process.env.ALLOWED_REDIRECT_ORIGINS || '').split(',');

if (!ALLOWED_ORIGINS.some(origin => redirectUri.startsWith(origin))) {
  return { statusCode: 400, error: 'Invalid redirect URI' };
}
```

- 환경 변수로 관리하여 dev/prod 분리

---

### 5순위: DynamoDB Scan 페이지네이션 버그 수정 (데이터 정합성)

**이유**: 세그먼트 수가 많은 영상에서 고아 레코드 발생. 사용자에게 이전 분석 결과가 중복 표시될 수 있음.

**수정 범위:**
- `amplify/custom/lambda-functions/analyze-presenter-segments/lambda_function.py` (lines 50-57)

**수정 내용:** scan 후 `LastEvaluatedKey` 체크하는 while 루프로 교체. 동시에 Write-then-Delete 패턴으로 변경하여 원자성 보장.

---

### 6순위: Bedrock 타임아웃 설정 수정 + 멱등성 보호 (안정성)

**이유**: 타임아웃이 실질적으로 작동하지 않아 Lambda가 900초까지 hang 가능. 이중 트리거 시 Transcribe ConflictException으로 영구 실패.

**수정 범위:**
- `analyze-presenter-segments/lambda_function.py`: `connect_timeout=10, read_timeout=300`
- `LongVideoProcessStateMachine.ts`: GetEditRecord 후 `stage >= 1`이면 조기 성공 종료

---

### 7순위: `allow.guest()` → 명시적 IAM auth mode 전환 (보안 — 장기)

**이유**: 보안상 중요하지만, 잘못 제거하면 **실시간 알림 전체 중단**. 현재 `allow.guest()`가 AppSync IAM auth mode를 활성화하는 유일한 트리거임이 검증됨.

**절대 하면 안 되는 것:**
- `allow.guest()` 단순 제거 → EventBridge→AppSync 통신 즉시 중단

**안전한 접근:**
1. `defineData`에 `iamAuthorizationMode` 명시적 추가
2. `publish`/`publishLongVideo`의 auth를 IAM 전용 규칙으로 변경
3. sandbox에서 실시간 stage 업데이트 정상 동작 검증
4. 검증 완료 후에만 프로덕션 적용

**대안 (최소 변경):**
- 현재 구조 유지하되, AppSync WAF에서 guest mutation 호출 소스를 EventBridge IAM role로 제한

---

## 10. 실행 로드맵 (검증 반영)

```
Week 1 (운영 안정성 + 보안 기반):
  ├─ [1순위] Step Function Retry/Catch + FAILED stage + 사용자 에러 알림
  ├─ [2순위] IAM scope 축소 (Bedrock, Secrets Manager)
  └─ [6순위-일부] Bedrock 타임아웃 수정 (connect_timeout=10, read_timeout=300)

Week 2 (보안 + 데이터 정합성):
  ├─ [3순위] Lambda 입력 검증
  ├─ [4순위] exchangeYouTubeToken redirectUri 검증
  └─ [5순위] DynamoDB scan 페이지네이션 + Write-then-Delete 패턴

Week 3 (안정성 + 운영):
  ├─ [6순위] 멱등성 보호 (이중 트리거 방지)
  ├─ CloudWatch Logs 보존 기한 설정 (30일)
  └─ S3 Lifecycle 설정 (multipart upload 정리)

Week 4+ (장기 개선):
  └─ [7순위] allow.guest() → 명시적 IAM auth mode (sandbox 검증 필수)
```

**병렬 작업 가능 조합:**
- 1순위(에러 처리) + 2순위(IAM) — 서로 독립적
- 3순위(입력 검증) + 5순위(DB 버그) — 같은 Lambda 파일이지만 다른 함수
- 6순위(타임아웃) 는 2순위와 동시에 같은 파일에서 수정 가능

---

## 11. 검증 방법론 기록

본 리뷰의 검증은 다음 방법으로 수행:

| 검증 항목 | 방법 |
|-----------|------|
| IAM 정책 | `backend.ts`, 각 `resource.ts` 직접 코드 확인 |
| DynamoDB 페이지네이션 | `analyze-presenter-segments` scan 코드 + boto3 문서 대조 |
| 타임아웃 단위 | botocore.config.Config 공식 문서 (단위: 초) 확인 |
| allow.guest() 영향 | Amplify Gen2 auth mode 작동 방식 + publish.js 핸들러 + eventBusRole 구성 분석 |
| batch_writer 자동 분할 | boto3 DynamoDB resource batch_writer 구현 확인 (자동 25개 분할 + 재시도) |
| 멱등성 | Transcribe StartTranscriptionJob API 문서 (동일 이름 ConflictException) |
| ID 형식 | LongVideoUploadComponent → createLongVideoEdit → Amplify auto-id (UUID v4) 확인 |
