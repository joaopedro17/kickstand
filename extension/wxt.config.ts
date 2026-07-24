import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Kickstand',
    description: 'Track Kick.com channels, see who\'s live, and browse streams.',
    permissions: ['storage', 'alarms', 'notifications', 'identity', 'tabs'],
    host_permissions: ['https://api.kick.com/*', 'https://id.kick.com/*'],
    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },
    action: {
      default_icon: {
        16: 'icons/16.png',
        32: 'icons/32.png',
        48: 'icons/48.png',
        128: 'icons/128.png',
      },
    },
  },
});
