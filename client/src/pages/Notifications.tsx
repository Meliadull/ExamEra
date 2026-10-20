import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Button, Card, Empty, Loader, PageHead, Seg } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

export function Notifications() {
  const { t } = useI18n();
  const f = useFormat();
  const nav = useNavigate();
  const { setUnread } = useAuth();
  const list = useApi<any>('/notifications');
  const [show, setShow] = useState<'all' | 'unread' | 'read'>('all');
  const open = async (n: any) => {
    if (!n.read_at) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => null);
    setUnread(Math.max(0, (list.data?.unread ?? 1) - (n.read_at ? 0 : 1)));
    if (n.link) nav(n.link);
    else list.reload();
  };
  return (
    <>
      <PageHead
        title={t('nav.notifications')}
        actions={
          <Button
            onClick={async () => {
              await api('/notifications/read-all', { method: 'POST' });
              setUnread(0);
              list.reload();
            }}
          >
            <CheckCheck /> {t('notifications.readAll')}
          </Button>
        }
      />
      <div className="filters">
        <Seg
          value={show}
          onChange={setShow}
          options={[
            { id: 'all', label: t('common.all') },
            { id: 'unread', label: t('filters.unread') },
            { id: 'read', label: t('filters.read') },
          ]}
        />
      </div>
      <Card>
        <Loader state={list}>
          {(d) => {
            const items = d.items.filter((n: any) => show === 'all' || (show === 'unread') === !n.read_at);
            return items.length ? (
              items.map((n: any) => {
                const params = JSON.parse(n.params || '{}');
                if (params.endsAt) params.endsAt = f.dateTime(params.endsAt);
                return (
                  <div key={n.id} className="list-item" style={{ cursor: 'pointer', opacity: n.read_at ? 0.65 : 1 }} onClick={() => open(n)}>
                    <div className={`list-icon tone-${n.read_at ? 'gray' : 'blue'}`}>
                      <Bell />
                    </div>
                    <div className="grow">
                      <div className={n.read_at ? '' : 'bold'}>{t(`notif.${n.type}`, params)}</div>
                      <div className="tiny muted">{f.dateTime(n.created_at)}</div>
                    </div>
                    {!n.read_at && <span className="badge blue">{t('notifications.new')}</span>}
                  </div>
                );
              })
            ) : (
              <Empty title={show === 'all' ? t('notifications.empty') : t('common.nothingFound')} />
            );
          }}
        </Loader>
      </Card>
    </>
  );
}
