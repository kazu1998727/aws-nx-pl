# インフラストラクチャ（infra）

`packages/infra` は [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html) のアプリです。
`packages/common/constructs` の部品を組み合わせて、AWS 上にアプリ全体を構築します。

## 構成

```
App（src/main.ts）
└── Stage: aws-nx-pl-infra-sandbox（src/stages/application-stage.ts）
    ├── Stack: Application（src/stacks/application-stack.ts）      … デプロイ先リージョン
    │   ├── UserIdentity   … Cognito
    │   ├── DemoApi        … API Gateway + Lambda
    │   ├── DemoWebsite    … CloudFront + S3
    │   └── RuntimeConfig  … AppConfig と runtime-config.json（自動で追加される）
    └── Stack: Application/DemoWebsite/waf                          … us-east-1（CloudFront 用 WAF。WAF 有効時のみ）
```

CloudFormation 上のスタック名は `aws-nx-pl-infra-sandbox-Application` です。
sandbox 環境は WAF を無効にしているので、us-east-1 の WAF スタックは作られません（[環境ごとの設定](#環境ごとの設定料金とセキュリティ) 参照）。

### src/main.ts

CDK アプリの起点です。環境（Stage）ごとに `ApplicationStage` を作ります。
初期状態では、手元の AWS CLI の認証情報を使う `sandbox` 環境だけが定義されています。

```ts
new ApplicationStage(app, 'aws-nx-pl-infra-sandbox', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,  // 手元の認証情報のアカウント
    region: process.env.CDK_DEFAULT_REGION,    // 手元の設定のリージョン
  },
  // 開発用なので料金を抑える設定にしている
  enableWaf: false,
  userPoolFeaturePlan: FeaturePlan.ESSENTIALS,
});
```

本番環境などを追加するときは、ここに Stage を増やします。
`enableWaf` と `userPoolFeaturePlan` を省略すると、安全側の既定値（WAF 有効、Cognito Plus プラン）になります。

```ts
new ApplicationStage(app, 'aws-nx-pl-infra-prod', {
  env: { account: '<本番の AWS アカウント ID>', region: 'ap-northeast-1' },
});
```

## 環境ごとの設定（料金とセキュリティ）

`ApplicationStage` には、料金とセキュリティのバランスを決める2つのオプションがあります。

| オプション | 既定値 | sandbox の設定 | 説明 |
|---|---|---|---|
| `enableWaf` | `true` | `false` | Cognito User Pool、API Gateway、CloudFront の3か所に WAF を付けるか |
| `userPoolFeaturePlan` | `FeaturePlan.PLUS` | `FeaturePlan.ESSENTIALS` | Cognito User Pool の機能プラン |

### 料金の違い

2026年9月時点の料金です（東京リージョンで試算）。最新の料金は各サービスの料金ページで確認してください。

| 項目 | 既定値（本番向け） | sandbox |
|---|---|---|
| WAF | Web ACL 3つ × （$5 + マネージドルール2つ × $1）= **月 $21**、ほかに $0.60 / 100万リクエスト | **$0** |
| Cognito | **$0.02 / MAU**（Plus プランには無料枠がない） | 10,000 MAU まで **$0**、超過分は $0.015 / MAU |
| KMS キー | 3つ（月 $3〜） | 2つ（月 $2〜。WAF ログ用のキーが作られないため） |
| 使っていないときの固定費の目安 | **月 $25 前後** | **月 $2〜3 程度** |

どちらの設定でも、API Gateway、Lambda、CloudWatch Logs などは利用量に応じて課金されます。

### セキュリティ上の違い

sandbox の設定では、次の保護がなくなります。**本番環境では既定値を使ってください。**

- **WAF がない:** 一般的な攻撃パターン（Common Rule Set）や既知の悪意ある入力（Known Bad Inputs）がブロックされない。WAF がない状態でも API は IAM 認証で保護されている
- **脅威保護がない:** Cognito の脅威保護（不審なサインインの検知など）は Plus プラン限定の機能で、Essentials では使えない

Checkov は「CloudFront に WAF が付いていない」（`CKV_AWS_68`）を検出します。
`enableWaf: false` のときだけ、理由を付けてこのルールを抑制しています（`application-stack.ts`）。

### 既存の環境で設定を変えるとき

- **Cognito のプランの切り替え:** 既存の User Pool のままプランを切り替えられる（User Pool が作り直されることはない）
- **WAF の有効化・無効化:** 再デプロイで Web ACL が作成・削除される。WAF を有効にする場合は、us-east-1 のブートストラップが必要（下記参照）

### src/stacks/application-stack.ts

作るリソースを組み立てるファイルです。**インフラを変更するときは、主にここを編集します。**

```ts
export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: ApplicationStackProps) {
    super(scope, id, props);

    const enableWaf = props?.enableWaf ?? true;

    // Cognito（User Pool + Identity Pool）
    const userIdentity = new UserIdentity(this, 'UserIdentity', {
      enableWaf,
      featurePlan: props?.userPoolFeaturePlan,
    });

    // tRPC API。procedure ごとに Lambda を作る
    const demoApi = new DemoApi(this, 'DemoApi', {
      integrations: DemoApi.defaultIntegrations(this).build(),
      enableWaf,
    });
    // ログイン済みユーザーのロールに API の呼び出しを許可
    demoApi.grantInvokeAccess(userIdentity.identityPool.authenticatedRole);

    // Web サイト（CloudFront + S3）
    const demoWebsite = new DemoWebsite(this, 'DemoWebsite', { enableWaf });
    // CORS をこの Web サイトのドメインに限定
    demoApi.restrictCorsTo(demoWebsite);

    // WAF を意図的に無効にした環境では、Checkov の WAF チェックを抑制する
    if (!enableWaf) {
      suppressRules(demoWebsite.cloudFrontDistribution, ['CKV_AWS_68'], '...');
    }
  }
}
```

スタックの内容は `src/stacks/application-stack.spec.ts` のテストで確認しています。
既定値と sandbox の設定のそれぞれで WAF と Cognito のプランが正しく反映されること、ログイン済みユーザーに API の呼び出しが許可されていることをテストしています。

## デプロイの前提

| 必要なもの | 用途 |
|---|---|
| AWS アカウントと認証情報 | `aws configure` や `aws sso login` などで設定しておく |
| AWS CLI | `load-runtime-config` タスクや、ユーザー作成で使う |
| Docker | 現在の構成では不要。コンテナを使うジェネレーターを追加したときに必要になる |
| [uv](https://docs.astral.sh/uv/) | `infra:build` に含まれる Checkov の実行に使う（`uvx`） |

デプロイ先のアカウントとリージョンは、実行時の AWS 認証情報と設定で決まります。

```sh
aws sts get-caller-identity   # アカウントを確認
aws configure get region      # リージョンを確認
```

## デプロイ手順

### 1. CDK のブートストラップ（アカウントとリージョンごとに初回のみ）

`cdk bootstrap` は CDK アプリを合成してから実行されるので、先に一度 `synth` してバンドルを作っておきます。

```sh
pnpm nx run @aws-nx-pl/infra:synth
pnpm nx run @aws-nx-pl/infra:bootstrap
```

WAF を有効にした環境では、CloudFront 用の WAF スタックが us-east-1 にデプロイされるため、us-east-1 のブートストラップも必要です（sandbox は WAF 無効なので不要）。
環境を指定しない `cdk bootstrap` は、アプリが使うすべての環境（メインのリージョンと us-east-1）をまとめてブートストラップします。
デプロイ時に us-east-1 がブートストラップされていないというエラーが出た場合は、明示的に指定します。

```sh
pnpm nx run @aws-nx-pl/infra:cdk bootstrap aws://<アカウントID>/us-east-1
```

### 2. デプロイ

```sh
pnpm nx run @aws-nx-pl/infra:deploy-sandbox
```

このコマンドは、次の処理を順番に行います。

1. `demo-api` を Lambda 用にバンドルする（`dist/packages/demo-api/bundle`）
2. `demo-website` をビルドする（`dist/packages/demo-website/bundle`）
3. `infra` をコンパイルする
4. `cdk deploy "aws-nx-pl-infra-sandbox/**"` を実行する（承認プロンプトなし）

初回は CloudFront ディストリビューションの作成があるため、完了までしばらく時間がかかります。

特定の Stage やスタックだけをデプロイするときは、`deploy` を使います。

```sh
pnpm nx run @aws-nx-pl/infra:deploy 'aws-nx-pl-infra-sandbox/*'
```

### 3. デプロイ結果の確認

完了すると Outputs が表示されます（論理 ID の末尾にはハッシュが付きます）。

| Output（の一部） | 内容 |
|---|---|
| `DemoWebsiteDistributionDomainName...` | Web サイトの URL（`https://` を付けて開く） |
| `DemoApiEndpoint...` | API のエンドポイント |
| `UserIdentity...UserPoolId...` | User Pool ID（ユーザー作成に使う） |
| `UserIdentity...UserPoolClientId...` | User Pool Client ID |
| `UserIdentity...IdentityPoolId...` | Identity Pool ID |
| `DemoWebsite...WebsiteBucketName...` | Web サイトの S3 バケット名 |
| `RuntimeConfigApplicationId` | AppConfig のアプリケーション ID |

あとから確認するときは、次のコマンドを使います。

```sh
aws cloudformation describe-stacks \
  --stack-name aws-nx-pl-infra-sandbox-Application \
  --query 'Stacks[0].Outputs' --output table
```

### 4. ユーザーを作成してログインする

[authentication.md](./authentication.md#ユーザーの作成) を参照してください。

## よく使うタスク

| コマンド | 内容 |
|---|---|
| `pnpm nx run @aws-nx-pl/infra:synth` | CloudFormation テンプレートを生成する（`dist/packages/infra/cdk.out`）。AWS には何も作らない |
| `pnpm nx run @aws-nx-pl/infra:deploy-sandbox` | sandbox 環境にデプロイする |
| `pnpm nx run @aws-nx-pl/infra:destroy-sandbox` | sandbox 環境を削除する |
| `pnpm nx run @aws-nx-pl/infra:cdk diff` | デプロイ済みの環境との差分を表示する |
| `pnpm nx run @aws-nx-pl/infra:cdk <任意のコマンド>` | 任意の `cdk` コマンドを実行する |
| `pnpm nx run @aws-nx-pl/infra:checkov` | 合成したテンプレートをセキュリティスキャンする |
| `pnpm nx run @aws-nx-pl/infra:build` | Lint、コンパイル、テスト、synth、Checkov をまとめて実行する |
| `pnpm nx run @aws-nx-pl/infra:deploy-ci` | ビルド済みの `cdk.out` をそのままデプロイする（CI 用） |

## 環境の削除

```sh
pnpm nx run @aws-nx-pl/infra:destroy-sandbox
```

テンプレートで `DeletionPolicy: Retain` が指定されているため、削除後も次のリソースは残ります。

| リソース | 後始末の方法 |
|---|---|
| Cognito User Pool（と SMS 用 IAM ロール） | 削除保護も有効。コンソールで削除保護を無効にしてから削除する |
| KMS キー（API ログ用、Web サイト用。WAF 有効時は User Pool の WAF ログ用も） | KMS コンソールで削除をスケジュールする（最短7日後に削除）。残っている間は1つあたり月 $1 以上かかる |
| API Gateway のアクセスロググループ | CloudWatch Logs コンソールで削除する |
| API Gateway の CloudWatch 用 IAM ロール | アカウント共通の設定。ほかの API Gateway が使っている可能性があるので、通常は残してよい |
| CDK のブートストラップ用リソース（`CDKToolkit` スタック） | ほかの CDK アプリでも使うので、通常は残してよい |

Web サイトの S3 バケット（中身も含む）と、そのほかのロググループは自動で削除されます。

同じアカウントに再デプロイしても問題ありません。
残ったリソースとは別に、新しいリソースが作られます。

## Checkov（セキュリティスキャン）

`infra:build` では、合成したテンプレートを [Checkov](https://www.checkov.io/) でスキャンします。
違反があるとビルドが失敗します。

意図的に許容するルールは、コードで抑制します。

```ts
import { suppressRules } from '@aws-nx-pl/common-constructs';

suppressRules(someConstruct, ['CKV_AWS_XXX'], '許容する理由');
```

全体の設定は `packages/infra/checkov.yml` にあります。

## リソースを追加する

### ジェネレーターを使う

`@aws/nx-plugin` のジェネレーターで作ったプロジェクト（DynamoDB、別の API など）は、`common/constructs` に Construct が追加されます。
`application-stack.ts` でインスタンス化すればデプロイされます。

```sh
pnpm nx g @aws/nx-plugin:ts#dynamodb
pnpm nx g @aws/nx-plugin:connection   # API とテーブルなどを接続する
```

### CDK の標準 Construct を使う

`application-stack.ts` に直接書くこともできます。

```ts
import { Bucket } from 'aws-cdk-lib/aws-s3';

const uploads = new Bucket(this, 'Uploads', { enforceSSL: true });
uploads.grantReadWrite(demoApi.integrations.echo.handler);
```

API の Lambda から使う値（テーブル名など）は、RuntimeConfig に登録して渡すことができます。

```ts
import { RuntimeConfig } from '@aws-nx-pl/common-constructs';

RuntimeConfig.ensure(this).set('connection', 'uploadsBucket', uploads.bucketName);
```

`connection` 名前空間に入れた値は `runtime-config.json` にも含まれ、ブラウザにも公開されます。
秘密情報は入れないでください。

## カスタムドメインを使う

`DemoWebsite` には `domainNames` と `certificate` を渡せます。
CloudFront の証明書は us-east-1 の ACM で発行したものが必要です。

```ts
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';

new DemoWebsite(this, 'DemoWebsite', {
  domainNames: ['app.example.com'],
  certificate: Certificate.fromCertificateArn(this, 'Cert', '<us-east-1 の証明書 ARN>'),
});
```

カスタムドメインは、Cognito のコールバック URL と API の CORS 許可リストにも自動で追加されます。
