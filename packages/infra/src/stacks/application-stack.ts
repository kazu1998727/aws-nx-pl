import {
  DemoApi,
  DemoWebsite,
  suppressRules,
  UserIdentity,
} from '@aws-nx-pl/common-constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { FeaturePlan } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface ApplicationStackProps extends StackProps {
  /**
   * Whether to protect the Cognito user pool, the API and the website with AWS WAF.
   * Each web ACL costs a fixed monthly fee, so this can be disabled for development environments.
   *
   * @default true
   */
  readonly enableWaf?: boolean;

  /**
   * The Cognito user pool feature plan. Plus adds threat protection but has no free tier,
   * whereas Essentials is free for up to 10,000 monthly active users.
   *
   * @default FeaturePlan.PLUS
   */
  readonly userPoolFeaturePlan?: FeaturePlan;
}

export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: ApplicationStackProps) {
    super(scope, id, props);

    const enableWaf = props?.enableWaf ?? true;

    const userIdentity = new UserIdentity(this, 'UserIdentity', {
      enableWaf,
      featurePlan: props?.userPoolFeaturePlan,
    });

    const demoApi = new DemoApi(this, 'DemoApi', {
      integrations: DemoApi.defaultIntegrations(this).build(),
      enableWaf,
    });
    demoApi.grantInvokeAccess(userIdentity.identityPool.authenticatedRole);

    const demoWebsite = new DemoWebsite(this, 'DemoWebsite', { enableWaf });
    demoApi.restrictCorsTo(demoWebsite);

    if (!enableWaf) {
      suppressRules(
        demoWebsite.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF is intentionally disabled for this environment to reduce cost',
      );
    }
  }
}
