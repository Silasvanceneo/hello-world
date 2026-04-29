import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.helloworld.ai',
  appName: 'hello-world',
  webDir: '../web/build',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
};

export default config;
