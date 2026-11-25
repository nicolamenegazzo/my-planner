import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth';
import { DataProvider } from './data';
import { Layout } from './Layout';
import { Toaster } from './toast';
import { LoginPage } from './pages/LoginPage';
import { BoardPage } from './pages/BoardPage';
import { KanbanPage } from './pages/KanbanPage';
import { CalendarPage } from './pages/CalendarPage';
import { SprintsPage } from './pages/SprintsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { UsersPage } from './pages/UsersPage';
import { ProfilePage } from './pages/ProfilePage';
import { DocsPage } from './pages/DocsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ImportPage } from './pages/ImportPage';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <DataProvider>
                  <Layout />
                </DataProvider>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/board" replace />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/sprint" element={<SprintsPage />} />
            <Route path="/progetti" element={<ProjectsPage />} />
            <Route path="/utenti" element={<UsersPage />} />
            <Route path="/profilo" element={<ProfilePage />} />
            <Route path="/documenti" element={<DocsPage />} />
            <Route path="/documenti/:id" element={<DocsPage />} />
            <Route path="/impostazioni" element={<SettingsPage />} />
            <Route path="/import" element={<ImportPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
