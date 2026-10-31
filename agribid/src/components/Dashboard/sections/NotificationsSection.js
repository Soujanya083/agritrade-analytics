import React from 'react';

const NotificationsSection = ({ markAllRead, markNotificationRead, notifications, unreadCount }) => (
  (
    <section className="listing-section">

      <div className="listing-header">

        <h2>
          Notifications{' '}

          {unreadCount > 0 && (
            <span className="badge">
              {unreadCount}
            </span>
          )}
        </h2>

        <button
          className="small-btn"
          onClick={markAllRead}
        >
          Mark all read
        </button>

      </div>

      <div className="simple-list">

        {notifications.slice(0, 10).map((item) => (

          <div
            key={item._id}
            className={`simple-item ${
              item.isRead
                ? 'read'
                : 'unread'
            }`}
          >

            <p>{item.message}</p>

            {!item.isRead && (
              <button
                className="small-btn"
                onClick={() =>
                  markNotificationRead(item._id)
                }
              >
                Mark read
              </button>
            )}

          </div>

        ))}

        {notifications.length === 0 && (
          <div className="simple-item">
            <p>No notifications yet.</p>
          </div>
        )}

      </div>

    </section>
  )
);

export default NotificationsSection;
