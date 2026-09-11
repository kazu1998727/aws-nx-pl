# @aws-nx-pl/demo-website
This library was generated with [@aws/nx-plugin](https://github.com/awslabs/nx-plugin-for-aws/).

## Building

Run `pnpm nx build @aws-nx-pl/demo-website [--skip-nx-cache]` to build the application.

## Run dev server

Run `pnpm nx serve @aws-nx-pl/demo-website`

## Running unit tests

Run `pnpm nx test @aws-nx-pl/demo-website` to execute the unit tests via Vitest.

### Updating snapshots

To update snapshots, run the following command:

`pnpm nx test @aws-nx-pl/demo-website --configuration=update-snapshot`

## Run lint

Run `pnpm nx lint @aws-nx-pl/demo-website`

### Fixable issues

You can also automatically fix some lint errors by running the following command:

`pnpm nx lint @aws-nx-pl/demo-website --configuration=fix`

### Runtime config

In order to integrate with cognito or trpc backends, you need to have a `runtime-config.json` file in your `/public` website directory. You can fetch this is follows:

`pnpm nx load-runtime-config @aws-nx-pl/demo-website`

> [!IMPORTANT]
> Ensure you have AWS CLI and curl installed
> You have deployed your CDK infrastructure into the appropriate account
> You have assumed a role in the AWS account with sufficient permissions to call describe-stacks from cloudformation

## Useful links

- [React website reference docs](TODO)
- [Learn more about NX](https://nx.dev/getting-started/intro)
