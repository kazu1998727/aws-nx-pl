# ドキュメント目次

このディレクトリには、`aws-nx-pl` リポジトリの設計と開発手順をまとめています。
初めて触る場合は、上から順に読むことをおすすめします。

| ドキュメント | 内容 |
|---|---|
| [architecture.md](./architecture.md) | システム全体の構成、AWS リソース、リクエストの流れ |
| [project-structure.md](./project-structure.md) | モノレポのディレクトリ構成と、各ファイルの役割 |
| [authentication.md](./authentication.md) | Cognito による認証と、API への認可（SigV4 / IAM）の仕組み |
| [api-development.md](./api-development.md) | tRPC API（`demo-api`）の開発手順 |
| [website-development.md](./website-development.md) | React Web サイト（`demo-website`）の開発手順 |
| [infrastructure.md](./infrastructure.md) | CDK（`infra`）の構成、デプロイ、削除 |
| [development-workflow.md](./development-workflow.md) | ローカル開発・テスト・Lint・ビルドの流れとトラブルシューティング |

## 用語集

| 用語 | 意味 |
|---|---|
| Nx | モノレポ管理ツール。`pnpm nx <target> <project>` でタスクを実行し、依存関係の順序やキャッシュを管理する |
| `@aws/nx-plugin` | AWS 公式の Nx プラグイン。API、Web サイト、インフラなどのひな形を生成するジェネレーターを提供する |
| ジェネレーター | `pnpm nx g @aws/nx-plugin:<名前>` で実行する、コードのひな形を生成するコマンド |
| tRPC | TypeScript だけで API を定義し、クライアントとサーバーで型を共有できるフレームワーク |
| procedure（プロシージャ） | tRPC における API の1操作。`query`（取得）と `mutation`（更新）がある |
| CDK | AWS Cloud Development Kit。TypeScript で AWS リソースを定義し、CloudFormation 経由でデプロイする |
| Construct | CDK の部品。複数の AWS リソースを1つのクラスにまとめたもの |
| Stage / Stack | CDK のデプロイ単位。Stage は環境（sandbox、prod など）、Stack は CloudFormation のスタックに対応する |
| User Pool | Cognito のユーザーディレクトリ。ログインを担当し、ID トークンを発行する |
| Identity Pool | Cognito の機能。ID トークンを一時的な AWS 認証情報（IAM ロール）に交換する |
| SigV4 | AWS のリクエスト署名方式。IAM 認証の API を呼ぶときに使う |
| Runtime Config | デプロイ時に決まる値（API の URL、Cognito の ID など）を、実行時にアプリへ渡す仕組み |
