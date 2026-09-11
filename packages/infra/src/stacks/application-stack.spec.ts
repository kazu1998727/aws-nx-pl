// @vitest-environment node
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { FeaturePlan } from 'aws-cdk-lib/aws-cognito';
import { describe, expect, it } from 'vitest';
import {
  ApplicationStack,
  ApplicationStackProps,
} from './application-stack.js';

const synth = (props: Omit<ApplicationStackProps, 'env'> = {}) => {
  const app = new App();
  const stack = new ApplicationStack(app, 'Application', {
    env: { region: 'ap-northeast-1' },
    crossRegionReferences: true,
    ...props,
  });
  return { stack, template: Template.fromStack(stack) };
};

describe('ApplicationStack', () => {
  it('uses WAF and the Cognito Plus plan with threat protection by default', () => {
    const { stack, template } = synth();

    // Regional web ACLs for the user pool and the API. The CloudFront web ACL
    // lives in a separate us-east-1 stack.
    template.resourceCountIs('AWS::WAFv2::WebACL', 2);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: { WebACLId: Match.anyValue() },
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTier: 'PLUS',
      UserPoolAddOns: { AdvancedSecurityMode: 'AUDIT' },
    });
    expect(stack.node.findAll().some((c) => c.node.id === 'waf')).toBe(true);
  });

  it('can disable WAF and use the Cognito Essentials plan to reduce cost', () => {
    const { stack, template } = synth({
      enableWaf: false,
      userPoolFeaturePlan: FeaturePlan.ESSENTIALS,
    });

    template.resourceCountIs('AWS::WAFv2::WebACL', 0);
    template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 0);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: { WebACLId: Match.absent() },
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTier: 'ESSENTIALS',
      UserPoolAddOns: Match.absent(),
    });
    expect(stack.node.findAll().some((c) => c.node.id === 'waf')).toBe(false);
  });

  it('always grants authenticated users access to the API', () => {
    const { template } = synth({ enableWaf: false });

    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Policy: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'execute-api:Invoke',
            Principal: {
              AWS: {
                'Fn::GetAtt': [
                  Match.stringLikeRegexp('IdentityPoolAuthenticatedRole'),
                  'Arn',
                ],
              },
            },
          }),
        ]),
      },
    });
  });
});
