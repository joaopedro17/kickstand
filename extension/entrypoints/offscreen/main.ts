import { ALERT_SOUND_PATH } from '@/lib/polling/sound';

// The background opens this page only to play the alert sound once.
new Audio(ALERT_SOUND_PATH).play().catch(() => {});
