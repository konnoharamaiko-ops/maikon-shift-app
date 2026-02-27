/**
 * pages.config.js - Page routing configuration
 * Pages are lazy-loaded for optimal performance.
 */
import { lazy } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Home = lazy(() => import('./pages/Home'));
const ShiftOverview = lazy(() => import('./pages/ShiftOverview'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminSettingsHub = lazy(() => import('./pages/AdminSettingsHub'));
const ShiftCreation = lazy(() => import('./pages/ShiftCreation'));
const ShiftDeadlineManagement = lazy(() => import('./pages/ShiftDeadlineManagement'));
const StoreSettings = lazy(() => import('./pages/StoreSettings'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const UserEdit = lazy(() => import('./pages/UserEdit'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const EventManagement = lazy(() => import('./pages/EventManagement'));

import __Layout from './Layout.jsx';

export const preloadAllPages = () => {};

export const PAGES = {
    "Admin": Admin,
    "AdminSettings": AdminSettings,
    "AdminSettingsHub": AdminSettingsHub,
    "Analytics": Analytics,
    "Dashboard": Dashboard,
    "Home": Home,
    "Settings": Settings,
    "ShiftCreation": ShiftCreation,
    "ShiftDeadlineManagement": ShiftDeadlineManagement,
    "StoreSettings": StoreSettings,
    "SystemSettings": SystemSettings,
    "UserEdit": UserEdit,
    "UserManagement": UserManagement,
    "ShiftOverview": ShiftOverview,
    "EventManagement": EventManagement,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
