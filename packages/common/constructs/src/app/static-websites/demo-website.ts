import * as url from 'url';
import { Construct } from 'constructs';
import { StaticWebsite, StaticWebsiteProps } from '../../core/index.js';

export type DemoWebsiteProps = Omit<
  StaticWebsiteProps,
  'websiteName' | 'websiteFilePath'
>;

export class DemoWebsite extends StaticWebsite {
  constructor(scope: Construct, id: string, props?: DemoWebsiteProps) {
    super(scope, id, {
      ...props,
      websiteName: 'DemoWebsite',
      websiteFilePath: url.fileURLToPath(
        new URL(
          '../../../../../../dist/packages/demo-website/bundle',
          import.meta.url,
        ),
      ),
    });
  }
}
