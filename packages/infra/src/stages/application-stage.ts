import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  ApplicationStack,
  ApplicationStackProps,
} from '../stacks/application-stack.js';

export type ApplicationStageProps = StageProps &
  Pick<ApplicationStackProps, 'enableWaf' | 'userPoolFeaturePlan'>;

/**
 * Defines a collection of CDK Stacks which make up your application
 */
export class ApplicationStage extends Stage {
  constructor(scope: Construct, id: string, props?: ApplicationStageProps) {
    super(scope, id, props);

    new ApplicationStack(this, 'Application', {
      crossRegionReferences: true,
      enableWaf: props?.enableWaf,
      userPoolFeaturePlan: props?.userPoolFeaturePlan,
    });
  }
}
