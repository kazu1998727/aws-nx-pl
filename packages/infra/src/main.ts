import { ApplicationStage } from './stages/application-stage.js';
import { App } from '@aws-nx-pl/common-constructs';
import { FeaturePlan } from 'aws-cdk-lib/aws-cognito';

const app = new App();

// Use this to deploy your own sandbox environment (assumes your CLI credentials)
new ApplicationStage(app, 'aws-nx-pl-infra-sandbox', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  // Keep the sandbox cheap: skip the fixed monthly WAF fees and use the
  // Cognito Essentials plan (free up to 10,000 MAU) instead of Plus.
  enableWaf: false,
  userPoolFeaturePlan: FeaturePlan.ESSENTIALS,
});

// Define other instances of stages, such as beta and prod, below.
// These use the secure defaults (WAF enabled, Cognito Plus plan) unless overridden.

app.synth();
