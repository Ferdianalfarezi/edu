# Requirements Document

## Introduction

Full UI redesign of the Teman Sekolah admin panel from a generic corporate SaaS aesthetic to a "Warm & Friendly Education-focused" design system. The redesign targets high visibility for non-tech-savvy users (parents, school staff, teachers) with larger typography, colorful surfaces, and approachable visual language. The scope covers the design system (tokens, typography, spacing), layout shell (sidebar + sub-navigation hybrid), all reusable UI components, and all 30+ view pages.

## Glossary

- **Design_System**: The collection of CSS custom properties (@theme tokens), typography rules, color palette definitions, spacing scales, and component-level styling that forms the visual foundation of the admin panel
- **Sidebar**: The vertical navigation component fixed to the left side of the viewport, using a dark teal gradient background with icon-based navigation items
- **Sub_Navigation**: The horizontal tab bar rendered below the top bar, providing context-specific page-level navigation within a sidebar section
- **Top_Bar**: The horizontal header bar at the top of the main content area displaying the current page title and school context
- **Stat_Card**: A dashboard component displaying a single metric with colored gradient background, icon badge, numeric value, and optional change indicator
- **Quick_Action_Card**: A clickable card component providing shortcut access to frequent operations, featuring a colored icon badge and descriptive text
- **Data_Table**: A table component for displaying tabular data with enhanced padding, larger text, colored avatars, and progress indicators
- **App_Layout**: The root layout component composing the Sidebar, Top_Bar, Sub_Navigation, and main content area into the application shell
- **Icon_Badge**: A solid-colored square container (rounded corners) displaying an SVG icon, used in Stat_Cards and Quick_Action_Cards
- **Page_Header**: A component rendering the page title, optional description, and action buttons at the top of each view
- **Warm_Surface**: The cream-toned background color (#F5F3EF) used as the base page background instead of cold slate/gray

## Requirements

### Requirement 1: Design System Token Architecture

**User Story:** As a developer, I want a centralized design token system using Tailwind CSS 4 @theme, so that all components derive their visual properties from a single source of truth and the redesign can be applied consistently.

#### Acceptance Criteria

1. THE Design_System SHALL define color tokens in the Tailwind CSS 4 @theme block including primary (blue #2563EB family), surface (warm cream #F5F3EF base), neutral text (stone family), accent (amber/gold), success (green), warning (amber), danger (red), and purple palette families
2. THE Design_System SHALL define typography tokens specifying Plus Jakarta Sans as the primary font family with fallback to system sans-serif fonts
3. THE Design_System SHALL define spacing tokens for page padding (32px), section gaps (18-32px), and element gaps (8-16px)
4. THE Design_System SHALL define border-radius tokens at 8px (xs), 12px (sm), and 16px (default) scales
5. THE Design_System SHALL define shadow tokens for elevation levels including hover-lift effects (translateY with box-shadow)
6. THE Design_System SHALL define sidebar dimension tokens for collapsed width (96px) and expanded width (240px)
7. WHEN the Design_System tokens are applied, THE admin panel SHALL use stone-family neutral colors (warm undertone) instead of slate-family colors for text and borders

### Requirement 2: Sidebar Navigation

**User Story:** As a school administrator, I want a compact icon-based sidebar that expands on hover to show full labels, so that I have maximum content area while still being able to navigate easily.

#### Acceptance Criteria

1. THE Sidebar SHALL render at 96px width by default, displaying navigation items as vertically-stacked icon + small label (10px font) below the icon
2. WHEN a user hovers over the Sidebar, THE Sidebar SHALL expand to 240px width with a cubic-bezier(0.4, 0, 0.2, 1) transition over 300ms, showing icon + label in horizontal layout (14px font)
3. THE Sidebar SHALL use a dark teal gradient background (linear-gradient from #1A3A3A to #0F2424)
4. THE Sidebar SHALL display navigation icons at 24px size with white color at 60% opacity for inactive items and 100% opacity for active items
5. WHEN a navigation item is active, THE Sidebar SHALL display an amber/gold vertical bar indicator (4px wide, 28px tall) on the left edge of the active item and apply a semi-transparent white background (15% opacity)
6. THE Sidebar SHALL display a logo container (52px, white background, 14px border-radius) at the top and a user avatar circle (44px, amber background) at the bottom
7. THE Sidebar SHALL group navigation items by domain: Dashboard, Akademik, Absensi, Rapor, RPP, Keuangan, Pengumuman, and Pengaturan

### Requirement 3: Top Bar

**User Story:** As a school staff member, I want a prominent colored top bar showing my current page and school context, so that I always know where I am in the application.

#### Acceptance Criteria

1. THE Top_Bar SHALL render at 70px height with a blue gradient background (linear-gradient 135deg from primary-600 to primary-700) and white text
2. THE Top_Bar SHALL display the current page title on the left side at 20px font-size with 700 font-weight in white
3. THE Top_Bar SHALL display the active school name in a frosted-glass badge (semi-transparent white background with backdrop-blur) on the right side with a building icon

### Requirement 4: Sub-Navigation Tabs

**User Story:** As a user navigating within a section, I want prominent horizontal tabs that clearly show where I am, so that I can switch between related pages without confusion.

#### Acceptance Criteria

1. THE Sub_Navigation SHALL render at 62px height with a light blue background (primary-50) and a 3px bottom border in primary-200
2. THE Sub_Navigation SHALL display tab items with 15px font-size, 700 font-weight, 12px vertical and 22px horizontal padding, and 10px border-radius
3. WHEN a tab is active, THE Sub_Navigation SHALL display it with a filled primary-600 background and white text
4. WHEN a tab is inactive, THE Sub_Navigation SHALL display it with semi-transparent white background (60% opacity) and primary-800 text color
5. WHEN a user hovers over an inactive tab, THE Sub_Navigation SHALL apply a white background, primary-300 border, and subtle box-shadow

### Requirement 5: Stat Card Components

**User Story:** As a school administrator viewing the dashboard, I want colorful, high-visibility stat cards, so that I can quickly read key metrics at a glance without straining.

#### Acceptance Criteria

1. THE Stat_Card SHALL render with 16px border-radius, 22px padding, and a 2px colored border matching its color variant
2. THE Stat_Card SHALL support four color variants: blue (gradient #EEF4FF→#DBEAFE), green (gradient #ECFDF5→#D1FAE5), amber (gradient #FFFBEB→#FEF3C7), and purple (gradient #FAF5FF→#F3E8FF)
3. THE Stat_Card SHALL display an Icon_Badge at 42px size with 12px border-radius and solid colored background (white icon) in the top-right area
4. THE Stat_Card SHALL display the metric value at 32px font-size with 800 font-weight
5. THE Stat_Card SHALL display the metric label at 14px font-size with 600 font-weight in secondary text color
6. WHEN a user hovers over a Stat_Card, THE Stat_Card SHALL translate upward by 3px and apply an enhanced box-shadow (0 12px 32px rgba(0,0,0,0.12))
7. WHERE a Stat_Card has change data, THE Stat_Card SHALL display a change indicator badge with rounded background (14px border-radius) and 13px bold text

### Requirement 6: Quick Action Cards

**User Story:** As a teacher or admin, I want prominent quick-action shortcuts on the dashboard, so that I can access frequent tasks (add student, input attendance, manage billing) in one click.

#### Acceptance Criteria

1. THE Quick_Action_Card SHALL render with white background, 12px border-radius, 20px padding, 2px border, and horizontal layout (icon + text)
2. THE Quick_Action_Card SHALL display an Icon_Badge at 48px size with a solid colored background (distinct per action: blue, green, amber) and 24px white icon
3. THE Quick_Action_Card SHALL display a title at 15px font-size with 700 font-weight and a description at 13px font-size in tertiary text color
4. WHEN a user hovers over a Quick_Action_Card, THE Quick_Action_Card SHALL translate upward by 2px, change border-color to primary-300, and apply a box-shadow (0 6px 20px rgba(37,99,235,0.12))

### Requirement 7: Data Table Styling

**User Story:** As a school administrator managing student records, I want tables with large, readable text and clear visual hierarchy, so that I can scan data quickly without leaning into the screen.

#### Acceptance Criteria

1. THE Data_Table SHALL render cell content at 15px font-size with 16px vertical and 20px horizontal padding
2. THE Data_Table SHALL render header cells at 13px font-size, 700 font-weight, uppercase, with 0.04em letter-spacing and warm surface background
3. THE Data_Table SHALL display name columns with colored circular avatars (38px diameter) showing initials in white on gradient backgrounds
4. WHEN a table row is hovered, THE Data_Table SHALL apply a primary-50 background to the row
5. WHERE a column displays percentage data, THE Data_Table SHALL render an 8px-thick progress bar with color coding: green (high), amber (medium), red (low) alongside the numeric value in matching bold color
6. THE Data_Table SHALL apply a 2px top border on the table container section-header with primary-50 background and 16px font-size bold title

### Requirement 8: Button Styling

**User Story:** As a non-tech-savvy user, I want buttons that are large and clearly clickable, so that I never miss or hesitate over an action.

#### Acceptance Criteria

1. THE Design_System SHALL style primary buttons with 10px vertical and 18px horizontal padding, 14px font-size, 600 font-weight, primary-600 background, white text, 8px border-radius, and colored box-shadow
2. THE Design_System SHALL style secondary buttons with 10px vertical and 18px horizontal padding, 14px font-size, 600 font-weight, white background, 2px border, and secondary text color
3. WHEN a user hovers over a primary button, THE button SHALL translate upward by 1px and intensify the box-shadow
4. WHEN a user hovers over a secondary button, THE button SHALL apply warm surface background, primary-300 border, and primary-700 text color

### Requirement 9: Card and Surface Styling

**User Story:** As a user browsing the admin panel, I want content areas that feel warm and distinct from each other, so that the interface feels approachable rather than cold and corporate.

#### Acceptance Criteria

1. THE Design_System SHALL apply the Warm_Surface color (#F5F3EF) as the base page background for all authenticated views
2. THE Design_System SHALL style content cards with white background, 16px border-radius, 2px border in stone-200 color, and xs-level box-shadow
3. WHEN a user hovers over an interactive card, THE card SHALL apply an elevated shadow and optional upward translation
4. THE Design_System SHALL style section headers within cards with primary-50 background, 20px vertical and 24px horizontal padding, and 2px bottom border

### Requirement 10: Typography Scale

**User Story:** As a user with varying technical literacy, I want text throughout the panel to be large and legible, so that I can read content comfortably on any screen.

#### Acceptance Criteria

1. THE Design_System SHALL set page headings (h1) at 26px font-size with 800 font-weight
2. THE Design_System SHALL set body text and table cells at 15px font-size minimum
3. THE Design_System SHALL set small/meta text (badges, labels, captions) at 13px minimum font-size with 600-700 font-weight
4. THE Design_System SHALL import and apply Plus Jakarta Sans from Google Fonts with weights 400, 500, 600, 700, and 800
5. THE Design_System SHALL apply -webkit-font-smoothing: antialiased for consistent rendering across browsers

### Requirement 11: Layout Shell Composition

**User Story:** As a developer, I want the AppLayout component to compose sidebar, top bar, and sub-navigation into a cohesive shell, so that all views share a consistent layout structure.

#### Acceptance Criteria

1. THE App_Layout SHALL compose the Sidebar (left), Top_Bar (top of main area), Sub_Navigation (below top bar), and scrollable content area into a flex-based full-viewport layout
2. THE App_Layout SHALL configure Sub_Navigation tabs dynamically based on the active sidebar section (e.g., Dashboard section shows Ringkasan/Siswa/Kelas/Mata Pelajaran/Jadwal tabs)
3. WHEN the viewport is below 1024px width, THE App_Layout SHALL hide the Sidebar and display a hamburger menu button in the Top_Bar that opens a mobile drawer overlay
4. THE App_Layout SHALL apply overflow-y-auto with custom scrollbar styling (8px width, rounded thumb, transparent track) to the content area

### Requirement 12: View Page Redesign

**User Story:** As a user accessing any page in the admin panel, I want every view to follow the new warm design system consistently, so that the experience feels cohesive across all 30+ pages.

#### Acceptance Criteria

1. WHEN a view page is loaded, THE view SHALL use the Design_System tokens for all colors, typography, spacing, and border-radius values (no hardcoded cold-palette colors)
2. THE Page_Header component SHALL render page titles at 26px/800 weight with optional subtitle at 15px in secondary text color
3. WHEN a dashboard view is loaded, THE view SHALL render Stat_Cards in a 4-column grid with 18px gap, Quick_Action_Cards in a 3-column grid with 16px gap, and data sections below
4. WHEN a management view (siswa, kelas, etc.) is loaded, THE view SHALL render a section container with card styling, section-header with title and action buttons, and Data_Table with the enhanced styling
5. THE views SHALL apply 32px padding to the page content area on desktop viewports

### Requirement 13: Color Accessibility

**User Story:** As a user with varying visual abilities, I want sufficient color contrast throughout the interface, so that I can read all text and distinguish all interactive elements.

#### Acceptance Criteria

1. THE Design_System SHALL maintain a minimum contrast ratio of 4.5:1 between text and its background for all body text (15px and below)
2. THE Design_System SHALL maintain a minimum contrast ratio of 3:1 between text and its background for all large text (18px+ or 14px+ bold)
3. THE Design_System SHALL ensure interactive elements (buttons, links, tabs) have distinct visual states for default, hover, active, and focus
4. WHEN an element receives keyboard focus, THE Design_System SHALL display a visible focus ring (2px offset outline in primary-500 color)

### Requirement 14: Transition and Animation

**User Story:** As a user interacting with the panel, I want smooth, subtle animations on interactive elements, so that the interface feels responsive and polished without being distracting.

#### Acceptance Criteria

1. THE Design_System SHALL apply transition duration of 200ms with ease timing for hover state changes on cards, buttons, and navigation items
2. THE Sidebar SHALL animate width changes with 300ms duration using cubic-bezier(0.4, 0, 0.2, 1) easing
3. THE Design_System SHALL apply translateY transform animations on card hover-lift effects (−2px to −3px depending on component)
4. WHERE a badge indicates live status (e.g., active semester), THE Design_System SHALL apply a pulse animation (opacity oscillation over 2s infinite loop)

### Requirement 15: Existing Component Migration

**User Story:** As a developer, I want existing UI components (BaseModal, ActionButton, PageHeader, SearchSelect, TablePagination, ToastNotification) to be updated to the new design system, so that no legacy styling leaks through.

#### Acceptance Criteria

1. WHEN the BaseModal component is rendered, THE BaseModal SHALL use 16px border-radius, warm surface overlay, Plus Jakarta Sans typography, and the updated button styles
2. WHEN the ActionButton component is rendered, THE ActionButton SHALL apply the new button sizing (10px/18px padding, 14px font, 600 weight) and color tokens
3. WHEN the PageHeader component is rendered, THE PageHeader SHALL display titles at 26px/800 weight with stone-family text colors
4. WHEN the SearchSelect component is rendered, THE SearchSelect SHALL use 8px border-radius, 15px font-size, warm border colors, and the updated focus ring style
5. WHEN the TablePagination component is rendered, THE TablePagination SHALL use larger touch targets (minimum 40px), 14px font-size, and primary-color active page indicators
6. WHEN the ToastNotification component is rendered, THE ToastNotification SHALL use 12px border-radius, 15px font-size, colored left-border indicators, and shadow-lg elevation
