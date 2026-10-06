# Fitzza WBS Dashboard

GitHub의 `data/tasks/*.json`을 단일 원본으로 사용하는 읽기 전용 간트 대시보드입니다.

## Local development

```bash
npm install
npm run validate:data
npm run dev
```

## 가중치와 상태

각 작업은 정수 `weight: 1` 또는 `weight: 2`를 반드시 지정합니다.
기존 12개 작업은 모두 `weight: 1`로 전환했습니다.

```json
{
  "weight": 2,
  "status": "완료"
}
```

- 상태: `시작 전`, `진행 중`, `차단됨`, `완료`, `보류`.
- 가중 진척률 = 완료 작업의 가중치 합 / 보류를 제외한 전체 작업의 가중치 합.
- `완료` 작업은 자신의 가중치 전체를 분자에 반영합니다. 다른 상태의 부분 진행률은 반영하지 않습니다.
- `보류` 작업은 분자와 분모 모두에서 제외합니다. 표와 Excel에는 남고 진행률은 `제외`로 표시됩니다.
- `차단됨`은 `보류`와 다르며 계산 대상 가중치에 포함됩니다.
- 모든 작업이 보류이거나 표시된 작업이 없으면 `계산 대상 없음`으로 표시합니다.
- 작업별 진행률은 완료 시 100%, 미완료 시 0%입니다. 기존 `progress` 필드는 하위 호환을 위해 허용하지만 계산에는 쓰지 않습니다. 새 JSON에는 작성할 필요가 없습니다.
- 이전 영문 상태 `not_started`, `in_progress`, `blocked`, `completed`도 지원합니다. `on_hold`는 `보류`와 동일합니다.

예: 완료(가중치 2), 진행 중(가중치 1), 보류(가중치 2)라면 진척률은 2 / 3 = 66.7%입니다.

## Excel 내보내기

화면의 **Excel 내보내기 (.xlsx)** 버튼으로 현재 표시된 작업을 다운로드합니다.
역할 필터, 작업 순서, 날짜 범위, 상태, 가중치, 주차/일자 헤더와 간트 색상을 반영합니다.
전체 결과를 받으려면 **전체 표시**를 누른 뒤 내보내세요. 화면의 가중 진척률도 동일한 표시 범위로 계산합니다.

Excel에는 진척률 수식, 가중치 1/2 입력 제한, 상태 선택 목록, 날짜에 따른 간트 조건부 서식과 틀 고정이 포함됩니다.
파일에서 상태·가중치·기존 날짜 범위 내 일정을 바꾸면 Excel이 수식과 서식을 다시 계산합니다.
날짜 열은 내보내기 시점의 일정 범위이므로 그 밖의 일정으로 바꾸려면 원본 JSON 수정 후 다시 내보내세요.
Excel 수정은 GitHub 데이터로 동기화되지 않습니다. 서버나 토큰 없이 브라우저에서 파일을 생성합니다.

## 검증

```bash
npm run validate:data
npm test
npm run build
```

테스트는 상태 전환·보류 제외·영문 호환·0 분모·잘못된 가중치와 XLSX 재열기 후 수식/날짜/서식 보존을 확인합니다.

## Dependency CSV import

`predecessorId,successorId` 헤더를 포함한 CSV를 표준 입력 또는 파일 인수로 전달합니다. 이 명령은 후행 작업의 `predecessorIds`에 항목을 추가합니다.

```bash
npm run import:dependencies -- dependencies.csv
# 또는
Get-Content dependencies.csv | npm run import:dependencies
```

수정 후에는 반드시 `npm run validate:data`를 실행하세요. PR과 `main` 푸시에서 같은 검증이 실행되며, `main`에 반영되면 Pages 배포가 시작됩니다. 저장소 설정의 **Pages > Build and deployment > Source**를 **GitHub Actions**로 한 번 지정해야 합니다.
