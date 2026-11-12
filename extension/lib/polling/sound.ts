import { browser } from 'wxt/browser';

export const ALERT_SOUND_PATH = '/sounds/alert.wav';

/**
 * Plays the alert sound. Firefox's background page has a DOM and plays it
 * directly. Chrome's service worker can't play audio, so an offscreen page
 * plays it when it loads; Chrome allows one at a time and closes it after
 * 30 seconds of silence, so one still open is replaced to play again.
 */
export async function playAlertSound(): Promise<void> {
  if (import.meta.env.FIREFOX) {
    await new Audio(browser.runtime.getURL(ALERT_SOUND_PATH)).play();
    return;
  }
  await browser.offscreen.closeDocument().catch(() => {});
  await browser.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Plays the optional sound for live alerts.',
  });
}
