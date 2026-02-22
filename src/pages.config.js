/**
 * pages.config.js - Page routing configuration
 * All pages are eagerly loaded for maximum reliability.
 */
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import ShiftOverview from './pages/ShiftOverview';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import AdminSettings from './pages/AdminSettings';
import AdminSettingsHub from './pages/AdminSettingsHub';
import ShiftCreation from './pages/ShiftCreation';
import ShiftDeadlineManagement from './pages/ShiftDeadlineManagement';
import StoreSettings from './pages/StoreSettings';
import SystemSettings from './pages/SystemSettings';
import UserEdit from './pages/UserEdit';
import UserManagement from './pages/UserManagement';
import EventManagement from './pages/EventManagement';

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
