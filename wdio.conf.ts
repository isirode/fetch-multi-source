import type { Options } from '@wdio/types';
import viteConfig from './vite.config.ts';// not recognized in vscode but this is the correct import

export const config: Options.Testrunner = {
  runner: ['browser', { viteConfig }],
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 600 * 10000
  },
  capabilities: [{
    browserName: 'chrome'
  }],
  specs: [
    [`./test/**/*spec.ts`]
  ],
  logLevel: 'warn',
}