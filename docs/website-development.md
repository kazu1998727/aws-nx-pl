# Web サイト開発（demo-website）

`packages/demo-website` は React の SPA です。主な技術は次のとおりです。

| 分類 | 技術 |
|---|---|
| ビルド | [Vite](https://vite.dev/) |
| ルーティング | [TanStack Router](https://tanstack.com/router)（ファイルベース、型安全） |
| データ取得 | [TanStack Query](https://tanstack.com/query) + [tRPC](https://trpc.io/docs/client/tanstack-react-query/usage) |
| 認証 | [react-oidc-context](https://github.com/authts/react-oidc-context)（Cognito） |
| UI | [shadcn/ui](https://ui.shadcn.com/)（`packages/common/shadcn`）+ [Tailwind CSS](https://tailwindcss.com/) v4 |
| アイコン | [lucide-react](https://lucide.dev/) |

## 起動の流れ（`src/main.tsx`）

`main.tsx` では、Provider を入れ子にしてアプリを起動します。
外側の Provider の準備が終わってから、内側が動き始めます。

```tsx
<RuntimeConfigProvider>        // ① /runtime-config.json を読み込む
  <CognitoAuth>                // ② 未ログインなら Cognito のログイン画面へ
    <QueryClientProvider>      // ③ TanStack Query（API 結果のキャッシュ）
      <DemoApiClientProvider>  // ④ demo-api 用の tRPC クライアント（SigV4 署名付き）
        <App />                // ⑤ TanStack Router → src/routes/ の各ページ
      </DemoApiClientProvider>
    </QueryClientProvider>
  </CognitoAuth>
</RuntimeConfigProvider>
```

| 順番 | コンポーネント | 役割 | 準備中の表示 |
|---|---|---|---|
| ① | `RuntimeConfigProvider` | API の URL と Cognito の設定を取得する | スピナー |
| ② | `CognitoAuth` | ログイン状態を確認し、必要ならリダイレクトする | スピナー（エラー時は警告） |
| ③ | `QueryClientProvider` | API 呼び出しの結果をキャッシュする。開発時は画面の隅に DevTools が表示される | なし |
| ④ | `DemoApiClientProvider` | `useDemoApi()` で使う tRPC クライアントを用意する | なし |
| ⑤ | `App` | ルーターに `auth` と `runtimeConfig` を渡し、ページを表示する | なし |

ルーターの context に `auth` と `runtimeConfig` を渡しているので、ルート定義の `beforeLoad` などからも参照できます。

## ページを追加する

`src/routes/` にファイルを置くと、そのファイル名がそのまま URL になります。
`src/routeTree.gen.ts` は開発サーバーやビルドの実行時に自動生成されるので、手で編集しないでください。

| ファイル | URL |
|---|---|
| `routes/index.tsx` | `/` |
| `routes/notes.tsx` | `/notes` |
| `routes/notes/$noteId.tsx` | `/notes/123`（`$noteId` はパラメーター） |
| `routes/__root.tsx` | 全ページ共通のレイアウト（`AppLayout`） |

`_` で始まるファイル名は、URL に現れないレイアウト用のルートとして扱われます（[TanStack Router のドキュメント](https://tanstack.com/router/latest/docs/framework/react/routing/file-naming-conventions)）。

`src/routes/notes.tsx` の例です。

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/notes')({
  component: NotesPage,
});

function NotesPage() {
  return <h1 className="text-2xl font-bold">Notes</h1>;
}
```

`createFileRoute` の引数（`'/notes'`）はファイルの場所と一致している必要があります。
開発サーバーを起動していれば、空のファイルを作るだけで自動的に書き込まれます。

### サイドバーにリンクを追加する

`src/components/app-sidebar.tsx` の `navItems` に追加します。

```tsx
import { Home, NotebookPen } from 'lucide-react';

const navItems = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Notes', to: '/notes', icon: NotebookPen },
];
```

`to` にはルートとして存在するパスしか指定できません（型でチェックされます）。

## API を呼ぶ

`useDemoApi()` が返すオブジェクトから、TanStack Query 用のオプションを作って使います。
API の入力と出力の型は、`demo-api` の定義から自動で付きます。

### データを取得する（query）

```tsx
import { useQuery } from '@tanstack/react-query';
import { useDemoApi } from '../hooks/useDemoApi';

function EchoMessage({ message }: { message: string }) {
  const api = useDemoApi();
  const echo = useQuery(api.echo.queryOptions({ message }));

  if (echo.isPending) return <p>読み込み中...</p>;
  if (echo.isError) return <p>エラー: {echo.error.message}</p>;
  return <p>{echo.data.message}</p>;
}
```

### データを更新する（mutation）

[api-development.md](./api-development.md) の例の `createNote` を呼ぶ場合です。

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDemoApi } from '../hooks/useDemoApi';

function CreateNoteButton() {
  const api = useDemoApi();
  const queryClient = useQueryClient();
  const createNote = useMutation(
    api.createNote.mutationOptions({
      onSuccess: () => {
        // 一覧のキャッシュを破棄して再取得させる
        queryClient.invalidateQueries({ queryKey: api.listNotes.queryKey() });
      },
    }),
  );

  return (
    <button
      disabled={createNote.isPending}
      onClick={() => createNote.mutate({ title: 'memo', body: 'hello' })}
    >
      作成
    </button>
  );
}
```

### React Query を使わずに直接呼ぶ

イベントハンドラーの中などで直接呼びたい場合は、`useDemoApiClient()` を使います。

```tsx
import { useDemoApiClient } from '../hooks/useDemoApi';

const client = useDemoApiClient();
const result = await client.echo.query({ message: 'hello' });
```

### ストリーミング（サブスクリプション）を受け取る

```tsx
import { useSubscription } from '@trpc/tanstack-react-query';

const api = useDemoApi();
const sub = useSubscription(
  api.countdown.subscriptionOptions({ from: 5 }, {
    onData: (n) => console.log(n),
  }),
);
```

## ログイン情報を使う

```tsx
import { useAuth } from 'react-oidc-context';

const { user } = useAuth();
const username = user?.profile['cognito:username'];
const email = user?.profile.email;
```

詳しくは [authentication.md](./authentication.md) を参照してください。

## Runtime Config を使う

```tsx
import { useRuntimeConfig } from '../hooks/useRuntimeConfig';

const { apis, cognitoProps } = useRuntimeConfig();
```

`runtime-config.json` はデプロイ時に自動生成され、S3 に置かれます。
ローカル開発時の扱いは [development-workflow.md](./development-workflow.md#ローカル開発) を参照してください。

## UI コンポーネント

### shadcn/ui

共通の UI コンポーネントは `packages/common/shadcn` にあります。

```tsx
import { Button } from '@aws-nx-pl/common-shadcn/components/ui/button';
import { Input } from '@aws-nx-pl/common-shadcn/components/ui/input';
import { Card } from '@aws-nx-pl/common-shadcn/components/ui/card';
```

現在あるコンポーネントは次のとおりです。
`alert`、`avatar`、`breadcrumb`、`button`、`card`、`input`、`separator`、`sheet`、`sidebar`、`skeleton`、`spinner`、`textarea`、`tooltip`

新しいコンポーネントを追加するときは、`packages/common/shadcn` で次を実行します。

```sh
cd packages/common/shadcn
pnpm dlx shadcn@latest add dialog
```

### スタイル

Tailwind CSS のクラスをそのまま使えます。
全体のテーマ（色など）は `packages/common/shadcn/src/styles/globals.css` で定義しています。

### アプリ名とロゴ

`src/config.ts` の `applicationName` と `logo` を変更すると、ヘッダーとサイドバーに反映されます。

## テストを書く

`src/**/*.spec.tsx` に置いたファイルが Vitest（jsdom 環境）で実行されます。

```sh
pnpm nx test @aws-nx-pl/demo-website
```
