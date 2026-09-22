"""ログイン・新規登録の連続失敗を数え、一定回数を超えたら一定時間ブロックする。

プロセス内のメモリで数えるだけの簡易実装。複数プロセス構成や再起動をまたいだ
制限はできないが、このひな型が想定する単一プロセス運用では十分な対策になる。
"""

import threading
import time


class RateLimiter:
    def __init__(self, max_attempts: int, lockout_seconds: int):
        self.max_attempts = max_attempts
        self.lockout_seconds = lockout_seconds
        self._failures: dict[str, int] = {}
        self._locked_until: dict[str, float] = {}
        self._lock = threading.Lock()

    def seconds_until_unlocked(self, key: str) -> float:
        """ロック中なら残り秒数を返す。ロックされていなければ 0"""
        with self._lock:
            until = self._locked_until.get(key)
            if until is None:
                return 0.0
            remaining = until - time.monotonic()
            if remaining > 0:
                return remaining
            # ロック期間が過ぎていたら記録を消し、また0回から数え直す
            self._locked_until.pop(key, None)
            self._failures.pop(key, None)
            return 0.0

    def record_failure(self, key: str) -> None:
        with self._lock:
            count = self._failures.get(key, 0) + 1
            if count >= self.max_attempts:
                self._locked_until[key] = time.monotonic() + self.lockout_seconds
                self._failures.pop(key, None)
            else:
                self._failures[key] = count

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._locked_until.pop(key, None)

    def clear(self) -> None:
        """テスト用。すべての記録を消す"""
        with self._lock:
            self._failures.clear()
            self._locked_until.clear()
