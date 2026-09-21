import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from '@/app/layout/AppShell'
import { RequireAuth } from '@/app/RequireAuth'

// Routes are code-split; the AppShell renders the Suspense boundary around the Outlet.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const HomePage = lazy(() => import('@/features/home/HomePage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const JobListPage = lazy(() => import('@/features/jobs/JobListPage'))
const JobFormPage = lazy(() => import('@/features/jobs/JobFormPage'))
const JobDetailPage = lazy(() => import('@/features/jobs/JobDetailPage'))
const SearchCandidatesPage = lazy(() => import('@/features/search/SearchCandidatesPage'))
const CandidateListPage = lazy(() => import('@/features/candidates/CandidateListPage'))
const CandidateDetailPage = lazy(() => import('@/features/candidates/CandidateDetailPage'))
const UploadResumesPage = lazy(() => import('@/features/resumes/UploadResumesPage'))
const EmailTemplatesPage = lazy(() => import('@/features/communications/EmailTemplatesPage'))
const InterviewsPage = lazy(() => import('@/features/interviews/InterviewsPage'))
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const NotFoundPage = lazy(() => import('@/app/NotFoundPage'))

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        {/* The homepage is the landing page after sign-in and the root URL (Enhancement.md 2). */}
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="jobs" element={<JobListPage />} />
        <Route path="jobs/new" element={<JobFormPage mode="create" />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="jobs/:id/edit" element={<JobFormPage mode="edit" />} />
        <Route path="search" element={<SearchCandidatesPage />} />
        <Route path="candidates" element={<CandidateListPage />} />
        <Route path="candidates/upload" element={<UploadResumesPage />} />
        <Route path="candidates/:id" element={<CandidateDetailPage />} />
        <Route path="interviews" element={<InterviewsPage />} />
        <Route path="templates" element={<EmailTemplatesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
