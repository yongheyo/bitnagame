# PlayHub

Phaser 3 기반 미니 게임 포털 — 계정 없이 바로 플레이.

## 라이브 URL

**https://yongheyo.github.io/playhub-portal/**

## 게임

| 게임 | 경로 | 조작 |
|------|------|------|
| 2048 | `docs/games/2048/` | 화살표 키 / 스와이프 |
| 슬라이딩 퍼즐 (15) | `docs/games/sliding/` | 탭·클릭으로 타일 이동 |
| 매치-3 | `docs/games/match3/` | 인접 보석 스왑 (드래그/탭) |

모든 게임 로직은 **Phaser 3** (CDN)만 사용합니다. 로비는 HTML/CSS입니다.

## 로컬 실행

정적 사이트이므로 빌드 없이 `docs/`를 서빙하면 됩니다.

```bash
python3 -m http.server 8080 --directory docs
# http://localhost:8080
```

## 게임 추가 방법

1. `docs/games/<새게임>/index.html` + `game.js` 추가 (Phaser 3 CDN 로드)
2. `docs/index.html` 로비 카드 링크 추가
3. README 표 업데이트 후 `main`에 푸시 (GitHub Pages: `/docs`)

## 기술

- 순수 정적 (`docs/`) + Phaser 3 (unpkg CDN)
- GitHub Pages: branch `main` / folder `/docs`
- 한국어 UI, 모바일·데스크톱 입력 지원
- 계정/결제 없음
