import { Download, FileSpreadsheet, Lock } from 'lucide-react';
import { useState } from 'react';
import { downloadUrl, useApi } from '../api';
import { useMe } from '../auth';
import { auditActionLabel } from '../components/common';
import { Badge, Button, Card, Empty, Input, Loader, Modal, PageHead, Pager, Select } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

export function Audit() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const me = useMe();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [role, setRole] = useState('');
  const [result, setResult] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<any>(null);
  const actions = useApi<string[]>('/audit/actions');
  const filters = { search, action, role, result, from, to };
  const list = useApi<any>('/audit', { ...filters, page });
  const upd = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHead
        title={t('nav.audit')}
        subtitle={me.role === 'teacher' ? t('audit.teacherSubtitle') : t('audit.subtitle')}
        actions={
          me.role !== 'teacher' && (
            <>
              <Button onClick={() => downloadUrl('/audit/export', { ...filters, format: 'xlsx', lang })}>
                <FileSpreadsheet /> XLSX
              </Button>
              <Button onClick={() => downloadUrl('/audit/export', { ...filters, format: 'csv', lang })}>
                <Download /> CSV
              </Button>
            </>
          )
        }
      />
      <div className="alert info mb">
        <Lock /> {t('audit.immutable')}
      </div>
      <div className="filters">
        <Input className="search-input" placeholder={t('audit.search')} value={search} onChange={(e) => upd(setSearch)(e.target.value)} />
        <Select value={action} onChange={(e) => upd(setAction)(e.target.value)}>
          <option value="">{t('audit.allActions')}</option>
          {actions.data?.map((a) => (
            <option key={a} value={a}>
              {auditActionLabel(t, a)}
            </option>
          ))}
        </Select>
        {me.role !== 'teacher' && (
          <Select value={role} onChange={(e) => upd(setRole)(e.target.value)}>
            <option value="">{t('audit.allRoles')}</option>
            {['student', 'teacher', 'admin', 'auditor'].map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </Select>
        )}
        <Select value={result} onChange={(e) => upd(setResult)(e.target.value)}>
          <option value="">{t('audit.anyResult')}</option>
          <option value="success">{t('audit.success')}</option>
          <option value="failure">{t('audit.failure')}</option>
        </Select>
        <Input type="date" value={from} onChange={(e) => upd(setFrom)(e.target.value)} title={t('filters.from')} />
        <Input type="date" value={to} onChange={(e) => upd(setTo)(e.target.value)} title={t('filters.to')} />
      </div>
      <Card flush>
        <Loader state={list}>
          {(d) =>
            d.items.length ? (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('audit.time')}</th>
                        <th>{t('audit.user')}</th>
                        <th>{t('audit.role')}</th>
                        <th>{t('audit.action')}</th>
                        <th>{t('audit.object')}</th>
                        <th>{t('audit.result')}</th>
                        <th>IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((r: any) => (
                        <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                          <td className="nowrap small">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="bold">{r.user_name ?? '—'}</td>
                          <td>{r.role ? t(`role.${r.role}`) : '—'}</td>
                          <td>{auditActionLabel(t, r.action)}</td>
                          <td className="small">
                            {r.entity_type ? `${r.entity_type} #${r.entity_id ?? ''}` : '—'}
                          </td>
                          <td>
                            <Badge tone={r.result === 'success' ? 'green' : 'red'}>{t(`audit.${r.result}`)}</Badge>
                          </td>
                          <td className="mono">{r.ip ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={d.page} pageSize={d.pageSize} total={d.total} onChange={setPage} />
              </>
            ) : (
              <Empty title={t('common.nothingFound')} />
            )
          }
        </Loader>
      </Card>
      {open && (
        <Modal title={auditActionLabel(t, open.action)} onClose={() => setOpen(null)} wide>
          <dl className="kv">
            <dt>{t('audit.eventId')}</dt>
            <dd className="mono">{open.event_id}</dd>
            <dt>{t('audit.time')}</dt>
            <dd>{f.dateTime(open.created_at)} ({open.created_at})</dd>
            <dt>{t('audit.user')}</dt>
            <dd>
              {open.user_name ?? '—'} {open.user_id ? `(#${open.user_id})` : ''}
            </dd>
            <dt>{t('audit.role')}</dt>
            <dd>{open.role ? t(`role.${open.role}`) : '—'}</dd>
            <dt>{t('audit.actionCode')}</dt>
            <dd className="mono">{open.action}</dd>
            <dt>{t('audit.object')}</dt>
            <dd>
              {open.entity_type ?? '—'} {open.entity_id ? `#${open.entity_id}` : ''}
            </dd>
            <dt>{t('audit.result')}</dt>
            <dd>{t(`audit.${open.result}`)}</dd>
            <dt>IP</dt>
            <dd className="mono">{open.ip ?? '—'}</dd>
            <dt>User-Agent</dt>
            <dd className="small">{open.user_agent ?? '—'}</dd>
            <dt>{t('audit.details')}</dt>
            <dd>
              <pre className="mono pre" style={{ margin: 0, background: 'var(--surface-2)', padding: 10, borderRadius: 8 }}>
                {JSON.stringify(JSON.parse(open.metadata || '{}'), null, 2)}
              </pre>
            </dd>
          </dl>
        </Modal>
      )}
    </>
  );
}
