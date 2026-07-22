# Implementation Plan: Admin Panel Redesign

## Overview

Migrate the Teman Sekolah admin panel from cold corporate SaaS (slate colors, system fonts) to a warm, education-focused design system (cream surfaces, Plus Jakarta Sans, dark teal sidebar, colorful stat cards). The migration follows 6 sequential phases: tokens → font → layout shell → new components → existing component updates → view pages. Each phase builds on the previous and is independently verifiable.

## Tasks

- [x] 1. Phase 1 — Design Token Replacement
  - [x] 1.1 Replace @theme block in main.css with new warm design tokens
    - Replace the entire `@theme` block in `apps/admin/src/assets/main.css`
    - Define new color palettes: primary (blue #2563EB), surface-warm (#F5F3EF), stone-family neutrals, accent (amber/gold), success, warning, danger, purple, teal (sidebar)
    - Define typography tokens: Plus Jakarta Sans as primary font-family
    - Update spacing tokens: page padding (32px), section gaps (18-32px), element gaps (8-16px)
    - Update border-radius scale: xs (8px), sm (12px), default (16px)
    - Add shadow tokens including hover-lift effects (translateY + box-shadow)
    - Update sidebar dimensions: collapsed (96px), expanded (240px)
    - Replace all slate-family references with stone-family warm neutrals
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Update base styles in main.css
    - Update body font-family to Plus Jakarta Sans with system fallback
    - Change body background to surface-warm token
    - Apply -webkit-font-smoothing: antialiased
    - Update scrollbar styling to use stone-family colors
    - Update table base styles (zebra striping, hover) to use new tokens
    - _Requirements: 9.1, 10.4, 10.5, 14.1_

- [x] 2. Phase 2 — Font Integration
  - [x] 2.1 Add Plus Jakarta Sans font to index.html
    - Add Google Fonts preconnect links to `apps/admin/index.html`
    - Add Plus Jakarta Sans stylesheet link with weights 400, 500, 600, 700, 800 and `display=swap`
    - _Requirements: 10.4_

- [x] 3. Phase 3 — Layout Shell Decomposition
  - [x] 3.1 Create useSubNavigation composable
    - Create `apps/admin/src/composables/useSubNavigation.ts`
    - Implement SubNavConfig mapping sidebar sections to tab arrays
    - Implement activeSection computed property derived from current route
    - Implement role-filtered tabs computed property
    - Export useSubNavigation composable function
    - _Requirements: 4.1, 11.2_

  - [x] 3.2 Create AppSidebar.vue component
    - Create `apps/admin/src/components/layout/AppSidebar.vue`
    - Implement dark teal gradient background (#1A3A3A → #0F2424)
    - Render navigation items as icon + 10px label at 96px collapsed width
    - Implement hover expansion to 240px with 300ms cubic-bezier transition
    - Add amber/gold active indicator bar (4px wide, 28px tall) on active item
    - Add logo container (52px, white bg, 14px radius) at top
    - Add user avatar circle (44px, amber bg) at bottom
    - Implement role-based navigation filtering using auth store
    - Icons at 24px, white at 60% opacity (inactive) / 100% (active)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 14.2_

  - [x] 3.3 Create AppTopBar.vue component
    - Create `apps/admin/src/components/layout/AppTopBar.vue`
    - Implement 70px height, blue gradient (primary-600 → primary-700)
    - Display page title (20px/700 white) on the left
    - Display school name in frosted-glass badge (backdrop-blur) with building icon on the right
    - Add hamburger menu button for mobile (< 1024px)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.4 Create AppSubNav.vue component
    - Create `apps/admin/src/components/layout/AppSubNav.vue`
    - Implement 62px height, primary-50 background, 3px bottom border
    - Render tab items at 15px/700, 12px vertical + 22px horizontal padding, 10px radius
    - Active tab: primary-600 background, white text
    - Inactive tab: 60% white background, primary-800 text
    - Hover state: white bg, primary-300 border, subtle shadow
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.5 Rewrite AppLayout.vue to compose new sub-components
    - Rewrite `apps/admin/src/components/layout/AppLayout.vue`
    - Compose AppSidebar (left) + AppTopBar (top) + AppSubNav (below top bar) + content slot
    - Use flex-based full-viewport layout
    - Implement mobile responsive behavior: hide sidebar < 1024px, show mobile drawer overlay
    - Apply overflow-y-auto with custom scrollbar to content area
    - Wire useSubNavigation composable to AppSubNav props
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x]* 3.6 Write unit tests for useSubNavigation composable
    - Test correct section derivation for all route path prefixes
    - Test role-based tab filtering
    - Test idempotent section derivation (Property 1)
    - **Property 1: Sub-navigation route mapping consistency**
    - **Validates: Requirements 4.1, 11.2**
    - _Requirements: 4.1, 11.2_

- [x] 4. Checkpoint — Layout shell verification
  - Ensure the app renders with new layout (sidebar + top bar + sub-nav) without console errors
  - Verify sidebar expand/collapse works on hover
  - Verify sub-navigation tabs display and navigate correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Phase 4 — New UI Components
  - [x] 5.1 Create StatCard.vue component
    - Create `apps/admin/src/components/ui/StatCard.vue`
    - Implement 16px radius, 22px padding, 2px colored border
    - Support 4 variants: blue, green, amber, purple with gradient backgrounds
    - Render Icon_Badge (42px, 12px radius, solid colored bg, white icon)
    - Display metric value at 32px/800 weight
    - Display label at 14px/600 in secondary text color
    - Hover: translate -3px, enhanced box-shadow (0 12px 32px rgba(0,0,0,0.12))
    - Optional change indicator badge (14px radius, 13px bold)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 5.2 Create QuickActionCard.vue component
    - Create `apps/admin/src/components/ui/QuickActionCard.vue`
    - Implement white bg, 12px radius, 20px padding, 2px border, horizontal layout
    - Render Icon_Badge (48px, solid color bg, 24px white icon)
    - Display title at 15px/700, description at 13px tertiary color
    - Hover: translate -2px, border primary-300, box-shadow (0 6px 20px rgba(37,99,235,0.12))
    - Support optional `to` prop for router-link navigation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x]* 5.3 Write unit tests for StatCard and QuickActionCard
    - Test StatCard renders correct variant classes for each color variant
    - Test StatCard renders change indicator when change prop is provided
    - Test QuickActionCard emits click event
    - Test QuickActionCard renders as router-link when `to` prop provided
    - _Requirements: 5.1, 5.2, 6.1, 6.4_

- [x] 6. Phase 5 — Existing Component Updates
  - [x] 6.1 Update BaseModal.vue to new design system
    - Update `apps/admin/src/components/ui/BaseModal.vue`
    - Apply 16px border-radius to modal container
    - Use warm surface overlay background
    - Apply Plus Jakarta Sans typography
    - Update internal button styles to match new design tokens
    - _Requirements: 15.1_

  - [x] 6.2 Update ActionButton.vue to new design system
    - Update `apps/admin/src/components/ui/ActionButton.vue`
    - Apply padding 10px/18px, font 14px/600 weight
    - Primary: primary-600 bg, white text, 8px radius, colored box-shadow
    - Secondary: white bg, 2px border, secondary text
    - Primary hover: translate -1px, intensify shadow
    - Secondary hover: warm surface bg, primary-300 border, primary-700 text
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 15.2_

  - [x] 6.3 Update PageHeader.vue to new design system
    - Update `apps/admin/src/components/ui/PageHeader.vue`
    - Title at 26px/800 weight with stone-family text color
    - Optional subtitle at 15px secondary text color
    - _Requirements: 10.1, 12.2, 15.3_

  - [x] 6.4 Update SearchSelect.vue to new design system
    - Update `apps/admin/src/components/ui/SearchSelect.vue`
    - Apply 8px border-radius, 15px font-size
    - Use warm border colors (stone-200)
    - Add focus ring: 2px offset outline in primary-500
    - _Requirements: 13.4, 15.4_

  - [x] 6.5 Update TablePagination.vue to new design system
    - Update `apps/admin/src/components/ui/TablePagination.vue`
    - Minimum 40px touch targets for page buttons
    - 14px font-size
    - Primary-color active page indicator
    - _Requirements: 15.5_

  - [x] 6.6 Update ToastNotification.vue to new design system
    - Update `apps/admin/src/components/ui/ToastNotification.vue`
    - Apply 12px border-radius, 15px font-size
    - Add colored left-border indicators (success=green, error=red, warning=amber)
    - Apply shadow-lg elevation
    - _Requirements: 15.6_

  - [x] 6.7 Update ui/index.ts barrel file with new component exports
    - Add StatCard and QuickActionCard to `apps/admin/src/components/ui/index.ts`
    - _Requirements: 5.1, 6.1_

- [x] 7. Checkpoint — Component verification
  - Ensure all updated components render correctly with new styling
  - Verify no hardcoded slate/cold colors remain in UI components
  - Verify focus ring, hover states, and transitions work per design
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Phase 6 — View Page Migration (Dashboard & Academic)
  - [x] 8.1 Redesign DashboardView.vue
    - Update `apps/admin/src/views/DashboardView.vue`
    - Use StatCards in 4-column grid (18px gap) for key metrics
    - Use QuickActionCards in 3-column grid (16px gap) for shortcuts
    - Apply 32px page padding
    - Use new Data_Table styling for data sections
    - Replace any hardcoded colors with token-based utilities
    - _Requirements: 12.1, 12.3, 12.5_

  - [x] 8.2 Update dashboard role-specific components
    - Update all files in `apps/admin/src/components/dashboard/`
    - AdminDashboard, BendaharaDashboard, DefaultDashboard, KepalaSekolahDashboard, SuperadminDashboard
    - Apply new design tokens, StatCard usage, warm color scheme
    - _Requirements: 12.1, 12.3_

  - [x] 8.3 Redesign SiswaManagementView.vue and SiswaDetailView.vue
    - Apply card container with section-header (primary-50 bg, 20px/24px padding, 2px bottom border)
    - Apply Data_Table styling: 15px cells, 13px uppercase headers, 38px avatars, hover rows
    - Apply progress bars for percentage columns
    - Use 32px page padding
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.2, 9.4, 12.4, 12.5_

  - [x] 8.4 Redesign KelasManagementView.vue and MataPelajaranView.vue
    - Apply card + section-header + Data_Table pattern
    - Replace all hardcoded colors with token utilities
    - Apply 32px page padding, 15px body text, 26px headings
    - _Requirements: 7.1, 7.2, 9.2, 12.1, 12.4, 12.5_

  - [x] 8.5 Redesign JadwalView.vue and KenaikanKelasView.vue
    - Apply card + section-header + Data_Table pattern
    - Replace all hardcoded colors with token utilities
    - Apply consistent spacing and typography
    - _Requirements: 7.1, 9.2, 12.1, 12.4, 12.5_

- [x] 9. Phase 6 continued — Absensi & Rapor Views
  - [x] 9.1 Redesign AbsensiInputView.vue, AbsensiEditView.vue, AbsensiRekapView.vue
    - Apply card container with warm styling
    - Update tables/forms to use new Data_Table styling and typography scale
    - Replace hardcoded colors with token-based utilities
    - Apply 32px page padding
    - _Requirements: 7.1, 9.2, 12.1, 12.4, 12.5_

  - [x] 9.2 Redesign RaporKomponenView.vue, RaporInputView.vue, RaporFinalizeView.vue, RaporDetailView.vue
    - Apply card container with warm styling
    - Update grade tables to use Data_Table styling
    - Apply new button styles for finalization actions
    - Replace hardcoded colors with token-based utilities
    - _Requirements: 7.1, 8.1, 9.2, 12.1, 12.4, 12.5_

- [x] 10. Phase 6 continued — RPP, Keuangan & Communication Views
  - [x] 10.1 Redesign RppPortalView.vue, RppCreateView.vue, RppDetailView.vue, RppFavoritesView.vue
    - Apply card container styling with new tokens
    - Update form elements with warm borders, larger fonts
    - Apply 32px page padding and 15px body text
    - _Requirements: 9.2, 12.1, 12.4, 12.5_

  - [x] 10.2 Redesign TagihanView.vue
    - Apply card + section-header + Data_Table pattern for billing tables
    - Update payment status badges with new color tokens
    - Apply 32px page padding
    - _Requirements: 7.1, 9.2, 12.1, 12.4, 12.5_

  - [x] 10.3 Redesign PengumumanView.vue
    - Apply card container styling
    - Update form and list styling with new tokens
    - Apply 32px page padding
    - _Requirements: 9.2, 12.1, 12.5_

- [x] 11. Phase 6 continued — Settings & Utility Views
  - [x] 11.1 Redesign TahunAjaranView.vue, KonfigurasiView.vue, UserManagementView.vue
    - Apply card + section-header + Data_Table pattern
    - Update forms and modals to use new design tokens
    - Apply 32px page padding
    - _Requirements: 7.1, 9.2, 12.1, 12.4, 12.5_

  - [x] 11.2 Redesign AuditLogView.vue and TenantManagementView.vue
    - Apply card + section-header + Data_Table pattern
    - Replace hardcoded colors with token utilities
    - Apply 32px page padding
    - _Requirements: 7.1, 9.2, 12.1, 12.4, 12.5_

  - [x] 11.3 Update LoginView.vue, ResetPasswordView.vue, ResetPasswordConfirmView.vue
    - Apply warm surface background
    - Update form input styling (8px radius, 15px font, warm borders)
    - Update button styling per new button design
    - Apply Plus Jakarta Sans typography
    - _Requirements: 1.1, 8.1, 8.2, 9.1, 10.4_

  - [x] 11.4 Update NotFoundView.vue and UnauthorizedView.vue
    - Apply warm surface background and stone-family text colors
    - Update buttons to new styling
    - _Requirements: 9.1, 12.1_

- [x] 12. Accessibility and Focus States
  - [x] 12.1 Add global focus ring and accessibility styles
    - Add `:focus-visible` styles with 2px offset outline in primary-500 to `main.css`
    - Verify primary button contrast ratio ≥ 4.5:1 for body text
    - Verify large text contrast ≥ 3:1
    - Add transition 200ms ease for all interactive element state changes
    - Add pulse animation keyframes for live status badges
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 14.1, 14.4_

- [x] 13. Final Checkpoint — Full verification
  - Ensure all views render without console errors or broken layouts
  - Verify no slate/cold hardcoded colors remain across the codebase
  - Verify sidebar, top bar, and sub-navigation work across all sections
  - Verify responsive behavior at < 1024px (mobile drawer)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after major phases
- The design document's `mockup-redesign.html` serves as the visual reference
- Only presentation layer changes — Pinia stores, Vue Router, API client, and data flow remain unchanged
- Phase 6 is split into multiple task groups (8–11) because of the 30+ views; they can be parallelized within each group

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["3.5"] },
    { "id": 4, "tasks": ["3.6", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "12.1"] },
    { "id": 7, "tasks": ["9.1", "9.2", "10.1", "10.2", "10.3"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4"] }
  ]
}
```
