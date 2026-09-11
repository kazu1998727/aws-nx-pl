import {
  DemoApi,
  DemoWebsite,
  UserIdentity,
} from '@aws-nx-pl/common-constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const userIdentity = new UserIdentity(this, 'UserIdentity');

    const demoApi = new DemoApi(this, 'DemoApi', {
      integrations: DemoApi.defaultIntegrations(this).build(),
    });
    demoApi.grantInvokeAccess(userIdentity.identityPool.authenticatedRole);

    const demoWebsite = new DemoWebsite(this, 'DemoWebsite');
    demoApi.restrictCorsTo(demoWebsite);
  }
}
