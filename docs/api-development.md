# API 開発（demo-api）

`packages/demo-api` は [tRPC](https://trpc.io/) で作られた API です。
TypeScript の関数として API を書くと、その型が Web サイト側にも自動で共有されます。

## 基本の考え方

| 概念 | ファイル | 説明 |
|---|---|---|
| スキーマ | `src/schema/*.ts` | 入力と出力の形を [Zod](https://zod.dev/) で定義する。実行時の検証にも使われる |
| procedure | `src/procedures/*.ts` | API の1操作。`query`（取得）か `mutation`（更新）のどちらか |
| ルーター | `src/router.ts` | procedure を名前付きで登録する。ここに登録したものが API として公開される |
| `publicProcedure` | `src/init.ts` | すべての procedure の土台。ログ、トレース、メトリクス、エラー処理のミドルウェアが適用済み |

### デプロイ時の対応関係

CDK（`DemoApi` Construct）は `router.ts` を読み、procedure ごとに API Gateway のパスと Lambda を作ります。

| tRPC | API Gateway | Lambda |
|---|---|---|
| `query` の `echo` | `GET /echo` | `DemoApiechoHandler` |
| `mutation` の `createTodo` | `POST /createTodo` | `DemoApicreateTodoHandler` |
| ネストした `todo.list` | `GET /todo.list` | procedure ごとに1つ |

procedure を追加すると、**インフラのコードを変更しなくても**、次回のデプロイで Lambda と API のパスが自動的に増えます。
すべての Lambda は同じバンドル（`dist/packages/demo-api/bundle`）を使います。

## procedure を追加する手順

例として、メモを作成する `createNote`（mutation）を追加します。

### 1. スキーマを定義する

`src/schema/note.ts` を作成します。

```ts
import { z } from 'zod';

export const CreateNoteInputSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().max(1000),
});

export const NoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
});

export type ICreateNoteInput = z.TypeOf<typeof CreateNoteInputSchema>;
export type INote = z.TypeOf<typeof NoteSchema>;
```

`src/schema/index.ts` に追記して公開します。

```ts
export * from './note.js';
```

### 2. procedure を実装する

`src/procedures/create-note.ts` を作成します。

```ts
import { randomUUID } from 'node:crypto';
import { publicProcedure } from '../init.js';
import { CreateNoteInputSchema, NoteSchema } from '../schema/index.js';

export const createNote = publicProcedure
  .input(CreateNoteInputSchema)
  .output(NoteSchema)
  .mutation(async ({ input, ctx }) => {
    ctx.logger?.info('Creating note', { title: input.title });
    return {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
  });
```

- **入力の検証:** `.input()` に渡したスキーマで、入力が自動的に検証される。不正な入力には `400 BAD_REQUEST` が返る
- **出力の検証:** `.output()` を付けると、返す値も検証される
- **取得系の処理:** データを取得するだけなら、`.mutation()` の代わりに `.query()` を使う

### 3. ルーターに登録する

`src/router.ts` に追加します。

```ts
import { echo } from './procedures/echo.js';
import { createNote } from './procedures/create-note.js';
import { t } from './init.js';

export const router = t.router;

export const appRouter = router({
  echo,
  createNote,
});
```

関連する procedure は、ルーターをネストしてまとめることもできます。

```ts
export const appRouter = router({
  echo,
  note: router({
    create: createNote,
    // list: listNotes,
  }),
});
// 画面からは api.note.create のように呼ぶ
```

### 4. 画面から呼ぶ

[website-development.md](./website-development.md#api-を呼ぶ) を参照してください。
型は自動で共有されるので、画面側の型定義を書く必要はありません。

## コンテキスト（ctx）で使えるもの

procedure の第1引数の `ctx` には、次のものが入っています。

| プロパティ | 内容 |
|---|---|
| `ctx.event` | API Gateway のイベント（ヘッダー、呼び出し元の IAM / Cognito の情報など） |
| `ctx.context` | Lambda のコンテキスト |
| `ctx.logger` | [Powertools Logger](https://docs.powertools.aws.dev/lambda/typescript/latest/core/logger/)。構造化ログを CloudWatch Logs に出力する |
| `ctx.tracer` | [Powertools Tracer](https://docs.powertools.aws.dev/lambda/typescript/latest/core/tracer/)。X-Ray のサブセグメントを作れる |
| `ctx.metrics` | [Powertools Metrics](https://docs.powertools.aws.dev/lambda/typescript/latest/core/metrics/)。CloudWatch にカスタムメトリクスを送る（名前空間は `DemoApi`） |

ローカルサーバー（`local-server.ts`）では、`ctx.event` などは空のオブジェクトになります。
呼び出し元ユーザーの特定方法は [authentication.md](./authentication.md#lambda-内でユーザーを特定する) を参照してください。

## エラーの返し方

想定内のエラーは `TRPCError` で返します。

```ts
import { TRPCError } from '@trpc/server';

throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' });
```

`TRPCError` 以外の例外は、`middleware/error.ts` で `INTERNAL_SERVER_ERROR` に変換されます。
その際、元のエラー内容はクライアントに返さず、ログにだけ出力します。

## ストリーミング（サブスクリプション）

Lambda はレスポンスのストリーミングに対応しています。
`async function*` で値を少しずつ返すと、画面側で順次受け取れます（AI の応答の逐次表示などに使えます）。

```ts
import { z } from 'zod';
import { publicProcedure } from '../init.js';
import { ZodAsyncIterable } from '../schema/z-async-iterable.js';

export const countdown = publicProcedure
  .input(z.object({ from: z.number().int().max(10) }))
  .output(ZodAsyncIterable({ yield: z.number() }))
  .subscription(async function* ({ input }) {
    for (let i = input.from; i >= 0; i--) {
      yield i;
      await new Promise((r) => setTimeout(r, 1000));
    }
  });
```

## ローカルで動かす

```sh
pnpm nx run @aws-nx-pl/demo-api:serve
```

`http://localhost:2022` で tRPC サーバーが起動し、ファイルを変更すると自動で再起動します（`tsx --watch`）。
ローカルサーバーには認証がありません。

query は GET で、入力を URL エンコードした JSON で渡します。

```sh
curl 'http://localhost:2022/echo?input=%7B%22message%22%3A%22hello%22%7D'
# => {"result":{"data":{"message":"hello"}}}
```

mutation は POST で、入力を JSON のボディで渡します。

```sh
curl -X POST http://localhost:2022/createNote \
  -H 'content-type: application/json' \
  -d '{"title":"memo","body":"hello"}'
```

## テストを書く

`src/**/*.spec.ts` に置いたファイルが [Vitest](https://vitest.dev/) で実行されます。
`appRouter.createCaller` を使うと、HTTP を通さずに procedure を直接呼べます。

```ts
// src/procedures/echo.spec.ts
import { describe, expect, it } from 'vitest';
import { appRouter } from '../router.js';

describe('echo', () => {
  it('入力されたメッセージをそのまま返す', async () => {
    const caller = appRouter.createCaller({
      event: {} as any,
      context: {} as any,
      info: {} as any,
    });
    await expect(caller.echo({ message: 'hello' })).resolves.toEqual({
      message: 'hello',
    });
  });
});
```

```sh
pnpm nx test @aws-nx-pl/demo-api
```

## Node.js から呼ぶ（スクリプトやほかのサービスから）

`src/client/index.ts` に、SigV4 署名付きのクライアントがあります。
実行環境の AWS 認証情報（`fromNodeProviderChain`）を使います。

```ts
import { createDemoApiClient } from '@aws-nx-pl/demo-api';

const client = createDemoApiClient({ url: 'https://xxxx.execute-api.ap-northeast-1.amazonaws.com/prod/' });
const res = await client.echo.query({ message: 'hello' });
```

ただし、API のリソースポリシーは Cognito の認証済みロールにしか呼び出しを許可していません。
ほかの IAM ロールから呼ぶ場合は、`application-stack.ts` で `demoApi.grantInvokeAccess(<ロール>)` を追加します。

## Lambda の設定を変える

メモリやタイムアウトは `application-stack.ts` で変更できます。
変更は、すべての procedure にまとめて適用することも、procedure ごとに適用することもできます。

```ts
import { Duration } from 'aws-cdk-lib';

const demoApi = new DemoApi(this, 'DemoApi', {
  integrations: DemoApi.defaultIntegrations(this)
    // すべての procedure の Lambda に適用
    .withDefaultOptions({ memorySize: 512 })
    // 特定の procedure の Lambda だけに適用
    .withOperationOptions({ echo: { timeout: Duration.seconds(60) } })
    .build(),
});
```

`withOverrides()` を使うと、特定の procedure の統合（Lambda 以外の実装など）をまるごと差し替えることもできます。

DynamoDB などへのアクセス権は、Lambda に付与します。

```ts
table.grantReadWriteData(demoApi.integrations.createNote.handler);
```

データベースが必要な場合は、`ts#dynamodb` / `ts#rdb` ジェネレーターと `connection` ジェネレーターを使えます。
