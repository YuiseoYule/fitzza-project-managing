# Fitzza WBS Dashboard

GitHub의 `data/tasks/*.json`을 단일 원본으로 사용하는 읽기 전용 간트 대시보드입니다.

## Local development

```bash
npm install
npm run validate:data
npm run dev
```

## Dependency CSV import

`predecessorId,successorId` 헤더를 포함한 CSV를 표준 입력 또는 파일 인수로 전달합니다. 이 명령은 후행 작업의 `predecessorIds`에 항목을 추가합니다.

```bash
npm run import:dependencies -- dependencies.csv
# 또는
Get-Content dependencies.csv | npm run import:dependencies
```

수정 후에는 반드시 `npm run validate:data`를 실행하세요. PR과 `main` 푸시에서 같은 검증이 실행되며, `main`에 반영되면 Pages 배포가 시작됩니다. 저장소 설정의 **Pages > Build and deployment > Source**를 **GitHub Actions**로 한 번 지정해야 합니다.
