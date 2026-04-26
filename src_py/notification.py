"""
MingEvidence 通知模块 — 系统通知、任务进度、协作提醒管理

支持：
- 任务完成/失败通知
- 文献更新提醒
- 协作审阅通知
- 系统告警
- 邮件/消息推送
"""

import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from enum import Enum

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    """通知类型"""
    TASK_COMPLETE = "task_complete"
    TASK_FAILED = "task_failed"
    LITERATURE_UPDATE = "literature_update"
    REVIEW_REQUEST = "review_request"
    REVIEW_COMPLETE = "review_complete"
    SYSTEM_ALERT = "system_alert"
    DEADLINE_REMINDER = "deadline_reminder"
    COLLABORATION = "collaboration"
    EXPORT_READY = "export_ready"
    QUALITY_ALERT = "quality_alert"


class NotificationPriority(str, Enum):
    """通知优先级"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class NotificationChannel(str, Enum):
    """通知渠道"""
    IN_APP = "in_app"
    EMAIL = "email"
    WEBHOOK = "webhook"
    WECHAT = "wechat"
    DINGTALK = "dingtalk"


@dataclass
class Notification:
    """通知对象"""
    notification_id: str
    type: str
    title: str
    message: str
    priority: str = "normal"
    created_at: str = ""
    read: bool = False
    user_id: str = ""
    project_id: str = ""
    resource_type: str = ""  # meta_analysis, systematic_review, protocol
    resource_id: str = ""
    action_url: str = ""
    expires_at: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().isoformat()

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def is_expired(self) -> bool:
        if not self.expires_at:
            return False
        return datetime.now().isoformat() > self.expires_at


@dataclass
class NotificationPreference:
    """用户通知偏好"""
    user_id: str
    enabled_channels: List[str] = field(default_factory=lambda: ["in_app"])
    enabled_types: List[str] = field(
        default_factory=lambda: [t.value for t in NotificationType]
    )
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "08:00"
    digest_mode: bool = False  # True = 汇总发送，False = 实时发送
    email: str = ""
    webhook_url: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class NotificationManager:
    """通知管理器 — 管理通知的创建、发送和状态"""

    def __init__(self):
        self.notifications: Dict[str, Notification] = {}
        self.preferences: Dict[str, NotificationPreference] = {}
        self.handlers: Dict[str, List[Callable]] = {}
        self._id_counter = 0

    def _generate_id(self) -> str:
        self._id_counter += 1
        return f"notif_{datetime.now().strftime('%Y%m%d')}_{self._id_counter:06d}"

    def register_handler(self, channel: str, handler: Callable):
        """注册通知发送处理器"""
        if channel not in self.handlers:
            self.handlers[channel] = []
        self.handlers[channel].append(handler)
        logger.info(f"Registered handler for channel: {channel}")

    def set_preference(self, preference: NotificationPreference):
        """设置用户通知偏好"""
        self.preferences[preference.user_id] = preference
        logger.info(f"Updated notification preferences for user {preference.user_id}")

    def create_notification(
        self,
        type: str,
        title: str,
        message: str,
        user_id: str = "",
        priority: str = "normal",
        project_id: str = "",
        resource_type: str = "",
        resource_id: str = "",
        action_url: str = "",
        expires_in_hours: int = -1,
        metadata: Optional[Dict] = None,
    ) -> Notification:
        """创建通知"""
        notif_id = self._generate_id()

        expires_at = None
        if expires_in_hours > 0:
            expires_at = (datetime.now() + timedelta(hours=expires_in_hours)).isoformat()

        notification = Notification(
            notification_id=notif_id,
            type=type,
            title=title,
            message=message,
            priority=priority,
            user_id=user_id,
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
            action_url=action_url,
            expires_at=expires_at,
            metadata=metadata or {},
        )

        self.notifications[notif_id] = notification
        logger.info(f"Created notification {notif_id}: {title}")

        # 尝试发送
        self._dispatch(notification)

        return notification

    def _dispatch(self, notification: Notification):
        """分发通知到各渠道"""
        if not notification.user_id:
            return

        pref = self.preferences.get(notification.user_id)
        if not pref:
            # 默认使用应用内通知
            return

        # 检查通知类型是否启用
        if notification.type not in pref.enabled_types:
            return

        # 检查安静时间
        if self._is_quiet_hours(pref):
            if notification.priority not in ("high", "urgent"):
                return

        # 分发到各渠道
        for channel in pref.enabled_channels:
            handlers = self.handlers.get(channel, [])
            for handler in handlers:
                try:
                    handler(notification)
                except Exception as e:
                    logger.error(f"Failed to dispatch notification via {channel}: {e}")

    def _is_quiet_hours(self, pref: NotificationPreference) -> bool:
        """检查是否在安静时段"""
        now = datetime.now().strftime("%H:%M")
        if pref.quiet_hours_start <= pref.quiet_hours_end:
            return pref.quiet_hours_start <= now <= pref.quiet_hours_end
        else:
            return now >= pref.quiet_hours_start or now <= pref.quiet_hours_end

    def get_user_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        type_filter: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict]:
        """获取用户通知列表"""
        notifs = [n for n in self.notifications.values() if n.user_id == user_id]

        if unread_only:
            notifs = [n for n in notifs if not n.read]
        if type_filter:
            notifs = [n for n in notifs if n.type == type_filter]

        # 过滤过期通知
        notifs = [n for n in notifs if not n.is_expired]

        # 按时间倒序
        notifs.sort(key=lambda x: x.created_at, reverse=True)

        return [n.to_dict() for n in notifs[:limit]]

    def mark_read(self, notification_id: str, user_id: str) -> bool:
        """标记通知为已读"""
        notif = self.notifications.get(notification_id)
        if notif and notif.user_id == user_id:
            notif.read = True
            return True
        return False

    def mark_all_read(self, user_id: str) -> int:
        """标记用户所有通知为已读"""
        count = 0
        for notif in self.notifications.values():
            if notif.user_id == user_id and not notif.read:
                notif.read = True
                count += 1
        return count

    def get_unread_count(self, user_id: str) -> int:
        """获取未读通知数"""
        return sum(
            1 for n in self.notifications.values()
            if n.user_id == user_id and not n.read and not n.is_expired
        )

    def cleanup_expired(self) -> int:
        """清理过期通知"""
        expired = [nid for nid, n in self.notifications.items() if n.is_expired]
        for nid in expired:
            del self.notifications[nid]
        if expired:
            logger.info(f"Cleaned up {len(expired)} expired notifications")
        return len(expired)

    def get_stats(self) -> Dict:
        """获取通知统计"""
        total = len(self.notifications)
        unread = sum(1 for n in self.notifications.values() if not n.read)
        by_type = {}
        for n in self.notifications.values():
            by_type[n.type] = by_type.get(n.type, 0) + 1
        return {
            "total": total,
            "unread": unread,
            "by_type": by_type,
            "users_with_prefs": len(self.preferences),
        }

    def send_task_notification(self, task_name: str, status: str, user_id: str, details: str = ""):
        """发送任务状态通知（便捷方法）"""
        if status == "completed":
            notif_type = NotificationType.TASK_COMPLETE.value
            title = f"✅ 任务完成: {task_name}"
            priority = "normal"
        elif status == "failed":
            notif_type = NotificationType.TASK_FAILED.value
            title = f"❌ 任务失败: {task_name}"
            priority = "high"
        else:
            notif_type = NotificationType.SYSTEM_ALERT.value
            title = f"📋 任务更新: {task_name}"
            priority = "normal"

        return self.create_notification(
            type=notif_type,
            title=title,
            message=details or f"任务 {task_name} 状态已更新为 {status}",
            user_id=user_id,
            priority=priority,
        )

    def send_review_request(self, review_id: str, reviewer_id: str, project_name: str):
        """发送审阅请求通知"""
        return self.create_notification(
            type=NotificationType.REVIEW_REQUEST.value,
            title=f"📝 审阅请求: {project_name}",
            message=f"您有一个新的系统综述审阅请求，请及时处理。",
            user_id=reviewer_id,
            priority="normal",
            resource_type="systematic_review",
            resource_id=review_id,
        )

    def export_notifications(self, user_id: str) -> str:
        """导出用户通知"""
        notifs = self.get_user_notifications(user_id, limit=1000)
        return json.dumps(notifs, ensure_ascii=False, indent=2)
