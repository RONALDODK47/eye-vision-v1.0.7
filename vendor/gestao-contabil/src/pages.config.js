/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import React from 'react';

export const PAGES = {
    "administrator": React.lazy(() => import('./pages/administrator')),
    "AppSettings": React.lazy(() => import('./pages/AppSettings')),
    "CalendarManagement": React.lazy(() => import('./pages/CalendarManagement')),
    "Chat": React.lazy(() => import('./pages/Chat')),
    "ClientPortal": React.lazy(() => import('./pages/ClientPortal')),
    "Companies": React.lazy(() => import('./pages/Companies')),
    "Conversations": React.lazy(() => import('./pages/Conversations')),
    "Dashboard": React.lazy(() => import('./pages/Dashboard')),
    "Excel": React.lazy(() => import('./pages/Excel')),
    "Exits": React.lazy(() => import('./pages/Exits')),
    "LoanControl": React.lazy(() => import('./pages/LoanControl')),
    "Novidades": React.lazy(() => import('./pages/Novidades')),
    "Notices": React.lazy(() => import('./pages/Notices')),
    "Onboarding": React.lazy(() => import('./pages/Onboarding')),
    "Profile": React.lazy(() => import('./pages/Profile')),
    "Trash": React.lazy(() => import('./pages/Trash')),
    "UsefulSites": React.lazy(() => import('./pages/UsefulSites')),
    "Users": React.lazy(() => import('./pages/Users')),
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};