# Issue tracker

## Tracker

GitHub Issues

## Repository

minorunakamura/pi-demo
https://github.com/minorunakamura/pi-demo
Host: github.com

## 作成・取得

- 公開 gh CLI を使い、常に上記 repository を明示する。
- 作成: gh issue create --repo minorunakamura/pi-demo --title <title> --body <body> --label ready-for-agent
- 取得: gh issue view <number-or-url> --repo minorunakamura/pi-demo --json number,url,title,body,comments,labels,state
- ready-for-agent 対応名は docs/agents/triage-labels.md があればその既存対応名、なければ ready-for-agent。必要な1つだけ別途承認後に準備する。

## 依存関係

blocker を先に作成し、実 Issue の参照を使う。利用可能なら native blocking relationship / sub-issue、機能非対応なら本文の Blocked by / Parent の実リンクで表す。認証・権限・通信の失敗では停止する。元 Issue の本文・状態は変更しない。
