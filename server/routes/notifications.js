// routes/notifications.js - in-app notifications
const express = require('express');
const { Notification } = require('../models');
const { sendServerError } = require('../lib/helpers');
const { authenticateToken, requireOwnerOf } = require('../lib/auth');

const router = express.Router();

router.get('/api/notifications/:userId', authenticateToken, requireOwnerOf('userId'), async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.status(200).json({
      notifications,
      unreadCount: notifications.filter((item) => !item.isRead).length,
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch notifications');
  }
});

router.patch('/api/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    if (String(notification.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to update this notification' });
    }
    notification.isRead = true;
    await notification.save();
    res.status(200).json({ message: 'Notification marked as read', notification });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update notification');
  }
});

router.patch('/api/notifications/user/:userId/read-all', authenticateToken, requireOwnerOf('userId'), async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.params.userId, isRead: false }, { isRead: true });
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to mark all notifications as read');
  }
});

module.exports = router;
