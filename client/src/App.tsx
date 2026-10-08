import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Empty, Spinner } from './components/ui';
import { useI18n } from './i18n';
import { AdminDashboard, Roles, SettingsPage, UserDetail, Users } from './pages/admin';
import { Analytics } from './pages/Analytics';
import { Assignments } from './pages/Assignments';
import { AttemptResult } from './pages/AttemptResult';
import { Audit } from './pages/Audit';
import { Login, Recover, Register } from './pages/Auth';
import { GroupDetail, Groups } from './pages/groups';
import { Landing } from './pages/Landing';
import { Notifications } from './pages/Notifications';
import { Profile } from './pages/Profile';
import { Questions } from './pages/Questions';
import { Reports } from './pages/Reports';
import { Results } from './pages/Results';
import { History, MyResults, MyTests, StudentDashboard } from './pages/student';
import { StudentCard, Students } from './pages/students';
import { Subjects } from './pages/Subjects';
import { TakeTest } from './pages/TakeTest';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { TestBuilder } from './pages/TestBuilder';
import { TestDetail, TestsList } from './pages/tests';
import type { Role } from './types';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function Only({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user || !roles.includes(user.role)) return <Empty title={t('errors.forbidden')} text={t('common.noAccess')} />;
  return <>{children}</>;
}

function ByRole({ student, staff }: { student: ReactNode; staff: ReactNode }) {
  const { user } = useAuth();
  return <>{user?.role === 'student' ? student : staff}</>;
}

function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentDashboard />;
  if (user?.role === 'teacher') return <TeacherDashboard />;
  return <AdminDashboard />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return user ? <Navigate to="/app" replace /> : <>{children}</>;
}

const STAFF: Role[] = ['teacher', 'admin', 'auditor'];
const EDITORS: Role[] = ['teacher', 'admin'];

export function App() {
  const { t } = useI18n();
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/recover" element={<PublicOnly><Recover /></PublicOnly>} />
      <Route path="/app/attempt/:id" element={<RequireAuth><Only roles={['student']}><TakeTest /></Only></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="my-tests" element={<Only roles={['student']}><MyTests /></Only>} />
        <Route path="history" element={<Only roles={['student']}><History /></Only>} />
        <Route path="results" element={<ByRole student={<MyResults />} staff={<Results />} />} />
        <Route path="attempts/:id/result" element={<AttemptResult />} />
        <Route path="tests" element={<Only roles={STAFF}><TestsList /></Only>} />
        <Route path="tests/new" element={<Only roles={EDITORS}><TestBuilder /></Only>} />
        <Route path="tests/:id/edit" element={<Only roles={EDITORS}><TestBuilder /></Only>} />
        <Route path="tests/:id" element={<Only roles={STAFF}><TestDetail /></Only>} />
        <Route path="questions" element={<Only roles={STAFF}><Questions /></Only>} />
        <Route path="assignments" element={<Only roles={STAFF}><Assignments /></Only>} />
        <Route path="groups" element={<Only roles={STAFF}><Groups /></Only>} />
        <Route path="groups/:id" element={<Only roles={STAFF}><GroupDetail /></Only>} />
        <Route path="students" element={<Only roles={STAFF}><Students /></Only>} />
        <Route path="students/:id" element={<Only roles={STAFF}><StudentCard /></Only>} />
        <Route path="subjects" element={<Only roles={STAFF}><Subjects /></Only>} />
        <Route path="analytics" element={<Only roles={STAFF}><Analytics /></Only>} />
        <Route path="reports" element={<Only roles={STAFF}><Reports /></Only>} />
        <Route path="audit" element={<Only roles={STAFF}><Audit /></Only>} />
        <Route path="users" element={<Only roles={['admin', 'auditor']}><Users /></Only>} />
        <Route path="users/:id" element={<Only roles={['admin', 'auditor']}><UserDetail /></Only>} />
        <Route path="roles" element={<Only roles={['admin', 'auditor']}><Roles /></Only>} />
        <Route path="settings" element={<Only roles={['admin', 'auditor']}><SettingsPage /></Only>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Empty title={t('errors.not_found')} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
