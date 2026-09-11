# 開発の流れ

## セットアップ

| 必要なもの | バージョンの目安 |
|---|---|
| Node.js | 24 系（Lambda のランタイムも Node.js 24） |
| pnpm | 11 系 |
| AWS CLI | v2（デプロイ、`load-runtime-config` で使用） |
| uv | Checkov の実行（`infra:build`）で使用 |

```sh
pnpm install
```

`pnpm install` の実行時に、Git フック（husky）も設定されます。
コミット時には [git-secrets](https://github.com/awslabs/git-secrets) が実行され、AWS の認証情報などが含まれていないかチェックされます。

## ローカル開発

ローカル開発には、Cognito を使わない方法（A）と、デプロイ済みの Cognito を使う方法（B）があります。

### A. AWS なしで開発する（おすすめ）

```sh
pnpm nx run @aws-nx-pl/demo-website:dev
```

次の2つが同時に起動します。

| サーバー | URL | 内容 |
|---|---|---|
| Vite 開発サーバー | http://localhost:4200 | Web サイト（`--mode local-dev`）。ファイルを保存すると即座に反映される |
| tRPC ローカルサーバー | http://localhost:2022 | demo-api（`tsx --watch`）。ファイルを保存すると自動で再起動する |

この方法では、`runtime-config.json` が存在しないため、画面は次のように動きます。

- **ログインしない:** `cognitoProps` がないので、ログインを省略してそのまま表示する（`CognitoAuth`）
- **署名しない:** リクエストに SigV4 署名を付けない（`useSigV4`）
- **ローカル API を使う:** API の URL は `http://localhost:2022/` に差し替えられる（`RuntimeConfigProvider` の `applyOverrides`）

AWS の認証情報なしで、画面と API の開発を進められます。
ただし、ログインユーザーの情報（`useAuth().user`）は空になります。

### B. 本物の Cognito でログインして開発する

一度デプロイしたあと、デプロイ済みの `runtime-config.json` を手元にダウンロードします。

```sh
pnpm nx run @aws-nx-pl/demo-website:load-runtime-config
pnpm nx run @aws-nx-pl/demo-website:dev
```

`load-runtime-config` は、`aws-nx-pl-` で始まる CloudFormation スタックから Web サイトのバケット名を探します。
そのバケットの `runtime-config.json` を `packages/demo-website/public/runtime-config.json` に保存します。
このファイルは `.gitignore` の対象です。

この方法では、次のように動きます。

- **本物のログイン:** Cognito のログイン画面が表示される（コールバック URL に `http://localhost:4200` が登録済み）
- **署名して送る:** リクエストには SigV4 署名が付く
- **API はローカルのまま:** local-dev モードの `applyOverrides` により、API の URL は引き続き `http://localhost:2022/` になる

デプロイ済みの API を画面から直接呼びたい場合は、`src/components/RuntimeConfig/index.tsx` の `applyOverrides` の差し替えを外します。
ただし、API の CORS は CloudFront のドメインに限定されているので、`localhost` からのリクエストはブラウザでブロックされます。
[architecture.md](./architecture.md#セキュリティ上のポイント) を参照してください。

### API だけを起動する

```sh
pnpm nx run @aws-nx-pl/demo-api:serve
```

## よく使うコマンド

プロジェクト名は `@aws-nx-pl/<名前>` の形式です（`pnpm nx show projects` で一覧を表示できます）。

| コマンド | 内容 |
|---|---|
| `pnpm nx run @aws-nx-pl/demo-website:dev` | ローカル開発サーバー（Web + API）を起動する |
| `pnpm nx test <プロジェクト>` | テストを実行する |
| `pnpm nx lint <プロジェクト>` | Lint を実行する（Biome） |
| `pnpm nx typecheck <プロジェクト>` | 型チェックを実行する |
| `pnpm nx build <プロジェクト>` | Lint、コンパイル、テスト、バンドルをまとめて実行する |
| `pnpm lint` | 全プロジェクトの Lint を自動修正付きで実行する |
| `pnpm test` | 全プロジェクトのテストを実行する |
| `pnpm build:all` | 全プロジェクトをビルドする（Checkov を含む） |
| `pnpm build:skip-lint` | Lint を省略してビルドする |
| `pnpm nx affected -t build` | 変更の影響を受けるプロジェクトだけビルドする |
| `pnpm nx sync` | TypeScript のプロジェクト参照（`tsconfig.json` の `references`）を更新する |
| `pnpm nx graph` | プロジェクトの依存関係をブラウザで表示する |
| `pnpm nx reset` | Nx のキャッシュとデーモンをリセットする |

Nx はタスクの結果をキャッシュします。
入力が変わっていなければ、2回目以降の実行は一瞬で終わります。

### ビルド成果物（`dist/`）

| パス | 内容 |
|---|---|
| `dist/packages/demo-api/bundle` | Lambda にデプロイされる API のバンドル |
| `dist/packages/demo-website/bundle` | S3 にデプロイされる Web サイト |
| `dist/packages/infra/cdk.out` | 合成された CloudFormation テンプレート |
| `dist/packages/*/test-output` | テストのカバレッジなど |

## 典型的な開発サイクル

1. **API を追加する:** `demo-api` にスキーマと procedure を追加する（[api-development.md](./api-development.md)）
2. **画面を作る:** `demo-website` にページを追加し、`useDemoApi()` で呼ぶ（[website-development.md](./website-development.md)）
3. **ローカルで確認する:** `pnpm nx run @aws-nx-pl/demo-website:dev`
4. **テストを書く:** `pnpm nx test @aws-nx-pl/demo-api`
5. **全体をチェックする:** `pnpm nx run-many -t lint typecheck test`
6. **テンプレートを確認する:** `pnpm nx run @aws-nx-pl/infra:synth`
7. **デプロイして確認する:** `pnpm nx run @aws-nx-pl/infra:deploy-sandbox`

## ジェネレーターを使う

`@aws/nx-plugin` のジェネレーターで、新しいプロジェクトや機能を追加できます。
使えるジェネレーターの一覧はルートの [README.md](../README.md#使えるジェネレーター) を参照してください。

```sh
# 対話形式で実行する
pnpm nx g @aws/nx-plugin:ts#api

# 生成される内容を事前に確認する（ファイルは作られない）
pnpm nx g @aws/nx-plugin:ts#api --name=other-api --dry-run
```

ジェネレーターは `packages/common/constructs` なども更新します。
実行前に変更をコミットしておくと、差分を確認しやすくなります。

## トラブルシューティング

### 画面に「Runtime config configuration error」と表示される

`runtime-config.json` に `cognitoProps` がありません。

- **ローカルの場合:** `--mode local-dev`（`dev` タスク）で起動しているか確認する。`vite preview` などでは local-dev モードにならない
- **デプロイ後の場合:** `https://<CloudFront のドメイン>/runtime-config.json` を開き、中身を確認する

### ログイン後に「Error contacting Cognito」と表示される

`runtime-config.json` の値が古い可能性があります。
環境を作り直した場合は、`load-runtime-config` を再実行してください。

### ログイン画面で redirect_uri のエラーになる

アクセスしている URL が、User Pool Client のコールバック URL に登録されていません。
ローカルでは `http://localhost:4200` か `http://localhost:4300` を使ってください（`127.0.0.1` は登録されていません）。

### API が 403 Forbidden を返す

- **ログインしているか:** ログインしていない、または署名が付いていない
- **権限が付いているか:** `application-stack.ts` の `grantInvokeAccess` が消えていないか確認する
- **認証情報が古くないか:** 環境を作り直した場合、ブラウザに古い認証情報が残っていることがある。ログアウトしてからログインし直す

### API の呼び出しが CORS エラーになる

- **localhost から呼んでいないか:** `localhost` から**デプロイ済みの** API を呼んでいないか確認する（上記「B」を参照）
- **カスタムドメインが許可リストにあるか:** カスタムドメインを使う場合は、`restrictCorsTo` にそのドメインが含まれているか確認する

### API が 500 を返す

Lambda のログを確認します。
Lambda は procedure ごとに分かれていて、関数名には `DemoApi<procedure 名>Handler` が含まれます。

```sh
aws logs tail /aws/lambda/<関数名> --follow
```

X-Ray のトレースも有効です（CloudWatch コンソール →「トレース」）。

### `synth` で `Cannot find asset` のようなエラーになる

`dist/packages/demo-api/bundle` または `dist/packages/demo-website/bundle` がありません。
`infra` の `synth` / `deploy` タスクは、依存プロジェクトのビルドを自動で先に実行します。
`cdk` コマンドを直接実行した場合に起こりやすいので、Nx のタスク経由で実行してください。

### 型が合わない、import が解決できない

```sh
pnpm nx sync
pnpm install
```

それでも直らない場合は `pnpm nx reset` でキャッシュをリセットします。
