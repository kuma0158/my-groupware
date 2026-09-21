// メニューのバッジを今すぐ数え直させる。お知らせの投稿・既読・削除など、件数が変わる操作の直後に呼ぶ
const EVENT = "badges:refresh";

export const refreshBadges = () => window.dispatchEvent(new Event(EVENT));
export const onBadgesRefresh = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};
