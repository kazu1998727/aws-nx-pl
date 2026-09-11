# 認証と認可

このアプリでは、次の2段階でアクセスを制御しています。

1. **認証（誰か）:** Cognito User Pool でログインし、ID トークンを受け取る
2. **認可（何ができるか）:** Cognito Identity Pool で ID トークンを IAM ロールの一時認証情報に交換する。その認証情報で API リクエストに SigV4 署名を付け、API Gateway が IAM で検証する

## 登場するリソース

`packages/common/constructs/src/core/user-identity.ts` の `UserIdentity` Construct が、次のリソースをまとめて作ります。

| リソース | 役割 | 主な設定 |
|---|---|---|
| User Pool | ユーザーのディレクトリ | セルフサインアップ無効、MFA 必須（SMS / TOTP）、パスワードは8文字以上で英大小文字・数字・記号が必須、メールアドレスでもログイン可能。機能プランは既定が Plus（脅威保護を監査モードで有効）、sandbox は Essentials |
| User Pool Domain | ログイン画面のドメイン | `nx-pl-demo-website-<AWS アカウント ID>.auth.<リージョン>.amazoncognito.com` |
| User Pool Client | Web サイト用のクライアント | 認可コードフロー、スコープは `email openid profile` |
| Managed Login Branding | ログイン画面のデザイン | Cognito 標準のデザイン |
| Identity Pool | ID トークン → AWS 認証情報の交換 | 認証済みユーザーには「認証済みロール」を割り当てる |
| WAF | User Pool の保護 | AWS マネージドルール。`enableWaf: false` のときは作られない（sandbox） |

ログイン後のリダイレクト先（コールバック URL）には、次の URL が自動的に登録されます。

- `http://localhost:4200`（`vite` 開発サーバー）
- `http://localhost:4300`（`vite preview`）
- `https://<CloudFront のドメイン>`（同じスタック内の CloudFront を自動検出）

## 画面側の処理

### 1. ログイン（`components/CognitoAuth/index.tsx`）

- `runtime-config.json` の `cognitoProps` から、User Pool と Client ID を読み込む
- [`react-oidc-context`](https://github.com/authts/react-oidc-context) で OIDC の認可コードフローを実行する
- 未ログインなら、自動的に Cognito のログイン画面へリダイレクトする（`auth.signinRedirect()`）
- ログインが済むまで、子コンポーネント（アプリ本体）は表示されない

ページのコードからは、`useAuth()` でログイン中のユーザー情報を取得できます。

```tsx
import { useAuth } from 'react-oidc-context';

const { user } = useAuth();
user?.profile.email;       // メールアドレス
user?.profile.given_name;  // 名
```

ログアウト処理は `components/AppLayout/index.tsx` のユーザーメニューに実装されています。

### 2. AWS 認証情報の取得と署名（`hooks/useSigV4.tsx`）

API を呼ぶたびに、次の処理が行われます。

1. ログインで得た ID トークンを Identity Pool に渡す（`fromCognitoIdentityPool`）
2. 認証済みロールの一時認証情報（アクセスキー、シークレット、セッショントークン）を受け取る
3. [`aws4fetch`](https://github.com/mhart/aws4fetch) でリクエストに SigV4 署名を付けて送信する

一時認証情報はメモリにキャッシュされ、有効期限の30秒前になると再取得されます。

### 3. tRPC クライアントへの組み込み（`components/DemoApiClientProvider.tsx`）

- 通常の query / mutation は、`httpLink` の `fetch` に署名付きの `fetch` を渡す
- サブスクリプション（ストリーミング）は、`EventSource` のヘッダーに署名を付ける

ページのコードで署名を意識する必要はありません。`useDemoApi()` を使うだけで、署名付きのリクエストが送られます。

## API 側の処理

### IAM 認証（`constructs/src/app/apis/demo-api.ts`）

- **全メソッドを IAM 認証にする:** `defaultMethodOptions.authorizationType = AuthorizationType.IAM` を指定している
- **リソースポリシー:** 最初は `OPTIONS`（CORS のプリフライト）だけを全員に許可している

### 権限の付与（`infra/src/stacks/application-stack.ts`）

```ts
demoApi.grantInvokeAccess(userIdentity.identityPool.authenticatedRole);
```

この1行で、次の2つが設定されます。

- **API のリソースポリシー:** 認証済みロールに `execute-api:Invoke` を許可する
- **認証済みロールの IAM ポリシー:** この API への `execute-api:Invoke` を許可する

つまり、**Cognito にログインしたユーザーだけが API を呼べます。** 未ログインのユーザーや、他の AWS アカウントからのリクエストは、API Gateway で `403` になります。

### Lambda 内でユーザーを特定する

IAM 認証の場合、API Gateway はリクエストしたユーザーの Identity Pool 上の ID を、イベントの `requestContext.identity` に入れて Lambda に渡します。
procedure の中では `opts.ctx.event` から参照できます。

```ts
export const whoami = publicProcedure.query(({ ctx }) => {
  const identity = ctx.event.requestContext.identity;
  return {
    cognitoIdentityId: identity.cognitoIdentityId,
    // "cognito-idp.<region>.amazonaws.com/<userPoolId>,...:CognitoSignIn:<sub>" の形式
    authProvider: identity.cognitoAuthenticationProvider,
  };
});
```

User Pool のユーザー ID（`sub`）は、`cognitoAuthenticationProvider` の末尾から取り出せます。

## ユーザーの作成

セルフサインアップは無効なので、管理者がユーザーを作成します。

### AWS CLI で作成する

User Pool ID は、デプロイ完了時に表示される Outputs の `...UserPoolId...` で確認できます。

```sh
aws cognito-idp admin-create-user \
  --user-pool-id <User Pool ID> \
  --username <ユーザー名> \
  --user-attributes \
    Name=email,Value=<メールアドレス> \
    Name=email_verified,Value=true \
    Name=given_name,Value=<名> \
    Name=family_name,Value=<姓>
```

`email`、`given_name`、`family_name` は必須属性です。
一時パスワードが指定したメールアドレスに届きます。

### AWS マネジメントコンソールで作成する

Amazon Cognito → ユーザープール → 対象のプール → ユーザー → 「ユーザーを作成」から作成できます。

### 初回ログイン

1. Web サイトを開くと、Cognito のログイン画面に移動する
2. ユーザー名（またはメールアドレス）と一時パスワードでログインする
3. 新しいパスワードを設定する
4. MFA を設定する。**認証アプリ（TOTP）の利用をおすすめします。** SMS を使う場合は、Amazon SNS の SMS 送信設定（サンドボックスの解除など）が別途必要です
5. Web サイトに戻り、ログイン済みの状態になる

## 設定を変更したいとき

`UserIdentity` はプロパティで一部の設定を変更できます。

```ts
import { FeaturePlan, Mfa } from 'aws-cdk-lib/aws-cognito';

new UserIdentity(this, 'UserIdentity', {
  mfa: Mfa.OPTIONAL,                           // MFA を任意にする
  mfaSecondFactor: { sms: false, otp: true },  // TOTP のみにする
  enableWaf: true,                             // WAF を付ける（既定値: true）
  featurePlan: FeaturePlan.ESSENTIALS,         // 機能プラン（既定値: PLUS）
});
```

このアプリでは、`enableWaf` と `featurePlan` を `ApplicationStage` のオプション（`enableWaf`、`userPoolFeaturePlan`）から環境ごとに設定しています。
[infrastructure.md](./infrastructure.md#環境ごとの設定料金とセキュリティ) を参照してください。

機能プランには次の違いがあります。

| プラン | 料金 | 脅威保護 |
|---|---|---|
| Plus | $0.02 / MAU（無料枠なし） | あり（このアプリでは監査モード `AUDIT_ONLY`） |
| Essentials | 10,000 MAU まで無料、超過分は $0.015 / MAU | なし |

Plus 以外のプランでは、脅威保護の設定は自動的に外れます。

セルフサインアップの有効化など、それ以外の変更は `user-identity.ts` を直接編集します。
このファイルはジェネレーターが生成したものなので、変更した箇所がわかるようにコメントを残すことをおすすめします。

## 注意点

- **User Pool は削除されない:** User Pool は削除保護が有効で、`DeletionPolicy: Retain` です。スタックを削除しても残るので、完全に消すには、コンソールで削除保護を無効にしてから手動で削除します
- **Cognito ドメインは一意でなければならない:** ドメインのプレフィックスは全 AWS で一意である必要があります。AWS アカウント ID を含めているので、通常は衝突しません
