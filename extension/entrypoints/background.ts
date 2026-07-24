const POLL_ALARM = 'kickstand-poll';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) {
      console.log('[kickstand] poll alarm fired', new Date().toISOString());
    }
  });
});
