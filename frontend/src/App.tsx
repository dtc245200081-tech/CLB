import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { ErrorBoundary } from './components/ErrorBoundary';

import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { JoinPage } from './pages/JoinPage';
import { ProfilePage } from './pages/ProfilePage';
import { MemberManagementPage } from './pages/admin/MemberManagementPage';
import { DepartmentManagementPage } from './pages/admin/DepartmentManagementPage';
import { JoinRequestsPage } from './pages/admin/JoinRequestsPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { EventsPage } from './pages/EventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { MyRegistrationsPage } from './pages/MyRegistrationsPage';
import { TasksPage } from './pages/TasksPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { MyFeesPage } from './pages/MyFeesPage';
import { FinanceOverviewPage } from './pages/FinanceOverviewPage';
import { FeeManagementPage } from './pages/admin/FeeManagementPage';
import { FundManagementPage } from './pages/admin/FundManagementPage';
import { KnowledgeManagementPage } from './pages/admin/KnowledgeManagementPage';
import { ThemeProvider } from './context/ThemeContext';
import { ChatbotQualityPage } from './pages/admin/ChatbotQualityPage';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <BrowserRouter>
                <Routes>
          {/* Standalone Fullscreen Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join" element={<JoinPage />} />

          <Route path="/" element={<Layout />}>
            {/* Giao diện chính - Yêu cầu đăng nhập */}
            <Route
              index
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route path="public-events" element={<Navigate to="/events" replace />} />

            {/* Member Protected Routes */}
            <Route
              path="profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="events"
              element={
                <ProtectedRoute>
                  <EventsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="events/:id"
              element={
                <ProtectedRoute>
                  <EventDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="my-registrations"
              element={
                <ProtectedRoute>
                  <MyRegistrationsPage />
                </ProtectedRoute>
              }
            />

            {/* Phase 4 Member Routes */}
            <Route
              path="tasks"
              element={
                <ProtectedRoute>
                  <TasksPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="announcements"
              element={
                <ProtectedRoute>
                  <AnnouncementsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="my-fees"
              element={
                <ProtectedRoute>
                  <MyFeesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="finance-overview"
              element={
                <ProtectedRoute>
                  <FinanceOverviewPage />
                </ProtectedRoute>
              }
            />

            {/* Admin & Department Head Routes */}
            <Route
              path="admin/users"
              element={
                <AdminRoute allowedRoles={['admin', 'department_head']}>
                  <MemberManagementPage />
                </AdminRoute>
              }
            />

            {/* Finance Management Routes (Admin, Treasurer, and Dept Head) */}
            <Route
              path="admin/fees"
              element={
                <AdminRoute allowedRoles={['admin', 'department_head']} allowTreasurer={true}>
                  <FeeManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/funds"
              element={
                <AdminRoute allowedRoles={['admin', 'department_head']} allowTreasurer={true}>
                  <FundManagementPage />
                </AdminRoute>
              }
            />

            {/* Admin Only Routes */}
            <Route
              path="admin/departments"
              element={
                <AdminRoute allowedRoles={['admin']}>
                  <DepartmentManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/join-requests"
              element={
                <AdminRoute allowedRoles={['admin']}>
                  <JoinRequestsPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/audit-logs"
              element={
                <AdminRoute allowedRoles={['admin']}>
                  <AuditLogsPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/knowledge"
              element={
                <AdminRoute allowedRoles={['admin']}>
                  <KnowledgeManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/chatbot-quality"
              element={
                <AdminRoute allowedRoles={['admin']}>
                  <ChatbotQualityPage />
                </AdminRoute>
              }
            />

            {/* 404 Route */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
      </ThemeProvider>
  </ErrorBoundary>
  );
};

export default App;
